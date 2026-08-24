/* 408刷题 PWA - 本地"后端"：题库加载 + IndexedDB 存储 + api() 路由
 * 与 Flask 版 app.py/database.py 逐一对应，页面脚本用 api(url, opts) 代替 fetch(url, opts)。
 */

const SUBJECTS = {
    os: { name: '操作系统', json: 'os.json' },
    co: { name: '计算机组成原理', json: 'co.json' },
    ds: { name: '数据结构', json: 'ds.json' },
    cn: { name: '计算机网络', json: 'cn.json' }
};

// 真题标记：【2xxx统考真题】（容忍OCR空格与"年"字变体）
const REAL_EXAM_RE = /【\s*(2\s*0\s*\d\s*\d)\s*年?\s*统\s*考\s*真\s*题\s*】/;
const TAG_RE = /<[^>]+>/g;

// ==================== 题库加载（内存缓存） ====================
const _qCache = {};      // {subject: data}
const _searchTexts = {}; // {subject: [(id, 小写去HTML文本)]}

async function loadQuestions(key) {
    if (_qCache[key]) return _qCache[key];
    const resp = await fetch(`data/${SUBJECTS[key].json}`);
    const data = await resp.json();
    const texts = [];
    for (const q of data.questions) {
        const m = REAL_EXAM_RE.exec((q.content || '').slice(0, 80));
        q.is_real_exam = !!m;
        q.exam_year = m ? parseInt(m[1].replace(/\s/g, ''), 10) : null;
        const raw = (q.content || '') + ' ' + Object.values(q.options || {}).join(' ') + ' ' + (q.explanation || '');
        texts.push([q.id, raw.replace(TAG_RE, ' ').toLowerCase()]);
    }
    _searchTexts[key] = texts;
    _qCache[key] = data;
    return data;
}

async function getQuestionById(qid) {
    const key = qid.split('_')[0];
    if (!SUBJECTS[key]) return null;
    const data = await loadQuestions(key);
    return data.questions.find(q => q.id === qid) || null;
}

// 题量元数据：首页 /api/stats 只需各科总题数画进度条，无需整份题库。
// 抽成几百字节的 data/meta.json，避免首页下载 ~2.1MB 题库（性能优化）。
const _metaCache = { promise: null };
async function getTotals() {
    if (_metaCache.promise) return _metaCache.promise;
    _metaCache.promise = (async () => {
        try {
            const r = await fetch('data/meta.json');
            return await r.json();
        } catch (e) {
            console.warn('meta.json 读取失败，总题数回退为 0', e);
            return { subjects: {}, ds_daka: 0 };
        }
    })();
    return _metaCache.promise;
}

// 知识库笔记索引：用于搜题覆盖知识点（P1-3）与章节↔题目互链（P1-4）。
// 结构：{chapters:[{chapter, sections:[{section, html}]}]}
const _notesCache = {};
const _notesIndex = {};
async function loadNotes(subject) {
    if (_notesCache[subject]) return _notesCache[subject];
    const resp = await fetch(`data/notes/${subject}_notes.json`);
    const data = await resp.json();
    _notesCache[subject] = data;
    const texts = [];
    for (const ch of (data.chapters || [])) {
        for (const sec of (ch.sections || [])) {
            texts.push({
                chapter: ch.chapter || '',
                section: sec.section || '',
                html: sec.html || '',
                text: (sec.html || '').replace(TAG_RE, ' ').toLowerCase()
            });
        }
    }
    _notesIndex[subject] = texts;
    return data;
}

// ==================== IndexedDB ====================
const DB_NAME = 'quiz408';
const DB_VER = 2;
let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
            const db = req.result;
            // 幂等建库：只新增缺失的 store，不动老数据（v2 新增 daka_progress）
            if (!db.objectStoreNames.contains('progress')) {
                const prog = db.createObjectStore('progress', { keyPath: 'pk', autoIncrement: true });
                prog.createIndex('by_qid', 'question_id');
                prog.createIndex('by_subject', 'subject');
            }
            for (const s of ['wrong', 'favorites', 'notes']) {
                if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'question_id' });
            }
            if (!db.objectStoreNames.contains('exams')) {
                db.createObjectStore('exams', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('daka_progress')) {
                db.createObjectStore('daka_progress', { keyPath: 'question_id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

// Promise 化的通用读写
async function dbAll(store) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function dbGet(store, key) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function dbPut(store, val) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).put(val);
        r.onsuccess = () => res(r.result);
        tx.onerror = () => rej(tx.error);
    });
}

async function dbDelete(store, key) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

function now() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ==================== 答题记录（对应 database._apply_answer） ====================
async function applyAnswer(qid, subject, userAnswer, isCorrect, ts, trackWrong = true) {
    await dbPut('progress', { question_id: qid, subject, user_answer: userAnswer, is_correct: isCorrect ? 1 : 0, answered_at: ts });
    const w = await dbGet('wrong', qid);
    if (!isCorrect) {
        if (!trackWrong) return; // 错题不入错题本（考试可选关闭）
        if (w) {
            w.wrong_count += 1; w.last_wrong_at = ts; w.is_resolved = 0; w.correct_streak = 0;
            await dbPut('wrong', w);
        } else {
            await dbPut('wrong', { question_id: qid, subject, wrong_count: 1, last_wrong_at: ts, is_resolved: 0, correct_streak: 0 });
        }
    } else if (w) {
        // 答对：连对计数+1，连对满2次移出错题本（置已解决，保留记录）
        w.correct_streak = (w.correct_streak || 0) + 1;
        if (w.correct_streak >= 2) w.is_resolved = 1;
        await dbPut('wrong', w);
    }
}

// 每题最近一次作答 {qid: {user_answer, is_correct, answered_at}}
async function latestStatuses(subject) {
    const rows = await dbAll('progress');
    const map = {};
    for (const r of rows) {
        if (subject && r.subject !== subject) continue;
        const old = map[r.question_id];
        if (!old || r.answered_at >= old.answered_at) {
            map[r.question_id] = { user_answer: r.user_answer, is_correct: r.is_correct, answered_at: r.answered_at };
        }
    }
    return map;
}

async function subjectStats(subject) {
    const statuses = await latestStatuses(subject);
    const ids = Object.keys(statuses);
    const correct = ids.filter(k => statuses[k].is_correct).length;
    const wrongs = (await dbAll('wrong')).filter(w => (!subject || w.subject === subject) && !w.is_resolved).length;
    const favs = (await dbAll('favorites')).filter(f => !subject || f.subject === subject).length;
    return {
        total_answered: ids.length,
        correct_count: correct,
        wrong_count: wrongs,
        favorite_count: favs,
        accuracy: ids.length ? Math.round(correct / ids.length * 1000) / 10 : 0,
        due_review_count: (await getDueReview(subject)).count
    };
}

// ==================== 艾宾浩斯复习（对应 database.get_due_review，改动需双端同步） ====================
// 复习间隔（天）：连续答对 N 次后，隔 REVIEW_INTERVALS[min(N,末位)] 天到期再复习；走完全部间隔（连对4次）毕业
const REVIEW_INTERVALS = [2, 4, 7, 15];

// 单题复习阶段计算：返回 {qid, interval(当前间隔天数), dueAt} 或 null（无动态/已豁免）
function _reviewStageOf(w, st, nowMs) {
    const streak = w.correct_streak || 0;
    const la = st ? st.answered_at || '' : '';
    // 基准时间取最近一次动态（做错或作答），只取前19位规避考试批量提交的 .NNN 后缀
    const baseStr = ((w.last_wrong_at || '') > la ? w.last_wrong_at || '' : la).slice(0, 19);
    if (!baseStr) return null;
    // 用 T 分隔符解析，规避 Safari 不认空格分隔的日期格式
    const base = new Date(baseStr.replace(' ', 'T')).getTime();
    if (isNaN(base)) return null;
    // 历史迁移豁免：已解决且超过30天无动态的老错题视为已毕业，防止存量数据涌入队列
    if (w.is_resolved && nowMs - base > 30 * 86400000) return null;
    const interval = REVIEW_INTERVALS[Math.min(streak, REVIEW_INTERVALS.length - 1)];
    return { qid: w.question_id, interval, dueAt: base + interval * 86400000 };
}

// stage：可选，只保留处于该间隔天数阶段的到期题（阶段筛选 chips 用）
async function getDueReview(subject, stage) {
    const wrongs = (await dbAll('wrong')).filter(w =>
        (!subject || w.subject === subject) && (!w.is_resolved || (w.correct_streak || 0) < REVIEW_INTERVALS.length));
    const statuses = await latestStatuses(subject);
    const nowMs = Date.now();
    const due = [];
    for (const w of wrongs) {
        const info = _reviewStageOf(w, statuses[w.question_id], nowMs);
        if (!info) continue;
        if (nowMs >= info.dueAt && (!stage || info.interval === stage))
            due.push([nowMs - info.dueAt, info.qid]);
    }
    // 逾期越久越靠前；同逾期时长按题ID稳定排序
    due.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
    return { ids: due.map(x => x[1]), count: due.length };
}

// 阶段明细：各间隔阶段的题 id 分组 + 各阶段到期数 + 未来3天内即将到期预告（阶段 chips / 规划用）
async function getDueReviewDetailed(subject) {
    const wrongs = (await dbAll('wrong')).filter(w =>
        (!subject || w.subject === subject) && (!w.is_resolved || (w.correct_streak || 0) < REVIEW_INTERVALS.length));
    const statuses = await latestStatuses(subject);
    const nowMs = Date.now();
    const stages = {};              // {interval天数: [qid...]} 该阶段全部题
    const stageDue = {};            // {interval天数: 该阶段今日到期数}
    let dueCount = 0;
    const upcoming = [];            // [{qid, inDays, interval}]
    for (const w of wrongs) {
        const info = _reviewStageOf(w, statuses[w.question_id], nowMs);
        if (!info) continue;
        (stages[info.interval] = stages[info.interval] || []).push(info.qid);
        if (nowMs >= info.dueAt) {
            dueCount++;
            stageDue[info.interval] = (stageDue[info.interval] || 0) + 1;
        } else {
            const days = (info.dueAt - nowMs) / 86400000;
            if (days <= 3) upcoming.push({ qid: info.qid, inDays: Math.ceil(days), interval: info.interval });
        }
    }
    upcoming.sort((a, b) => a.inDays - b.inDays || (a.qid < b.qid ? -1 : 1));
    return { stages, stageDue, dueCount, upcoming };
}

// ==================== api() 路由 ====================
function jsonResp(obj, status = 200) {
    return { ok: status < 400, status, json: async () => obj };
}

async function api(url, opts = {}) {
    const u = new URL(url, location.href);
    const path = u.pathname.replace(/^.*\/api\//, '/api/');
    const p = u.searchParams;
    const body = opts.body ? JSON.parse(opts.body) : {};
    const seg = path.split('/').filter(Boolean); // ['api', ...]

    try {
        // ---------- 题目列表 ----------
        if (seg[1] === 'questions') {
            const subject = seg[2];
            if (!SUBJECTS[subject]) return jsonResp({ error: '科目不存在' }, 404);
            const mode = p.get('mode') || 'sequential';
            const page = parseInt(p.get('page') || '1', 10);
            const perPage = parseInt(p.get('per_page') || '1', 10);
            const chapter = p.get('chapter') || '';
            const section = p.get('section') || '';

            const data = await loadQuestions(subject);
            let qs = data.questions;
            if (chapter) qs = qs.filter(q => q.chapter === chapter);
            if (section) qs = qs.filter(q => q.section === section);

            const statuses = await latestStatuses(subject);
            const favSet = new Set((await dbAll('favorites')).filter(f => f.subject === subject).map(f => f.question_id));

            if (mode === 'random') {
                qs = qs.slice();
                for (let i = qs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [qs[i], qs[j]] = [qs[j], qs[i]];
                }
            } else if (mode === 'real') {
                qs = qs.filter(q => q.is_real_exam);
            } else if (mode === 'code') {
                // 代码专项：只出含代码块的题
                qs = qs.filter(q => (q.content || '').includes('<pre class="code-block"'));
            } else if (mode === 'wrong') {
                const wrongIds = new Set((await dbAll('wrong')).filter(w => w.subject === subject && !w.is_resolved).map(w => w.question_id));
                qs = qs.filter(q => wrongIds.has(q.id));
            } else if (mode === 'favorite') {
                qs = qs.filter(q => favSet.has(q.id));
            } else if (mode === 'fav_real') {
                // 收藏+真题混合：既是收藏题又是统考真题
                qs = qs.filter(q => favSet.has(q.id) && q.is_real_exam);
            } else if (mode === 'unanswered') {
                qs = qs.filter(q => !statuses[q.id]);
            } else if (mode === 'review') {
                // 艾宾浩斯复习：只出今日到期的错题，保持逾期时长降序；?stage=N 只刷该间隔阶段
                const { ids } = await getDueReview(subject, p.get('stage') ? parseInt(p.get('stage'), 10) : null);
                const order = new Map(ids.map((id, i) => [id, i]));
                qs = qs.filter(q => order.has(q.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
            } else if (mode === 'smart') {
                // 智能推题：按章节正确率加权乱序，正确率越低、未做题越多的章节越先出现
                const chStat = {};
                for (const q of data.questions) {
                    const ch = q.chapter || '未分类';
                    if (!chStat[ch]) chStat[ch] = { answered: 0, correct: 0 };
                    const st = statuses[q.id];
                    if (st) { chStat[ch].answered++; if (st.is_correct) chStat[ch].correct++; }
                }
                const wrongMap = {};
                for (const w of await dbAll('wrong')) if (w.subject === subject) wrongMap[w.question_id] = w;
                const wd = new Date(Date.now() - 7 * 86400000), wp = n => String(n).padStart(2, '0');
                const weekAgo = `${wd.getFullYear()}-${wp(wd.getMonth() + 1)}-${wp(wd.getDate())} ${wp(wd.getHours())}:${wp(wd.getMinutes())}:${wp(wd.getSeconds())}`;
                const weight = q => {
                    const st = chStat[q.chapter || '未分类'] || { answered: 0, correct: 0 };
                    const acc = st.answered ? st.correct / st.answered : 0;
                    let w = (1 - acc) + (statuses[q.id] ? 0 : 0.3);
                    // 题目级加权：反复错的题更优先；久未碰的题适当提权
                    const wr = wrongMap[q.id];
                    if (wr && !wr.is_resolved && wr.wrong_count >= 2) w += 0.5;
                    const s = statuses[q.id];
                    if (s && (s.answered_at || '') < weekAgo) w += 0.3;
                    return Math.max(w, 0.05);
                };
                // 加权随机洗牌（Efraimidis-Spirakis）：权重越大排序键越大、越靠前
                qs = qs.map(q => [Math.pow(Math.random(), 1 / weight(q)), q])
                    .sort((a, b) => b[0] - a[0])
                    .map(x => x[1]);
            }

            const total = qs.length;
            const pageQs = qs.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
            const notes = {};
            for (const n of await dbAll('notes')) if (n.subject === subject) notes[n.question_id] = n;
            const result = pageQs.map(q => ({
                ...q,
                is_favorited: favSet.has(q.id),
                last_status: statuses[q.id] || null,
                note: notes[q.id] ? notes[q.id].content : '',
                note_images: (notes[q.id] && notes[q.id].images) || []
            }));
            return jsonResp({ subject: data.subject, total, page, per_page: perPage, questions: result });
        }

        // ---------- 章节树 ----------
        if (seg[1] === 'chapters') {
            const result = {};
            for (const [key, info] of Object.entries(SUBJECTS)) {
                const data = await loadQuestions(key);
                const chapters = [], chMap = {};
                for (const q of data.questions) {
                    const ch = q.chapter || '未分类', sec = q.section || '';
                    if (!chMap[ch]) { chMap[ch] = { name: ch, count: 0, sections: [], smap: {} }; chapters.push(chMap[ch]); }
                    const node = chMap[ch];
                    node.count++;
                    if (sec) {
                        if (!node.smap[sec]) { node.smap[sec] = { name: sec, count: 0 }; node.sections.push(node.smap[sec]); }
                        node.smap[sec].count++;
                    }
                }
                chapters.forEach(n => delete n.smap);
                result[key] = { name: info.name, total: data.total, chapters };
            }
            return jsonResp(result);
        }

        // ---------- 提交答案 ----------
        if (seg[1] === 'submit') {
            const qid = body.question_id;
            const ua = (body.answer || '').toUpperCase();
            if (!qid || !ua) return jsonResp({ error: '缺少参数' }, 400);
            const q = await getQuestionById(qid);
            if (!q) return jsonResp({ error: '题目不存在' }, 404);
            const ca = q.answer || '';
            if (!ca) {
                return jsonResp({ question_id: qid, user_answer: ua, correct_answer: '', is_correct: null, message: '该题暂无标准答案，无法批改', explanation: q.explanation || '' });
            }
            const ok = ua === ca;
            await applyAnswer(qid, qid.split('_')[0], ua, ok, now());
            return jsonResp({ question_id: qid, user_answer: ua, correct_answer: ca, is_correct: ok, explanation: q.explanation || '' });
        }

        // ---------- 收藏切换 ----------
        if (seg[1] === 'favorite') {
            const qid = seg[2];
            const subject = qid.split('_')[0];
            if (!SUBJECTS[subject]) return jsonResp({ error: '无效的题目ID' }, 400);
            const existing = await dbGet('favorites', qid);
            if (existing) {
                await dbDelete('favorites', qid);
                return jsonResp({ question_id: qid, is_favorited: false });
            }
            await dbPut('favorites', { question_id: qid, subject, added_at: now() });
            return jsonResp({ question_id: qid, is_favorited: true });
        }

        // ---------- 错题列表 ----------
        if (seg[1] === 'wrong') {
            const subject = p.get('subject') || null;
            const includeResolved = p.get('include_resolved') === 'true';
            const sort = p.get('sort') || 'recent';
            const realOnly = p.get('real_only') === 'true';
            let list = (await dbAll('wrong')).filter(w =>
                (!subject || w.subject === subject) && (includeResolved || !w.is_resolved));
            list.sort(sort === 'count'
                ? (a, b) => b.wrong_count - a.wrong_count || (a.last_wrong_at < b.last_wrong_at ? -1 : 1)
                : (a, b) => (a.last_wrong_at > b.last_wrong_at ? -1 : 1));
            const result = [];
            for (const w of list) {
                const q = await getQuestionById(w.question_id);
                if (!q) continue;
                if (realOnly && !q.is_real_exam) continue;
                result.push({ ...w, ...q });
            }
            return jsonResp({ wrong_questions: result, total: result.length });
        }

        // ---------- 收藏列表 / 收藏清空重做 ----------
        if (seg[1] === 'favorites') {
            if (seg[2] === 'reset') {
                // 只清收藏题的作答与错题记录，收藏本身保留（对应 app.py /api/favorites/reset）
                const subject = seg[3];
                if (!SUBJECTS[subject]) return jsonResp({ error: '科目不存在' }, 404);
                const favIds = new Set((await dbAll('favorites')).filter(f => f.subject === subject).map(f => f.question_id));
                if (favIds.size) {
                    const db = await openDB();
                    for (const store of ['progress', 'wrong']) {
                        const rows = await dbAll(store);
                        const tx = db.transaction(store, 'readwrite');
                        for (const r of rows) {
                            if (favIds.has(r.question_id)) tx.objectStore(store).delete(store === 'progress' ? r.pk : r.question_id);
                        }
                        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
                    }
                }
                return jsonResp({ success: true, cleared: favIds.size });
            }
            const subject = p.get('subject') || null;
            const list = (await dbAll('favorites')).filter(f => !subject || f.subject === subject);
            list.sort((a, b) => (a.added_at > b.added_at ? -1 : 1));
            const result = [];
            for (const f of list) {
                const q = await getQuestionById(f.question_id);
                if (q) result.push({ ...f, ...q });
            }
            return jsonResp({ favorites: result, total: result.length });
        }

        // ---------- 复习阶段明细（阶段筛选 chips 数据源） ----------
        if (seg[1] === 'review' && seg[2] === 'stages') {
            const subject = p.get('subject') || null;
            return jsonResp(await getDueReviewDetailed(subject));
        }

        // ---------- 统计 ----------
        if (seg[1] === 'stats' && !seg[2]) {
            const overall = await subjectStats(null);
            const totals = await getTotals();
            const subjects = {};
            for (const key of Object.keys(SUBJECTS)) {
                const total = (totals.subjects && totals.subjects[key] && totals.subjects[key].total) || 0;
                // 复习阶段明细：{1:[qid...],2:...,4:...,7:...,15:...}，首页阶段 chips 用
                const detail = await getDueReviewDetailed(key);
                subjects[key] = {
                    ...(await subjectStats(key)), total_questions: total, name: SUBJECTS[key].name,
                    review_stages: detail.stages, review_stage_due: detail.stageDue, review_upcoming: detail.upcoming.length
                };
            }
            return jsonResp({ overall, subjects });
        }

        if (seg[1] === 'stats' && seg[2] === 'daily') {
            const days = Math.min(parseInt(p.get('days') || '30', 10), 365);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (days - 1));
            const cutStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
            const byDay = {};
            for (const r of await dbAll('progress')) {
                const day = r.answered_at.slice(0, 10);
                if (day < cutStr) continue;
                if (!byDay[day]) byDay[day] = { day, total: 0, correct: 0 };
                byDay[day].total++;
                byDay[day].correct += r.is_correct ? 1 : 0;
            }
            const data = Object.values(byDay).sort((a, b) => (a.day < b.day ? -1 : 1));
            return jsonResp({ days, data });
        }

        if (seg[1] === 'stats' && seg[2] === 'mastery') {
            const result = {};
            for (const [key, info] of Object.entries(SUBJECTS)) {
                const data = await loadQuestions(key);
                const statuses = await latestStatuses(key);
                const chMap = {}, chapters = [];
                for (const q of data.questions) {
                    const ch = q.chapter || '未分类';
                    if (!chMap[ch]) { chMap[ch] = { name: ch, total: 0, answered: 0, correct: 0 }; chapters.push(chMap[ch]); }
                    const node = chMap[ch];
                    node.total++;
                    const st = statuses[q.id];
                    if (st) { node.answered++; if (st.is_correct) node.correct++; }
                }
                result[key] = { name: info.name, chapters };
            }
            return jsonResp(result);
        }

        // ---------- 搜题（题目 + 知识库笔记） ----------
        if (seg[1] === 'search') {
            const kw = (p.get('q') || '').trim().toLowerCase();
            const subject = p.get('subject') || '';
            if (!kw) return jsonResp({ results: [], total: 0, notes: [], notes_total: 0 });
            const keys = SUBJECTS[subject] ? [subject] : Object.keys(SUBJECTS);
            const results = [];
            outer:
            for (const key of keys) {
                const data = await loadQuestions(key);
                const qmap = {};
                for (const q of data.questions) qmap[q.id] = q;
                for (const [qid, text] of _searchTexts[key]) {
                    if (!text.includes(kw)) continue;
                    const q = qmap[qid];
                    results.push({
                        id: qid, subject: key, subject_name: SUBJECTS[key].name,
                        number: q.number, content: q.content || '', options: q.options,
                        chapter: q.chapter || '', section: q.section || '',
                        is_real_exam: q.is_real_exam || false,
                        exam_year: q.exam_year || null
                    });
                    if (results.length >= 50) break outer;
                }
            }
            // 同时检索知识库笔记正文，最多 20 条
            const notesResults = [];
            notesOuter:
            for (const key of keys) {
                await loadNotes(key);
                for (const n of (_notesIndex[key] || [])) {
                    if (!n.text.includes(kw)) continue;
                    notesResults.push({
                        subject: key, subject_name: SUBJECTS[key].name,
                        chapter: n.chapter, section: n.section, html: n.html
                    });
                    if (notesResults.length >= 20) break notesOuter;
                }
            }
            return jsonResp({ results, total: results.length, notes: notesResults, notes_total: notesResults.length });
        }

        // ---------- 笔记 ----------
        if (seg[1] === 'note') {
            const qid = seg[2];
            const subject = qid.split('_')[0];
            if (!SUBJECTS[subject]) return jsonResp({ error: '无效的题目ID' }, 400);
            if ((opts.method || 'GET') === 'GET') {
                const n = await dbGet('notes', qid);
                return jsonResp({ question_id: qid, note: n ? n.content : '', images: (n && n.images) || [] });
            }
            const content = (body.content || '').trim();
            const images = Array.isArray(body.images) ? body.images : [];
            if (content || images.length) {
                await dbPut('notes', { question_id: qid, subject, content, images, updated_at: now() });
            } else {
                await dbDelete('notes', qid);
            }
            return jsonResp({ success: true, note: content, images });
        }

        // ---------- 数据结构强化打卡 ----------
        if (seg[1] === 'daka' && seg[2] === 'progress') {
            if ((opts.method || 'GET') === 'GET') {
                const rows = await dbAll('daka_progress');
                const progress = {};
                for (const r of rows) if (r.done) progress[r.question_id] = r.done_at;
                return jsonResp({ progress });
            }
            const qid = body.question_id || '';
            if (!qid.startsWith('ds_daka_')) return jsonResp({ error: '无效的题目ID' }, 400);
            if (body.done) {
                await dbPut('daka_progress', { question_id: qid, done: 1, done_at: now() });
            } else {
                await dbDelete('daka_progress', qid);
            }
            return jsonResp({ success: true });
        }

        // ---------- 模拟考试 ----------
        if (seg[1] === 'exam') return examApi(seg[2], body, seg[3]);

        // ---------- 数据备份 ----------
        if (seg[1] === 'backup' && seg[2] === 'export') {
            const strip = (rows, key) => rows.map(r => { const o = { ...r }; delete o[key]; return o; });
            return jsonResp({
                version: 1, exported_at: now(), source: 'pwa',
                progress: strip(await dbAll('progress'), 'pk'),
                wrong: await dbAll('wrong'),
                favorites: await dbAll('favorites'),
                notes: await dbAll('notes'),
                exams: strip(await dbAll('exams'), 'id'),
                daka: await dbAll('daka_progress')
            });
        }
        if (seg[1] === 'backup' && seg[2] === 'import') {
            if (!Array.isArray(body.progress)) return jsonResp({ error: '备份文件格式不正确' }, 400);
            const db = await openDB();
            const counts = {};
            // daka 存于备份的 'daka' 键，落库到 daka_progress store
            const storeMap = { progress: 'progress', wrong: 'wrong', favorites: 'favorites', notes: 'notes', exams: 'exams', daka: 'daka_progress' };
            for (const [key, store] of Object.entries(storeMap)) {
                const rows = Array.isArray(body[key]) ? body[key] : [];
                await new Promise((res, rej) => {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).clear();
                    for (const r of rows) {
                        // 剥离外来自增主键，由本库重新分配
                        const o = { ...r }; delete o.pk; delete o.id;
                        tx.objectStore(store).put(o);
                    }
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
                counts[key] = rows.length;
            }
            return jsonResp({ success: true, counts });
        }

        // ---------- 重置进度 ----------
        if (seg[1] === 'reset_progress') {
            const subject = body.subject;
            const db = await openDB();
            for (const store of ['progress', 'wrong']) {
                const rows = await dbAll(store);
                const tx = db.transaction(store, 'readwrite');
                for (const r of rows) {
                    if (!subject || r.subject === subject) tx.objectStore(store).delete(store === 'progress' ? r.pk : r.question_id);
                }
                await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
            }
            return jsonResp({ success: true });
        }

        return jsonResp({ error: '未知接口: ' + path }, 404);
    } catch (e) {
        console.error('api error', path, e);
        return jsonResp({ error: e.message }, 500);
    }
}

// ==================== 模拟考试（对应 app.py 考试 API） ====================
const EXAM_RATIO = { ds: 45, co: 45, os: 35, cn: 25 };

function stripAnswer(q) {
    const { answer, explanation, ...rest } = q;
    return rest;
}

async function gradeExam(exam, answers) {
    const details = [];
    let correct = 0;
    const perSubject = {}, perChapter = {};
    const ts = now();
    let idx = 0;
    for (const qid of exam.question_ids) {
        const q = await getQuestionById(qid);
        if (!q) continue;
        const subj = qid.split('_')[0];
        const ua = (answers[qid] || '').toUpperCase();
        const ok = !!ua && ua === (q.answer || '');
        if (ok) correct++;
        if (!perSubject[subj]) perSubject[subj] = { key: subj, name: SUBJECTS[subj].name, total: 0, correct: 0 };
        perSubject[subj].total++;
        perSubject[subj].correct += ok ? 1 : 0;
        const ch = q.chapter || '未分类';
        const ck = subj + '|' + ch;
        if (!perChapter[ck]) perChapter[ck] = { subject: SUBJECTS[subj].name, chapter: ch, total: 0, wrong: 0 };
        perChapter[ck].total++;
        if (!ok) perChapter[ck].wrong++;
        details.push({
            id: qid, number: q.number, content: q.content || '', options: q.options,
            user_answer: ua, correct_answer: q.answer || '', is_correct: ok,
            multi_blank: !!q.multi_blank,
            explanation: q.explanation || '', chapter: q.chapter || '', section: q.section || ''
        });
        // 错题是否入错题本由组卷时的开关决定（答题记录照常计入统计，时间戳错开保持顺序）
        if (ua) await applyAnswer(qid, subj, ua, ok, `${ts}.${String(idx).padStart(3, '0')}`, exam.record_wrong !== 0);
        idx++;
    }
    const total = details.length;
    const score = total ? Math.round(correct / total * 1000) / 10 : 0;
    exam.answers = answers;
    exam.correct_count = correct;
    exam.score = score;
    exam.status = 'submitted';
    exam.submitted_at = now();
    await dbPut('exams', exam);
    return {
        exam_id: exam.id, total, correct, score,
        per_subject: Object.values(perSubject),
        chapter_loss: Object.values(perChapter).filter(c => c.wrong > 0),
        details
    };
}

async function examApi(action, body, arg) {
    if (action === 'generate') {
        const mode = body.mode || 'full';
        const count = parseInt(body.count || 0, 10);
        let picked = [];
        const sample = (pool, n) => {
            const arr = pool.slice();
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr.slice(0, Math.min(n, arr.length));
        };
        if (mode === 'full') {
            const total = count ? Math.min(Math.max(count, 10), 150) : 40; // 越界收拢到范围内
            const ratioSum = Object.values(EXAM_RATIO).reduce((a, b) => a + b, 0);
            const quotas = {};
            for (const [k, v] of Object.entries(EXAM_RATIO)) quotas[k] = Math.floor(total * v / ratioSum);
            const order = ['ds', 'co', 'os', 'cn'];
            let i = 0;
            while (Object.values(quotas).reduce((a, b) => a + b, 0) < total) { quotas[order[i % 4]]++; i++; }
            for (const key of order) {
                const pool = (await loadQuestions(key)).questions.filter(q => q.answer);
                picked = picked.concat(sample(pool, quotas[key]));
            }
        } else if (SUBJECTS[mode]) {
            const total = count ? Math.min(Math.max(count, 5), 100) : 20;
            const pool = (await loadQuestions(mode)).questions.filter(q => q.answer);
            picked = sample(pool, total);
        } else if (mode === 'favorites') {
            // 仅收藏题：从收藏夹中随机抽取
            const favs = await dbAll('favorites');
            const pool = [];
            for (const f of favs) {
                const q = await getQuestionById(f.question_id);
                if (q && q.answer) pool.push(q);
            }
            const total = count ? Math.min(Math.max(count, 5), Math.max(pool.length, 5)) : Math.min(20, pool.length);
            picked = sample(pool, total);
        } else if (mode === 'wrong') {
            // 仅错题：从错题本（未解决的）中随机抽取
            const wrongs = (await dbAll('wrong')).filter(w => !w.is_resolved);
            const pool = [];
            for (const w of wrongs) {
                const q = await getQuestionById(w.question_id);
                if (q && q.answer) pool.push(q);
            }
            const total = count ? Math.min(Math.max(count, 5), Math.max(pool.length, 5)) : Math.min(20, pool.length);
            picked = sample(pool, total);
        } else {
            return jsonResp({ error: '无效的考试模式' }, 400);
        }
        if (!picked.length) return jsonResp({ error: '题库为空，无法组卷' }, 400);
        const duration = parseInt(body.duration_sec || 0, 10) || picked.length * 60;
        // 废弃之前未交卷的会话
        for (const e of await dbAll('exams')) {
            if (e.status === 'in_progress') { e.status = 'abandoned'; await dbPut('exams', e); }
        }
        const examId = await dbPut('exams', {
            mode, question_ids: picked.map(q => q.id), answers: {},
            total_count: picked.length, correct_count: 0, score: 0,
            duration_sec: duration, status: 'in_progress', started_at: now(), submitted_at: null,
            record_wrong: body.record_wrong === false ? 0 : 1
        });
        return jsonResp({ exam_id: examId, duration_sec: duration, questions: picked.map(stripAnswer) });
    }

    if (action === 'save') {
        if (!body.exam_id) return jsonResp({ error: '缺少exam_id' }, 400);
        const exam = await dbGet('exams', body.exam_id);
        if (exam && exam.status === 'in_progress') {
            exam.answers = body.answers || {};
            await dbPut('exams', exam);
        }
        return jsonResp({ success: true });
    }

    if (action === 'active') {
        const active = (await dbAll('exams')).filter(e => e.status === 'in_progress').pop();
        if (!active) return jsonResp({ active: null });
        const started = new Date(active.started_at.replace(' ', 'T'));
        const remaining = active.duration_sec - Math.floor((Date.now() - started.getTime()) / 1000);
        if (remaining <= 0) {
            const result = await gradeExam(active, active.answers || {});
            return jsonResp({ active: null, auto_submitted: result });
        }
        const questions = [];
        for (const qid of active.question_ids) {
            const q = await getQuestionById(qid);
            if (q) questions.push(stripAnswer(q));
        }
        return jsonResp({ active: {
            exam_id: active.id, mode: active.mode, remaining_sec: remaining,
            duration_sec: active.duration_sec, answers: active.answers || {}, questions
        }});
    }

    if (action === 'submit') {
        const exam = body.exam_id ? await dbGet('exams', body.exam_id) : null;
        if (!exam) return jsonResp({ error: '考试不存在' }, 404);
        if (exam.status !== 'in_progress') return jsonResp({ error: '该考试已交卷' }, 400);
        return jsonResp(await gradeExam(exam, body.answers || {}));
    }

    if (action === 'history') {
        const records = (await dbAll('exams'))
            .filter(e => e.status === 'submitted')
            .sort((a, b) => (a.submitted_at > b.submitted_at ? -1 : 1))
            .slice(0, 50)
            .map(e => ({
                id: e.id, mode: e.mode, total_count: e.total_count, correct_count: e.correct_count,
                score: e.score, duration_sec: e.duration_sec, started_at: e.started_at, submitted_at: e.submitted_at
            }));
        return jsonResp({ records });
    }

    if (action === 'detail') {
        // 按场次回看逐题明细：用留存的 question_ids+answers 与题库比对还原对错
        const exam = await dbGet('exams', parseInt(arg, 10));
        if (!exam || exam.status !== 'submitted') return jsonResp({ error: '考试记录不存在' }, 404);
        const answers = exam.answers || {};
        const details = [];
        for (const qid of exam.question_ids) {
            const q = await getQuestionById(qid);
            const ua = (answers[qid] || '').toUpperCase();
            if (!q) {
                // 题库更新后题目可能已不存在，留占位不参与比对
                details.push({ id: qid, number: null, content: '（该题已从题库移除）', options: {},
                    user_answer: ua, correct_answer: '', is_correct: false, explanation: '', chapter: '', section: '' });
                continue;
            }
            details.push({
                id: qid, number: q.number, content: q.content || '', options: q.options,
                user_answer: ua, correct_answer: q.answer || '',
                is_correct: !!ua && ua === (q.answer || ''),
                explanation: q.explanation || '', chapter: q.chapter || '', section: q.section || ''
            });
        }
        return jsonResp({
            exam_id: exam.id, mode: exam.mode, submitted_at: exam.submitted_at,
            total: exam.total_count, correct: exam.correct_count, score: exam.score, details
        });
    }

    return jsonResp({ error: '未知考试接口' }, 404);
}

// ==================== Service Worker 注册 ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW注册失败（需HTTPS或localhost）', e));
    });
    // 更新提示（P1-5）：发现新版本并完成安装后，弹出 toast 让用户手动刷新，
    // 避免 skipWaiting 静默接管导致当前页面数据/状态意外刷新。
    let hasPendingUpdate = false;
    navigator.serviceWorker.addEventListener('updatefound', () => {
        const installing = navigator.serviceWorker.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
            // 已有旧 SW 在控制页面（说明是更新，而非首次安装）且新版本已就绪
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                hasPendingUpdate = true;
                showUpdateToast();
            }
        });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 新 SW 已接管页面；若是用户点了 toast 触发的刷新，这里不再重复处理
    });
}

function showUpdateToast() {
    if (document.getElementById('swUpdateToast')) return;
    const t = document.createElement('div');
    t.id = 'swUpdateToast';
    t.className = 'sw-update-toast';
    t.innerHTML = '<span>发现新版本，点击刷新</span>';
    t.onclick = () => location.reload();
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 50);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 8000);
}
