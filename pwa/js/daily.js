// ==================== 每日一题（首页内嵌作答） ====================
// 规则：
//   ① 每天从四门（ds/os/cn/co）的【收藏】里各抽 1 题，共 4 题，四门互不重复；
//   ② 抽题优先级：无已做记录（没做过）的收藏题 → 其中「从未抽过」的 → 最久未抽的；
//   ③ 直接在首页卡片里作答（选选项→提交→判对错→看解析），不跳转刷题页；
//   ④ 笔记：每日一题里默认【不展开】（正常刷题页 quiz.html 仍保持有笔记即展开）；
//   ⑤ 每天首次进入生成结果并归档进历史，历史保留最近 120 天，可回看。
// 存储（localStorage）：
//   daily_pick_v1    —— 今日 {date, picks:{ds|os|cn|co: {id,content,options,answer,explanation,note,note_images,chapter,section,answered}}}
//   daily_history_v1 —— 历史数组 [{date, picks}]（最近在前，仅存摘要）
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

    // 收藏题（带作答状态 last_status、笔记等）：用 mode=favorite 拉，比 /api/favorites 信息更全
    async function loadFavs(sub) {
        try {
            // 路由是 /api/questions/<subject>（路径段），不是 ?subject= 查询参数
            const resp = await api(`/api/questions/${encodeURIComponent(sub)}?mode=favorite&page=1&per_page=9999`);
            const data = await resp.json();
            return (data && data.questions) || [];
        } catch (e) { return []; }
    }

    // 抽 1 题：① 优先「无已做记录」的收藏题 ② 其中优先未抽过的 ③ 都没有则取最久未抽的
    function pickOne(favs, seenSub) {
        if (!favs || !favs.length) return null;
        const seen = seenSub || {};
        const undone = favs.filter(f => !f.last_status);          // 没做过的题
        const pool = undone.length ? undone : favs;               // 全做过则退回全部收藏
        const fresh = pool.filter(f => !seen[f.id]);
        if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
        const arr = pool.slice().sort((a, b) => String(seen[a.id] || '').localeCompare(String(seen[b.id] || '')));
        const earliest = seen[arr[0].id] || '';
        const oldest = arr.filter(f => (seen[f.id] || '') === earliest);
        return oldest[Math.floor(Math.random() * oldest.length)];
    }

    // 今日卡片存的题目数据：作答所需字段 + 历史摘要
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
            answered: null    // {answer, isCorrect, correctAnswer}
        };
    }
    function toSummary(p) {
        return { id: p.id, content: snippet(p.content, 56), chapter: p.chapter, section: p.section };
    }

    async function rollToday() {
        const today = todayStr();
        const cur = readJson(TODAY_KEY, null);
        if (cur && cur.date === today && cur.picks) return cur;

        // 上一天归档进历史（只存摘要，避免历史体积膨胀）
        if (cur && cur.date && cur.picks) {
            const hist = readJson(HISTORY_KEY, []);
            if (!hist.some(h => h.date === cur.date)) {
                const sum = {};
                for (const k of Object.keys(cur.picks)) sum[k] = toSummary(cur.picks[k]);
                hist.unshift({ date: cur.date, picks: sum });
                writeJson(HISTORY_KEY, hist.slice(0, HISTORY_LIMIT));
            }
        }

        const seen = readJson(SEEN_KEY, {});
        const picks = {};
        for (const sub of SUBJ_ORDER) {
            const favs = await loadFavs(sub);
            const f = pickOne(favs, seen[sub]);
            if (!f) continue;
            picks[sub] = toPick(f);
            seen[sub] = seen[sub] || {};
            seen[sub][f.id] = today;
        }
        const out = { date: today, picks };
        writeJson(TODAY_KEY, out);
        writeJson(SEEN_KEY, seen);
        return out;
    }

    function quizLink(sub, qid) {
        return `quiz.html?subject=${sub}&mode=favorite&goto=${encodeURIComponent(qid)}`;
    }

    // ---------- 渲染：每题一个内嵌作答块 ----------
    function itemHtml(sub, p) {
        if (!p) {
            return `<div class="daily-item daily-item-empty">
                <span class="daily-subject">${esc(subName(sub))}</span>
                <div class="daily-q">暂无收藏题</div>
                <a class="daily-link" href="quiz.html?subject=${sub}&mode=sequential">去刷题收藏 →</a>
            </div>`;
        }
        const meta = [p.chapter, p.section].filter(Boolean).join(' · ');
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
                    <input type="radio" name="dq-${sub}" value="${esc(k)}" ${locked ? 'disabled' : ''}
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

        const btn = locked
            ? `<button class="daily-redo" onclick="redoDaily('${sub}')">重新作答 ↺</button>`
            : (isMulti
                ? `<a class="daily-link" href="${quizLink(sub, p.id)}">去刷题页作答 →</a>`
                : `<button class="daily-submit" onclick="submitDaily('${sub}')">提交答案</button>`);

        return `<div class="daily-item" data-sub="${sub}">
            <span class="daily-subject">${esc(subName(sub))}</span>
            <div class="daily-q">${(typeof fmtContent === 'function') ? fmtContent(p.content || '') : esc(p.content || '')}</div>
            ${meta ? `<div class="daily-meta">${esc(meta)}</div>` : ''}
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
        const picks = (d && d.picks) || {};
        const hasAny = Object.keys(picks).length > 0;
        const now = new Date();
        const items = SUBJ_ORDER.map(sub => itemHtml(sub, picks[sub])).join('');

        box.innerHTML = `
            <div class="daily-card">
                <div class="daily-head">
                    <h2 class="daily-title">📅 每日一题</h2>
                    <span class="daily-date">${d && d.date ? d.date : todayStr()} ${weekdayCn(now)}</span>
                    <button class="daily-hist-btn" onclick="showDailyHistory()" title="查看每天抽到的题">历史记录</button>
                </div>
                ${hasAny
                    ? `<div class="daily-grid">${items}</div>
                       <div class="daily-foot">直接在卡片里作答（优先抽没做过的收藏题）· 每天 0 点更新</div>`
                    : `<div class="daily-empty">还没有收藏题，先去刷题收藏几道，这里每天会从四门收藏里各抽 1 题。</div>`}
            </div>`;
    }

    async function initDaily() {
        try {
            const data = await rollToday();
            renderDaily(data);
        } catch (e) { /* 抽题失败不影响首页其余内容 */ }
    }

    // ---------- 作答 ----------
    function curPick(sub) {
        const d = readJson(TODAY_KEY, null);
        return (d && d.picks && d.picks[sub]) || null;
    }

    async function submitDaily(sub) {
        const p = curPick(sub);
        if (!p || p.answered) return;
        const sel = document.querySelector(`input[name="dq-${sub}"]:checked`);
        if (!sel) { alert('请先选择一个答案'); return; }
        const userAnswer = sel.value;
        try {
            const resp = await api('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question_id: p.id, answer: userAnswer })
            });
            const r = await resp.json();
            p.answered = { answer: userAnswer, isCorrect: r.is_correct, correctAnswer: r.correct_answer || p.answer };
            if (r.explanation) p.explanation = r.explanation;
            const d = readJson(TODAY_KEY, null);
            if (d && d.picks && d.picks[sub]) d.picks[sub] = p;
            writeJson(TODAY_KEY, d);
            renderDaily(d);
        } catch (e) {
            alert('提交失败: ' + e.message);
        }
    }

    function redoDaily(sub) {
        const d = readJson(TODAY_KEY, null);
        if (d && d.picks && d.picks[sub]) { d.picks[sub].answered = null; writeJson(TODAY_KEY, d); renderDaily(d); }
    }

    // ---------- 历史记录弹层 ----------
    function showDailyHistory() {
        const hist = readJson(HISTORY_KEY, []);
        const cur = readJson(TODAY_KEY, null);
        const todaySummary = cur && cur.date ? { date: cur.date, picks: cur.picks || {}, today: true } : null;
        const all = todaySummary ? [todaySummary].concat(hist.filter(h => h.date !== cur.date)) : hist;
        const body = all.length ? all.map(day => `
            <div class="daily-hist-day">
                <div class="daily-hist-date">${esc(day.date)}${day.today ? ' · 今天' : ''}</div>
                <div class="daily-hist-list">
                    ${SUBJ_ORDER.map(sub => {
                        const p = day.picks && day.picks[sub];
                        return p
                            ? `<a class="daily-hist-item" href="${quizLink(sub, p.id)}" title="${esc((p.chapter || '') + (p.section ? ' · ' + p.section : ''))}">
                                    <span class="daily-hist-sub">${esc(subName(sub))}</span>
                                    <span class="daily-hist-q">${esc(p.content || '（题目）')}</span>
                               </a>`
                            : `<span class="daily-hist-item muted"><span class="daily-hist-sub">${esc(subName(sub))}</span><span class="daily-hist-q">未抽</span></span>`;
                    }).join('')}
                </div>
            </div>`).join('') : '<div class="daily-hist-empty">还没有历史记录，明天再来抽题吧。</div>';

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
                    <span>每日一题 · 历史记录</span>
                    <button class="kb-close" onclick="closeDailyHistory()" title="关闭">✕</button>
                </div>
                <div class="daily-hist-body">${body}</div>
                <div class="kb-actions">
                    <button class="btn btn-primary" onclick="closeDailyHistory()">关闭</button>
                </div>
            </div>`;
        ov.hidden = false;
    }

    function closeDailyHistory() {
        const ov = document.getElementById('dailyHistOverlay');
        if (ov) ov.hidden = true;
    }

    window.initDaily = initDaily;
    window.showDailyHistory = showDailyHistory;
    window.closeDailyHistory = closeDailyHistory;
    window.submitDaily = submitDaily;
    window.redoDaily = redoDaily;
    window.DailyPick = {
        rollToday, pickOne, todayStr, renderDaily, snippet, itemHtml,
        KEYS: { TODAY_KEY, HISTORY_KEY, SEEN_KEY }, SUBJ_ORDER
    };
})();
