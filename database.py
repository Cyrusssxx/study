"""
数据库模块 - 管理用户进度、错题、收藏、笔记、模拟考试等数据
"""
import os
import json
import sqlite3
from datetime import datetime, timedelta
from config import DB_PATH


def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """初始化数据库表结构"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()
    
    # 用户答题记录
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            user_answer TEXT NOT NULL,
            is_correct INTEGER NOT NULL,
            answered_at TEXT NOT NULL,
            UNIQUE(question_id, answered_at)
        )
    ''')
    
    # 错题记录
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wrong_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL UNIQUE,
            subject TEXT NOT NULL,
            wrong_count INTEGER DEFAULT 1,
            last_wrong_at TEXT NOT NULL,
            is_resolved INTEGER DEFAULT 0
        )
    ''')
    
    # 收藏记录
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL UNIQUE,
            subject TEXT NOT NULL,
            added_at TEXT NOT NULL
        )
    ''')
    
    # 学习会话统计
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            session_date TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    
    # 题目笔记
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id TEXT NOT NULL UNIQUE,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    
    # 模拟考试记录（进行中会话 + 历史成绩共用一张表）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exam_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            question_ids TEXT NOT NULL,
            answers TEXT NOT NULL DEFAULT '{}',
            total_count INTEGER NOT NULL,
            correct_count INTEGER DEFAULT 0,
            score REAL DEFAULT 0,
            duration_sec INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'in_progress',
            started_at TEXT NOT NULL,
            submitted_at TEXT
        )
    ''')
    
    # 数据结构强化打卡完成状态
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daka_progress (
            question_id TEXT PRIMARY KEY,
            done INTEGER NOT NULL DEFAULT 1,
            done_at TEXT NOT NULL
        )
    ''')
    
    # 幂等迁移：wrong_questions 加连对计数列（做对2次才移出错题本）
    wrong_cols = {r[1] for r in cursor.execute('PRAGMA table_info(wrong_questions)').fetchall()}
    if 'correct_streak' not in wrong_cols:
        cursor.execute('ALTER TABLE wrong_questions ADD COLUMN correct_streak INTEGER DEFAULT 0')
        # 存量已解决错题视为已掌握，streak直接置2，避免语义突变后"复活"
        cursor.execute('UPDATE wrong_questions SET correct_streak = 2 WHERE is_resolved = 1')

    # 幂等迁移：exam_records 加"错题是否自动入错题本"开关列（组卷时定，交卷/超时自动交卷都照此执行）
    exam_cols = {r[1] for r in cursor.execute('PRAGMA table_info(exam_records)').fetchall()}
    if 'record_wrong' not in exam_cols:
        cursor.execute('ALTER TABLE exam_records ADD COLUMN record_wrong INTEGER DEFAULT 1')

    # 幂等迁移：notes 加图片列（JSON数组存压缩后的dataURL，笔记支持贴图）
    note_cols = {r[1] for r in cursor.execute('PRAGMA table_info(notes)').fetchall()}
    if 'images' not in note_cols:
        cursor.execute("ALTER TABLE notes ADD COLUMN images TEXT DEFAULT '[]'")
    
    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_progress_qid ON user_progress(question_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_progress_subject ON user_progress(subject)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_progress_time ON user_progress(answered_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_progress_subj_time ON user_progress(subject, answered_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_wrong_subject ON wrong_questions(subject)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorites_subject ON favorites(subject)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_exam_status ON exam_records(status)')
    
    conn.commit()
    conn.close()


def _apply_answer(conn, question_id, subject, user_answer, is_correct, now, track_wrong=True):
    """在已有连接上写入一次答题记录并维护错题表（供单题/批量共用）
    track_wrong=False 时答错不记入错题本（答对仍正常推进存量错题的连对计数）"""
    conn.execute(
        'INSERT INTO user_progress (question_id, subject, user_answer, is_correct, answered_at) VALUES (?, ?, ?, ?, ?)',
        (question_id, subject, user_answer, int(is_correct), now)
    )
    
    if not is_correct:
        if not track_wrong:
            return
        existing = conn.execute(
            'SELECT id, wrong_count FROM wrong_questions WHERE question_id = ?',
            (question_id,)
        ).fetchone()
        
        if existing:
            conn.execute(
                'UPDATE wrong_questions SET wrong_count = wrong_count + 1, last_wrong_at = ?, is_resolved = 0, correct_streak = 0 WHERE question_id = ?',
                (now, question_id)
            )
        else:
            conn.execute(
                'INSERT INTO wrong_questions (question_id, subject, wrong_count, last_wrong_at, correct_streak) VALUES (?, ?, 1, ?, 0)',
                (question_id, subject, now)
            )
    else:
        # 答对：连对计数+1，连对满2次才移出错题本（置为已解决，保留记录）
        conn.execute(
            'UPDATE wrong_questions SET correct_streak = correct_streak + 1 WHERE question_id = ?',
            (question_id,)
        )
        conn.execute(
            'UPDATE wrong_questions SET is_resolved = 1 WHERE question_id = ? AND correct_streak >= 2',
            (question_id,)
        )


def record_answer(question_id, subject, user_answer, is_correct):
    """记录用户答题"""
    conn = get_db()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    _apply_answer(conn, question_id, subject, user_answer, is_correct, now)
    conn.commit()
    conn.close()


def record_answers_batch(items, track_wrong=True):
    """批量记录答题（考试交卷用），单连接单事务
    items: [(question_id, subject, user_answer, is_correct), ...]
    track_wrong=False 时错题不入错题本
    """
    if not items:
        return
    conn = get_db()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    for idx, (question_id, subject, user_answer, is_correct) in enumerate(items):
        # answered_at 有 UNIQUE(question_id, answered_at) 约束，同秒批量写入需错开
        ts = f"{now}.{idx:03d}"
        _apply_answer(conn, question_id, subject, user_answer, is_correct, ts, track_wrong)
    conn.commit()
    conn.close()


def get_wrong_questions(subject=None, include_resolved=False, sort='recent'):
    """获取错题列表。sort: recent=最近答错优先, count=错误次数多优先"""
    conn = get_db()
    query = 'SELECT * FROM wrong_questions WHERE 1=1'
    params = []
    
    if subject:
        query += ' AND subject = ?'
        params.append(subject)
    
    if not include_resolved:
        query += ' AND is_resolved = 0'
    
    if sort == 'count':
        query += ' ORDER BY wrong_count DESC, last_wrong_at ASC'
    else:
        query += ' ORDER BY last_wrong_at DESC'
    
    results = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in results]


def toggle_favorite(question_id, subject):
    """切换收藏状态，返回当前是否收藏"""
    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM favorites WHERE question_id = ?', (question_id,)
    ).fetchone()
    
    if existing:
        conn.execute('DELETE FROM favorites WHERE question_id = ?', (question_id,))
        conn.commit()
        conn.close()
        return False
    else:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            'INSERT INTO favorites (question_id, subject, added_at) VALUES (?, ?, ?)',
            (question_id, subject, now)
        )
        conn.commit()
        conn.close()
        return True


def get_favorites(subject=None):
    """获取收藏列表"""
    conn = get_db()
    query = 'SELECT * FROM favorites WHERE 1=1'
    params = []
    
    if subject:
        query += ' AND subject = ?'
        params.append(subject)
    
    query += ' ORDER BY added_at DESC'
    
    results = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in results]


def is_favorited(question_id):
    """检查是否已收藏"""
    conn = get_db()
    result = conn.execute(
        'SELECT id FROM favorites WHERE question_id = ?', (question_id,)
    ).fetchone()
    conn.close()
    return result is not None


def get_question_status(question_id):
    """获取单题状态（最近一次答题记录）"""
    conn = get_db()
    result = conn.execute(
        'SELECT user_answer, is_correct, answered_at FROM user_progress WHERE question_id = ? ORDER BY answered_at DESC LIMIT 1',
        (question_id,)
    ).fetchone()
    conn.close()
    return dict(result) if result else None


def get_subject_stats(subject):
    """获取科目统计数据"""
    conn = get_db()
    
    # 总答题数（去重）
    total_answered = conn.execute(
        'SELECT COUNT(DISTINCT question_id) FROM user_progress WHERE subject = ?',
        (subject,)
    ).fetchone()[0]
    
    # 正确数（最近一次答对的题目数）
    correct_count = conn.execute('''
        SELECT COUNT(DISTINCT question_id) FROM user_progress 
        WHERE subject = ? AND is_correct = 1 
        AND answered_at = (SELECT MAX(answered_at) FROM user_progress p2 WHERE p2.question_id = user_progress.question_id)
    ''', (subject,)).fetchone()[0]
    
    # 错题数
    wrong_count = conn.execute(
        'SELECT COUNT(*) FROM wrong_questions WHERE subject = ? AND is_resolved = 0',
        (subject,)
    ).fetchone()[0]
    
    # 收藏数
    fav_count = conn.execute(
        'SELECT COUNT(*) FROM favorites WHERE subject = ?',
        (subject,)
    ).fetchone()[0]
    
    conn.close()
    
    return {
        'total_answered': total_answered,
        'correct_count': correct_count,
        'wrong_count': wrong_count,
        'favorite_count': fav_count,
        'accuracy': round(correct_count / total_answered * 100, 1) if total_answered > 0 else 0,
        'due_review_count': get_due_review(subject)[1]
    }


def get_overall_stats():
    """获取总体统计"""
    conn = get_db()
    
    total = conn.execute('SELECT COUNT(DISTINCT question_id) FROM user_progress').fetchone()[0]
    correct = conn.execute('''
        SELECT COUNT(DISTINCT question_id) FROM user_progress 
        WHERE is_correct = 1
        AND answered_at = (SELECT MAX(answered_at) FROM user_progress p2 WHERE p2.question_id = user_progress.question_id)
    ''').fetchone()[0]
    wrong = conn.execute('SELECT COUNT(*) FROM wrong_questions WHERE is_resolved = 0').fetchone()[0]
    favs = conn.execute('SELECT COUNT(*) FROM favorites').fetchone()[0]
    
    conn.close()
    
    return {
        'total_answered': total,
        'correct_count': correct,
        'wrong_count': wrong,
        'favorite_count': favs,
        'accuracy': round(correct / total * 100, 1) if total > 0 else 0,
        'due_review_count': get_due_review()[1]
    }


def get_answered_ids(subject):
    """获取某科目已答题目ID集合"""
    conn = get_db()
    results = conn.execute(
        'SELECT DISTINCT question_id FROM user_progress WHERE subject = ?',
        (subject,)
    ).fetchall()
    conn.close()
    return {r[0] for r in results}


def get_statuses_and_favs(subject):
    """批量查询某科目：收藏ID集合 + 每题最近一次作答状态（修复逐题查询的N+1）"""
    conn = get_db()
    fav_ids = {r[0] for r in conn.execute(
        'SELECT question_id FROM favorites WHERE subject = ?', (subject,)
    ).fetchall()}
    # 每题取 answered_at 最大的一条（同题时间戳唯一）
    rows = conn.execute('''
        SELECT p.question_id, p.user_answer, p.is_correct, p.answered_at
        FROM user_progress p
        JOIN (SELECT question_id, MAX(answered_at) AS mx FROM user_progress
              WHERE subject = ? GROUP BY question_id) t
        ON p.question_id = t.question_id AND p.answered_at = t.mx
    ''', (subject,)).fetchall()
    conn.close()
    statuses = {r['question_id']: {
        'user_answer': r['user_answer'],
        'is_correct': r['is_correct'],
        'answered_at': r['answered_at']
    } for r in rows}
    return statuses, fav_ids


# ==================== 艾宾浩斯复习 ====================

# 复习间隔（天）：连续答对 N 次后，隔 REVIEW_INTERVALS[N] 天到期再复习；streak>=5 毕业
REVIEW_INTERVALS = [1, 2, 4, 7, 15]


def get_due_review(subject=None):
    """获取今日到期的复习题ID列表（按逾期时长降序）与数量。

    零schema方案：复用 wrong_questions.correct_streak 作为复习阶段计数，
    到期时间运行时推算。与 pwa/js/backend.js 的 getDueReview 逻辑镜像，改动需双端同步。
    """
    conn = get_db()
    sql = '''
        SELECT w.question_id, w.last_wrong_at, w.is_resolved, w.correct_streak,
               (SELECT MAX(answered_at) FROM user_progress p
                WHERE p.question_id = w.question_id) AS last_answered_at
        FROM wrong_questions w
        WHERE (w.is_resolved = 0 OR w.correct_streak < 5)
    '''
    params = ()
    if subject:
        sql += ' AND w.subject = ?'
        params = (subject,)
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    now = datetime.now()
    due = []
    for r in rows:
        streak = r['correct_streak'] or 0
        # 基准时间取最近一次动态（做错或作答），只取前19位规避考试批量提交的 .NNN 后缀
        base_str = max(r['last_wrong_at'] or '', r['last_answered_at'] or '')[:19]
        if not base_str:
            continue
        try:
            base = datetime.strptime(base_str, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            continue
        # 历史迁移豁免：已解决且超过30天无动态的老错题视为已毕业，防止存量数据涌入队列
        if r['is_resolved'] and (now - base).days > 30:
            continue
        due_at = base + timedelta(days=REVIEW_INTERVALS[min(streak, 4)])
        if now >= due_at:
            due.append((now - due_at, r['question_id']))
    # 逾期越久越靠前；同逾期时长按题ID稳定排序
    due.sort(key=lambda x: (-x[0].total_seconds(), x[1]))
    ids = [qid for _, qid in due]
    return ids, len(ids)


def get_daily_stats(days=30):
    """近N天每日答题量与正确数（按 answered_at 前10位日期聚合）"""
    conn = get_db()
    rows = conn.execute('''
        SELECT substr(answered_at, 1, 10) AS day,
               COUNT(*) AS total,
               SUM(is_correct) AS correct
        FROM user_progress
        WHERE substr(answered_at, 1, 10) >= date('now', 'localtime', ?)
        GROUP BY day ORDER BY day
    ''', (f'-{int(days) - 1} days',)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ==================== 笔记 ====================

def upsert_note(question_id, subject, content, images=None):
    """新建/更新笔记；文字和图片都为空则删除"""
    conn = get_db()
    imgs = images or []
    if (content and content.strip()) or imgs:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute('''
            INSERT INTO notes (question_id, subject, content, images, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(question_id) DO UPDATE SET content = excluded.content, images = excluded.images, updated_at = excluded.updated_at
        ''', (question_id, subject, (content or '').strip(), json.dumps(imgs), now))
    else:
        conn.execute('DELETE FROM notes WHERE question_id = ?', (question_id,))
    conn.commit()
    conn.close()


def get_note(question_id):
    """获取单题笔记 {'content':文字, 'images':[dataURL]}，无则空"""
    conn = get_db()
    row = conn.execute('SELECT content, images FROM notes WHERE question_id = ?', (question_id,)).fetchone()
    conn.close()
    if not row:
        return {'content': '', 'images': []}
    return {'content': row['content'], 'images': json.loads(row['images'] or '[]')}


def get_notes_map(subject):
    """某科目全部笔记 {question_id: {'content':..., 'images':[...]}}"""
    conn = get_db()
    rows = conn.execute('SELECT question_id, content, images FROM notes WHERE subject = ?', (subject,)).fetchall()
    conn.close()
    return {r['question_id']: {'content': r['content'], 'images': json.loads(r['images'] or '[]')} for r in rows}


# ==================== 模拟考试 ====================

def save_exam_record(mode, question_ids, duration_sec, record_wrong=True):
    """创建考试会话，返回会话ID；同时废弃之前未交卷的会话"""
    conn = get_db()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("UPDATE exam_records SET status = 'abandoned' WHERE status = 'in_progress'")
    cur = conn.execute(
        'INSERT INTO exam_records (mode, question_ids, total_count, duration_sec, started_at, record_wrong) VALUES (?, ?, ?, ?, ?, ?)',
        (mode, json.dumps(question_ids), len(question_ids), duration_sec, now, int(record_wrong))
    )
    exam_id = cur.lastrowid
    conn.commit()
    conn.close()
    return exam_id


def update_exam_answers(exam_id, answers):
    """保存进行中考试的答案（随选随存，崩溃/刷新可恢复）"""
    conn = get_db()
    conn.execute(
        "UPDATE exam_records SET answers = ? WHERE id = ? AND status = 'in_progress'",
        (json.dumps(answers), exam_id)
    )
    conn.commit()
    conn.close()


def finish_exam_record(exam_id, answers, correct_count, score):
    """交卷：写入成绩并置为已提交"""
    conn = get_db()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute('''
        UPDATE exam_records SET answers = ?, correct_count = ?, score = ?,
               status = 'submitted', submitted_at = ? WHERE id = ?
    ''', (json.dumps(answers), correct_count, score, now, exam_id))
    conn.commit()
    conn.close()


def get_exam_record(exam_id):
    """按ID取考试会话"""
    conn = get_db()
    row = conn.execute('SELECT * FROM exam_records WHERE id = ?', (exam_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_exam():
    """取当前进行中的考试会话（最多一个）"""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM exam_records WHERE status = 'in_progress' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_exam_records(limit=50):
    """历史成绩列表（已交卷）"""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, mode, total_count, correct_count, score, duration_sec, started_at, submitted_at "
        "FROM exam_records WHERE status = 'submitted' ORDER BY submitted_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ==================== 打卡完成状态 ====================

def get_daka_progress():
    """全部已打卡题：{question_id: done_at}"""
    conn = get_db()
    rows = conn.execute('SELECT question_id, done_at FROM daka_progress WHERE done = 1').fetchall()
    conn.close()
    return {r['question_id']: r['done_at'] for r in rows}


def set_daka_progress(question_id, done):
    """打卡/取消打卡"""
    conn = get_db()
    if done:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            'INSERT INTO daka_progress (question_id, done, done_at) VALUES (?, 1, ?) '
            'ON CONFLICT(question_id) DO UPDATE SET done = 1, done_at = ?',
            (question_id, now, now))
    else:
        conn.execute('DELETE FROM daka_progress WHERE question_id = ?', (question_id,))
    conn.commit()
    conn.close()


# ==================== 数据备份 ====================

def export_all():
    """导出全部学习数据（与PWA版统一结构，不含自增主键；exam的JSON字段解析成对象）"""
    conn = get_db()
    progress = [dict(r) for r in conn.execute(
        'SELECT question_id, subject, user_answer, is_correct, answered_at FROM user_progress').fetchall()]
    wrong = [dict(r) for r in conn.execute(
        'SELECT question_id, subject, wrong_count, last_wrong_at, is_resolved, correct_streak FROM wrong_questions').fetchall()]
    favorites = [dict(r) for r in conn.execute(
        'SELECT question_id, subject, added_at FROM favorites').fetchall()]
    notes = []
    for r in conn.execute('SELECT question_id, subject, content, images, updated_at FROM notes').fetchall():
        n = dict(r)
        n['images'] = json.loads(n['images'] or '[]')
        notes.append(n)
    exams = []
    for r in conn.execute(
            'SELECT mode, question_ids, answers, total_count, correct_count, score, duration_sec, status, started_at, submitted_at, record_wrong '
            'FROM exam_records').fetchall():
        e = dict(r)
        e['question_ids'] = json.loads(e['question_ids'] or '[]')
        e['answers'] = json.loads(e['answers'] or '{}')
        exams.append(e)
    daka = [dict(r) for r in conn.execute(
        'SELECT question_id, done, done_at FROM daka_progress').fetchall()]
    conn.close()
    return {'progress': progress, 'wrong': wrong, 'favorites': favorites, 'notes': notes,
            'exams': exams, 'daka': daka}


def import_all(payload):
    """导入备份（全量覆盖6张表，单事务），返回各表导入条数"""
    conn = get_db()
    for table in ('user_progress', 'wrong_questions', 'favorites', 'notes', 'exam_records', 'daka_progress'):
        conn.execute(f'DELETE FROM {table}')
    for r in payload.get('progress') or []:
        conn.execute(
            'INSERT OR IGNORE INTO user_progress (question_id, subject, user_answer, is_correct, answered_at) VALUES (?, ?, ?, ?, ?)',
            (r.get('question_id'), r.get('subject'), r.get('user_answer', ''),
             int(r.get('is_correct') or 0), r.get('answered_at', '')))
    for r in payload.get('wrong') or []:
        conn.execute(
            'INSERT OR IGNORE INTO wrong_questions (question_id, subject, wrong_count, last_wrong_at, is_resolved, correct_streak) VALUES (?, ?, ?, ?, ?, ?)',
            (r.get('question_id'), r.get('subject'), int(r.get('wrong_count') or 1), r.get('last_wrong_at', ''),
             int(r.get('is_resolved') or 0), int(r.get('correct_streak') or 0)))
    for r in payload.get('favorites') or []:
        conn.execute(
            'INSERT OR IGNORE INTO favorites (question_id, subject, added_at) VALUES (?, ?, ?)',
            (r.get('question_id'), r.get('subject'), r.get('added_at', '')))
    for r in payload.get('notes') or []:
        conn.execute(
            'INSERT OR IGNORE INTO notes (question_id, subject, content, images, updated_at) VALUES (?, ?, ?, ?, ?)',
            (r.get('question_id'), r.get('subject'), r.get('content', ''),
             json.dumps(r.get('images') or []), r.get('updated_at', '')))
    for r in payload.get('exams') or []:
        conn.execute(
            'INSERT INTO exam_records (mode, question_ids, answers, total_count, correct_count, score, duration_sec, status, started_at, submitted_at, record_wrong) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (r.get('mode', 'full'), json.dumps(r.get('question_ids') or []), json.dumps(r.get('answers') or {}),
             int(r.get('total_count') or 0), int(r.get('correct_count') or 0), float(r.get('score') or 0),
             int(r.get('duration_sec') or 0), r.get('status', 'submitted'), r.get('started_at', ''), r.get('submitted_at'),
             int(r.get('record_wrong', 1) or 0)))
    for r in payload.get('daka') or []:
        conn.execute(
            'INSERT OR IGNORE INTO daka_progress (question_id, done, done_at) VALUES (?, ?, ?)',
            (r.get('question_id'), int(r.get('done') or 1), r.get('done_at', '')))
    conn.commit()
    conn.close()
    return {k: len(payload.get(k) or []) for k in ('progress', 'wrong', 'favorites', 'notes', 'exams', 'daka')}


# 初始化数据库
if not os.path.exists(DB_PATH):
    init_db()
