"""
408刷题应用 - Flask 后端主程序
"""
import os
import re
import json
import random
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from config import BASE_DIR, FROZEN, QUESTIONS_DIR, SUBJECTS, SECRET_KEY, HOST, PORT
import database as db

# 显式指定模板/静态目录，兼容PyInstaller打包后从_MEIPASS加载
app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.secret_key = SECRET_KEY

# 题库缓存（带文件修改时间检测）
_questions_cache = {}
_cache_mtime = {}
_search_texts = {}  # {subject: [(question_id, 小写去HTML检索文本), ...]}

# 真题标记：【统考真题】前缀（容忍OCR空格与"年"字变体）
REAL_EXAM_RE = re.compile(r'【\s*(2\s*0\s*\d\s*\d)\s*年?\s*统\s*考\s*真\s*题\s*】')
TAG_RE = re.compile(r'<[^>]+>')


def load_questions(subject_key):
    """加载题库数据（带缓存，自动检测文件更新）"""
    json_file = os.path.join(QUESTIONS_DIR, SUBJECTS[subject_key]['json'])
    if not os.path.exists(json_file):
        return {"subject": SUBJECTS[subject_key]['name'], "questions": [], "total": 0}
    
    mtime = os.path.getmtime(json_file)
    if subject_key in _questions_cache and _cache_mtime.get(subject_key) == mtime:
        return _questions_cache[subject_key]
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 缓存填充时一次性：真题打标 + 预建检索文本（exe内JSON只读，只能运行时附加）
    texts = []
    for q in data['questions']:
        m = REAL_EXAM_RE.search(q.get('content', '')[:80])
        q['is_real_exam'] = bool(m)
        q['exam_year'] = int(m.group(1).replace(' ', '')) if m else None
        raw = q.get('content', '') + ' ' + ' '.join((q.get('options') or {}).values()) \
              + ' ' + q.get('explanation', '')
        texts.append((q['id'], TAG_RE.sub(' ', raw).lower()))
    _search_texts[subject_key] = texts
    
    _questions_cache[subject_key] = data
    _cache_mtime[subject_key] = mtime
    return data


def get_question_by_id(question_id):
    """根据ID查找题目"""
    subject_key = question_id.split('_')[0]
    if subject_key not in SUBJECTS:
        return None
    data = load_questions(subject_key)
    for q in data['questions']:
        if q['id'] == question_id:
            return q
    return None


# ==================== 页面路由 ====================

@app.route('/')
def index():
    """首页"""
    stats = db.get_overall_stats()
    subjects_info = []
    for key, info in SUBJECTS.items():
        data = load_questions(key)
        subject_stats = db.get_subject_stats(key)
        subjects_info.append({
            'key': key,
            'name': info['name'],
            'total': data['total'],
            **subject_stats
        })
    return render_template('index.html', subjects=subjects_info, stats=stats)


@app.route('/quiz/<subject>')
def quiz_page(subject):
    """答题页面"""
    if subject not in SUBJECTS:
        return "科目不存在", 404
    mode = request.args.get('mode', 'sequential')  # sequential/random/wrong/favorite
    chapter = request.args.get('chapter', '')
    section = request.args.get('section', '')
    return render_template('quiz.html', subject=subject, subject_name=SUBJECTS[subject]['name'],
                           mode=mode, chapter=chapter, section=section)


@app.route('/wrong')
def wrong_page():
    """错题本页面"""
    return render_template('wrong.html', subjects=SUBJECTS)


@app.route('/favorites')
def favorites_page():
    """收藏页面"""
    return render_template('favorites.html', subjects=SUBJECTS)


@app.route('/stats')
def stats_page():
    """学习统计页面"""
    return render_template('stats.html', subjects=SUBJECTS)


@app.route('/search')
def search_page():
    """搜题页面"""
    return render_template('search.html', subjects=SUBJECTS)


@app.route('/exam')
def exam_page():
    """模拟考试页面"""
    return render_template('exam.html', subjects=SUBJECTS)


# ==================== API 路由 ====================

@app.route('/api/questions/<subject>')
def api_get_questions(subject):
    """获取题目列表"""
    if subject not in SUBJECTS:
        return jsonify({"error": "科目不存在"}), 404
    
    mode = request.args.get('mode', 'sequential')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 1))
    chapter = request.args.get('chapter', '')
    section = request.args.get('section', '')
    
    data = load_questions(subject)
    questions = data['questions']
    
    # 章节筛选
    if chapter:
        questions = [q for q in questions if q.get('chapter') == chapter]
    if section:
        questions = [q for q in questions if q.get('section') == section]
    
    if mode == 'random':
        questions = random.sample(questions, len(questions))
    elif mode == 'real':
        questions = [q for q in questions if q.get('is_real_exam')]
    elif mode == 'wrong':
        wrong_list = db.get_wrong_questions(subject)
        wrong_ids = {w['question_id'] for w in wrong_list}
        questions = [q for q in questions if q['id'] in wrong_ids]
    elif mode == 'favorite':
        fav_list = db.get_favorites(subject)
        fav_ids = {f['question_id'] for f in fav_list}
        questions = [q for q in questions if q['id'] in fav_ids]
    elif mode == 'unanswered':
        answered_ids = db.get_answered_ids(subject)
        questions = [q for q in questions if q['id'] not in answered_ids]
    elif mode == 'review':
        # 艾宾浩斯复习：只出今日到期的错题，保持逾期时长降序
        due_ids, _ = db.get_due_review(subject)
        order = {qid: i for i, qid in enumerate(due_ids)}
        questions = sorted([q for q in questions if q['id'] in order],
                           key=lambda q: order[q['id']])
    elif mode == 'smart':
        # 智能推题：按章节正确率加权乱序，正确率越低、未做题越多的章节越先出现
        statuses_all, _ = db.get_statuses_and_favs(subject)
        wrong_map = {w['question_id']: w for w in db.get_wrong_questions(subject)}
        week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        ch_stat = {}
        for q in data['questions']:
            ch = q.get('chapter') or '未分类'
            st = ch_stat.setdefault(ch, {'answered': 0, 'correct': 0})
            s = statuses_all.get(q['id'])
            if s:
                st['answered'] += 1
                if s['is_correct']:
                    st['correct'] += 1

        def _weight(q):
            st = ch_stat.get(q.get('chapter') or '未分类', {'answered': 0, 'correct': 0})
            acc = st['correct'] / st['answered'] if st['answered'] else 0
            w = (1 - acc) + (0 if q['id'] in statuses_all else 0.3)
            # 题目级加权：反复错的题更优先；久未碰的题适当提权
            w_rec = wrong_map.get(q['id'])
            if w_rec and not w_rec['is_resolved'] and w_rec['wrong_count'] >= 2:
                w += 0.5
            s = statuses_all.get(q['id'])
            if s and (s['answered_at'] or '') < week_ago:
                w += 0.3
            return max(w, 0.05)

        # 加权随机洗牌（Efraimidis-Spirakis）：权重越大排序键越大、越靠前
        questions = sorted(questions, key=lambda q: random.random() ** (1 / _weight(q)), reverse=True)
    
    total = len(questions)
    start = (page - 1) * per_page
    end = start + per_page
    page_questions = questions[start:end]
    
    # 批量查回收藏/最近作答/笔记，避免逐题开连接（N+1）
    statuses, fav_ids_all = db.get_statuses_and_favs(subject)
    notes_map = db.get_notes_map(subject)
    result = []
    for q in page_questions:
        q_data = dict(q)
        q_data['is_favorited'] = q['id'] in fav_ids_all
        q_data['last_status'] = statuses.get(q['id'])
        q_data['note'] = notes_map.get(q['id'], '')
        result.append(q_data)
    
    return jsonify({
        "subject": data['subject'],
        "total": total,
        "page": page,
        "per_page": per_page,
        "questions": result
    })


@app.route('/api/chapters')
def api_get_chapters():
    """获取所有科目的章节树（含题目数统计）"""
    result = {}
    for key, info in SUBJECTS.items():
        data = load_questions(key)
        chapters = []
        ch_map = {}
        for q in data['questions']:
            ch = q.get('chapter') or '未分类'
            sec = q.get('section') or ''
            if ch not in ch_map:
                ch_map[ch] = {'name': ch, 'count': 0, 'sections': [], 'smap': {}}
                chapters.append(ch_map[ch])
            node = ch_map[ch]
            node['count'] += 1
            if sec:
                if sec not in node['smap']:
                    node['smap'][sec] = {'name': sec, 'count': 0}
                    node['sections'].append(node['smap'][sec])
                node['smap'][sec]['count'] += 1
        for node in chapters:
            node.pop('smap')
        result[key] = {'name': info['name'], 'total': data['total'], 'chapters': chapters}
    return jsonify(result)


@app.route('/api/submit', methods=['POST'])
def api_submit_answer():
    """提交答案并批改"""
    data = request.get_json()
    question_id = data.get('question_id')
    user_answer = data.get('answer', '').upper()
    
    if not question_id or not user_answer:
        return jsonify({"error": "缺少参数"}), 400
    
    question = get_question_by_id(question_id)
    if not question:
        return jsonify({"error": "题目不存在"}), 404
    
    correct_answer = question.get('answer', '')
    
    if not correct_answer:
        return jsonify({
            "question_id": question_id,
            "user_answer": user_answer,
            "correct_answer": "",
            "is_correct": None,
            "message": "该题暂无标准答案，无法批改",
            "explanation": question.get('explanation', '')
        })
    
    is_correct = user_answer == correct_answer
    subject_key = question_id.split('_')[0]
    
    # 记录答题
    db.record_answer(question_id, subject_key, user_answer, is_correct)
    
    return jsonify({
        "question_id": question_id,
        "user_answer": user_answer,
        "correct_answer": correct_answer,
        "is_correct": is_correct,
        "explanation": question.get('explanation', '')
    })


@app.route('/api/favorite/<question_id>', methods=['POST'])
def api_toggle_favorite(question_id):
    """切换收藏状态"""
    subject_key = question_id.split('_')[0]
    if subject_key not in SUBJECTS:
        return jsonify({"error": "无效的题目ID"}), 400
    
    is_fav = db.toggle_favorite(question_id, subject_key)
    return jsonify({"question_id": question_id, "is_favorited": is_fav})


@app.route('/api/wrong')
def api_get_wrong():
    """获取错题列表"""
    subject = request.args.get('subject', None)
    include_resolved = request.args.get('include_resolved', 'false') == 'true'
    sort = request.args.get('sort', 'recent')  # recent/count
    real_only = request.args.get('real_only', 'false') == 'true'
    
    wrong_list = db.get_wrong_questions(subject, include_resolved, sort)
    
    # 补充题目详情
    result = []
    for w in wrong_list:
        question = get_question_by_id(w['question_id'])
        if question:
            if real_only and not question.get('is_real_exam'):
                continue
            result.append({**w, **question})
    
    return jsonify({"wrong_questions": result, "total": len(result)})


@app.route('/api/favorites')
def api_get_favorites():
    """获取收藏列表"""
    subject = request.args.get('subject', None)
    fav_list = db.get_favorites(subject)
    
    result = []
    for f in fav_list:
        question = get_question_by_id(f['question_id'])
        if question:
            result.append({**f, **question})
    
    return jsonify({"favorites": result, "total": len(result)})


@app.route('/api/stats')
def api_get_stats():
    """获取统计数据"""
    overall = db.get_overall_stats()
    subjects_stats = {}
    for key in SUBJECTS:
        data = load_questions(key)
        subjects_stats[key] = {
            **db.get_subject_stats(key),
            'total_questions': data['total'],
            'name': SUBJECTS[key]['name']
        }
    return jsonify({"overall": overall, "subjects": subjects_stats})


@app.route('/api/stats/daily')
def api_stats_daily():
    """近N天每日刷题量与正确率"""
    days = min(int(request.args.get('days', 30)), 365)
    rows = db.get_daily_stats(days)
    return jsonify({"days": days, "data": rows})


@app.route('/api/stats/mastery')
def api_stats_mastery():
    """各科各章掌握度：内存题库按章聚合 + 最近一次作答结果"""
    result = {}
    for key, info in SUBJECTS.items():
        data = load_questions(key)
        statuses, _ = db.get_statuses_and_favs(key)
        ch_map = {}
        chapters = []
        for q in data['questions']:
            ch = q.get('chapter') or '未分类'
            if ch not in ch_map:
                ch_map[ch] = {'name': ch, 'total': 0, 'answered': 0, 'correct': 0}
                chapters.append(ch_map[ch])
            node = ch_map[ch]
            node['total'] += 1
            st = statuses.get(q['id'])
            if st:
                node['answered'] += 1
                if st['is_correct']:
                    node['correct'] += 1
        result[key] = {'name': info['name'], 'chapters': chapters}
    return jsonify(result)


@app.route('/api/search')
def api_search():
    """关键词搜题（题干/选项/解析，内存子串匹配，返回前50条）"""
    kw = (request.args.get('q') or '').strip().lower()
    subject = request.args.get('subject', '')
    if not kw:
        return jsonify({"results": [], "total": 0})
    
    keys = [subject] if subject in SUBJECTS else list(SUBJECTS.keys())
    results = []
    for key in keys:
        data = load_questions(key)  # 确保检索文本已预建
        qmap = {q['id']: q for q in data['questions']}
        for qid, text in _search_texts.get(key, []):
            if kw not in text:
                continue
            q = qmap[qid]
            results.append({
                'id': qid,
                'subject': key,
                'subject_name': SUBJECTS[key]['name'],
                'number': q.get('number'),
                'content': q.get('content', ''),
                'options': q.get('options'),
                'chapter': q.get('chapter', ''),
                'section': q.get('section', ''),
                'is_real_exam': q.get('is_real_exam', False),
            })
            if len(results) >= 50:
                break
        if len(results) >= 50:
            break
    return jsonify({"results": results, "total": len(results)})


@app.route('/api/note/<question_id>', methods=['GET', 'POST'])
def api_note(question_id):
    """读写题目笔记（POST content为空则删除）"""
    subject_key = question_id.split('_')[0]
    if subject_key not in SUBJECTS:
        return jsonify({"error": "无效的题目ID"}), 400
    
    if request.method == 'GET':
        return jsonify({"question_id": question_id, "note": db.get_note(question_id)})
    
    content = (request.get_json() or {}).get('content', '')
    db.upsert_note(question_id, subject_key, content)
    return jsonify({"success": True, "note": content.strip()})


# ==================== 模拟考试 API ====================

# 408分值比例：数据结45' 组成45' 操作系统35' 网络25'
EXAM_RATIO = {'ds': 45, 'co': 45, 'os': 35, 'cn': 25}


def _strip_answer(q):
    """组卷返回前剥离答案与解析，防前端偷看"""
    return {k: v for k, v in q.items() if k not in ('answer', 'explanation')}


def _grade_exam(exam, answers):
    """服务端统一判分：写成绩 + 批量入答题记录/错题本，返回成绩单"""
    qids = json.loads(exam['question_ids'])
    details = []
    correct = 0
    per_subject = {}
    per_chapter = {}
    batch = []
    for qid in qids:
        q = get_question_by_id(qid)
        if not q:
            continue
        subj = qid.split('_')[0]
        ua = (answers.get(qid) or '').upper()
        ok = bool(ua) and ua == q.get('answer', '')
        if ok:
            correct += 1
        ps = per_subject.setdefault(subj, {'key': subj, 'name': SUBJECTS[subj]['name'], 'total': 0, 'correct': 0})
        ps['total'] += 1
        ps['correct'] += int(ok)
        ch = q.get('chapter') or '未分类'
        pc = per_chapter.setdefault(subj + '|' + ch, {'subject': SUBJECTS[subj]['name'], 'chapter': ch, 'total': 0, 'wrong': 0})
        pc['total'] += 1
        if not ok:
            pc['wrong'] += 1
        details.append({
            'id': qid,
            'number': q.get('number'),
            'content': q.get('content', ''),
            'options': q.get('options'),
            'user_answer': ua,
            'correct_answer': q.get('answer', ''),
            'is_correct': ok,
            'explanation': q.get('explanation', ''),
            'chapter': q.get('chapter', ''),
            'section': q.get('section', ''),
        })
        if ua:
            batch.append((qid, subj, ua, ok))
    
    total = len(details)
    score = round(correct / total * 100, 1) if total else 0
    db.record_answers_batch(batch)  # 错题照常进错题本、计入统计
    db.finish_exam_record(exam['id'], answers, correct, score)
    return {
        'exam_id': exam['id'],
        'total': total,
        'correct': correct,
        'score': score,
        'per_subject': list(per_subject.values()),
        'chapter_loss': [c for c in per_chapter.values() if c['wrong'] > 0],
        'details': details,
    }


@app.route('/api/exam/generate', methods=['POST'])
def api_exam_generate():
    """组卷：full按408分值比例抽题，或单科+自定义题量"""
    payload = request.get_json() or {}
    mode = payload.get('mode', 'full')
    count = int(payload.get('count') or 0)
    
    picked = []
    if mode == 'full':
        total = count if 10 <= count <= 150 else 40
        ratio_sum = sum(EXAM_RATIO.values())
        quotas = {k: total * v // ratio_sum for k, v in EXAM_RATIO.items()}
        order = ['ds', 'co', 'os', 'cn']
        i = 0
        while sum(quotas.values()) < total:
            quotas[order[i % 4]] += 1
            i += 1
        for key in order:
            pool = [q for q in load_questions(key)['questions'] if q.get('answer')]
            picked += random.sample(pool, min(quotas[key], len(pool)))
    elif mode in SUBJECTS:
        total = count if 5 <= count <= 100 else 20
        pool = [q for q in load_questions(mode)['questions'] if q.get('answer')]
        picked = random.sample(pool, min(total, len(pool)))
    else:
        return jsonify({"error": "无效的考试模式"}), 400
    
    if not picked:
        return jsonify({"error": "题库为空，无法组卷"}), 400
    
    duration = int(payload.get('duration_sec') or 0) or len(picked) * 60
    exam_id = db.save_exam_record(mode, [q['id'] for q in picked], duration)
    return jsonify({
        "exam_id": exam_id,
        "duration_sec": duration,
        "questions": [_strip_answer(q) for q in picked],
    })


@app.route('/api/exam/save', methods=['POST'])
def api_exam_save():
    """进行中随选随存答案（崩溃/刷新可恢复）"""
    payload = request.get_json() or {}
    exam_id = payload.get('exam_id')
    if not exam_id:
        return jsonify({"error": "缺少exam_id"}), 400
    db.update_exam_answers(exam_id, payload.get('answers') or {})
    return jsonify({"success": True})


@app.route('/api/exam/active')
def api_exam_active():
    """查进行中会话；服务端重算剩余时间，已超时则自动判分交卷"""
    exam = db.get_active_exam()
    if not exam:
        return jsonify({"active": None})
    
    started = datetime.strptime(exam['started_at'], '%Y-%m-%d %H:%M:%S')
    remaining = exam['duration_sec'] - int((datetime.now() - started).total_seconds())
    if remaining <= 0:
        result = _grade_exam(exam, json.loads(exam['answers']))
        return jsonify({"active": None, "auto_submitted": result})
    
    qids = json.loads(exam['question_ids'])
    questions = []
    for qid in qids:
        q = get_question_by_id(qid)
        if q:
            questions.append(_strip_answer(q))
    return jsonify({"active": {
        "exam_id": exam['id'],
        "mode": exam['mode'],
        "remaining_sec": remaining,
        "duration_sec": exam['duration_sec'],
        "answers": json.loads(exam['answers']),
        "questions": questions,
    }})


@app.route('/api/exam/submit', methods=['POST'])
def api_exam_submit():
    """交卷：服务端统一判分出成绩单"""
    payload = request.get_json() or {}
    exam_id = payload.get('exam_id')
    exam = db.get_exam_record(exam_id) if exam_id else None
    if not exam:
        return jsonify({"error": "考试不存在"}), 404
    if exam['status'] != 'in_progress':
        return jsonify({"error": "该考试已交卷"}), 400
    return jsonify(_grade_exam(exam, payload.get('answers') or {}))


@app.route('/api/exam/history')
def api_exam_history():
    """历史成绩列表"""
    return jsonify({"records": db.get_exam_records()})


@app.route('/api/answer/<question_id>', methods=['POST'])
def api_update_answer(question_id):
    """修改题目答案（人工校验用）"""
    data = request.get_json()
    new_answer = data.get('answer', '').upper()
    new_explanation = data.get('explanation', '')
    
    subject_key = question_id.split('_')[0]
    if subject_key not in SUBJECTS:
        return jsonify({"error": "无效的题目ID"}), 400
    
    # 更新JSON文件中的答案
    json_file = os.path.join(QUESTIONS_DIR, SUBJECTS[subject_key]['json'])
    with open(json_file, 'r', encoding='utf-8') as f:
        file_data = json.load(f)
    
    updated = False
    for q in file_data['questions']:
        if q['id'] == question_id:
            if new_answer:
                q['answer'] = new_answer
            if new_explanation:
                q['explanation'] = new_explanation
            updated = True
            break
    
    if updated:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(file_data, f, ensure_ascii=False, indent=2)
        # 清除缓存
        _questions_cache.pop(subject_key, None)
        return jsonify({"success": True, "message": "答案已更新"})
    
    return jsonify({"error": "题目未找到"}), 404


@app.route('/api/backup/export')
def api_backup_export():
    """导出全部学习数据（统一JSON格式，可导入PWA版）"""
    payload = db.export_all()
    payload['version'] = 1
    payload['exported_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    payload['source'] = 'flask'
    resp = jsonify(payload)
    resp.headers['Content-Disposition'] = f"attachment; filename=408quiz-backup-{datetime.now().strftime('%Y%m%d')}.json"
    return resp


@app.route('/api/backup/import', methods=['POST'])
def api_backup_import():
    """导入备份文件（全量覆盖本地数据）"""
    payload = request.get_json(silent=True)
    if not payload or not isinstance(payload.get('progress'), list):
        return jsonify({"error": "备份文件格式不正确"}), 400
    counts = db.import_all(payload)
    return jsonify({"success": True, "counts": counts})


@app.route('/api/reset_progress', methods=['POST'])
def api_reset_progress():
    """重置学习进度"""
    subject = request.get_json().get('subject')
    conn = db.get_db()
    if subject:
        conn.execute('DELETE FROM user_progress WHERE subject = ?', (subject,))
        conn.execute('DELETE FROM wrong_questions WHERE subject = ?', (subject,))
    else:
        conn.execute('DELETE FROM user_progress')
        conn.execute('DELETE FROM wrong_questions')
    conn.commit()
    conn.close()
    return jsonify({"success": True})


if __name__ == '__main__':
    # 确保数据库初始化
    db.init_db()
    print(f"\n{'='*50}")
    print(f"  408刷题应用已启动!")
    print(f"  请在浏览器中访问: http://{HOST}:{PORT}")
    print(f"  按 Ctrl+C 停止服务")
    print(f"{'='*50}\n")
    if FROZEN:
        # exe双击运行时自动打开浏览器（开发模式由start.bat负责）
        import threading
        import webbrowser
        threading.Timer(1.2, lambda: webbrowser.open(f'http://{HOST}:{PORT}')).start()
    app.run(host=HOST, port=PORT, debug=False)
