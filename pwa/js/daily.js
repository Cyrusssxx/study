// ==================== 每日一题（daily.html） ====================
// 规则：
//   ① 每天从四门（ds/os/cn/co）的【收藏 ∪ 不熟/不会 ∪ 今日到期复习】题池里各抽 1 题，共 4 题，四门互不重复；
//   ② 抽题优先级（五层）：到期复习 > 不会 > 不熟 > 没做过 > 其他做过；层内「从未抽过 → 最久未抽」；
//   ③ 支持「➕ 再来 4 道」加量：每门再抽 1 题追加到当天列表（与当天已抽不重复，某门抽完则跳过）；
//   ④ 直接在卡片里作答（选项→提交→判对错→看解析），页面内完成不跳转；
//   ⑤ 笔记默认【不展开】（刷题页 quiz.html 仍保持有笔记即展开）；
//   ⑥ 每天首次进入生成结果并归档进历史，历史保留最近 120 天，可回看/页内补做。
// 存储（localStorage）：
//   daily_pick_v1    —— 今日 {date, picks:{ds|os|cn|co: [题目对象, ...]}}（题目对象含 options/answer/explanation/note/answered）
//   daily_history_v1 —— 历史数组 [{date, picks}]（结构同今日，保留完整题目数据）
//   daily_seen_v1    —— 已抽过记录 {subject: {qid: 上次抽到的日期}}
(function () {
    const TODAY_KEY = 'daily_pick_v1';
    const HISTORY_KEY = 'daily_history_v1';
    const SEEN_KEY = 'daily_seen_v1';
    const SUBJ_ORDER = ['ds', 'os', 'cn', 'co'];
    const HISTORY_LIMIT = 120;

    function todayStr(d) {
        const t = d || new Date();
        const p = n => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }
    function weekdayCn(d) { return '周' + '日一二三四五六'[d.getDay()]; }
    function readJson(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; }
    }
    function writeJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }
    function subName(k) {
        return (typeof SUBJECTS !== 'undefined' && SUBJECTS[k] && SUBJECTS[k].name) || k;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function snippet(html, n) {
        const t = String(html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return t.length > (n || 56) ? t.slice(0, n || 56) + '…' : t;
    }
    function hasRealNote(p) {
        if (!p) return false;
        if ((p.note_images || []).length) return true;
        const t = String(p.note || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
        return t.length > 0;
    }

    // 单模式拉题（带作答状态 last_status、弱标记、笔记等完整字段）
    async function loadMode(sub, mode) {
        try {
            // 路由是 /api/questions/<subject>（路径段），不是 ?subject= 查询参数
            const resp = await api(`/api/questions/${encodeURIComponent(sub)}?mode=${mode}&page=1&per_page=9999`);
            const data = await resp.json();
            return (data && data.questions) || [];
        } catch (e) { return []; }
    }

    // 抽题池 = 收藏题 ∪ 不熟/不会的题 ∪ 今日到期复习题（艾宾浩斯）
    //   - unfamiliar 模式返回「不熟+不会」并集；review 模式返回今日到期（逾期越久越前）
    //   - 到期复习的题打 _due 标记（抽题时最高优先，界面上标「待复习」）
    async function loadPool(sub) {
        const [favs, weak, due] = await Promise.all([
            loadMode(sub, 'favorite'),
            loadMode(sub, 'unfamiliar'),
            loadMode(sub, 'review')
        ]);
        const map = new Map();
        const add = (q, isDue) => {
            let o = map.get(q.id);
            if (!o) { o = Object.assign({}, q); o._due = false; map.set(q.id, o); }
            if (isDue) o._due = true;
        };
        for (const q of favs) add(q, false);
        for (const q of weak) add(q, false);
        for (const q of due) add(q, true);
        return Array.from(map.values());
    }

    // picks 归一化：兼容旧数据（单题对象）与新数据（题目数组）
    function normPicks(picks) {
        const out = {};
        const src = picks || {};
        for (const k of Object.keys(src)) {
            const v = src[k];
            if (!v) continue;
            const arr = (Array.isArray(v) ? v : [v]).filter(Boolean);
            if (arr.length) out[k] = arr;
        }
        return out;
    }

    // 抽 1 题（五层优先，层内「从未抽过 → 最久未抽」，随机打破并列）：
    //   L1 今日到期复习（艾宾浩斯）→ L2 标记「不会」→ L3 标记「不熟」→ L4 没做过 → L5 其他做过的。
    //   旧写法的缺陷：先按"没做过"整体过滤，导致只要还有没做过的题，弱标记题永远抽不到。
    function pickOne(pool, seenSub, excludeIds) {
        if (!pool || !pool.length) return null;
        const seen = seenSub || {};
        const ex = excludeIds || new Set();
        let cand = pool.filter(f => !ex.has(f.id));          // 排除当天已抽过的
        if (!cand.length) cand = pool.slice();               // 题不够时放宽（由调用方决定是否过滤）

        const isD = f => !!f.is_dontknow;
        const isU = f => !!f.is_unfamiliar && !isD(f);
        const isNew = f => !isD(f) && !isU(f) && !f.last_status;      // 没做过
        const layers = [
            cand.filter(f => f._due),                                    // 到期复习（最该现在看）
            cand.filter(f => !f._due && isD(f)),
            cand.filter(f => !f._due && isU(f)),
            cand.filter(f => !f._due && isNew(f)),
            cand.filter(f => !f._due && !isD(f) && !isU(f) && !!f.last_status)
        ];
        const tier = layers.find(a => a.length) || cand;
        return pickOldest(tier, seen);
    }
    function pickOldest(arr, seen) {
        const fresh = arr.filter(f => !seen[f.id]);
        if (fresh.length) return pick(fresh);
        const sorted = arr.slice().sort((a, b) => String(seen[a.id] || '').localeCompare(String(seen[b.id] || '')));
        const earliest = seen[sorted[0].id] || '';
        return pick(sorted.filter(f => (seen[f.id] || '') === earliest));
    }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    // 今日卡片存的题目数据：作答所需字段（历史归档也存完整数据，供页内回看/补做）
    function toPick(f) {
        return {
            id: f.id,
            content: f.content || '',
            options: f.options || {},
            answer: f.answer || '',
            explanation: f.explanation || '',
            multi_blank: !!f.multi_blank,
            chapter: f.chapter || '',
            section: f.section || '',
            note: f.note || '',
            note_images: f.note_images || [],
            due: !!f._due,    // 抽到时是「今日到期复习」题（界面标 🔁 待复习）
            answered: null    // {answer, isCorrect, correctAnswer}
        };
    }

    async function rollToday() {
        const today = todayStr();
        const cur = readJson(TODAY_KEY, null);
        if (cur && cur.date === today && cur.picks) {
            const norm = { date: cur.date, picks: normPicks(cur.picks) };
            if (!cur.normalized) { norm.normalized = 1; writeJson(TODAY_KEY, norm); }
            return norm;
        }

        // 上一天归档进历史（存完整题目数据，供日期视图回看与页内补做）
        if (cur && cur.date && cur.picks) {
            const hist = readJson(HISTORY_KEY, []);
            if (!hist.some(h => h.date === cur.date)) {
                hist.unshift({ date: cur.date, picks: normPicks(cur.picks) });
                writeJson(HISTORY_KEY, hist.slice(0, HISTORY_LIMIT));
            }
        }

        const seen = readJson(SEEN_KEY, {});
        const picks = {};
        for (const sub of SUBJ_ORDER) {
            const pool = await loadPool(sub);
            const f = pickOne(pool, seen[sub]);
            if (!f) continue;
            picks[sub] = [toPick(f)];
            seen[sub] = seen[sub] || {};
            seen[sub][f.id] = today;
        }
        const out = { date: today, picks, normalized: 1 };
        writeJson(TODAY_KEY, out);
        writeJson(SEEN_KEY, seen);
        return out;
    }

    // 加量：每门再抽 1 题追加到当天列表（与当天已抽的不重复；某门收藏抽完则跳过该门）
    async function addBatch() {
        const d = readJson(TODAY_KEY, null);
        if (!d || d.date !== todayStr() || !d.picks) return { added: 0, subs: [] };
        const picks = normPicks(d.picks);
        const seen = readJson(SEEN_KEY, {});
        const today = todayStr();
        let added = 0;
        const subs = [];
        for (const sub of SUBJ_ORDER) {
            const cur = picks[sub] || [];
            const ex = new Set(cur.map(p => p.id));
            const pool = await loadPool(sub);
            const cand = pool.filter(f => !ex.has(f.id));     // 该门可抽的都抽过 → 本题无新题可加
            if (!cand.length) continue;
            const f = pickOne(cand, seen[sub]);
            if (!f) continue;
            cur.push(toPick(f));
            picks[sub] = cur;
            seen[sub] = seen[sub] || {};
            seen[sub][f.id] = today;
            added++; subs.push(sub);
        }
        if (added) {
            writeJson(TODAY_KEY, { date: today, picks, normalized: 1 });
            writeJson(SEEN_KEY, seen);
        }
        return { added, subs };
    }

    function quizLink(sub, qid) {
        return `quiz.html?subject=${sub}&mode=favorite&goto=${encodeURIComponent(qid)}`;
    }

    // 章节小节 → 知识点跳转（同 quiz.html：notes.html 定位到小节，题干片段兜底模糊定位）
    function kpMetaHtml(sub, p) {
        const meta = [p.chapter, p.section].filter(Boolean).join(' · ');
        if (!meta) return '';
        if (p.section) {
            return `<a class="daily-meta daily-kp" href="notes.html?subject=${sub}&goto=${encodeURIComponent(p.section)}&q=${encodeURIComponent(String(p.content || '').slice(0, 60))}"
                target="_blank" title="点击新窗口查看该知识点笔记（已定位到小节）">${esc(meta)} 📖</a>`;
        }
        return `<span class="daily-meta">${esc(meta)}</span>`;
    }

    // ---------- 渲染：每题一个内嵌作答块（ctx.idx = 同门第几题；ctx.date 非空 = 历史日期补做） ----------
    function itemHtml(sub, p, ctx) {
        ctx = ctx || {};
        const idx = ctx.idx || 0;
        if (!p) {
            return `<div class="daily-item daily-item-empty">
                <div class="daily-item-head"><span class="daily-subject">${esc(subName(sub))}</span></div>
                <div class="daily-q">${ctx.date ? '当天未抽到该科目的题' : '暂无收藏题'}</div>
                <a class="daily-link" href="quiz.html?subject=${sub}&mode=sequential">${ctx.date ? '去刷题做题 →' : '去刷题收藏 →'}</a>
            </div>`;
        }
        // 旧版摘要数据（无 options）：无法页内作答，跳刷题页
        if (!p.options || !Object.keys(p.options).length) {
            return `<div class="daily-item" data-sub="${sub}">
                <div class="daily-item-head">
                    <span class="daily-subject">${esc(subName(sub))}</span>
                    ${kpMetaHtml(sub, p)}
                </div>
                <div class="daily-q">${esc(p.content || '（题目）')}</div>
                <a class="daily-link" href="${quizLink(sub, p.id)}">旧版记录，去刷题页作答 →</a>
            </div>`;
        }
        const a = p.answered;
        const locked = !!a;
        const isMulti = !!p.multi_blank;

        // 选项（单选）；已作答则锁定并显示对错
        let optsHtml = '';
        if (isMulti) {
            optsHtml = `<div class="daily-multi-hint">该题需多空作答，请在刷题页完成</div>`;
        } else {
            optsHtml = `<div class="daily-opts">` + Object.keys(p.options || {}).map(k => {
                const cls = [];
                if (locked) {
                    if (k === (a.correctAnswer || p.answer)) cls.push('opt-correct');
                    else if (k === a.answer) cls.push('opt-wrong');
                }
                const txt = (typeof fmtOptionText === 'function') ? fmtOptionText(p.options[k]) : esc(p.options[k]);
                return `<label class="daily-opt ${cls.join(' ')}">
                    <input type="radio" name="dq-${sub}-${idx}" value="${esc(k)}" ${locked ? 'disabled' : ''}
                        ${locked && a.answer === k ? 'checked' : ''}>
                    <span class="daily-opt-key">${esc(k)}.</span><span class="daily-opt-text">${txt}</span>
                </label>`;
            }).join('') + `</div>`;
        }

        const resultHtml = a ? (a.isCorrect === true
            ? `<div class="daily-result ok">回答正确 ✓</div>`
            : a.isCorrect === false
                ? `<div class="daily-result bad">回答错误 ✗　正确答案：${esc(p.multi_blank ? [...(a.correctAnswer || '')].join('、') : (a.correctAnswer || ''))}</div>`
                : `<div class="daily-result info">该题暂无标准答案</div>`) : '';

        const explHtml = p.explanation
            ? `<details class="daily-fold"><summary>查看解析 ▾</summary><div class="daily-fold-body">${p.explanation}</div></details>`
            : '';
        // 笔记：每日一题默认【不展开】（不写 open）；正常刷题页 quiz.html 仍保持有笔记即展开
        const noteHtml = hasRealNote(p)
            ? `<details class="daily-fold daily-note"><summary>笔记 ●</summary><div class="daily-fold-body">
                    ${p.note || ''}
                    ${(p.note_images || []).map(src => `<img class="daily-note-img" src="${esc(src)}" alt="笔记图片">`).join('')}
               </div></details>`
            : '';

        const act = ctx.date ? `submitHist('${ctx.date}','${sub}',${idx})` : `submitDaily('${sub}',${idx})`;
        const btn = locked
            ? (ctx.date ? '' : `<button class="daily-redo" onclick="redoDaily('${sub}',${idx})">重新作答 ↺</button>`)
            : (isMulti
                ? `<a class="daily-link" href="${quizLink(sub, p.id)}">去刷题页作答 →</a>`
                : `<button class="daily-submit" onclick="${act}">提交答案</button>`);

        return `<div class="daily-item" data-sub="${sub}" data-idx="${idx}">
            <div class="daily-item-head">
                <span class="daily-subject">${esc(subName(sub))}${idx > 0 ? ' · 加量' : ''}</span>
                ${p.due ? '<span class="daily-tag due">🔁 待复习</span>' : ''}
                ${kpMetaHtml(sub, p)}
            </div>
            <div class="daily-q">${(typeof fmtContent === 'function') ? fmtContent(p.content || '') : esc(p.content || '')}</div>
            ${optsHtml}
            ${resultHtml}
            ${btn}
            ${explHtml}
            ${noteHtml}
        </div>`;
    }

    function renderDaily(data) {
        const box = document.getElementById('dailySection');
        if (!box) return;
        const d = data || readJson(TODAY_KEY, null);
        const picks = normPicks(d && d.picks);
        const totalQ = SUBJ_ORDER.reduce((n, k) => n + (picks[k] || []).length, 0);
        const hasAny = totalQ > 0;
        const now = new Date();
        const items = SUBJ_ORDER.map(sub => {
            const arr = picks[sub] || [];
            return arr.length
                ? arr.map((p, i) => itemHtml(sub, p, { idx: i })).join('')
                : itemHtml(sub, null, { idx: 0 });
        }).join('');

        box.innerHTML = `
            <div class="daily-card">
                <div class="daily-head">
                    <h2 class="daily-title">📅 每日一题</h2>
                    <span class="daily-date">${d && d.date ? d.date : todayStr()} ${weekdayCn(now)}</span>
                    <span class="daily-head-sp"></span>
                    ${hasAny ? `<button class="daily-hist-btn daily-add-btn" onclick="addBatchDaily()" title="每门再抽 1 题，追加到今天的列表">➕ 再来 4 道</button>` : ''}
                    <button class="daily-hist-btn" onclick="showDailyHistory()" title="查看每天抽到的题">历史记录</button>
                </div>
                ${hasAny
                    ? `<div class="daily-grid">${items}</div>
                       <div class="daily-foot">共 ${totalQ} 题 · 优先抽 到期复习/不熟/不会 → 没做过的收藏题 · 每天 0 点更新</div>`
                    : `<div class="daily-empty">还没有可抽的题：去刷题收藏几道、或标记不熟/不会、答错的题会自动进入复习队列，这里每天从四门各抽 1 题。</div>`}
            </div>`;
    }

    async function addBatchDaily() {
        const r = await addBatch();
        if (!r.added) {
            alert('四门能抽的题都抽过一遍了，去刷题页再收藏几道或标记不熟/不会吧～');
            return;
        }
        renderDaily();
    }

    async function initDaily() {
        try {
            const data = await rollToday();
            renderDaily(data);
        } catch (e) { /* 抽题失败不影响首页其余内容 */ }
    }

    // ---------- 作答 ----------
    function curPick(sub, idx) {
        const d = readJson(TODAY_KEY, null);
        const P = normPicks(d && d.picks);
        const arr = P[sub] || [];
        return arr[idx || 0] || null;
    }

    async function submitDaily(sub, idx) {
        idx = idx || 0;
        const d = readJson(TODAY_KEY, null);
        if (!d || !d.picks) return;
        const P = normPicks(d.picks);
        const p = (P[sub] || [])[idx];
        if (!p || p.answered) return;
        const sel = document.querySelector(`input[name="dq-${sub}-${idx}"]:checked`);
        if (!sel) { alert('请先选择一个答案'); return; }
        try {
            const r = await judgeAnswer(p.id, sel.value);
            p.answered = { answer: sel.value, isCorrect: r.is_correct, correctAnswer: r.correct_answer || p.answer };
            if (r.explanation) p.explanation = r.explanation;
            d.picks = P;
            writeJson(TODAY_KEY, d);
            renderDaily(d);
            // 历史弹层开着今天的详情时，同步刷新弹层
            const ov = document.getElementById('dailyHistOverlay');
            if (histView === d.date && ov && !ov.hidden) showDailyHistory();
        } catch (e) {
            alert('提交失败: ' + e.message);
        }
    }

    // ---------- 历史日期补做：判分后把状态写回当天记录 ----------
    async function submitHist(date, sub, idx) {
        idx = idx || 0;
        const hist = readJson(HISTORY_KEY, []);
        const day = hist.find(h => h.date === date);
        if (!day) return;
        const P = normPicks(day.picks);
        const p = (P[sub] || [])[idx];
        if (!p || p.answered) return;
        const sel = document.querySelector(`input[name="dq-${sub}-${idx}"]:checked`);
        if (!sel) { alert('请先选择一个答案'); return; }
        try {
            const r = await judgeAnswer(p.id, sel.value);
            p.answered = { answer: sel.value, isCorrect: r.is_correct, correctAnswer: r.correct_answer || p.answer };
            if (r.explanation) p.explanation = r.explanation;
            day.picks = P;
            writeJson(HISTORY_KEY, hist);
            showDailyHistory();   // 重渲染详情（状态色即时更新）
        } catch (e) {
            alert('提交失败: ' + e.message);
        }
    }

    function redoDaily(sub, idx) {
        idx = idx || 0;
        const d = readJson(TODAY_KEY, null);
        if (!d || !d.picks) return;
        const P = normPicks(d.picks);
        const p = (P[sub] || [])[idx];
        if (!p) return;
        p.answered = null;
        d.picks = P;
        writeJson(TODAY_KEY, d);
        renderDaily(d);
        const ov = document.getElementById('dailyHistOverlay');
        if (histView === d.date && ov && !ov.hidden) showDailyHistory();   // 弹层同步
    }

    async function judgeAnswer(qid, val) {
        const resp = await api('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_id: qid, answer: val })
        });
        return await resp.json();
    }

    // ---------- 历史记录弹层：日期列表（带完成度颜色）→ 点击进当天详情补做 ----------
    let histView = null;   // null = 日期列表；'YYYY-MM-DD' = 当天详情

    function weekdayOfDate(dstr) {
        try { return weekdayCn(new Date(dstr + 'T00:00:00')); } catch (e) { return ''; }
    }
    function fmtDate(dstr) {
        const d = new Date(dstr + 'T00:00:00');
        if (isNaN(d)) return dstr;
        const now = new Date();
        const md = `${d.getMonth() + 1}月${d.getDate()}日`;
        return d.getFullYear() === now.getFullYear() ? `${md}` : `${dstr}`;
    }

    // 当天完成度（按题统计）：今日看 answered；历史看 answered（新数据）或 done（旧摘要兼容）
    function dayStat(picks, isToday) {
        const P = normPicks(picks);
        let total = 0, done = 0, correct = 0;
        for (const k of SUBJ_ORDER) {
            for (const p of (P[k] || [])) {
                total++;
                let st = null;
                if (p.answered) st = p.answered.isCorrect === true ? 'ok' : (p.answered.isCorrect === false ? 'bad' : 'na');
                else if (!isToday) {
                    if (p.done === true) st = 'ok';
                    else if (p.done === false) st = 'bad';
                }
                if (st) { done++; if (st === 'ok') correct++; }
            }
        }
        return { total, done, correct };
    }

    function collectDays() {
        const hist = readJson(HISTORY_KEY, []);
        const cur = readJson(TODAY_KEY, null);
        const days = [];
        if (cur && cur.date && cur.picks) days.push({ date: cur.date, picks: cur.picks, today: true });
        for (const h of hist) {
            if (cur && h.date === cur.date) continue;
            days.push(h);
        }
        days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return days;
    }

    function showDailyHistory() {
        const days = collectDays();
        let bodyHtml, headTitle;
        if (histView) {
            const day = days.find(d => d.date === histView);
            if (!day) { histView = null; return showDailyHistory(); }
            headTitle = esc(fmtDate(day.date)) + (day.today ? ' · 今天' : '');
            // 今天的详情复用页面作答逻辑（submitDaily 写 TODAY_KEY）；历史日期走 submitHist（写回历史）
            const baseCtx = day.today ? {} : { date: day.date };
            const P = normPicks(day.picks);
            const items = SUBJ_ORDER.map(sub => {
                const arr = P[sub] || [];
                return arr.length
                    ? arr.map((p, i) => itemHtml(sub, p, Object.assign({ idx: i }, baseCtx))).join('')
                    : itemHtml(sub, null, Object.assign({ idx: 0 }, baseCtx));
            }).join('');
            bodyHtml = `
                <div class="daily-hist-body">
                    <div class="dh-detail-tip">点选项作答，判分后自动记入当天记录</div>
                    ${items}
                </div>`;
        } else {
            headTitle = '选择日期查看当天记录';
            bodyHtml = `<div class="daily-hist-body">` + (days.length
                ? `<div class="daily-cal">` + days.map(day => {
                    const st = dayStat(day.picks, !!day.today);
                    const cls = st.done === 0 ? 'cal-none'
                        : (st.total > 0 && st.done >= st.total ? 'cal-full' : 'cal-part');
                    const stat = st.total ? `${st.done}/${st.total} 已做 · ${st.correct} 对` : '未作答';
                    return `<button class="daily-cal-day ${cls}${day.today ? ' today' : ''}" data-date="${esc(day.date)}"
                            onclick="openDailyDay('${esc(day.date)}')">
                            <span class="dc-dot"></span>
                            <span class="dc-date">${esc(fmtDate(day.date))} <em>${weekdayOfDate(day.date)}${day.today ? ' · 今天' : ''}</em></span>
                            <span class="dc-stat">${stat}</span>
                            <span class="dc-arrow">›</span>
                        </button>`;
                }).join('') + `</div>`
                : `<div class="daily-hist-empty">还没有记录，每天打开「每日一题」会自动生成。</div>`) + `</div>`;
        }

        let ov = document.getElementById('dailyHistOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'dailyHistOverlay';
            ov.className = 'kb-overlay';
            ov.setAttribute('onclick', 'if(event.target===this)closeDailyHistory()');
            document.body.appendChild(ov);
        }
        ov.innerHTML = `
            <div class="kb-dialog daily-hist-dialog">
                <div class="kb-head">
                    <span>每日一题 · ${histView ? `<button class="daily-hist-back" onclick="backDailyHist()">‹ 日期列表</button>` : '历史记录'}</span>
                    <span class="dh-head-date">${headTitle}</span>
                    <button class="kb-close" onclick="closeDailyHistory()" title="关闭">✕</button>
                </div>
                ${bodyHtml}
                <div class="kb-actions">
                    <button class="btn btn-primary" onclick="closeDailyHistory()">关闭</button>
                </div>
            </div>`;
        ov.hidden = false;
    }

    function openDailyDay(date) { histView = date; showDailyHistory(); }
    function backDailyHist() { histView = null; showDailyHistory(); }

    function closeDailyHistory() {
        histView = null;
        const ov = document.getElementById('dailyHistOverlay');
        if (ov) ov.hidden = true;
    }

    window.initDaily = initDaily;
    window.showDailyHistory = showDailyHistory;
    window.closeDailyHistory = closeDailyHistory;
    window.openDailyDay = openDailyDay;
    window.backDailyHist = backDailyHist;
    window.submitDaily = submitDaily;
    window.submitHist = submitHist;
    window.redoDaily = redoDaily;
    window.addBatchDaily = addBatchDaily;
    window.DailyPick = {
        rollToday, addBatch, pickOne, todayStr, renderDaily, snippet, itemHtml, dayStat, collectDays, normPicks,
        KEYS: { TODAY_KEY, HISTORY_KEY, SEEN_KEY }, SUBJ_ORDER
    };
})();
