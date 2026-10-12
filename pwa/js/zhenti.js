/* ================= 真题套卷（zhenti.html）=================
 * 数据源：data/zt/zt_YYYY.json —— 2009-2026 全量真题（每年 47 题 = 40 选择 + 7 大题）。
 *   item 字段：{i 题号, t 1单选/2大题/3综合, s 分值, a 答案字母, sid 科目,
 *               q 题干HTML, o 选项HTML[], an 解析HTML, qid 题库映射id|null, ans?}
 *   SVG 外置于 data/zt_svg/：题干里留 <div class="zt-svgholder" data-svg="名">，渲染后异步注入。
 * 交互 id（收藏/作答/笔记）：有题库映射用 qid（与刷题页互通），否则用 {sid}_zt{year}_{i}。
 * 判分：客户端用 a 字段，写库复用 backend 的 applyAnswer（进度 + 错题本）。 */
(function () {
    'use strict';

    const SUBJ_NAME = { ds: '数据结构', co: '计算机组成原理', os: '操作系统', cn: '计算机网络' };
    const SUBJ_ORDER = ['ds', 'co', 'os', 'cn'];
    const LETTERS = ['A', 'B', 'C', 'D'];
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const state = {
        index: null,             // {years, counts, iids, choice_total, big_total}
        papers: {},              // year -> {y,n,items}
        progress: {},            // iid -> {user_answer, is_correct, ...}
        pending: {},             // 做题模式下的临时选择 iid -> 'A'
        sessionAnswered: new Set(), // 本次会话作答过的题（仅这些显示反馈/展开解析）
        favSet: new Set(),
        noteMap: {},
        noteImages: {},          // iid -> 已有图片数组（本页不编辑图片，保存时原样透传）
        dakaByReal: new Map(),   // "YYYY|题号" -> 打卡表卡片（DS 真题大题替换源）
        lectureBySource: new Map(), // daka 卡 source -> ds_code/extra 讲义条目
        svgCache: {},            // name -> svg 文本
        year: 0,
        examMode: true,          // 默认进入做题模式：白纸状态，不显示历史作答记录与笔记
        showAll: false,
        favOnly: false,
        ansOpen: new Set(JSON.parse(localStorage.getItem('zhentiAnsOpen2') || '[]')),
        noteOpen: new Set(JSON.parse(localStorage.getItem('zhentiNoteOpen2') || '[]')),
        navCollapsed: localStorage.getItem('zhentiNavCollapsed') === '1',
        fqOpen: true,
        ansPopOpen: false,       // 答案速查浮层
        flat: [],                // 当前卷有序题（带 iid）
        noteTimer: {},
        rendering: false,
    };

    /* ---------------- 数据加载 ---------------- */
    async function loadIndex() {
        state.index = await fetch('data/zt/index.json').then(r => r.json());
    }
    async function loadYear(y) {
        if (!state.papers[y]) {
            state.papers[y] = await fetch('data/zt/zt_' + y + '.json').then(r => r.json());
        }
        return state.papers[y];
    }
    async function loadStores() {
        const [prog, favs, notes] = await Promise.all([dbAll('progress'), dbAll('favorites'), dbAll('notes')]);
        for (const p of prog) state.progress[p.question_id] = p;
        for (const f of favs) state.favSet.add(f.question_id);
        for (const n of notes) {
            state.noteMap[n.question_id] = n.content || '';
            state.noteImages[n.question_id] = n.images || [];
        }
    }

    // 是否有笔记（文字或图片，与刷题页口径一致）
    function hasNoteOf(iid) {
        return !!(state.noteMap[iid] || (state.noteImages[iid] || []).length);
    }

    /* ---------------- 打卡表替换源（DS 真题大题） ----------------
     * 数据来源：ds_daka.json（卡片按 real「YYYY年408真题第N题」建索引）
     *         + ds_code.json / ds_code_extra.json（讲义按 source 逐字关联）。
     * 命中映射的 DS 大题，题目与答案在渲染时替换为打卡表版本；失败静默回落 408os 原版。 */
    async function loadDaka() {
        try {
            const [daka, code, extra] = await Promise.all([
                fetch('data/ds_daka.json').then(r => r.json()),
                fetch('data/ds_code.json').then(r => r.json()).catch(() => null),
                fetch('data/ds_code_extra.json').then(r => r.json()).catch(() => null),
            ]);
            for (const list of [code, extra]) {
                for (const q of (list && list.questions) || []) {
                    if (q.source) state.lectureBySource.set(q.source, q);
                }
            }
            for (const c of (daka && daka.questions) || []) {
                const m = /^(\d{4})年408真题第(\d+)题/.exec(c.real || '');
                if (m) state.dakaByReal.set(m[1] + '|' + m[2], c);
            }
        } catch (e) { /* 打卡表数据拉取失败：DS 大题回落 408os 原版，不打断页面 */ }
    }

    /* ---------------- 套卷结构 ---------------- */
    function buildFlat(d, year) {
        return d.items.map(it => {
            const f = {
                ...it,
                iid: it.qid || (it.sid + '_zt' + year + '_' + it.i),
                group: it.t === 1 ? 'choice' : 'big',
            };
            // 算法题（= 打卡表真题卡且有讲义命中：2009-2012 在 42 题、2013 起在 41 题、2016 为 43）
            // 才替换为打卡表版本；非算法的应用题保持 408os 原版
            if (f.group === 'big') {
                const card = state.dakaByReal.get(year + '|' + it.i);
                const lecture = card && (state.lectureBySource.get(card.source) || null);
                if (card && lecture) f.daka = { card, lecture };
            }
            return f;
        });
    }

    function doneCount(year) {
        if (year === state.year && state.flat.length) {
            return state.flat.filter(f => f.group === 'choice' && state.progress[f.iid]).length;
        }
        const ids = (state.index.iids || {})[String(year)] || [];
        return ids.filter(id => state.progress[id]).length;
    }

    /* ---------------- 渲染：年份列表 ---------------- */
    function renderYearList() {
        const years = [...state.index.years].reverse();
        $('yearList').innerHTML = years.map(y => {
            const done = doneCount(y);
            const active = y === state.year;
            // 做题模式（默认）不显示各年完成度（属历史记录，取消后恢复）
            const doneHtml = state.examMode ? '' : `<span class="zt-year-done">${done}/${state.index.choice_total}</span>`;
            return `<a class="ol-nav-item root${active ? ' zt-year-active' : ''}" data-year="${y}"
                onclick="switchYear(${y})" title="${y} 年真题（选择 40 + 大题 7）">
                ${y} 年真题${doneHtml}</a>`;
        }).join('');
    }

    /* ---------------- 渲染：套卷 ---------------- */
    async function renderPaper() {
        const year = state.year;
        if (!state.papers[year]) {
            $('ztMain').innerHTML = '<div class="loading">加载 ' + year + ' 年套卷…</div>';
        }
        const d = await loadYear(year);
        if (state.year !== year) return;   // 加载期间切了年份，放弃本次渲染
        state.flat = buildFlat(d, year);

        // 做题模式：进度按本次暂选数；非做题模式：按历史已做数
        const progTxt = state.examMode
            ? `已选 ${Object.keys(state.pending).length}/${state.index.choice_total}`
            : `已做 ${doneCount(year)}/${state.index.choice_total}`;
        let html = `<div class="zt-toolbar">
            <div class="zt-title">${year} 年真题套卷<span class="zt-sub">选择题 ${state.index.choice_total} · 大题 ${state.index.big_total}</span></div>
            <div class="zt-tools">
                <span class="zt-progress" id="ztProgress">${progTxt}</span>
                <button class="zt-btn${state.examMode ? ' on' : ''}" onclick="toggleExamMode()" title="${state.examMode ? '取消做题模式：显示历史作答记录与笔记' : '做题模式：隐藏答案、历史记录与笔记'}">${state.examMode ? '做题中' : '做题模式'}</button>
                ${state.examMode ? '<button class="zt-btn zt-btn-primary" onclick="checkPending()">对答案</button>' : ''}
                <button class="zt-btn${state.showAll ? ' on' : ''}" onclick="toggleShowAll()">${state.showAll ? '收起全部答案' : '展开全部答案'}</button>
                <button class="zt-btn zt-btn-primary" onclick="toggleAnsPop()">答案速查</button>
                <button class="zt-btn${state.favOnly ? ' on' : ''}" onclick="toggleFavOnly()">${state.favOnly ? '显示全部' : '只看收藏'}</button>
                <button class="zt-btn" onclick="resetYear()" title="清空本年作答记录重新做（错题本保留）">重做本年 ↺</button>
            </div>
        </div>`;

        const choices = state.flat.filter(f => f.group === 'choice' && (!state.favOnly || state.favSet.has(f.iid)));
        const bigs = state.flat.filter(f => f.group === 'big' && (!state.favOnly || state.favSet.has(f.iid)));

        if (state.favOnly && !choices.length && !bigs.length) {
            html += '<div class="zt-empty">本年还没有收藏题目。点题目右上角的 ☆ 收藏后，可用「只看收藏」集中攻克。</div>';
        }

        if (choices.length) {
            html += `<div class="zt-sec-title">一、选择题<span class="zt-sec-sub">共 ${choices.length} 题（每题 2 分）</span></div>`;
            for (const subj of SUBJ_ORDER) {
                const items = choices.filter(f => f.sid === subj);
                if (!items.length) continue;
                html += `<div class="zt-group-title">${SUBJ_NAME[subj]}<span class="zt-group-count">${items.length} 题</span></div>`;
                for (const it of items) html += choiceCard(it);
            }
        }
        if (bigs.length) {
            html += `<div class="zt-sec-title">二、大题<span class="zt-sec-sub">共 ${bigs.length} 题</span></div>`;
            for (const it of bigs) html += bigCard(it);
        }

        $('ztMain').innerHTML = html;
        injectSvgs();
        initNoteEditors($('ztMain'));
        renderFq();
    }

    /* ---------------- 卡片：选择题 ----------------
     * 做题模式（默认）：白纸状态——不显示历史作答痕迹（结果条/选项色/预选）与笔记，
     *   本次选答仅暂存（picked），退出做题模式时统一判分。
     * 取消做题模式：显示历史作答记录（预选/对错色/结果条）与笔记，解析默认仍收起。 */
    function choiceCard(f) {
        const st = state.progress[f.iid];
        const newly = state.sessionAnswered.has(f.iid);   // 本次会话作答过
        const showHist = !state.examMode;                 // 非做题模式：显示历史作答记录
        let sel = '';
        if (state.examMode) sel = state.pending[f.iid] || '';
        else if (st) sel = st.user_answer || '';
        const isFav = state.favSet.has(f.iid);
        const ansOpen = state.showAll || (showHist && (state.ansOpen.has(f.iid) || newly));

        let opts = '';
        for (let k = 0; k < LETTERS.length; k++) {
            const key = LETTERS[k];
            const text = f.o[k] != null ? f.o[k] : '';
            let cls = 'option-item';
            if (showHist && st) {
                if (key === f.a) cls += ' correct';
                else if (key === sel && !st.is_correct) cls += ' wrong';
            } else if (state.examMode && sel === key) {
                cls += ' picked';
            }
            const checked = sel === key ? 'checked' : '';
            opts += `<label class="${cls}">
                <input type="radio" name="q_${f.iid}" value="${key}" ${checked} onchange="pickOption('${f.iid}', '${key}')">
                <span class="option-letter">${key}</span>
                <span class="option-text">${text}</span>
            </label>`;
        }

        let result = '';
        if (showHist && st) {
            result = st.is_correct
                ? '<div class="result-correct">回答正确!</div>'
                : `<div class="result-wrong">回答错误! 正确答案: ${f.a || '—'}</div>`;
        }

        // 笔记：做题模式一律不显示（含「●」提示），取消做题模式后恢复
        const showNote = !state.examMode;
        const hasNote = showNote && hasNoteOf(f.iid);
        const noteOpen = showNote && state.noteOpen.has(f.iid);
        return `<div class="question-card" id="card-${f.iid}" data-iid="${f.iid}" data-i="${f.i}">
            <div class="question-header">
                <div class="question-meta">
                    <span class="question-number">第 ${f.i} 题</span>
                    <span class="zt-subj-badge">${SUBJ_NAME[f.sid] || ''}</span>
                </div>
                <button class="btn-icon ${isFav ? 'favorited' : ''}" onclick="toggleFav('${f.iid}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="question-content">${f.q}</div>
            <div class="options-list">${opts}</div>
            ${result}
            <div class="question-tools">
                <button class="btn-explanation${ansOpen ? ' active' : ''}" onclick="toggleAns('${f.iid}')">答案与解析 ${ansOpen ? '▴' : '▾'}</button>
                <button class="btn-explanation${noteOpen ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${f.iid}')">笔记${hasNote ? ' ●' : ''} ${noteOpen ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">答案解析</div>
                <div class="explanation-meta">
                    <span class="expl-answer">正确答案：${f.a || '暂无标准答案'}</span>
                </div>
                <div class="explanation-body">${f.an || '<div class="explanation-empty">该题暂无详细解析</div>'}</div>
            </div>` : ''}
            ${noteOpen ? notePanel(f.iid) : ''}
        </div>`;
    }

    /* ---------------- 卡片：大题 ---------------- */
    function bigCard(f) {
        if (f.daka) return dakaBigCard(f);   // DS 大题命中打卡表映射 → 替换为打卡表版本
        const isFav = state.favSet.has(f.iid);
        const ansOpen = state.showAll || (!state.examMode && state.ansOpen.has(f.iid));
        const showNote = !state.examMode;   // 做题模式不显示笔记（含「●」提示）
        const hasNote = showNote && hasNoteOf(f.iid);
        const noteOpen = showNote && state.noteOpen.has(f.iid);
        return `<div class="question-card" id="card-${f.iid}" data-iid="${f.iid}" data-i="${f.i}">
            <div class="question-header">
                <div class="question-meta">
                    <span class="question-number">第 ${f.i} 题</span>
                    <span class="zt-subj-badge">${SUBJ_NAME[f.sid] || ''} · 大题</span>
                    <span class="zt-score-badge">${f.s} 分</span>
                </div>
                <button class="btn-icon ${isFav ? 'favorited' : ''}" onclick="toggleFav('${f.iid}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="question-content">${f.q}</div>
            <div class="question-tools">
                <button class="btn-explanation${ansOpen ? ' active' : ''}" onclick="toggleAns('${f.iid}')">参考答案与解析 ${ansOpen ? '▴' : '▾'}</button>
                <button class="btn-explanation${noteOpen ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${f.iid}')">笔记${hasNote ? ' ●' : ''} ${noteOpen ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">参考答案与解析</div>
                <div class="explanation-body">${f.an || '<div class="explanation-empty">暂无解析</div>'}</div>
            </div>` : ''}
            ${noteOpen ? notePanel(f.iid) : ''}
        </div>`;
    }

    /* ---------------- 卡片：DS 大题（打卡表版本） ----------------
     * 41/42（按 ds_daka「real」映射命中）的题目与答案替换为打卡表内容：
     * 题图/题干（card.content）+ 讲义解法（source 关联 ds_code/extra）+ 解答原图。
     * 容器带 .zt-daka-figs 标记 → 教材原图复用 code-figs 样式 + lightbox 点击放大。 */
    function dakaBigCard(f) {
        const { card, lecture } = f.daka;
        const isFav = state.favSet.has(f.iid);
        const ansOpen = state.showAll || (!state.examMode && state.ansOpen.has(f.iid));
        const showNote = !state.examMode;   // 做题模式不显示笔记（含「●」提示）
        const hasNote = showNote && hasNoteOf(f.iid);
        const noteOpen = showNote && state.noteOpen.has(f.iid);
        const figs = card.figs || {};
        const figWrap = (arr, label) => (arr && arr.length)
            ? `<div class="code-figs zt-daka-figs"><div class="code-figs-label">📷 ${esc(label)}</div>${arr.map(n =>
                `<img src="data/daka_figs/${esc(n)}" loading="lazy" alt="教材原图">`).join('')}</div>`
            : '';
        const hasLecture = lecture && lecture.solutions && (lecture.solutions.list || []).length;
        let answerHtml = '';
        if (hasLecture) {
            answerHtml += `<div class="daka-analysis">${esc((lecture.analysis || '').replace('易错点：', '\n易错点：'))}</div>${solHtml(lecture)}`;
        }
        answerHtml += figWrap(figs.answer, '解答原图');
        if (!answerHtml) answerHtml = '<div class="explanation-empty">该题暂无解答内容</div>';
        const contentHtml = [fmtContent(card.content || ''), figWrap(figs.content, '题目原图')].join('');
        return `<div class="question-card zt-daka-card" id="card-${f.iid}" data-iid="${f.iid}" data-i="${f.i}">
            <div class="question-header">
                <div class="question-meta">
                    <span class="question-number">第 ${f.i} 题</span>
                    <span class="zt-subj-badge">${SUBJ_NAME[f.sid] || ''} · 大题</span>
                    <span class="zt-score-badge">${f.s} 分</span>
                </div>
                <button class="btn-icon ${isFav ? 'favorited' : ''}" onclick="toggleFav('${f.iid}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="question-content">${contentHtml || '（题目见教材原图）'}</div>
            <div class="question-tools">
                <button class="btn-explanation${ansOpen ? ' active' : ''}" onclick="toggleAns('${f.iid}')">参考答案与解析 ${ansOpen ? '▴' : '▾'}</button>
                <button class="btn-explanation${noteOpen ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${f.iid}')">笔记${hasNote ? ' ●' : ''} ${noteOpen ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">参考答案与解析</div>
                <div class="explanation-body">${answerHtml}</div>
            </div>` : ''}
            ${noteOpen ? notePanel(f.iid) : ''}
        </div>`;
    }

    /* 讲义解法渲染（与 daka.html 的 solHtml 同源：多解法 → 思路/代码/复杂度；
     * 样式由 style.css 的 .sol-* 提供。两处若改渲染结构需同步） */
    function solHtml(q) {
        const s = q.solutions || {};
        const list = s.list || [];
        if (!list.length) {
            const b = q.brute;
            if (!b) return '';
            return `<div class="code-brute">
                <div class="code-brute-head">💪 ${esc(b.method || '暴力解')} <span class="sol-tag-fb">自生成</span></div>
                <div class="sol-sec">基本设计思想</div>
                <div class="sol-text">${b.idea || ''}</div>
                <div class="sol-sec">代码</div>
                <pre class="code-block">${esc(b.code || '')}</pre>
            </div>`;
        }
        const table = (s.score_rows || []).length ? `
            <table class="sol-score">
                <tr><th>做题思路</th><th>方法</th><th>预计得分</th></tr>
                ${s.score_rows.map(r => `<tr><td>${esc(r.approach)}</td><td>${esc(r.method)}</td><td class="sol-score-num">${esc(r.score)}</td></tr>`).join('')}
            </table>` : '';
        return `<div class="sol-wrap">
            <div class="sol-source">📘 ${esc(s.source || '')}</div>
            ${table}
            ${list.map((x, i) => `
                <details class="sol-fold"${i === 0 ? ' open' : ''}>
                    <summary class="sol-head">${esc(x.tag || ('解法' + (i + 1)))}${x.kind ? ' · ' + esc(x.kind) : ''}${x.name ? ' · ' + esc(x.name) : ''}</summary>
                    <div class="sol-item">
                    ${x.analysis ? `<div class="sol-sec">解析</div><div class="sol-text">${esc(x.analysis)}</div>` : ''}
                    ${x.thought ? `<div class="sol-sec">基本设计思想</div><div class="sol-text">${esc(x.thought)}</div>` : ''}
                    ${x.code ? `<div class="sol-sec">代码</div><pre class="code-block">${esc(x.code)}</pre>` : ''}
                    ${x.complexity ? `<div class="sol-cx">${esc(x.complexity)}</div>` : ''}
                    ${x.note ? `<div class="sol-note">${esc(x.note)}</div>` : ''}
                    </div>
                </details>`).join('')}
        </div>`;
    }

    /* ---------------- 笔记面板（富文本，停顿时自动保存） ----------------
     * 与刷题页同源：note_richtext.js 的富文本编辑器（工具条/高亮/染色/格式刷），
     * "原来的笔记形态"（加粗、颜色、段落）原样渲染；内容以 HTML 存 IndexedDB，与 quiz 互通。 */
    function notePanel(qid) {
        return `<div class="zt-note-panel note-editor" data-note="${qid}">
            <div class="zt-note-title">我的笔记</div>
            ${noteToolbarHtml()}
            <div class="note-input zt-note-input" contenteditable="true" spellcheck="false"
                data-qid="${qid}" data-placeholder="记下解题思路、易错点…（停顿即自动保存）"
                oninput="onNoteInput(this)"></div>
        </div>`;
    }

    // 新渲染/刷新出来的卡片：初始化富文本编辑器（装载内容 + 绑定工具条）
    function initNoteEditors(root) {
        (root || document).querySelectorAll('.note-editor .note-input[data-qid]').forEach(el => {
            if (el.dataset.noteReady) return;
            el.dataset.noteReady = '1';
            loadNoteIntoEditor(el, state.noteMap[el.dataset.qid] || '');
            bindNoteToolbar(el);
        });
    }

    /* ---------------- SVG 注入 ---------------- */
    async function fetchSvg(name) {
        if (state.svgCache[name] != null) return state.svgCache[name];
        try {
            const r = await fetch('data/zt_svg/' + name + '.svg');
            const t = r.ok ? await r.text() : '';
            state.svgCache[name] = t;
            return t;
        } catch (e) {
            state.svgCache[name] = '';
            return '';
        }
    }

    function injectSvgs(root) {
        const host = root || document;
        const holders = [...host.querySelectorAll('.zt-svgholder[data-svg]')];
        for (const h of holders) {
            if (h.dataset.done) continue;
            h.dataset.done = '1';
            fetchSvg(h.dataset.svg).then(t => {
                if (t) {
                    const wrap = document.createElement('div');
                    wrap.className = 'zt-svg-wrap';
                    wrap.innerHTML = t;
                    h.replaceWith(wrap);
                } else {
                    h.innerHTML = '<span class="zt-svg-fail">[图加载失败，可刷新重试]</span>';
                }
            });
        }
    }

    /* ---------------- 交互 ---------------- */
    async function pickOption(iid, key) {
        if (state.examMode) {
            state.pending[iid] = key;
            refreshCard(iid);
            const n = Object.keys(state.pending).length;
            $('ztProgress').textContent = `已选 ${n}/${state.index.choice_total}`;
            return;
        }
        flushNote();
        const f = state.flat.find(x => x.iid === iid);
        if (!f) return;
        const ok = !!f.a && key === f.a;
        if (typeof window.applyAnswer === 'function') {
            await window.applyAnswer(iid, f.sid, key, ok, Date.now());
        }
        state.progress[iid] = { user_answer: key, is_correct: ok ? 1 : 0 };
        state.sessionAnswered.add(iid);
        refreshCard(iid);
        $('ztProgress').textContent = `已做 ${doneCount(state.year)}/${state.index.choice_total}`;
        renderYearList();
    }

    async function checkPending() {
        if (!Object.keys(state.pending).length) { alert('还没有选择任何答案'); return; }
        await gradePending();
        state.examMode = false;   // 对答案 = 判分 + 退出做题模式（显示记录与笔记）
        renderPaper();
        renderYearList();
    }

    async function toggleFav(iid) {
        // 经后端接口写收藏（前缀即科目，新题 id 前缀合法）
        const r = await api('/api/favorite/' + iid);
        const j = await r.json();
        if (j.is_favorited) state.favSet.add(iid); else state.favSet.delete(iid);
        refreshCard(iid);
    }

    function refreshCard(iid) {
        flushNote();
        const f = state.flat.find(x => x.iid === iid);
        const el = document.getElementById('card-' + iid);
        if (!f || !el) return;
        const html = f.group === 'choice' ? choiceCard(f) : bigCard(f);
        el.insertAdjacentHTML('afterend', html);
        const fresh = el.nextElementSibling;
        el.remove();
        if (fresh) { injectSvgs(fresh); initNoteEditors(fresh); }
        renderFq();
    }

    function toggleAns(iid) {
        if (state.examMode) {
            alert('做题模式下不显示答案。做完点「对答案」后即可查看。');
            return;
        }
        if (state.ansOpen.has(iid)) state.ansOpen.delete(iid); else state.ansOpen.add(iid);
        localStorage.setItem('zhentiAnsOpen2', JSON.stringify([...state.ansOpen]));
        refreshCard(iid);
    }

    function toggleNotePanel(iid) {
        if (state.examMode) {
            alert('做题模式下不显示笔记（避免看到此前记录的内容）。点「对答案」或取消做题模式后即可查看与编辑。');
            return;
        }
        flushNote();
        if (state.noteOpen.has(iid)) state.noteOpen.delete(iid); else state.noteOpen.add(iid);
        localStorage.setItem('zhentiNoteOpen2', JSON.stringify([...state.noteOpen]));
        refreshCard(iid);
    }

    // 输入（含工具条/快捷键改动）：刷新占位符 + 停顿自动保存
    function onNoteInput(el) {
        // 工具条点击经 note_richtext 全局回调 onNoteInput() 无参调用 → 从当前焦点取编辑器
        if (!el || !el.dataset || !el.dataset.qid) el = document.activeElement;
        if (!el || !el.dataset || !el.dataset.qid) return;
        updateNotePlaceholder(el);
        const qid = el.dataset.qid;
        clearTimeout(state.noteTimer[qid]);
        state.noteTimer[qid] = setTimeout(() => saveNote(qid, serializeNote(el)), 700);
    }

    async function saveNote(qid, content) {
        state.noteMap[qid] = content;
        await api('/api/note/' + qid, {
            method: 'POST',
            body: JSON.stringify({ content: content, images: state.noteImages[qid] || [] }),
        });
        // 保存后同步该题的「笔记 ●」状态（删除笔记时圆点消失）
        const card = document.getElementById('card-' + qid);
        const btn = card && card.querySelector('.btn-explanation[onclick*="toggleNotePanel"]');
        if (btn) btn.classList.toggle('has-note', hasNoteOf(qid));
    }

    function flushNote() {
        document.querySelectorAll('.zt-note-input').forEach(el => {
            const qid = el.dataset.qid;
            if (!qid) return;
            clearTimeout(state.noteTimer[qid]);
            const cur = serializeNote(el);
            if (cur !== (state.noteMap[qid] || '')) saveNote(qid, cur);
        });
    }

    // 把做题模式下暂选的答案统一判分入库（进度 + 错题本）
    async function gradePending() {
        const ids = Object.keys(state.pending);
        if (!ids.length) return false;
        for (const iid of ids) {
            const f = state.flat.find(x => x.iid === iid);
            if (!f) continue;
            const key = state.pending[iid];
            const ok = !!f.a && key === f.a;
            if (typeof window.applyAnswer === 'function') {
                await window.applyAnswer(iid, f.sid, key, ok, Date.now());
            }
            state.progress[iid] = { user_answer: key, is_correct: ok ? 1 : 0 };
            state.sessionAnswered.add(iid);
        }
        state.pending = {};
        return true;
    }

    // 切换做题模式：默认进入（白纸）；取消时先把本次暂选的答案判分，再显示历史记录与笔记
    async function toggleExamMode() {
        flushNote();
        if (state.examMode) {
            await gradePending();
            state.examMode = false;
        } else {
            state.examMode = true;
        }
        renderPaper();
        renderYearList();
    }

    function toggleShowAll() {
        flushNote();
        state.showAll = !state.showAll;
        renderPaper();
    }

    function toggleFavOnly() {
        flushNote();
        state.favOnly = !state.favOnly;
        renderPaper();
    }

    async function resetYear() {
        if (!confirm('确定清空本年所有作答记录重新做吗？（错题本与收藏保留）')) return;
        const ids = new Set(state.flat.filter(f => f.group === 'choice').map(f => f.iid));
        const rows = await dbAll('progress');
        for (const r of rows) {
            if (ids.has(r.question_id)) await dbDelete('progress', r.pk);
        }
        for (const id of ids) delete state.progress[id];
        state.pending = {};
        renderPaper();
        renderYearList();
    }

    function switchYear(y) {
        if (y === state.year) return;
        flushNote();
        if (state.ansPopOpen) toggleAnsPop();   // 关闭答案速查
        state.year = y;
        state.pending = {};                     // 未判分的本次暂选不跨年
        localStorage.setItem('zhentiYear', String(y));
        state.ansOpen = new Set();
        renderYearList();
        renderPaper();
        window.scrollTo({ top: 0 });
    }

    /* ---------------- 题号导航（竖排半透明横条，目录式） ---------------- */
    function renderFq() {
        const cells = state.flat.map(it => {
            const st = state.progress[it.iid];
            let cls = 'zt-fq-i';
            // 做题模式不显示历史对错色点，仅本次暂选的 picked
            if (!state.examMode && st) cls += st.is_correct ? ' ok' : (it.group === 'choice' ? ' bad' : '');
            else if (state.examMode && state.pending[it.iid]) cls += ' picked';
            if (it.i === 41) cls += ' zt-fq-sep';   // 大题起点分隔
            return `<a class="${cls}" data-iid="${it.iid}" data-i="${it.i}" onclick="gotoQ('${it.iid}')" title="第 ${it.i} 题">${it.i}</a>`;
        }).join('');
        $('fqList').innerHTML = cells;
        syncFqCur();
    }

    // 高亮滚动位置对应的题号条（随页面滑动而滑动）
    function syncFqCur() {
        const cards = document.querySelectorAll('#ztMain .question-card');
        let cur = null;
        for (const c of cards) {
            if (c.getBoundingClientRect().top < 120) cur = c; else break;
        }
        $('fqNo').textContent = cur ? ('第 ' + cur.dataset.i + ' 题') : '—';
        const box = $('fqList');
        const prev = box.querySelector('.zt-fq-i.cur');
        if (prev) prev.classList.remove('cur');
        if (!cur) return;
        const a = box.querySelector(`.zt-fq-i[data-iid="${cur.dataset.iid}"]`);
        if (!a) return;
        a.classList.add('cur');
        // 容器内滚动跟随（当前条始终可见）
        const ar = a.getBoundingClientRect();
        const br = box.getBoundingClientRect();
        if (ar.top < br.top + 6) box.scrollTop += ar.top - br.top - 6;
        else if (ar.bottom > br.bottom - 6) box.scrollTop += ar.bottom - br.bottom + 6;
    }

    function gotoQ(iid) {
        flushNote();
        const el = document.getElementById('card-' + iid);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function toggleFq() {
        state.fqOpen = !state.fqOpen;
        $('ztFq').classList.toggle('zt-fq-closed', !state.fqOpen);
        $('fqArrow').textContent = state.fqOpen ? '▲' : '▼';
    }

    // 滚动时更新题号导航（当前题高亮 + 顶部题号显示）
    function bindScrollSpy() {
        let raf = 0;
        window.addEventListener('scroll', () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                syncFqCur();
            });
        }, { passive: true });
    }

    /* ---------------- 答案速查（悬浮窗：只列选择题答案） ---------------- */
    function toggleAnsPop() {
        state.ansPopOpen = !state.ansPopOpen;
        const old = $('ztAnsPop');
        if (old) old.remove();
        if (!state.ansPopOpen) return;
        const cells = state.flat
            .filter(f => f.group === 'choice')
            .map(f => `<span class="zt-ans-i">${f.i}.&nbsp;${f.a || '—'}</span>`)
            .join('');
        const el = document.createElement('div');
        el.id = 'ztAnsPop';
        el.className = 'zt-ans-pop';
        el.innerHTML = `<div class="zt-ans-mask" onclick="toggleAnsPop()"></div>
            <div class="zt-ans-panel">
                <div class="zt-ans-head">${state.year} 年选择题答案速查<span class="zt-ans-close" onclick="toggleAnsPop()">×</span></div>
                <div class="zt-ans-grid">${cells}</div>
            </div>`;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
    }

    /* ---------------- 左栏收起（复用 ol-nav 形态） ---------------- */
    function toggleZtNav() {
        state.navCollapsed = !state.navCollapsed;
        localStorage.setItem('zhentiNavCollapsed', state.navCollapsed ? '1' : '0');
        $('ztNav').classList.toggle('collapsed', state.navCollapsed);
    }
    function expandZtNav() {
        if (!state.navCollapsed) return;
        state.navCollapsed = false;
        localStorage.setItem('zhentiNavCollapsed', '0');
        $('ztNav').classList.remove('collapsed');
    }

    /* ---------------- 启动 ---------------- */
    async function init() {
        try {
            $('ztMain').innerHTML = '<div class="loading">加载中…</div>';
            await Promise.all([loadIndex(), loadStores(), loadDaka()]);
            const remembered = +(localStorage.getItem('zhentiYear') || 0);
            state.year = (remembered && state.index.years.includes(remembered))
                ? remembered : state.index.years[state.index.years.length - 1];
            if (state.navCollapsed) $('ztNav').classList.add('collapsed');
            renderYearList();
            await renderPaper();
            bindScrollSpy();
            if (typeof renderDarkSwitch === 'function') renderDarkSwitch();
        } catch (e) {
            console.error(e);
            $('ztMain').innerHTML = `<div class="error">加载失败：${esc(e.message)}。请检查网络或刷新重试。</div>`;
        }
    }

    Object.assign(window, {
        switchYear, pickOption, checkPending, toggleFav, toggleAns, toggleNotePanel,
        onNoteInput, toggleExamMode, toggleShowAll, toggleFavOnly, resetYear,
        gotoQ, toggleFq, toggleZtNav, expandZtNav, toggleAnsPop,
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
