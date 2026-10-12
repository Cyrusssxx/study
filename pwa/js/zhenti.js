/* ================= 真题套卷（zhenti.html）=================
 * 形态参照 math-note 的 exam.html：左年份列表 + 中题目流 + 右悬浮题号导航。
 * 题目流 = 当年选择题（四科分组）+ 大题（DS 代码题 + co/os/cn 大题），
 * 题号按真实试卷编排（选择 1..N，大题接排）。作答/收藏/错题/笔记走后端 IndexedDB。 */
(function () {
    'use strict';

    const SUBJ_NAME = { ds: '数据结构', co: '计算机组成原理', os: '操作系统', cn: '计算机网络' };
    const SUBJ_FILES = { ds: 'data/ds.json', co: 'data/co.json', os: 'data/os.json', cn: 'data/cn.json' };
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const state = {
        papers: null,            // {years, papers:{year:{choice,code,dati,total,...}}}
        qmap: {},                // qid -> {kind:'choice'|'dati'|'code', subj, q}
        progress: {},            // qid -> {user_answer, is_correct}
        pending: {},             // 做题模式下的临时选择
        favSet: new Set(),
        noteMap: {},             // qid -> content
        year: 0,
        examMode: localStorage.getItem('zhentiMode') === 'exam',
        showAll: false,
        favOnly: false,
        ansOpen: new Set(JSON.parse(localStorage.getItem('zhentiAnsOpen') || '[]')),
        noteOpen: new Set(JSON.parse(localStorage.getItem('zhentiNoteOpen') || '[]')),
        navCollapsed: localStorage.getItem('zhentiNavCollapsed') === '1',
        fqOpen: true,
        flat: [],                // 当前卷有序题
        noteTimer: {},
        ready: false,
    };

    /* ---------------- 数据加载 ---------------- */
    async function loadAll() {
        const [papers, dsD, coD, osD, cnD, datiD, codeD] = await Promise.all([
            fetch('data/papers.json').then(r => r.json()),
            fetch(SUBJ_FILES.ds).then(r => r.json()),
            fetch(SUBJ_FILES.co).then(r => r.json()),
            fetch(SUBJ_FILES.os).then(r => r.json()),
            fetch(SUBJ_FILES.cn).then(r => r.json()),
            fetch('data/dati.json').then(r => r.json()),
            fetch('data/ds_code.json').then(r => r.json()),
        ]);
        state.papers = papers;
        const subData = { ds: dsD, co: coD, os: osD, cn: cnD };
        for (const [k, d] of Object.entries(subData))
            for (const q of d.questions) state.qmap[q.id] = { kind: 'choice', subj: k, q };
        for (const s of datiD.subjects)
            for (const ch of s.chapters)
                for (const sec of (ch.sections || []))
                    for (const q of (sec.questions || []))
                        state.qmap[q.id] = { kind: 'dati', subj: s.key, q };
        for (const q of codeD.questions) state.qmap[q.id] = { kind: 'code', subj: 'ds', q };

        const [prog, favs, notes] = await Promise.all([dbAll('progress'), dbAll('favorites'), dbAll('notes')]);
        for (const p of prog) state.progress[p.question_id] = p;
        for (const f of favs) state.favSet.add(f.question_id);
        for (const n of notes) state.noteMap[n.question_id] = n.content || '';

        // 默认年份：记忆 > 最新年
        const remembered = +(localStorage.getItem('zhentiYear') || 0);
        state.year = (remembered && papers.papers[remembered]) ? remembered : papers.years[papers.years.length - 1];
        state.ready = true;
    }

    /* ---------------- 套卷结构 ---------------- */
    function buildFlat(year) {
        const p = state.papers.papers[year];
        const flat = [];
        let no = 0;
        for (const subj of ['ds', 'co', 'os', 'cn'])
            for (const qid of p.choice[subj]) flat.push({ qid, no: ++no, kind: 'choice', subj, group: 'choice' });
        for (const qid of (p.code || [])) flat.push({ qid, no: ++no, kind: 'code', subj: 'ds', group: 'big' });
        for (const subj of ['co', 'os', 'cn'])
            for (const qid of p.dati[subj]) flat.push({ qid, no: ++no, kind: 'dati', subj, group: 'big' });
        return flat;
    }

    function doneCount(year) {
        const p = state.papers.papers[year];
        const ids = [...p.choice.ds, ...p.choice.co, ...p.choice.os, ...p.choice.cn];
        return ids.filter(id => state.progress[id]).length;
    }

    /* ---------------- 渲染：年份列表 ---------------- */
    function renderYearList() {
        const years = [...state.papers.years].reverse();
        $('yearList').innerHTML = years.map(y => {
            const p = state.papers.papers[y];
            const done = doneCount(y);
            const active = y === state.year;
            return `<a class="ol-nav-item root${active ? ' zt-year-active' : ''}" data-year="${y}"
                onclick="switchYear(${y})" title="${y} 年真题（选择 ${p.choice_total} + 大题 ${p.big_total}）">
                ${y} 年真题<span class="zt-year-done">${done}/${p.choice_total}</span></a>`;
        }).join('');
    }

    /* ---------------- 渲染：套卷 ---------------- */
    function renderPaper() {
        const year = state.year;
        const p = state.papers.papers[year];
        state.flat = buildFlat(year);
        state.pending = {};

        let html = `<div class="zt-toolbar">
            <div class="zt-title">${year} 年真题套卷<span class="zt-sub">选择题 ${p.choice_total} · 大题 ${p.big_total}</span></div>
            <div class="zt-tools">
                <span class="zt-progress" id="ztProgress">已做 ${doneCount(year)}/${p.choice_total}</span>
                <button class="zt-btn${state.examMode ? ' on' : ''}" onclick="toggleExamMode()" title="做题模式：隐藏答案与解析，全部做完再对答案">${state.examMode ? '做题中' : '做题模式'}</button>
                ${state.examMode ? '<button class="zt-btn zt-btn-primary" onclick="checkPending()">对答案</button>' : ''}
                <button class="zt-btn${state.showAll ? ' on' : ''}" onclick="toggleShowAll()">${state.showAll ? '收起全部答案' : '展开全部答案'}</button>
                <button class="zt-btn${state.favOnly ? ' on' : ''}" onclick="toggleFavOnly()">${state.favOnly ? '显示全部' : '只看收藏'}</button>
                <button class="zt-btn" onclick="resetYear()" title="清空本年作答记录重新做（错题本保留）">重做本年 ↺</button>
            </div>
        </div>`;

        const choices = state.flat.filter(f => f.group === 'choice' && (!state.favOnly || state.favSet.has(f.qid)));
        const bigs = state.flat.filter(f => f.group === 'big' && (!state.favOnly || state.favSet.has(f.qid)));

        if (state.favOnly && !choices.length && !bigs.length) {
            html += '<div class="zt-empty">本年还没有收藏题目。点题目右上角的 ☆ 收藏后，可用「只看收藏」集中攻克。</div>';
        }

        if (choices.length) {
            html += `<div class="zt-sec-title">一、选择题<span class="zt-sec-sub">共 ${choices.length} 题</span></div>`;
            for (const subj of ['ds', 'co', 'os', 'cn']) {
                const items = choices.filter(f => f.subj === subj);
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
        renderFq();
    }

    /* ---------------- 卡片：选择题 ---------------- */
    function choiceCard(it) {
        const { q } = state.qmap[it.qid];
        const st = state.progress[it.qid];
        const sel = st ? (st.user_answer || '') : (state.pending[it.qid] || '');
        const isFav = state.favSet.has(it.qid);
        const ansOpen = state.ansOpen.has(it.qid) || state.showAll || (!!st && !state.examMode);

        let opts = '';
        for (const key of Object.keys(q.options || {})) {
            let cls = 'option-item';
            if (st && !state.examMode) {
                if (key === q.answer) cls += ' correct';
                else if (key === sel && !st.is_correct) cls += ' wrong';
            } else if (sel === key) {
                cls += state.examMode ? ' picked' : '';
            }
            const checked = sel === key ? 'checked' : '';
            const disabled = (st && !state.examMode) ? 'disabled' : '';
            opts += `<label class="${cls}">
                <input type="radio" name="q_${it.qid}" value="${key}" ${checked} ${disabled} onchange="pickOption('${it.qid}', this.value)">
                <span class="option-letter">${key}</span>
                <span class="option-text">${fmtOptionText(q.options[key])}</span>
            </label>`;
        }

        let result = '';
        if (st && !state.examMode) {
            result = st.is_correct
                ? '<div class="result-correct">回答正确!</div>'
                : `<div class="result-wrong">回答错误! 正确答案: ${q.answer}</div>`;
        }

        const hasNote = !!state.noteMap[it.qid];
        return `<div class="question-card" id="card-${it.qid}" data-qid="${it.qid}">
            <div class="question-header">
                <div class="question-meta">
                    <span class="question-number">第 ${it.no} 题</span>
                    <span class="zt-subj-badge">${SUBJ_NAME[it.subj]}</span>
                </div>
                <button class="btn-icon ${isFav ? 'favorited' : ''}" onclick="toggleFav('${it.qid}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="question-content">${fmtContent(q.content)}</div>
            <div class="options-list">${opts}</div>
            ${result}
            <div class="question-tools">
                <button class="btn-explanation${ansOpen ? ' active' : ''}" onclick="toggleAns('${it.qid}')">答案与解析 ${ansOpen ? '▴' : '▾'}</button>
                <button class="btn-explanation${state.noteOpen.has(it.qid) ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${it.qid}')">笔记${hasNote ? ' ●' : ''} ${state.noteOpen.has(it.qid) ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">答案解析</div>
                <div class="explanation-meta">
                    <span class="expl-answer">正确答案：${q.answer || '暂无标准答案'}</span>
                    ${q.chapter ? `<span class="expl-kp">知识点：${esc(q.chapter)}${q.section ? ' · ' + esc(q.section) : ''}</span>` : ''}
                </div>
                <div class="explanation-body">${q.explanation || '<div class="explanation-empty">该题暂无详细解析</div>'}</div>
            </div>` : ''}
            ${state.noteOpen.has(it.qid) ? notePanel(it.qid) : ''}
        </div>`;
    }

    /* ---------------- 卡片：大题 ---------------- */
    function bigCard(it) {
        const entry = state.qmap[it.qid];
        const q = entry.q;
        const isCode = entry.kind === 'code';
        const isFav = state.favSet.has(it.qid);
        const ansOpen = state.ansOpen.has(it.qid) || state.showAll;
        const hasNote = !!state.noteMap[it.qid];
        const body = isCode ? (q.content_text || '') : (q.q || '');
        const ans = isCode ? (q.answer_full || '') : (q.a || '');
        const sols = isCode && q.solutions && q.solutions.list ? q.solutions.list : [];

        let solHtml = '';
        if (ansOpen && sols.length) {
            for (const s of sols) {
                solHtml += `<div class="zt-sol">
                    <div class="zt-sol-tag">${esc(s.tag || '')}${s.kind ? ' · ' + esc(s.kind) : ''}</div>
                    ${s.thought ? `<div class="zt-sol-thought">${esc(s.thought).replace(/\n/g, '<br>')}</div>` : ''}
                    ${s.code ? `<pre class="code-block">${esc(s.code)}</pre>` : ''}
                </div>`;
            }
        }

        return `<div class="question-card" id="card-${it.qid}" data-qid="${it.qid}">
            <div class="question-header">
                <div class="question-meta">
                    <span class="question-number">第 ${it.no} 题</span>
                    <span class="zt-subj-badge">${SUBJ_NAME[it.subj]} · 大题</span>
                    ${q.real ? `<span class="badge-real">${esc(q.real)}</span>` : ''}
                </div>
                <button class="btn-icon ${isFav ? 'favorited' : ''}" onclick="toggleFav('${it.qid}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
            </div>
            <div class="question-content">${body}</div>
            <div class="question-tools">
                <button class="btn-explanation${ansOpen ? ' active' : ''}" onclick="toggleAns('${it.qid}')">参考答案 ${ansOpen ? '▴' : '▾'}</button>
                <button class="btn-explanation${state.noteOpen.has(it.qid) ? ' active' : ''}${hasNote ? ' has-note' : ''}" onclick="toggleNotePanel('${it.qid}')">笔记${hasNote ? ' ●' : ''} ${state.noteOpen.has(it.qid) ? '▴' : '▾'}</button>
            </div>
            ${ansOpen ? `<div class="explanation-panel">
                <div class="explanation-title">参考答案</div>
                <div class="explanation-body">${ans || '<div class="explanation-empty">暂无答案</div>'}</div>
                ${solHtml}
            </div>` : ''}
            ${state.noteOpen.has(it.qid) ? notePanel(it.qid) : ''}
        </div>`;
    }

    /* ---------------- 笔记面板（纯文本，debounce 自动保存） ---------------- */
    function notePanel(qid) {
        const content = state.noteMap[qid] || '';
        return `<div class="zt-note-panel" data-note="${qid}">
            <div class="zt-note-title">我的笔记</div>
            <textarea class="zt-note-input" data-qid="${qid}" placeholder="记下解题思路、易错点…（停顿即自动保存）"
                oninput="onNoteInput(this)">${esc(content)}</textarea>
        </div>`;
    }

    /* ---------------- 交互 ---------------- */
    async function pickOption(qid, key) {
        if (state.examMode) {
            state.pending[qid] = key;
            refreshCard(qid);
            const n = Object.keys(state.pending).length;
            const total = state.flat.filter(f => f.group === 'choice').length;
            $('ztProgress').textContent = `已选 ${n}/${total}`;
            return;
        }
        flushNote();
        const r = await api('/api/submit', { method: 'POST', body: JSON.stringify({ question_id: qid, answer: key }) });
        const j = await r.json();
        state.progress[qid] = { user_answer: j.user_answer, is_correct: j.is_correct };
        refreshCard(qid);
        const year = state.year;
        $('ztProgress').textContent = `已做 ${doneCount(year)}/${state.papers.papers[year].choice_total}`;
        renderYearList();
    }

    async function checkPending() {
        const ids = Object.keys(state.pending);
        if (!ids.length) { alert('还没有选择任何答案'); return; }
        for (const qid of ids) {
            const key = state.pending[qid];
            const r = await api('/api/submit', { method: 'POST', body: JSON.stringify({ question_id: qid, answer: key }) });
            const j = await r.json();
            state.progress[qid] = { user_answer: j.user_answer, is_correct: j.is_correct };
        }
        state.pending = {};
        state.examMode = false;
        localStorage.setItem('zhentiMode', 'practice');
        renderPaper();
        renderYearList();
    }

    async function toggleFav(qid) {
        const r = await api('/api/favorite/' + qid);
        const j = await r.json();
        if (j.is_favorited) state.favSet.add(qid); else state.favSet.delete(qid);
        refreshCard(qid);
    }

    function refreshCard(qid) {
        const it = state.flat.find(f => f.qid === qid);
        const el = document.querySelector(`#card-${qid}`);
        if (!it || !el) return;
        const html = it.group === 'choice' ? choiceCard(it) : bigCard(it);
        el.insertAdjacentHTML('afterend', html);
        el.remove();
        renderFq();
    }

    function toggleAns(qid) {
        if (state.ansOpen.has(qid)) state.ansOpen.delete(qid); else state.ansOpen.add(qid);
        localStorage.setItem('zhentiAnsOpen', JSON.stringify([...state.ansOpen]));
        refreshCard(qid);
    }

    function toggleNotePanel(qid) {
        flushNote();
        if (state.noteOpen.has(qid)) state.noteOpen.delete(qid); else state.noteOpen.add(qid);
        localStorage.setItem('zhentiNoteOpen', JSON.stringify([...state.noteOpen]));
        refreshCard(qid);
    }

    function onNoteInput(ta) {
        const qid = ta.dataset.qid;
        clearTimeout(state.noteTimer[qid]);
        state.noteTimer[qid] = setTimeout(() => saveNote(qid, ta.value), 700);
    }

    async function saveNote(qid, content) {
        const subj = qid.split('_')[0];
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
        state.examMode = !state.examMode;
        state.pending = {};
        localStorage.setItem('zhentiMode', state.examMode ? 'exam' : 'practice');
        renderPaper();
    }

    function toggleShowAll() {
        state.showAll = !state.showAll;
        renderPaper();
    }

    function toggleFavOnly() {
        state.favOnly = !state.favOnly;
        renderPaper();
    }

    async function resetYear() {
        if (!confirm('确定清空本年所有作答记录重新做吗？（错题本与收藏保留）')) return;
        for (const it of state.flat) {
            if (state.progress[it.qid]) {
                await dbDelete('progress', it.qid);
                delete state.progress[it.qid];
            }
        }
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
            const st = state.progress[it.qid];
            let cls = 'zt-fq-i';
            if (st) cls += st.is_correct ? ' ok' : ' bad';
            else if (state.pending[it.qid]) cls += ' picked';
            return `<a class="${cls}" data-qid="${it.qid}" onclick="gotoQ('${it.qid}')" title="第 ${it.no} 题">${it.no}</a>`;
        };
        $('fqList').innerHTML =
            `<div class="zt-fq-g">选择题</div><div class="zt-fq-grid">${choices.map(cell).join('')}</div>` +
            (bigs.length ? `<div class="zt-fq-g">大题</div><div class="zt-fq-grid">${bigs.map(cell).join('')}</div>` : '');
    }

    function gotoQ(qid) {
        flushNote();
        const el = document.querySelector(`#card-${qid}`);
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
                $('fqNo').textContent = cur ? ('第 ' + cur.dataset.qid.replace(/^.*_/, '') + ' 题') : '—';
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
            await loadAll();
            renderYearList();
            renderPaper();
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
