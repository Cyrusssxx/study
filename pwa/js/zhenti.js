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
        favSet: new Set(),
        noteMap: {},
        svgCache: {},            // name -> svg 文本
        year: 0,
        examMode: localStorage.getItem('zhentiMode') === 'exam',
        showAll: false,
        favOnly: false,
        ansOpen: new Set(JSON.parse(localStorage.getItem('zhentiAnsOpen') || '[]')),
        noteOpen: new Set(JSON.parse(localStorage.getItem('zhentiNoteOpen') || '[]')),
        navCollapsed: localStorage.getItem('zhentiNavCollapsed') === '1',
        fqOpen: true,
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
        for (const n of notes) state.noteMap[n.question_id] = n.content || '';
    }

    /* ---------------- 套卷结构 ---------------- */
    function buildFlat(d, year) {
        return d.items.map(it => ({
            ...it,
            iid: it.qid || (it.sid + '_zt' + year + '_' + it.i),
            group: it.t === 1 ? 'choice' : 'big',
        }));
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
            return `<a class="ol-nav-item root${active ? ' zt-year-active' : ''}" data-year="${y}"
                onclick="switchYear(${y})" title="${y} 年真题（选择 40 + 大题 7）">
                ${y} 年真题<span class="zt-year-done">${done}/${state.index.choice_total}</span></a>`;
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
        state.pending = {};

        let html = `<div class="zt-toolbar">
            <div class="zt-title">${year} 年真题套卷<span class="zt-sub">选择题 ${state.index.choice_total} · 大题 ${state.index.big_total}</span></div>
            <div class="zt-tools">
                <span class="zt-progress" id="ztProgress">已做 ${doneCount(year)}/${state.index.choice_total}</span>
                <button class="zt-btn${state.examMode ? ' on' : ''}" onclick="toggleExamMode()" title="做题模式：隐藏答案与解析，全部做完再对答案">${state.examMode ? '做题中' : '做题模式'}</button>
                ${state.examMode ? '<button class="zt-btn zt-btn-primary" onclick="checkPending()">对答案</button>' : ''}
                <button class="zt-btn${state.showAll ? ' on' : ''}" onclick="toggleShowAll()">${state.showAll ? '收起全部答案' : '展开全部答案'}</button>
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
        renderFq();
    }

    /* ---------------- 卡片：选择题 ---------------- */
    function choiceCard(f) {
        const st = state.progress[f.iid];
        const sel = st ? (st.user_answer || '') : (state.pending[f.iid] || '');
        const isFav = state.favSet.has(f.iid);
        const ansOpen = state.ansOpen.has(f.iid) || state.showAll || (!!st && !state.examMode);

        let opts = '';
        for (let k = 0; k < LETTERS.length; k++) {
            const key = LETTERS[k];
            const text = f.o[k] != null ? f.o[k] : '';
            let cls = 'option-item';
            if (st && !state.examMode) {
                if (key === f.a) cls += ' correct';
                else if (key === sel && !st.is_correct) cls += ' wrong';
            } else if (sel === key) {
                cls += state.examMode ? ' picked' : '';
            }
            const checked = sel === key ? 'checked' : '';
            const disabled = (st && !state.examMode) ? 'disabled' : '';
            opts += `<label class="${cls}">
                <input type="radio" name="q_${f.iid}" value="${key}" ${checked} ${disabled} onchange="pickOption('${f.iid}', '${key}')">
                <span class="option-letter">${key}</span>
                <span class="option-text">${text}</span>
            </label>`;
        }

        let result = '';
        if (st && !state.examMode) {
            result = st.is_correct
                ? '<div class="result-correct">回答正确!</div>'
                : `<div class="result-wrong">回答错误! 正确答案: ${f.a || '—'}</div>`;
        }

        const hasNote = !!state.noteMap[f.iid];
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
                <button class="btn-explanation${state.noteOpen.has(f.iid) ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${f.iid}')">笔记${hasNote ? ' ●' : ''} ${state.noteOpen.has(f.iid) ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">答案解析</div>
                <div class="explanation-meta">
                    <span class="expl-answer">正确答案：${f.a || '暂无标准答案'}</span>
                </div>
                <div class="explanation-body">${f.an || '<div class="explanation-empty">该题暂无详细解析</div>'}</div>
            </div>` : ''}
            ${state.noteOpen.has(f.iid) ? notePanel(f.iid) : ''}
        </div>`;
    }

    /* ---------------- 卡片：大题 ---------------- */
    function bigCard(f) {
        const isFav = state.favSet.has(f.iid);
        const ansOpen = state.ansOpen.has(f.iid) || state.showAll;
        const hasNote = !!state.noteMap[f.iid];
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
                <button class="btn-explanation${state.noteOpen.has(f.iid) ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${f.iid}')">笔记${hasNote ? ' ●' : ''} ${state.noteOpen.has(f.iid) ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">参考答案与解析</div>
                <div class="explanation-body">${f.an || '<div class="explanation-empty">暂无解析</div>'}</div>
            </div>` : ''}
            ${state.noteOpen.has(f.iid) ? notePanel(f.iid) : ''}
        </div>`;
    }

    /* ---------------- 笔记面板（debounce 自动保存） ---------------- */
    function notePanel(qid) {
        const content = state.noteMap[qid] || '';
        return `<div class="zt-note-panel" data-note="${qid}">
            <div class="zt-note-title">我的笔记</div>
            <textarea class="zt-note-input" data-qid="${qid}" placeholder="记下解题思路、易错点…（停顿即自动保存）"
                oninput="onNoteInput(this)">${esc(content)}</textarea>
        </div>`;
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
            $('ztProgress').textContent = `已选 ${n}/${state.flat.filter(f => f.group === 'choice').length}`;
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
        refreshCard(iid);
        $('ztProgress').textContent = `已做 ${doneCount(state.year)}/${state.index.choice_total}`;
        renderYearList();
    }

    async function checkPending() {
        const ids = Object.keys(state.pending);
        if (!ids.length) { alert('还没有选择任何答案'); return; }
        for (const iid of ids) {
            const f = state.flat.find(x => x.iid === iid);
            if (!f) continue;
            const key = state.pending[iid];
            const ok = !!f.a && key === f.a;
            if (typeof window.applyAnswer === 'function') {
                await window.applyAnswer(iid, f.sid, key, ok, Date.now());
            }
            state.progress[iid] = { user_answer: key, is_correct: ok ? 1 : 0 };
        }
        state.pending = {};
        state.examMode = false;
        localStorage.setItem('zhentiMode', 'practice');
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
        if (fresh) injectSvgs(fresh);
        renderFq();
    }

    function toggleAns(iid) {
        if (state.ansOpen.has(iid)) state.ansOpen.delete(iid); else state.ansOpen.add(iid);
        localStorage.setItem('zhentiAnsOpen', JSON.stringify([...state.ansOpen]));
        refreshCard(iid);
    }

    function toggleNotePanel(iid) {
        flushNote();
        if (state.noteOpen.has(iid)) state.noteOpen.delete(iid); else state.noteOpen.add(iid);
        localStorage.setItem('zhentiNoteOpen', JSON.stringify([...state.noteOpen]));
        refreshCard(iid);
    }

    function onNoteInput(ta) {
        const qid = ta.dataset.qid;
        clearTimeout(state.noteTimer[qid]);
        state.noteTimer[qid] = setTimeout(() => saveNote(qid, ta.value), 700);
    }

    async function saveNote(qid, content) {
        state.noteMap[qid] = content;
        await api('/api/note/' + qid, { method: 'POST', body: JSON.stringify({ content: content, images: [] }) });
    }

    function flushNote() {
        document.querySelectorAll('.zt-note-input').forEach(ta => {
            const qid = ta.dataset.qid;
            clearTimeout(state.noteTimer[qid]);
            if (ta.value !== (state.noteMap[qid] || '')) saveNote(qid, ta.value);
        });
    }

    function toggleExamMode() {
        flushNote();
        state.examMode = !state.examMode;
        state.pending = {};
        localStorage.setItem('zhentiMode', state.examMode ? 'exam' : 'practice');
        renderPaper();
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
        state.year = y;
        localStorage.setItem('zhentiYear', String(y));
        state.ansOpen = new Set();
        renderYearList();
        renderPaper();
        window.scrollTo({ top: 0 });
    }

    /* ---------------- 题号导航 ---------------- */
    function renderFq() {
        const choices = state.flat.filter(f => f.group === 'choice');
        const bigs = state.flat.filter(f => f.group === 'big');
        const cell = it => {
            const st = state.progress[it.iid];
            let cls = 'zt-fq-i';
            if (st) cls += st.is_correct ? ' ok' : (it.group === 'choice' ? ' bad' : '');
            else if (state.pending[it.iid]) cls += ' picked';
            return `<a class="${cls}" data-iid="${it.iid}" onclick="gotoQ('${it.iid}')" title="第 ${it.i} 题">${it.i}</a>`;
        };
        $('fqList').innerHTML =
            `<div class="zt-fq-g">选择题</div><div class="zt-fq-grid">${choices.map(cell).join('')}</div>` +
            (bigs.length ? `<div class="zt-fq-g">大题</div><div class="zt-fq-grid">${bigs.map(cell).join('')}</div>` : '');
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

    // 滚动时更新当前题号
    function bindScrollSpy() {
        let raf = 0;
        window.addEventListener('scroll', () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const cards = document.querySelectorAll('#ztMain .question-card');
                let cur = null;
                for (const c of cards) {
                    if (c.getBoundingClientRect().top < 120) cur = c; else break;
                }
                $('fqNo').textContent = cur ? ('第 ' + cur.dataset.i + ' 题') : '—';
            });
        }, { passive: true });
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
            await Promise.all([loadIndex(), loadStores()]);
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
        gotoQ, toggleFq, toggleZtNav, expandZtNav,
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
