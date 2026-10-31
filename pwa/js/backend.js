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

// 搜索文本规范化：解码常见 HTML 实体 → 统一各类空白（含不间断空格/全角空格）→ 折叠全部空白 → 小写。
// 目的：① 实体未解码时搜「A<B」「A&B」必然失败；② 原文跨标签/跨行写成「页面<br>置换」时，
// 去标签后会留下空格，用户搜「页面置换」就断词搜不到；③ 用户输入「LRU 算法」而原文是「LRU算法」同理。
// 索引与关键词都过这个函数后，两边空白被同等消除，匹配即恢复为纯子串包含。
function normText(s) {
    return (s || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&(?:amp);/gi, '&')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/[\u00a0\u3000\ufeff]/g, ' ')
        .replace(/\s+/g, '')
        .toLowerCase();
}

// 搜索结果上限（总量），以及笔记结果上限
const SEARCH_LIMIT = 100;
const SEARCH_NOTE_LIMIT = 40;

// ==================== 题库加载（内存缓存） ====================
const _qCache = {};      // {subject: data}
const _qIndex = {};      // {subject: Map(id → question)} —— O(1) 查找，替代每次 find 的 O(n)
const _searchTexts = {}; // {subject: [(id, 规范化可搜索文本)]}

async function loadQuestions(key) {
    if (_qCache[key]) return _qCache[key];
    const resp = await fetch(`data/${SUBJECTS[key].json}`);
    const data = await resp.json();
    // 标记 excluded 的题（数据有缺陷、暂不可用）不进题池：刷题 / 模拟考 / 收藏 / 搜索 全部不出现
    if (Array.isArray(data.questions)) {
        const before = data.questions.length;
        data.questions = data.questions.filter(q => !q.excluded);
        if (before !== data.questions.length) data.total = data.questions.length;
    }
    const texts = [];
    for (const q of data.questions) {
        const m = REAL_EXAM_RE.exec((q.content || '').slice(0, 80));
        q.is_real_exam = !!m;
        q.exam_year = m ? parseInt(m[1].replace(/\s/g, ''), 10) : null;
        // 索引覆盖：题干 + 选项 + 解析 + 章节/小节（章节名原先不在索引里，搜「进程与线程」这类章节名会 0 命中）
        const raw = [
            q.content || '',
            Object.values(q.options || {}).join(' '),
            q.explanation || '',
            q.chapter || '', q.section || '', q.subsection || ''
        ].join(' ');
        texts.push([q.id, normText(raw.replace(TAG_RE, ' '))]);
    }
    _searchTexts[key] = texts;
    // id → 题目 的哈希索引：getQuestionById 从 O(n) find 变成 O(1) get。
    // 组卷 / 收藏列表 / 模拟考错题统计会成千次调用，这一层是主要热点。
    const idx = new Map();
    for (const q of data.questions) if (q && q.id) idx.set(q.id, q);
    _qIndex[key] = idx;
    _qCache[key] = data;
    return data;
}

// 清空题库与搜索索引缓存（数据更新后调用，下次访问自动用新数据重建索引）
function resetQuestionCache(key) {
    if (key) { delete _qCache[key]; delete _searchTexts[key]; delete _qIndex[key]; }
    else {
        for (const k of Object.keys(_qCache)) { delete _qCache[k]; delete _searchTexts[k]; delete _qIndex[k]; }
    }
}

async function getQuestionById(qid) {
    const key = String(qid || '').split('_')[0];
    if (!SUBJECTS[key]) return null;
    if (!_qIndex[key]) await loadQuestions(key);
    const idx = _qIndex[key];
    return (idx && idx.get(qid)) || null;
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
            // 小节自身正文（含章节名/小节名，便于按章节名检索）
            if (sec.html) texts.push({
                chapter: ch.chapter || '',
                section: sec.section || '',
                html: sec.html || '',
                text: normText([ch.chapter || '', sec.section || '', sec.html || ''].join(' ').replace(TAG_RE, ' '))
            });
            // 子小节正文：笔记正文约 80% 体量在 subsections 里（cn 11.7万字/os 30.9万字），
            // 原先只索引 section.html 会导致绝大部分知识点搜不到。子小节在 notes.html 里有独立
            // data-sec 锚点（.notes-sub[data-sec]），因此可作为独立结果条目并精确跳转。
            for (const sb of (sec.subsections || [])) {
                texts.push({
                    chapter: ch.chapter || '',
                    section: sb.section || sec.section || '',
                    html: sb.html || '',
                    text: normText([ch.chapter || '', sec.section || '', sb.section || '', sb.html || '']
                        .join(' ').replace(TAG_RE, ' '))
                });
            }
        }
    }
    _notesIndex[subject] = texts;
    return data;
}

// ==================== 算法讲义 / 思维导图 搜索索引（懒加载） ====================
// algo_notes.json 与 *_map.json 不在题库/笔记索引内，导致讲义页、导图页可见的内容全站搜不到。
// 这里按需加载建立索引：algo 条目用其 _id（algo.html#id 锚点直达），map 节点用与 map.html
// assignIds 相同的算法生成 _id（map.html?subject=xx&goto=id 直达）。
const _algoIndex = [];
let _algoLoaded = false;
async function loadAlgoIndex() {
    if (_algoLoaded) return;
    _algoLoaded = true;
    try {
        const resp = await fetch('data/algo_notes.json');
        const data = await resp.json();
        // 与 algo.html 相同的 id 生成规则：章节卡 ch-N 占号，h 标题 sec-N 递增（全局）
        let anchorSeq = 0;
        let curH = null;   // 当前最近标题：正文/代码归属其下
        for (const c of (data.chapters || [])) {
            anchorSeq++;   // 章节卡 ch-N
            for (const it of (c.items || [])) {
                if (it.t === 'h') {
                    anchorSeq++;
                    const id = 'sec-' + anchorSeq;
                    curH = { chapter: c.title || '', id, page: it.page || '' };
                    _algoIndex.push({ chapter: c.title || '', id, page: it.page || '',
                        text: normText((c.title || '') + ' ' + (it.text || '')) });
                } else if (it.t !== 'code' && curH && (it.text || '').trim()) {
                    // 正文段落归属当前标题，命中可跳到该标题
                    _algoIndex.push({ chapter: c.title || '', id: curH.id, page: curH.page,
                        text: normText((curH.chapter || '') + ' ' + (it.text || '')) });
                }
            }
        }
    } catch (e) { /* 讲义加载失败不阻塞搜索 */ }
}

const _mapIndex = [];
let _mapLoaded = false;
async function loadMapIndex() {
    if (_mapLoaded) return;
    _mapLoaded = true;
    try {
        for (const [key, json] of [['co', 'co_map.json'], ['os', 'os_map.json']]) {
            const resp = await fetch(`data/${json}`);
            const data = await resp.json();
            const walk = (nodes, path) => {
                for (const n of (nodes || [])) {
                    const p = path ? path + ' → ' + (n.n || '') : (n.n || '');
                    if (n._id) _mapIndex.push({ subject: key, id: n._id, path: p, text: normText(p) });
                    walk(n.c || [], p);
                }
            };
            data.roots.forEach((r, i) => { r._idx = i; (function assignIds(node, parent) {
                node._id = parent == null ? String(node._idx) : parent + '-' + node._idx;
                (node.c || []).forEach((ch, j) => { ch._idx = j; assignIds(ch, node._id); });
            })(r, null); });
            walk(data.roots, '');
        }
    } catch (e) { /* 导图加载失败不阻塞搜索 */ }
}

// ==================== IndexedDB ====================
const DB_NAME = 'quiz408';
// v3：新增 unfamiliar / dontknow 两个 store（「不熟 / 不会」标记）。
// v4：新增 redo store（试卷回顾「7 天后重练」——把做对的题手动排进 7 天后的抽取池）。
// 注意：新增 store 必须同时提升 DB_VER，否则老用户库不会被升级、
// onupgradeneeded 不触发 → 新 store 不存在 → 写入静默失败。
const DB_VER = 4;
let _dbPromise = null;
let _dbBlocked = false;    // 是否卡在「升级被占用」上
let _dbDegraded = false;   // 是否以低于 DB_VER 的版本打开（新 store 缺失 → 新功能不可用）

// 打开指定版本（ver 省略 = 打开当前已有版本，不触发升级、不会被 blocked）
function openRaw(ver) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const req = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
        req.onupgradeneeded = () => {
            const db = req.result;
            // 幂等建库：只新增缺失的 store，不动老数据
            if (!db.objectStoreNames.contains('progress')) {
                const prog = db.createObjectStore('progress', { keyPath: 'pk', autoIncrement: true });
                prog.createIndex('by_qid', 'question_id');
                prog.createIndex('by_subject', 'subject');
            }
            for (const s of ['wrong', 'favorites', 'notes', 'unfamiliar', 'dontknow', 'redo']) {
                if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'question_id' });
            }
            if (!db.objectStoreNames.contains('exams')) {
                db.createObjectStore('exams', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('daka_progress')) {
                db.createObjectStore('daka_progress', { keyPath: 'question_id' });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            // 关键：别让自己成为别人的阻塞源。其他页面要升级数据库时会收到 versionchange，
            // 主动关掉连接，否则对方永远卡在 blocked（这正是「开着两个页面就加载不出来」的成因）。
            db.onversionchange = () => {
                try { db.close(); } catch (e) { }
                _dbPromise = null;
            };
            _dbBlocked = false;
            settled = true;
            resolve(db);
        };
        req.onerror = () => {
            settled = true;
            reject(req.error || new Error('indexedDB 打开失败'));
        };
        // blocked：还有别的页面（旧代码，没有 onversionchange）持有旧连接。
        // 这里不干等：2.5 秒后标记 blocked 交给上层**降级打开**，让页面先能用。
        req.onblocked = () => {
            _dbBlocked = true;
            console.warn('[quiz408] 数据库升级被其他页面占用，尝试降级打开…');
            setTimeout(() => {
                if (settled) return;
                settled = true;
                const err = new Error('数据库升级被其他页面占用');
                err.blocked = true;
                reject(err);
            }, 2500);
        };
    });
}

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = (async () => {
        try {
            return await openRaw(DB_VER);
        } catch (e) {
            // 升级被占用 → 用**当前已有版本**打开（不触发升级，绝不会被 blocked）。
            // 代价是缺 redo 等新 store，新功能降级不可用；但页面能正常打开、数据全在。
            if (!e.blocked) throw e;
            const db = await openRaw();
            _dbDegraded = db.version < DB_VER;
            window.__dbDegraded = _dbDegraded;   // 页面可据此提示用户
            console.warn(`[quiz408] 已降级到 v${db.version}（目标 v${DB_VER}）：新功能暂不可用`);
            return db;
        }
    })().catch(e => {
        _dbPromise = null;   // 失败不缓存：允许用户关闭占用标签页后自动重试
        throw e;
    });
    return _dbPromise;
}

// Promise 化的通用读写
// 降级打开时可能缺 store（如 v3 库里没有 redo）：读操作返回空值而不是抛错，
// 让页面照常渲染；写操作仍报错（写入失败不能静默）。
async function dbAll(store) {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) return [];
    return new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function dbGet(store, key) {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) return undefined;
    return new Promise((res, rej) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function dbPut(store, val) {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) {
        throw new Error(`本地数据库缺少 ${store}（升级未完成，请关闭其它页面后刷新）`);
    }
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).put(val);
        r.onsuccess = () => res(r.result);
        tx.onerror = () => rej(tx.error);
    });
}

async function dbDelete(store, key) {
    const db = await openDB();
    if (!db.objectStoreNames.contains(store)) return;
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

// 备份用：收集当前 origin 下全部 localStorage 键值（原始字符串）。
// 这些键承载用户内容/进度（记忆卡标记、划词高亮与行级批注、大题已练、每日一题、
// 冲刺计划打卡与备注）以及 UI 偏好；自动全量收集，新功能无需改代码。
// 隐私模式 / 存储被禁用时返回空对象（导出不因此失败）。
function collectLocalStorage() {
    const out = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k == null) continue;
            const v = localStorage.getItem(k);
            if (v != null) out[k] = v;
        }
    } catch (e) { console.warn('localStorage 收集失败', e); }
    return out;
}

function now() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 时间戳归一化：数字毫秒时间戳 → 标准 'YYYY-MM-DD HH:MM:SS' 字符串。
// 背景（2026-10-14）：早期 zhenti 提交把 Date.now() 数字写进了 progress.answered_at /
// wrong.last_wrong_at，导致 _reviewStageOf 的 .slice 抛错 → 该科统计整科失败（首页显示 0）。
function tsToStr(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && isFinite(v) && v > 0) {
        const d = new Date(v), p = n => String(n).padStart(2, '0');
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    return '';
}

// 历史脏数据一次性修复（进程内只跑一次，幂等）：把库里已存在的数字时间戳改回字符串，
// 否则旧记录会永远「最新」（number >= string 比较恒为 false）持续污染统计与复习计算。
let _tsMigrated = false;
async function migrateDirtyTimestamps() {
    if (_tsMigrated) return;
    _tsMigrated = true;
    try {
        let n = 0;
        for (const r of await dbAll('progress')) {
            if (typeof r.answered_at !== 'string') {
                const s = tsToStr(r.answered_at);
                if (s) { r.answered_at = s; await dbPut('progress', r); n++; }
            }
        }
        for (const w of await dbAll('wrong')) {
            if (typeof w.last_wrong_at !== 'string') {
                const s = tsToStr(w.last_wrong_at);
                if (s) { w.last_wrong_at = s; await dbPut('wrong', w); n++; }
            }
        }
        if (n) console.info('[408quiz] 已修正 ' + n + ' 条历史时间戳记录');
    } catch (e) { console.warn('[408quiz] 时间戳迁移跳过：', e); }
}

// ==================== 答题记录（对应 database._apply_answer） ====================
async function applyAnswer(qid, subject, userAnswer, isCorrect, ts, trackWrong = true) {
    // 时间戳归一化：调用方传数字（历史 zhenti 曾传 Date.now()）或空值时统一成标准字符串，
    // 防止脏数据再进库；exam 路径的 'HH:MM:SS.NNN' 字符串原样保留
    ts = tsToStr(ts) || now();
    await dbPut('progress', { question_id: qid, subject, user_answer: userAnswer, is_correct: isCorrect ? 1 : 0, answered_at: ts });
    const w = await dbGet('wrong', qid);
    if (!isCorrect) {
        if (trackWrong) {          // 错题不入错题本（考试可选关闭）
            if (w) {
                w.wrong_count += 1; w.last_wrong_at = ts; w.is_resolved = 0; w.correct_streak = 0;
                await dbPut('wrong', w);
            } else {
                await dbPut('wrong', { question_id: qid, subject, wrong_count: 1, last_wrong_at: ts, is_resolved: 0, correct_streak: 0 });
            }
        }
        // 池子成员又做错了 → 清掉 mastered，重新变成可抽（不论有没有记进错题本）
        const rdWrong = await dbGet('redo', qid);
        if (rdWrong && rdWrong.mastered) {
            rdWrong.mastered = 0;
            rdWrong.mastered_at = null;
            await dbPut('redo', rdWrong);
        }
    } else {
        if (w) {
            // 答对：连对计数+1，连对满2次移出错题本（置已解决，保留记录）
            w.correct_streak = (w.correct_streak || 0) + 1;
            if (w.correct_streak >= 2) w.is_resolved = 1;
            await dbPut('wrong', w);
        }
        // 答对即移出「不熟 / 不会」池（用户规则：答对 1 次就移出，池子只保留当前真正薄弱的题）。
        // 与错题本"连对 2 次"不同 —— 不熟是主观标记，做对一次即可认为已过关。
        if (await dbGet('unfamiliar', qid)) await dbDelete('unfamiliar', qid);
        if (await dbGet('dontknow', qid)) await dbDelete('dontknow', qid);
        // 池子成员（模拟考错题 / 7 天后重练 / 猜对了）：做对一次即置 mastered ——
        // **记录保留**（还留在「模拟考错题」池里能回看），只是之后不再被抽到。
        // 与上面两个标记不同：那两个直接删除，这个只改状态。
        const rd = await dbGet('redo', qid);
        if (rd && !rd.mastered) {
            rd.mastered = 1;
            rd.mastered_at = ts;
            await dbPut('redo', rd);
        }
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
    const unfams = (await dbAll('unfamiliar')).filter(f => !subject || f.subject === subject).length;
    const dontknows = (await dbAll('dontknow')).filter(f => !subject || f.subject === subject).length;
    return {
        total_answered: ids.length,
        correct_count: correct,
        wrong_count: wrongs,
        favorite_count: favs,
        unfamiliar_count: unfams,
        dontknow_count: dontknows,
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
    // 读取侧也归一化（双保险）：即使库里还有漏网的数字时间戳，也不会 .slice 抛错
    const la = tsToStr(st && st.answered_at);
    const lw = tsToStr(w.last_wrong_at);
    // 基准时间取最近一次动态（做错或作答），只取前19位规避考试批量提交的 .NNN 后缀
    const baseStr = (lw > la ? lw : la).slice(0, 19);
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

// ==================== 模拟考「重抽间隔」7 天 ====================
// 只管两件事，**不再用于「答对的题」**（用户明确：答对的题不要冷却，排最后就行）：
//   ① examDueWrongIds —— 答错且未解决的题，满 7 天才重新进到期层
//   ② redo 池        —— 试卷回顾里手动「7 天后重练」的题，到期后才进抽取池
// 逾期越久越靠前：把很久之前写过的先过一遍，近期做过的不着急（自然排在队尾）。
const EXAM_REDO_COOLDOWN_DAYS = 7;
const EXAM_REDO_COOLDOWN_MS = EXAM_REDO_COOLDOWN_DAYS * 86400000;

async function examDueWrongIds() {
    const statuses = await latestStatuses('');
    const nowMs = Date.now();
    const items = [];
    for (const w of await dbAll('wrong')) {
        if (w.is_resolved) continue;   // 已了结/手动清过的不抽
        const lw = tsToStr(w.last_wrong_at).slice(0, 19);
        if (!lw) continue;
        const st = statuses[w.question_id];
        // 做对了不抽：最后一次作答是答对、且晚于最后做错时间
        if (st && st.is_correct && tsToStr(st.answered_at).slice(0, 19) > lw) continue;
        const base = new Date(lw.replace(' ', 'T')).getTime();
        if (isNaN(base)) continue;
        if (nowMs < base + EXAM_REDO_COOLDOWN_MS) continue;   // 未满 7 天（冷却中）
        items.push([lw, w.question_id]);
    }
    // 逾期越久越靠前 = last_wrong_at 越早越靠前；同刻按题号稳定排序
    items.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : 1)));
    return items.map(x => x[1]);
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

            // 试卷错题重刷（exam_wrong）：从指定模拟考卷里筛出错题（含未作答，口径与成绩单一致），
            // 跨科目按卷面顺序返回，并带出该卷的时间/得分等元信息供刷题页展示。
            // 一张卷覆盖四科，所以这里不按 URL 的 subject 过滤题、收藏、标记与笔记。
            let examMeta = null;
            if (mode === 'exam_wrong' || mode === 'exam_review') {
                const exam = await dbGet('exams', parseInt(p.get('exam_id') || '0', 10));
                if (!exam || exam.status !== 'submitted') return jsonResp({ error: '试卷不存在或未交卷' }, 404);
                const wrongRows = await dbAll('wrong');
                const wrongCntMap = {}; for (const w of wrongRows) wrongCntMap[w.question_id] = w.wrong_count || 0;
                const wrongIds = [], examUa = {};
                let wrongCnt = 0;
                for (const qid of exam.question_ids) {
                    const q = await getQuestionById(qid);
                    if (!q) continue;   // 已从题库移除的题无法重刷，跳过
                    const ua = ((exam.answers || {})[qid] || '').toUpperCase();
                    examUa[qid] = ua;
                    const isWrong = !(!!ua && ua === (q.answer || ''));
                    if (isWrong) wrongCnt++;
                    // exam_wrong：只出错题（含未作答）；exam_review：整卷全部题目（客户端切换 错题/全部）
                    if (mode === 'exam_review' || isWrong) wrongIds.push(qid);
                }
                const idSet = new Set(wrongIds);
                const orderMap = new Map(wrongIds.map((id, i) => [id, i]));
                // 不熟/不会标记 + 7 天后重练：题卡与题号面板要显示状态，随题带出
                const unfamSet = new Set((await dbAll('unfamiliar')).map(x => x.question_id));
                const dkSet = new Set((await dbAll('dontknow')).map(x => x.question_id));
                const redoRows0 = await dbAll('redo');
                const redoSet = new Set(redoRows0.filter(r => r.kind !== 'guessed' && !r.mastered).map(r => r.question_id));
                const guessedSet0 = new Set(redoRows0.filter(r => r.kind === 'guessed' && !r.mastered).map(r => r.question_id));
                // 标记过、且已经做对过一次：留在池子里但不再抽 —— 按钮显示「已掌握」
                const masteredSet0 = new Set(redoRows0.filter(r => r.mastered).map(r => r.question_id));
                qs = [];
                for (const k of Object.keys(SUBJECTS)) {
                    for (const q of (await loadQuestions(k)).questions) {
                        if (idSet.has(q.id)) qs.push(Object.assign({}, q, {
                            exam_user_answer: examUa[q.id] || '', wrong_count: wrongCntMap[q.id] || 0,
                            is_unfamiliar: unfamSet.has(q.id), is_dontknow: dkSet.has(q.id),
                            is_redo: redoSet.has(q.id), is_guessed: guessedSet0.has(q.id),
                            is_mastered: masteredSet0.has(q.id),
                            mastered_kind: masteredSet0.has(q.id)
                                ? ((redoRows0.find(r => r.question_id === q.id && r.mastered) || {}).kind || 'redo')
                                : ''
                        }));
                    }
                }
                qs.sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
                examMeta = {
                    exam_id: exam.id, mode: exam.mode,
                    score: exam.score, correct_count: exam.correct_count, total_count: exam.total_count,
                    started_at: exam.started_at, submitted_at: exam.submitted_at,
                    duration_sec: exam.duration_sec, wrong_count: wrongCnt
                };
            }
            const mixed = mode === 'exam_wrong' || mode === 'exam_review';

            if (chapter) qs = qs.filter(q => q.chapter === chapter);
            if (section) qs = qs.filter(q => q.section === section);

            const statuses = await latestStatuses(mixed ? '' : subject);
            const favSet = new Set((await dbAll('favorites')).filter(f => mixed || f.subject === subject).map(f => f.question_id));
            const unfamSet = new Set((await dbAll('unfamiliar')).filter(f => mixed || f.subject === subject).map(f => f.question_id));
            const dontknowSet = new Set((await dbAll('dontknow')).filter(f => mixed || f.subject === subject).map(f => f.question_id));

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
                // 错题池 = 错题本未了结 ∪ 不熟 ∪ 不会 ∪ 手动标记（不熟池已并入，不再单列）
                const wrongIds = (await dbAll('wrong')).filter(w => !w.is_resolved).map(w => w.question_id);
                const unfamIds = (await dbAll('unfamiliar')).map(w => w.question_id);
                const dkIds = (await dbAll('dontknow')).map(w => w.question_id);
                const markIds = (await dbAll('redo')).filter(r => !r.mastered).map(r => r.question_id);
                const pool = new Set([...wrongIds, ...unfamIds, ...dkIds, ...markIds]);
                qs = qs.filter(q => pool.has(q.id));
            } else if (mode === 'examwrong') {
                // 模拟考错题池（刷题式大批量练）：成员 = 模拟考做错 ∪ 手动标记，做对过的不再出
                const pool = await examWrongPoolQids(false);
                const set = new Set(pool.pending);
                qs = qs.filter(q => set.has(q.id));
            } else if (mode === 'favorite') {
                qs = qs.filter(q => favSet.has(q.id));
            } else if (mode === 'unfamiliar' || mode === 'dontknow') {
                // 不熟/不会模式：包含标记为不熟或不会的全部题目
                qs = qs.filter(q => unfamSet.has(q.id) || dontknowSet.has(q.id));
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
            for (const n of await dbAll('notes')) if (mixed || n.subject === subject) notes[n.question_id] = n;
            const result = pageQs.map(q => ({
                ...q,
                is_favorited: favSet.has(q.id),
                is_unfamiliar: unfamSet.has(q.id),
                is_dontknow: dontknowSet.has(q.id),
                last_status: statuses[q.id] || null,
                note: notes[q.id] ? notes[q.id].content : '',
                note_images: (notes[q.id] && notes[q.id].images) || []
            }));
            const out = { subject: data.subject, total, page, per_page: perPage, questions: result };
            if (examMeta) out.exam_meta = examMeta;
            return jsonResp(out);
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

        // ---------- 不熟/不会 标记切换 ----------
        // /api/mark/<unfamiliar|dontknow>/<qid>
        if (seg[1] === 'mark') {
            const kind = seg[2];
            const qid = seg[3];
            if (kind !== 'unfamiliar' && kind !== 'dontknow' && kind !== 'redo' && kind !== 'guessed') {
                return jsonResp({ error: '无效的标记类型' }, 400);
            }
            const subject = qid.split('_')[0];
            if (!SUBJECTS[subject]) return jsonResp({ error: '无效的题目ID' }, 400);

            // 「猜对了」：模拟考里答对、但其实是蒙的 → 放回收藏池的垫底层（否则答对即退出抽题）。
            // 与 redo 共用 store，用 kind 区分：redo = 7 天后重练（时间排期），
            // guessed = 垫底层放行（无时间概念，due_at 置 0）。
            if (kind === 'guessed') {
                const existing = await dbGet('redo', qid);
                if (existing && existing.kind === 'guessed') {
                    await dbDelete('redo', qid);
                    return jsonResp({ question_id: qid, is_guessed: false });
                }
                await dbPut('redo', { question_id: qid, subject, kind: 'guessed', added_at: now(), due_at: 0 });
                return jsonResp({ question_id: qid, is_guessed: true });
            }

            // 「7 天后重练」：把题排进 7 天后的抽取池（试卷回顾里对做对的题手动加）。
            // 与不熟/不会**不互斥**——那两者是掌握程度标记，这个是时间排期，可以同时存在。
            if (kind === 'redo') {
                const existing = await dbGet('redo', qid);
                if (existing) {
                    await dbDelete('redo', qid);
                    return jsonResp({ question_id: qid, is_redo: false });
                }
                const dueAt = Date.now() + EXAM_REDO_COOLDOWN_MS;
                await dbPut('redo', { question_id: qid, subject, added_at: now(), due_at: dueAt });
                return jsonResp({
                    question_id: qid, is_redo: true, due_at: dueAt,
                    days: EXAM_REDO_COOLDOWN_DAYS
                });
            }

            const store = kind === 'unfamiliar' ? 'unfamiliar' : 'dontknow';
            const otherStore = kind === 'unfamiliar' ? 'dontknow' : 'unfamiliar';
            const key = kind === 'unfamiliar' ? 'is_unfamiliar' : 'is_dontknow';
            const otherKey = kind === 'unfamiliar' ? 'is_dontknow' : 'is_unfamiliar';
            const existing = await dbGet(store, qid);
            if (existing) {
                await dbDelete(store, qid);
                return jsonResp({ question_id: qid, [key]: false, [otherKey]: !!(await dbGet(otherStore, qid)) });
            }
            // 互斥：标记「不熟」自动清除「不会」，反之亦然（同一题两种标记不能共存）
            await dbDelete(otherStore, qid);
            await dbPut(store, { question_id: qid, subject, added_at: now() });
            return jsonResp({ question_id: qid, [key]: true, [otherKey]: false });
        }

        // ---------- 不熟/不会 列表 ----------
        if (seg[1] === 'marks') {
            const subject = p.get('subject') || null;
            const kind = p.get('kind') || 'all'; // unfamiliar | dontknow | all
            const list = [];
            if (kind === 'unfamiliar' || kind === 'all') {
                list.push(...(await dbAll('unfamiliar')).filter(m => !subject || m.subject === subject));
            }
            if (kind === 'dontknow' || kind === 'all') {
                list.push(...(await dbAll('dontknow')).filter(m => !subject || m.subject === subject));
            }
            const result = [];
            for (const m of list) {
                const q = await getQuestionById(m.question_id);
                if (!q) continue;
                result.push({ ...m, ...q });
            }
            result.sort((a, b) => (a.added_at > b.added_at ? -1 : 1));
            return jsonResp({ marks: result, total: result.length });
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
            // reset       → 清收藏题的作答记录 + 错题记录（重刷一遍）
            // reset-wrong → 只清收藏题的错题记录（作答记录/正确率保留，题仍在收藏中）
            // 收藏本身始终保留（对应 app.py /api/favorites/reset）
            if (seg[2] === 'reset' || seg[2] === 'reset-wrong' || seg[2] === 'reset-wrong-replay') {
                // reset              → 清收藏题的作答记录 + 错题记录（重刷一遍）
                // reset-wrong        → 只清收藏题的错题记录（作答记录/正确率保留，题仍在收藏中）
                // reset-wrong-replay → 只清「收藏题中答错的题」的作答 + 错题记录（清空重做，收藏保留）
                const wrongOnly = seg[2] === 'reset-wrong';
                const replayOnly = seg[2] === 'reset-wrong-replay';
                const subject = seg[3];
                if (!SUBJECTS[subject]) return jsonResp({ error: '科目不存在' }, 404);
                const favIds = new Set((await dbAll('favorites')).filter(f => f.subject === subject).map(f => f.question_id));
                let cleared = 0, replayCount = 0;
                if (favIds.size) {
                    const db = await openDB();
                    // replay：先把范围缩小到「收藏题 ∩ 错题」，只重做这些题
                    let scope = null;
                    if (replayOnly) {
                        const wrongRows = (await dbAll('wrong')).filter(w => w.subject === subject && favIds.has(w.question_id));
                        scope = new Set(wrongRows.map(w => w.question_id));
                        replayCount = scope.size;
                    }
                    for (const store of wrongOnly ? ['wrong'] : ['progress', 'wrong']) {
                        const rows = await dbAll(store);
                        const tx = db.transaction(store, 'readwrite');
                        for (const r of rows) {
                            if (!favIds.has(r.question_id)) continue;
                            if (replayOnly && scope && !scope.has(r.question_id)) continue;
                            tx.objectStore(store).delete(store === 'progress' ? r.pk : r.question_id);
                            cleared++;
                        }
                        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
                    }
                }
                return jsonResp({
                    success: true, cleared, favs: favIds.size,
                    scope: wrongOnly ? 'wrong' : (replayOnly ? 'wrong-replay' : 'all'),
                    replay_count: replayCount
                });
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
            // 局部容错：单个统计/存储异常不拖垮整个首页（IndexedDB 被禁/损坏/被其他
            // 标签页占用时，仍返回结构完整的数据，由前端降级展示而不是整体报错）。
            // 但容错≠静默：失败原因放进 warnings 由前端明示，stores 给出底层行数，
            // 让「真没数据」和「读不出来」可区分（否则一律显示 0，用户会以为数据被清空）。
            const EMPTY = () => ({
                total_answered: 0, correct_count: 0, wrong_count: 0, favorite_count: 0,
                unfamiliar_count: 0, dontknow_count: 0, accuracy: 0, due_review_count: 0
            });
            const errMsg = e => ((e && e.message) ? e.message : String(e));
            const warnings = [];

            // 首次进首页时顺带修复历史脏时间戳（幂等、失败静默），修完本页统计即恢复正常
            await migrateDirtyTimestamps();

            // 底层存储可读性探针：逐项容错（老库可能缺少后加的 daka_progress store，
            // 单个 store 读不到 ≠ 整体不可用，不能误报）。-1 = 该项读不到
            const stores = {};
            let firstStoreErr = null;
            for (const [k, st] of [['progress', 'progress'], ['wrong', 'wrong'],
                                   ['favorites', 'favorites'], ['daka', 'daka_progress']]) {
                try { stores[k] = (await dbAll(st)).length; }
                catch (e) { stores[k] = -1; if (!firstStoreErr) firstStoreErr = errMsg(e); }
            }
            // 关键三项全读不到才判定「本地存储不可用」，且只报一条（避免与下面的统计失败刷屏）
            if (stores.progress === -1 && stores.wrong === -1 && stores.favorites === -1) {
                warnings.push('本地存储不可用：' + (firstStoreErr || '未知原因'));
            }

            let overall;
            try { overall = await subjectStats(null); }
            catch (e) { console.error('stats overall 失败', e); warnings.push('总统计失败：' + errMsg(e)); overall = EMPTY(); }
            const totals = await getTotals().catch(() => ({ subjects: {} }));
            const subjects = {};
            for (const key of Object.keys(SUBJECTS)) {
                const total = (totals.subjects && totals.subjects[key] && totals.subjects[key].total) || 0;
                let st;
                try { st = await subjectStats(key); }
                catch (e) { console.error('stats ' + key + ' 失败', e); warnings.push(key + ' 统计失败：' + errMsg(e)); st = EMPTY(); }
                const detail = await getDueReviewDetailed(key)
                    .catch(e => { console.error('dueReview ' + key + ' 失败', e); return { stages: {}, stageDue: {}, upcoming: [] }; });
                subjects[key] = {
                    ...st, total_questions: total, name: SUBJECTS[key].name,
                    review_stages: detail.stages, review_stage_due: detail.stageDue,
                    review_upcoming: (detail.upcoming || []).length
                };
            }
            return jsonResp({ overall, subjects, stores, warnings });
        }

        if (seg[1] === 'stats' && seg[2] === 'daily') {
            const days = Math.min(parseInt(p.get('days') || '30', 10), 365);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (days - 1));
            const cutStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
            const byDay = {};
            for (const r of await dbAll('progress')) {
                const day = String(r.answered_at || '').slice(0, 10);
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

        // ---------- 本月错题分析（薄弱点诊断） ----------
        if (seg[1] === 'stats' && seg[2] === 'month-wrong') {
            // 本月 = 当前自然月，对比维度：科目 → 章节 → 小节，取该月内每题"最后作答"判定对错，
            // 并统计答错次数>0 的题。输出薄弱章节排行与一句话建议。
            const nowD = new Date(), p2 = n => String(n).padStart(2, '0');
            const monthKey = `${nowD.getFullYear()}-${p2(nowD.getMonth() + 1)}`;   // YYYY-MM
            const progressRows = (await dbAll('progress')).filter(r => (r.answered_at || '').startsWith(monthKey));

            // 每题统计：本月作答次数/错次数/最后对错
            const perQ = {};
            for (const r of progressRows) {
                const e = perQ[r.question_id] || (perQ[r.question_id] = { subject: r.subject, total: 0, wrong: 0, last_ok: 0 });
                e.total++;
                if (!r.is_correct) e.wrong++;
                e.last_ok = r.is_correct ? 1 : 0;
            }
            // 科目→章节聚合（题目章节元数据）
            const bySubject = {};
            for (const [key, info] of Object.entries(SUBJECTS)) {
                const data = await loadQuestions(key);
                const chMap = {}, chapters = [];
                let sAnswered = 0, sWrong = 0;
                for (const q of data.questions) {
                    const e = perQ[q.id];
                    if (!e) continue;
                    const ch = q.chapter || '未分类';
                    if (!chMap[ch]) { chMap[ch] = { name: ch, answered: 0, wrong: 0, bad: 0 }; chapters.push(chMap[ch]); }
                    const node = chMap[ch];
                    node.answered += e.total; node.wrong += e.wrong;
                    if (e.total > 0 && e.wrong > 0) node.bad++;                 // 本月出过错的不同题数
                    sAnswered += e.total; sWrong += e.wrong;
                }
                // 科目级出过错题数(去重按题)
                let sBad = 0;
                for (const q of data.questions) { const e = perQ[q.id]; if (e && e.wrong > 0) sBad++; }
                chapters.sort((a, b) => b.wrong - a.wrong || b.bad - a.bad);
                bySubject[key] = {
                    name: info.name, answered: sAnswered, wrong: sWrong, bad_questions: sBad,
                    accuracy: sAnswered ? Math.round((sAnswered - sWrong) / sAnswered * 100) : 100,
                    chapters
                };
            }
            // 薄弱章节 = 至少答过 1 题且（错题数 ≥ 2 或 出过错题数 ≥ 1 且正确率 <70%）
            const weak = [];
            for (const [key, s] of Object.entries(bySubject)) {
                for (const c of s.chapters) {
                    const acc = c.answered ? Math.round((c.answered - c.wrong) / c.answered * 100) : 100;
                    const isWeak = c.answered > 0 && (c.wrong >= 2 || (c.bad >= 1 && acc < 70));
                    if (isWeak) weak.push({ subject: key, subject_name: s.name, chapter: c.name, answered: c.answered, wrong: c.wrong, bad: c.bad, accuracy: acc });
                }
            }
            weak.sort((a, b) => b.wrong - a.wrong || b.bad - a.bad || a.accuracy - b.accuracy);
            // 建议文案
            let suggestion = '本月错题不多，保持当前节奏即可。';
            if (weak.length) {
                const top = weak.slice(0, 3).map(w => `${w.subject_name}·${w.chapter}（错${w.wrong}题）`).join('，');
                suggestion = `建议优先复习：${top}。`;
            }
            const totRows = progressRows.length, totWrong = Object.values(perQ).reduce((s, e) => s + e.wrong, 0);
            return jsonResp({
                month: monthKey,
                answered: totRows, wrong: totWrong,
                accuracy: totRows ? Math.round((totRows - totWrong) / totRows * 100) : 100,
                subjects: bySubject, weak, suggestion
            });
        }

        // ---------- 搜题（题目 + 知识库笔记） ----------
        if (seg[1] === 'search') {
            const kw = (p.get('q') || '').trim();
            const subject = p.get('subject') || '';
            if (!kw) return jsonResp({ results: [], total: 0, notes: [], notes_total: 0 });
            const kwNorm = normText(kw);           // 与索引同规则：去空白/解码实体/小写
            if (!kwNorm) return jsonResp({ results: [], total: 0, notes: [], notes_total: 0 });
            const keys = SUBJECTS[subject] ? [subject] : Object.keys(SUBJECTS);

            // ---- 题库：先分科收集全部命中，再按科目「轮转取样」 ----
            // 原实现是在单循环里累计到 50 就 break outer：只要第一个科目命中够多，
            // 后面科目的结果一条都不会出现（搜「进程」时 os 独占 50 条，计组/计网全丢）。
            const hitsBySub = {};                 // subject -> [qid...]
            const qmaps = {};
            for (const key of keys) {
                const data = await loadQuestions(key);
                const qmap = {};
                for (const q of data.questions) qmap[q.id] = q;
                qmaps[key] = qmap;
                const hits = [];
                for (const [qid, text] of _searchTexts[key]) if (text.includes(kwNorm)) hits.push(qid);
                hitsBySub[key] = hits;
            }
            const total = Object.values(hitsBySub).reduce((a, b) => a + b.length, 0);
            const results = [];
            for (let i = 0; results.length < SEARCH_LIMIT; i++) {
                let added = false;
                for (const key of keys) {          // 每轮每科各取一条 → 各科目结果都不会被挤掉
                    const hits = hitsBySub[key];
                    if (i >= hits.length) continue;
                    const qid = hits[i];
                    const q = qmaps[key][qid];
                    if (!q) continue;
                    results.push({
                        id: qid, subject: key, subject_name: SUBJECTS[key].name,
                        number: q.number, content: q.content || '', options: q.options,
                        chapter: q.chapter || '', section: q.section || '',
                        is_real_exam: q.is_real_exam || false,
                        exam_year: q.exam_year || null
                    });
                    added = true;
                    if (results.length >= SEARCH_LIMIT) break;
                }
                if (!added) break;                 // 所有科目都取完了
            }

            // ---- 知识库笔记：同样轮转取样（索引已含 subsections 正文） ----
            const noteHitsBySub = {};
            for (const key of keys) {
                await loadNotes(key);
                noteHitsBySub[key] = (_notesIndex[key] || []).filter(n => n.text.includes(kwNorm));
            }
            const notesTotal = Object.values(noteHitsBySub).reduce((a, b) => a + b.length, 0);
            const notesResults = [];
            for (let i = 0; notesResults.length < SEARCH_NOTE_LIMIT; i++) {
                let added = false;
                for (const key of keys) {
                    const hits = noteHitsBySub[key];
                    if (i >= hits.length) continue;
                    const n = hits[i];
                    notesResults.push({
                        subject: key, subject_name: SUBJECTS[key].name,
                        chapter: n.chapter, section: n.section, html: n.html
                    });
                    added = true;
                    if (notesResults.length >= SEARCH_NOTE_LIMIT) break;
                }
                if (!added) break;
            }

            // ---- 算法讲义（algo_notes.json，懒加载；命中跳 algo.html#条目id） ----
            let algoResults = [];
            let algoTotal = 0;
            if (!subject || subject === 'os') {      // 讲义为算法通用内容，全库搜索时纳入
                await loadAlgoIndex();
                algoTotal = _algoIndex.filter(a => a.text.includes(kwNorm)).length;
                algoResults = _algoIndex.filter(a => a.text.includes(kwNorm)).slice(0, 20)
                    .map(a => ({ type: 'algo', chapter: a.chapter, id: a.id, page: a.page, text: a.text.slice(0, 120) }));
            }

            // ---- 思维导图（co/os_map.json，懒加载；命中跳 map.html?subject=xx&goto=节点id） ----
            let mapResults = [];
            let mapTotal = 0;
            const mapSubjects = SUBJECTS[subject] ? (subject === 'co' || subject === 'os' ? [subject] : []) : ['co', 'os'];
            if (mapSubjects.length) {
                await loadMapIndex();
                const hits = _mapIndex.filter(m => mapSubjects.includes(m.subject) && m.text.includes(kwNorm));
                mapTotal = hits.length;
                mapResults = hits.slice(0, 10).map(m => ({
                    type: 'map', subject: m.subject,
                    subject_name: SUBJECTS[m.subject] ? SUBJECTS[m.subject].name : m.subject,
                    id: m.id, path: m.path
                }));
            }

            return jsonResp({
                results, total, shown: results.length,
                notes: notesResults, notes_total: notesTotal,
                algo: algoResults, algo_total: algoTotal,
                map: mapResults, map_total: mapTotal
            });
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
        // 换设备迁移：除 IndexedDB 的 8 个 store 外，localStorage 里还有用户内容/进度
        // （记忆卡 熟/收藏/不熟不会、讲义/图谱/算法/打卡的划词高亮与行级批注、大题已练、
        //   每日一题、冲刺计划打卡与备注，以及各类 UI 偏好），必须一并带走。
        // 做法：自动收集当前 origin 下全部 localStorage 键（以后新增功能无需改这里），
        // 值以原始字符串存放，导入时原样 setItem 回写，保证逐字节还原。
        if (seg[1] === 'backup' && seg[2] === 'export') {
            const strip = (rows, key) => rows.map(r => { const o = { ...r }; delete o[key]; return o; });
            return jsonResp({
                version: 2, exported_at: now(), source: 'pwa',
                progress: strip(await dbAll('progress'), 'pk'),
                wrong: await dbAll('wrong'),
                favorites: await dbAll('favorites'),
                unfamiliar: await dbAll('unfamiliar'),
                dontknow: await dbAll('dontknow'),
                notes: await dbAll('notes'),
                exams: strip(await dbAll('exams'), 'id'),
                daka: await dbAll('daka_progress'),
                local: collectLocalStorage()
            });
        }
        if (seg[1] === 'backup' && seg[2] === 'import') {
            if (!Array.isArray(body.progress)) return jsonResp({ error: '备份文件格式不正确' }, 400);
            const db = await openDB();
            const counts = {};
            // daka 存于备份的 'daka' 键，落库到 daka_progress store
            const storeMap = { progress: 'progress', wrong: 'wrong', favorites: 'favorites', unfamiliar: 'unfamiliar', dontknow: 'dontknow', notes: 'notes', exams: 'exams', daka: 'daka_progress' };
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
            // localStorage 原样回写（记忆卡/批注/每日一题/冲刺计划等；v1 旧备份无此字段则跳过）
            const localRows = (body.local && typeof body.local === 'object' && !Array.isArray(body.local)) ? body.local : null;
            if (localRows) {
                let n = 0;
                for (const [k, v] of Object.entries(localRows)) {
                    if (typeof v !== 'string') continue;   // 只接受导出格式的字符串值
                    try { localStorage.setItem(k, v); n++; } catch (e) { }
                }
                counts.local = n;
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
// 真题选择题各科题量：408 标准卷 40 道单选 = 数构 11 · 组成 11 · OS 10 · 网络 8
// （官方各科分值 45/45/35/25，按同一比例落到 40 题即得此表）
const EXAM_QUOTA_40 = { ds: 11, co: 11, os: 10, cn: 8 };
const EXAM_SUBJECT_ORDER = ['ds', 'co', 'os', 'cn'];

// 按真题比例把总题量拆到各科；余数按小数部分从大到小补，保证合计恰好等于 total
function allocQuotas(total) {
    const baseSum = EXAM_SUBJECT_ORDER.reduce((a, k) => a + EXAM_QUOTA_40[k], 0);
    const raw = {};
    const quotas = {};
    let used = 0;
    for (const k of EXAM_SUBJECT_ORDER) {
        raw[k] = total * EXAM_QUOTA_40[k] / baseSum;
        quotas[k] = Math.floor(raw[k]);
        used += quotas[k];
    }
    let rest = total - used;
    const byFrac = EXAM_SUBJECT_ORDER.slice().sort(
        (a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a]))
    );
    let i = 0;
    while (rest > 0 && byFrac.length) {
        quotas[byFrac[i % byFrac.length]]++;
        rest--;
        i++;
    }
    return quotas;
}

// Fisher-Yates 洗牌（不改原数组）
function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

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
    // 统一 2 分/题：得分 = 答对数 × 2，恒为偶整数（无小数/奇数分）；
    // 多空题答案按序列精确匹配，错一空即整题 0 分
    const score = correct * 2;
    exam.answers = answers;
    exam.correct_count = correct;
    exam.score = score;
    exam.status = 'submitted';
    exam.submitted_at = now();
    // 交卷即固化错题 id：之后「仅模拟考错题」池直接读，不必再遍历题库比对答案
    exam.wrong_ids = details.filter(d => !d.is_correct).map(d => d.id);
    // 同理固化答对的题：收藏池抽题时，这些题默认退出（除非用户标了「猜对了」）
    exam.right_ids = details.filter(d => d.is_correct).map(d => d.id);
    // 实际用时（扣掉暂停）：墙钟 - 累计暂停 - 本次未结算的暂停。历史成绩优先用这个，
    // 否则中途暂停 20 分钟会被算进「时长」里。
    try {
        const t0 = new Date(String(exam.started_at).replace(' ', 'T')).getTime();
        const wall = Math.max(0, Math.floor((Date.now() - t0) / 1000));
        const paused = (exam.paused_sec || 0) +
            (exam.paused_at ? Math.max(0, Math.floor((Date.now() - exam.paused_at) / 1000)) : 0);
        exam.paused_sec = paused;
        exam.paused_at = null;
        exam.used_sec = Math.max(0, wall - paused);
    } catch (e) { exam.used_sec = 0; }
    await dbPut('exams', exam);
    return {
        exam_id: exam.id, total, correct, score,
        per_subject: Object.values(perSubject),
        chapter_loss: Object.values(perChapter).filter(c => c.wrong > 0),
        details
    };
}

// ==================== 模拟考错题池 ====================
// 「仅模拟考错题」模式的池子：只认**历次模拟考**这一条来源，
// 与错题本（wrong store，混了刷题/套卷/模拟考所有来源）刻意区分开。
// 口径：同一题在多场模拟考出现时以**最后一场**的作答为准 —— 后来做对了就不再算错题，
//       避免把已经掌握的题反复回炉；未作答也算错（与成绩单口径一致）。
//
// 性能：交卷时 gradeExam 已把错题 id 落库到 exam.wrong_ids，这里直接读，不再遍历题库。
// 老会话（升级前交的卷）没有该字段 —— 由 calc=true 时才补算并写回，只发生一次。
// **首屏统计传 calc=false**：只用已有 wrong_ids，绝不触发 2.9MB 题库加载，
// 数字可能暂时偏少，前端随后调 /api/exam/examwrong 在后台补算并刷新。
async function examWrongQids(calc) {
    const exams = (await dbAll('exams'))
        .filter(e => e.status === 'submitted')
        .sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')));
    if (calc) {
        for (const e of exams) {
            if (Array.isArray(e.wrong_ids)) continue;
            const ids = [];
            for (const qid of e.question_ids || []) {
                const q = await getQuestionById(qid);
                if (!q || !q.answer) continue;
                const ua = String((e.answers || {})[qid] || '').toUpperCase();
                if (!ua || ua !== q.answer) ids.push(qid);
            }
            e.wrong_ids = ids;
            await dbPut('exams', e);   // 写回，下次直接命中
        }
    }
    const latest = new Map();   // qid -> 最后一场是否算错
    for (const e of exams) {
        if (!Array.isArray(e.wrong_ids)) continue;   // 未补算的场次先跳过（calc=true 时会补齐）
        const wrongSet = new Set(e.wrong_ids);
        for (const qid of e.question_ids || []) latest.set(qid, wrongSet.has(qid));
    }
    const out = [];
    for (const [qid, isWrong] of latest) if (isWrong) out.push(qid);
    return out;
}

// 「模拟考错题」模式的完整抽题池 = 模拟考仍错的题 ∪ 标记题（7 天后重练 / 猜对了 / 历史模拟考错题）。
// 池子成员身份**持久化**：一道题只要进过这个池子（模拟考做错过，或手动标记过），
// 就永久是成员；做对一次置 mastered 后仍留在池子里（可回看），只是不再被抽到。
// 只有「做错」会清掉 mastered，让它重新可抽。
// 返回 { pending, mastered }：pending 进抽题池，mastered 只用于统计展示。
async function examWrongPoolQids(calc) {
    const dynamic = await examWrongQids(calc);
    const rows = await dbAll('redo').catch(() => []);
    const byId = new Map(rows.map(r => [r.question_id, r]));
    // 回填：历史模拟考错题没有持久记录 → 补一条 kind='examwrong'，从此成为永久成员
    // （老数据也满足「做对一次后留池不抽」，不必等下一次交卷）
    const backfill = [];
    for (const qid of dynamic) {
        if (byId.has(qid)) continue;
        const row = {
            question_id: qid,
            subject: String(qid).split('_')[0],
            kind: 'examwrong',
            added_at: now(),
            due_at: 0
        };
        backfill.push(row);
        byId.set(qid, row);
    }
    if (backfill.length) {
        for (const row of backfill) await dbPut('redo', row);
    }
    const pending = new Set(dynamic);
    const mastered = new Set();
    for (const r of byId.values()) {
        if (!r || !r.question_id) continue;
        if (r.mastered) { mastered.add(r.question_id); pending.delete(r.question_id); }
        else pending.add(r.question_id);
    }
    for (const qid of mastered) pending.delete(qid);
    return { pending: [...pending], mastered: [...mastered] };
}

// 模拟考里「答对过」的题（同一题以最后一场为准）。
// 用途：收藏池抽题时这些题默认退出 —— 用户规则「模拟考做对即视为掌握，不再抽」，
// 但在试卷回顾里点「猜对了」可以放回垫底层（guessed 标记）。
async function examCorrectQids(calc) {
    const exams = (await dbAll('exams'))
        .filter(e => e.status === 'submitted')
        .sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')));
    if (calc) {
        for (const e of exams) {
            if (Array.isArray(e.right_ids)) continue;
            if (!Array.isArray(e.wrong_ids)) {
                const ids = [];
                for (const qid of e.question_ids || []) {
                    const q = await getQuestionById(qid);
                    if (!q || !q.answer) continue;
                    const ua = String((e.answers || {})[qid] || '').toUpperCase();
                    if (!ua || ua !== q.answer) ids.push(qid);
                }
                e.wrong_ids = ids;
            }
            const wrongSet = new Set(e.wrong_ids);
            e.right_ids = (e.question_ids || []).filter(qid => !wrongSet.has(qid));
            await dbPut('exams', e);
        }
    }
    const latest = new Map();   // qid -> 最后一场是否答对
    for (const e of exams) {
        if (!Array.isArray(e.right_ids)) continue;
        const rightSet = new Set(e.right_ids);
        for (const qid of e.question_ids || []) latest.set(qid, rightSet.has(qid));
    }
    const out = [];
    for (const [qid, isRight] of latest) if (isRight) out.push(qid);
    return out;
}

async function examApi(action, body, arg) {
    if (action === 'generate') {
        const mode = body.mode || 'favorites';
        const count = parseInt(body.count || 0, 10);
        const isSpecial = mode === 'favorites' || mode === 'wrong' || mode === 'unfamiliar' || mode === 'examwrong';
        const isSingle = !!SUBJECTS[mode];
        if (!isSpecial && !isSingle && mode !== 'full') {
            return jsonResp({ error: '无效的考试模式' }, 400);
        }
        const [lo, hi, dft] = mode === 'full' ? [10, 150, 40] : isSpecial ? [5, 150, 40] : [5, 100, 20];
        const total = count ? Math.min(Math.max(count, lo), hi) : dft;

        // ---- 1. 分科建池 ----
        const poolBySub = {};
        for (const k of EXAM_SUBJECT_ORDER) poolBySub[k] = [];
        if (isSpecial) {
            // 特殊池：收藏 / 错题池（含不熟不会，已合并）/ 模拟考错题
            let qids;
            if (mode === 'favorites') {
                qids = (await dbAll('favorites')).map(r => r.question_id);
            } else if (mode === 'unfamiliar') {
                // 兼容旧入口：不熟池已并入错题池，这里保留为子集视图
                qids = [...(await dbAll('unfamiliar')), ...(await dbAll('dontknow'))].map(r => r.question_id);
            } else if (mode === 'examwrong') {
                // 模拟考仍错的题 + 「7 天后重练 / 猜对了」标记题（后者做对过就只留不抽）
                qids = (await examWrongPoolQids(true)).pending;
            } else {
                // 错题池 = 错题本未了结 ∪ 不熟 ∪ 不会 ∪ 手动标记（不熟池已并入，不再单列）
                const wrongIds = (await dbAll('wrong')).filter(w => !w.is_resolved).map(r => r.question_id);
                const unfamIds = (await dbAll('unfamiliar')).map(r => r.question_id);
                const dkIds = (await dbAll('dontknow')).map(r => r.question_id);
                const markIds = (await dbAll('redo')).filter(r => !r.mastered).map(r => r.question_id);
                qids = [...new Set([...wrongIds, ...unfamIds, ...dkIds, ...markIds])];
            }
            for (const qid of qids) {
                const subj = String(qid || '').split('_')[0];
                if (!SUBJECTS[subj] || !poolBySub[subj]) continue;
                const q = await getQuestionById(qid);
                if (q && q.answer) poolBySub[subj].push(q);
            }
        } else if (isSingle) {
            poolBySub[mode] = (await loadQuestions(mode)).questions.filter(q => q.answer);
        } else {
            for (const k of EXAM_SUBJECT_ORDER) {
                poolBySub[k] = (await loadQuestions(k)).questions.filter(q => q.answer);
            }
        }

        let picked = [];
        const pickedIds = new Set();

        // ---- 抽题优先级 ----
        // 空着没作答的题不会写 progress，因此天然落进「没做过」层，下次优先抽到。
        const progMap = new Map();
        for (const p of await dbAll('progress')) progMap.set(p.question_id, p);
        const wrongMap = new Map();
        for (const w of await dbAll('wrong')) wrongMap.set(w.question_id, w);

        // 到期错题（跨科目一次算好）：只含「最近一次作答仍是错的」的题。
        // 做对了即了结不抽；做错的满冷却期（7 天）后再抽；逾期越久越靠前（rank 越小越靠前）。
        let dueRank = new Map();
        try { (await examDueWrongIds()).forEach((id, i) => dueRank.set(id, i)); } catch (e) { /* 取不到就退化为纯时间队列 */ }
        // 到期的「7 天后重练」题（试卷回顾里手动排的）：并入到期层，但排在错题之后
        // —— 错题是"没掌握"，重练是"想再确认一遍"，优先级低于错题。
        // 注意 redo store 里还混着 kind='guessed'（猜对了）的标记，那不是时间排期，要跳过。
        const redoRows = await dbAll('redo').catch(() => []);
        try {
            const nowMs = Date.now();
            let idx = dueRank.size;
            for (const r of redoRows) {
                const qid = r && r.question_id;
                if (!qid || dueRank.has(qid)) continue;
                if (r.mastered) continue;                // 已做对过：留在池子里但不再抽
                if (r.kind === 'guessed') continue;      // 猜对了标记：只影响垫底层，不进到期层
                if (r.kind === 'examwrong') continue;    // 模拟考错题池成员：不参与收藏池排期
                if ((r.due_at || 0) > nowMs) continue;   // 还没到 7 天
                dueRank.set(qid, idx++);
            }
        } catch (e) { /* 取不到就只按错题层 */ }

        // 收藏模式专用：模拟考答对过的题默认退出抽题；标了「猜对了」的放行到垫底层
        // （已 mastered 的不放行 —— 做对过一次就不再抽，与「模拟考错题」池规则一致）
        let examRightSet = new Set(), guessedSet = new Set();
        if (mode === 'favorites') {
            try { examRightSet = new Set(await examCorrectQids(true)); } catch (e) { /* 取不到就不排除 */ }
            for (const r of redoRows) if (r.kind === 'guessed' && !r.mastered) guessedSet.add(r.question_id);
        }

        // 收藏题（favorites）：到期错题 → 做过的错题 → 没做过 → 做过的对题（垫底）。
        //   ① 到期错题最优先：逾期越久越先抽，最多占本场该科题量 1/3（向上取整）；
        //   ② 做过且错题本里仍挂着未解决（含未到 7 天的）：先把错过的题过一遍；
        //   ③ 从没做过的：按题号稳定序（不随机），对应"1312 题一天 40"的推进节奏；
        //   ④ 做过的对题垫底 —— 但**模拟考里答对的题默认退出**（用户规则：模拟考做对即视为掌握），
        //      除非在试卷回顾里点过「猜对了」（guessed 标记），那样才回到垫底层可抽。
        function prioritizeByTime(pool, take) {
            const due = [], fresh = [], wrongish = [], correct = [];
            const isWrongish = q => {
                const w = wrongMap.get(q.id);
                return !!(w && !w.is_resolved);
            };
            for (const q of pool) {
                const p = progMap.get(q.id);
                if (!p) { fresh.push(q); continue; }               // 从没做过
                if (dueRank.has(q.id)) { due.push(q); continue; }  // 到期错题
                if (isWrongish(q)) { wrongish.push(q); continue; } // 做过的错题
                if (p.is_correct) {
                    // 模拟考答对过、且没标「猜对了」→ 退出抽题池
                    if (examRightSet.has(q.id) && !guessedSet.has(q.id)) continue;
                    correct.push(q);   // 其余答对的题垫底
                }
            }
            // 到期错题内部：逾期越久越靠前（dueRank 由 examDueWrongIds 按最后做错时间升序生成）
            due.sort((a, b) => (dueRank.get(a.id) - dueRank.get(b.id)) || (a.id < b.id ? -1 : 1));
            // 帽子 = 本场该科题量的 1/3：超出部分退回"做过的错题"层
            const dueCap = Math.ceil((take || pool.length) / 3);
            while (due.length > dueCap) {
                const q = due.pop();
                (isWrongish(q) ? wrongish : correct).push(q);
            }
            // 从没做过的：按题号稳定排序，保证每场抽到的顺序一致（不是随机）
            fresh.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            // 做过的：按最近一次作答时间升序 = 最早做的排最前；同刻用题号兜底
            const byAnswered = (a, b) => {
                const ta = String((progMap.get(a.id) || {}).answered_at || '');
                const tb = String((progMap.get(b.id) || {}).answered_at || '');
                if (ta !== tb) return ta < tb ? -1 : 1;
                return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
            };
            wrongish.sort(byAnswered);
            correct.sort(byAnswered);
            // 顺序：到期错题 → 做过的错题 → 没做过 → 做过的对题（垫底）
            return due.concat(wrongish, fresh, correct);
        }

        // 错题本（wrong）：三层优先级 —— 没做过 > 错题未解决 > 最久没做 > 最近做过
        function prioritize(pool) {
            const fresh = [], wrongs = [], byDay = new Map();
            for (const q of pool) {
                const p = progMap.get(q.id);
                const w = wrongMap.get(q.id);
                if (!p) {
                    fresh.push(q);
                } else if (w && !w.is_resolved) {
                    wrongs.push(q);
                } else {
                    const day = String(p.answered_at || '').slice(0, 10) || '0000-00-00';
                    if (!byDay.has(day)) byDay.set(day, []);
                    byDay.get(day).push(q);
                }
            }
            const ordered = shuffled(fresh).concat(shuffled(wrongs));
            for (const day of [...byDay.keys()].sort()) ordered.push(...shuffled(byDay.get(day)));
            return ordered;
        }

        // 收藏题用时间队列（最早做过的先抽）；错题本 / 整卷 / 单科保持原三层优先级
        const order = mode === 'favorites' ? prioritizeByTime : prioritize;

        if (isSingle) {
            picked = order(poolBySub[mode], total).slice(0, total);
        } else {
            // ---- 2. 第一轮：严格按真题各科题量抽 ----
            const quotas = allocQuotas(total);
            for (const k of EXAM_SUBJECT_ORDER) {
                const take = Math.min(quotas[k], poolBySub[k].length);
                for (const q of order(poolBySub[k], take).slice(0, take)) {
                    picked.push(q);
                    pickedIds.add(q.id);
                }
            }
            let short = total - picked.length;

            // ---- 3. 第二轮：某科不够时，先用其它科池里剩下的补（收藏/错题仍优先）----
            if (short > 0) {
                const rest = [];
                for (const k of EXAM_SUBJECT_ORDER) {
                    for (const q of poolBySub[k]) if (!pickedIds.has(q.id)) rest.push(q);
                }
                // 同样按 order 排（到期错题优先/收藏=最早做过的先补），不做随机
                for (const q of order(rest, short).slice(0, short)) {
                    picked.push(q);
                    pickedIds.add(q.id);
                }
                short = total - picked.length;
            }

            // ---- 4. 第三轮：还差就跨科从全题库补 ----
            // 收藏模式兜底时同样排除「答对过」的题 —— 否则会从全库把刚排除的题又捞回来。
            if (short > 0) {
                const rest = [];
                for (const k of EXAM_SUBJECT_ORDER) {
                    const data = await loadQuestions(k);
                    for (const q of data.questions) {
                        if (!q.answer || pickedIds.has(q.id)) continue;
                        // 与池内规则保持一致：只排除「模拟考答对且没标猜对了」的题
                        if (mode === 'favorites' && examRightSet.has(q.id) && !guessedSet.has(q.id)) continue;
                        rest.push(q);
                    }
                }
                for (const q of shuffled(rest).slice(0, short)) {
                    picked.push(q);
                    pickedIds.add(q.id);
                }
            }
        }
        if (!picked.length) return jsonResp({ error: '题库为空，无法组卷' }, 400);
        const duration = parseInt(body.duration_sec || 0, 10) || picked.length * 90;   // 默认每题 1.5 分钟（40 题 = 60 分钟）
        // 废弃之前未交卷的会话
        for (const e of await dbAll('exams')) {
            if (e.status === 'in_progress') { e.status = 'abandoned'; await dbPut('exams', e); }
        }
        const examId = await dbPut('exams', {
            mode, question_ids: picked.map(q => q.id), answers: {},
            total_count: picked.length, correct_count: 0, score: 0,
            duration_sec: duration, status: 'in_progress', started_at: now(), submitted_at: null,
            record_wrong: body.record_wrong === false ? 0 : 1,
            // 暂停计时：paused_sec = 累计已暂停秒数，paused_at = 本次暂停开始的毫秒时间戳（未暂停为 null）
            paused_sec: 0, paused_at: null
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

    // 池子统计：模拟考设置页展示"待抽多少题"，让"按真题比例抽"这件事在组卷前可见
    if (action === 'pool') {
        const nowMs = Date.now();
        const progMap = new Map();
        for (const p of await dbAll('progress')) progMap.set(p.question_id, p);
        const wrongMap = new Map();
        for (const w of await dbAll('wrong')) wrongMap.set(w.question_id, w);
        const favs = await dbAll('favorites');
        // 与 prioritizeByTime 完全同口径：没做过 / 做过且错题未解决 / 做过且答对
        let fresh = 0, wrongish = 0, correct = 0;
        for (const f of favs) {
            const p = progMap.get(f.question_id);
            if (!p) { fresh++; continue; }
            const w = wrongMap.get(f.question_id);
            if (w && !w.is_resolved) wrongish++; else correct++;
        }
        // 不熟 / 不会：总数 + 其中"还没做过"的（用户要看这两个池子里真正待抽多少）
        const unfamRows = await dbAll('unfamiliar');
        const dkRows = await dbAll('dontknow');
        const unfam = unfamRows.length;
        const dk = dkRows.length;
        let unfamUndone = 0, dkUndone = 0;
        for (const r of unfamRows) if (!progMap.has(r.question_id)) unfamUndone++;
        for (const r of dkRows) if (!progMap.has(r.question_id)) dkUndone++;
        // 模拟考去重题数：历次已交卷的卷面题目并集（不碰题库，只读会话）
        const examRows = (await dbAll('exams')).filter(e => e.status === 'submitted');
        const examQidSet = new Set();
        for (const e of examRows) for (const qid of e.question_ids || []) examQidSet.add(qid);
        let dueWrong = 0;
        try { dueWrong = (await examDueWrongIds()).length; } catch (e) { /* 取不到就报 0 */ }
        // 模拟考错题池（只认模拟考来源，最后一场作答仍错/未作答）
        // calc=false：只用已落库的 wrong_ids，不触发题库加载 —— 首屏必须快
        let examWrongIds = [];
        try { examWrongIds = await examWrongQids(false); } catch (e) { /* 取不到就报 0 */ }
        const examWrongBySub = { ds: 0, co: 0, os: 0, cn: 0 };
        for (const qid of examWrongIds) {
            const k = String(qid).split('_')[0];
            if (examWrongBySub[k] != null) examWrongBySub[k]++;
        }
        // 「模拟考错题」池 = 模拟考仍错的题 ∪ 「7 天后重练 / 猜对了」标记题。
        // 标记题做对一次置 mastered：**留在池子里**（可回看）但不再抽。
        let redoPending = 0, redoDue = 0, guessedCnt = 0, markedMastered = 0, examMarked = 0;
        const markedIds = new Set(), masteredIds = new Set();
        try {
            for (const r of await dbAll('redo')) {
                if (r.mastered) { markedMastered++; masteredIds.add(r.question_id); continue; }
                if (r.kind === 'examwrong') { examMarked++; markedIds.add(r.question_id); continue; }
                if (r.kind === 'guessed') { guessedCnt++; markedIds.add(r.question_id); continue; }
                markedIds.add(r.question_id);
                if ((r.due_at || 0) <= nowMs) redoDue++; else redoPending++;
            }
        } catch (e) { /* 取不到就报 0 */ }
        // 池子实际可抽数（去重后）：模拟考仍错 + 标记未掌握
        const examPoolSet = new Set(examWrongIds);
        for (const qid of markedIds) examPoolSet.add(qid);
        for (const qid of masteredIds) examPoolSet.delete(qid);
        return jsonResp({
            favorites_total: favs.length,
            favorites_fresh: fresh,        // 待抽：收藏池里从没做过的（最高优先级的新题）
            favorites_wrongish: wrongish,  // 做过且错题本仍挂着未解决（排在答对之前）
            favorites_correct: correct,    // 做过且答对（优先级最低，但不是不抽）
            exam_answered: examQidSet.size,   // 模拟考做过的去重题数（历次卷面并集）
            exam_sessions: examRows.length,   // 已交卷场数
            unfamiliar: unfam,
            unfamiliar_undone: unfamUndone,   // 不熟池里还没做过的
            dontknow: dk,
            dontknow_undone: dkUndone,        // 不会池里还没做过的
            due_wrong: dueWrong,
            exam_wrong: examWrongIds.length,          // 模拟考仍错的题（动态）
            exam_wrong_by_subject: examWrongBySub,
            marked_pending: markedIds.size,           // 标记题：还没做对的（会抽）
            marked_mastered: markedMastered,          // 标记题：已做对的（留池不抽）
            exam_marked: examMarked,                  // 其中来自「模拟考错题」持久成员的数量
            exam_pool_total: examPoolSet.size,        // 「模拟考错题」模式实际可抽数
            redo_pending: redoPending,
            redo_due: redoDue,
            guessed: guessedCnt,              // 「猜对了」标记数（放回垫底层的题）
            cooldown_days: EXAM_REDO_COOLDOWN_DAYS
        });
    }

    // 后台补算「模拟考错题」池：老会话没有 wrong_ids，需要遍历题库比对答案。
    // 单独成一个接口，让首屏统计（pool）不必等它，也不会被 2.9MB 题库加载拖住。
    if (action === 'examwrong') {
        // 池子 = 模拟考仍错的题 ∪ 「7 天后重练 / 猜对了」标记题（标记题做对过只留不抽）
        const pool = await examWrongPoolQids(true);
        const bySub = { ds: 0, co: 0, os: 0, cn: 0 };
        for (const qid of pool.pending) {
            const k = String(qid).split('_')[0];
            if (bySub[k] != null) bySub[k]++;
        }
        return jsonResp({
            exam_wrong: pool.pending.length,        // 可抽总数（含标记题）
            exam_wrong_by_subject: bySub,
            marked_mastered: pool.mastered.length   // 已做对、留池不抽的标记题
        });
    }

    if (action === 'active') {
        const active = (await dbAll('exams')).filter(e => e.status === 'in_progress').pop();
        if (!active) return jsonResp({ active: null });
        const started = new Date(active.started_at.replace(' ', 'T'));
        // 超时不自动交卷：remaining_sec 允许为负，前端按"超时计时"展示，交卷由用户自己点。
        // 暂停期间不计入：实际计时 = 墙钟 - 累计已暂停 - 本次暂停至今
        const wallSec = Math.floor((Date.now() - started.getTime()) / 1000);
        const pausedSec = active.paused_sec || 0;
        const pausedNowSec = active.paused_at ? Math.max(0, Math.floor((Date.now() - active.paused_at) / 1000)) : 0;
        const remaining = active.duration_sec - (wallSec - pausedSec - pausedNowSec);
        const questions = [];
        for (const qid of active.question_ids) {
            const q = await getQuestionById(qid);
            if (q) questions.push(stripAnswer(q));
        }
        return jsonResp({ active: {
            exam_id: active.id, mode: active.mode, remaining_sec: remaining,
            duration_sec: active.duration_sec, answers: active.answers || {}, questions,
            paused: !!active.paused_at, paused_sec: pausedSec + pausedNowSec
        }});
    }

    // 暂停 / 继续：暂停期间时间不走，刷新页面重进也不会被追回（active 按扣除后的实际计时重算）
    if (action === 'pause') {
        const exam = body.exam_id ? await dbGet('exams', body.exam_id) : null;
        if (!exam) return jsonResp({ error: '考试不存在' }, 404);
        if (exam.status !== 'in_progress') return jsonResp({ error: '考试不在进行中' }, 400);
        if (!exam.paused_at) {
            exam.paused_at = Date.now();
            await dbPut('exams', exam);
        }
        return jsonResp({ success: true, paused_at: exam.paused_at, paused_sec: exam.paused_sec || 0 });
    }

    if (action === 'resume') {
        const exam = body.exam_id ? await dbGet('exams', body.exam_id) : null;
        if (!exam) return jsonResp({ error: '考试不存在' }, 404);
        if (exam.status !== 'in_progress') return jsonResp({ error: '考试不在进行中' }, 400);
        if (exam.paused_at) {
            const add = Math.max(0, Math.floor((Date.now() - exam.paused_at) / 1000));
            exam.paused_sec = (exam.paused_sec || 0) + add;
            exam.paused_at = null;
            await dbPut('exams', exam);
        }
        return jsonResp({ success: true, paused_sec: exam.paused_sec || 0 });
    }

    if (action === 'submit') {
        const exam = body.exam_id ? await dbGet('exams', body.exam_id) : null;
        if (!exam) return jsonResp({ error: '考试不存在' }, 404);
        if (exam.status !== 'in_progress') return jsonResp({ error: '该考试已交卷' }, 400);
        return jsonResp(await gradeExam(exam, body.answers || {}));
    }

    if (action === 'history') {
        const all = await dbAll('exams');
        const records = all
            .filter(e => e.status === 'submitted')
            .sort((a, b) => (a.submitted_at > b.submitted_at ? -1 : 1))
            .slice(0, 50)
            .map(e => ({
                id: e.id, mode: e.mode, total_count: e.total_count, correct_count: e.correct_count,
                score: e.score, duration_sec: e.duration_sec, started_at: e.started_at, submitted_at: e.submitted_at,
                used_sec: e.used_sec || 0, paused_sec: e.paused_sec || 0
            }));
        // total = 全部会话（含进行中/已废弃），供"清除记录"确认弹窗提示
        return jsonResp({ records, total: all.length });
    }

    // 清除全部模拟考记录（含进行中/已废弃的会话）——前端有确认弹窗把关
    if (action === 'clear') {
        const all = await dbAll('exams');
        const db = await openDB();
        await new Promise((res, rej) => {
            const tx = db.transaction('exams', 'readwrite');
            tx.objectStore('exams').clear();
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error || new Error('清除失败'));
        });
        return jsonResp({ cleared: all.length });
    }

    // 批量删除指定场次（历史列表勾选后删除）——前端有确认弹窗把关
    if (action === 'delete') {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(n => parseInt(n, 10)).filter(n => n > 0);
        if (!ids.length) return jsonResp({ error: '未选择要删除的记录' }, 400);
        const db = await openDB();
        await new Promise((res, rej) => {
            const tx = db.transaction('exams', 'readwrite');
            for (const id of ids) tx.objectStore('exams').delete(id);
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error || new Error('删除失败'));
        });
        return jsonResp({ deleted: ids.length });
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
            total: exam.total_count, correct: exam.correct_count, score: exam.score,
            details
        });
    }

    return jsonResp({ error: '未知考试接口' }, 404);
}

// ==================== 计网题库 id 迁移（一次性） ====================
// 2026-09-01：计网题库补入 6 道缺失多空题，全库 number/id 顺延（cn_0001..cn_0558
// → cn_0001..cn_0564）。本地 progress/wrong/favorites/notes 按 question_id 建键，
// 需按 data/cn_id_map.json 把旧 id 重写为新 id，否则既有收藏/错题/笔记/作答变孤儿。
// localStorage 标记保证只跑一次；逐条迁移可重入（已迁移的记录不在映射中，自动跳过）。
async function migrateCnQuestionIds() {
    try {
        if (localStorage.getItem('cn_id_migrated') === '1') return;
        const resp = await fetch('data/cn_id_map.json');
        if (!resp.ok) return;
        const map = await resp.json();
        let changed = 0;
        for (const store of ['wrong', 'favorites', 'notes']) {
            for (const row of await dbAll(store)) {
                const nid = map[row.question_id];
                if (nid && nid !== row.question_id) {
                    await dbDelete(store, row.question_id);
                    await dbPut(store, Object.assign({}, row, { question_id: nid }));
                    changed++;
                }
            }
        }
        for (const row of await dbAll('progress')) {
            const nid = map[row.question_id];
            if (nid && nid !== row.question_id) {
                await dbPut('progress', Object.assign({}, row, { question_id: nid }));
                changed++;
            }
        }
        localStorage.setItem('cn_id_migrated', '1');
        console.log('[migrate] 计网题目 id 迁移完成，更新', changed, '条记录');
    } catch (e) {
        console.warn('[migrate] 计网题目 id 迁移未执行（可稍后自动重试）', e);
    }
}

// ==================== Service Worker 注册 ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        migrateCnQuestionIds();
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

// 供 zhenti 等页面直接调用：真题数据（外部 id）客户端判分后写进度/错题本。
// 显式挂 window，避免未来 backend 被包进 IIFE 时静默失效。
window.applyAnswer = applyAnswer;
window.now = now;   // 供 zhenti 等页面生成标准时间戳（勿再用 Date.now()）
