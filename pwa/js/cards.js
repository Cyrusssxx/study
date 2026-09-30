// ==================== 记忆卡（cards.html） ====================
// 四组卡片＝四门科目的知识点卡（数据来自 pwa/data/cards.json，由考点笔记小节提取）：
//   正面 = 考点名（小节标题）+ 所属章节；背面 = 该考点的核心要点 + 易错提示。
// 交互：点卡片/点「翻转」看背面；左右滑动或左右按钮切题；「记住了」标记掌握状态。
// 移动端优先：滑动手势、底部固定大按钮（≥48px）、iOS 安全区内边距、卡片区随视口伸缩。
(function () {
    const SUBJ_ORDER = ['ds', 'os', 'cn', 'co'];
    const SUBJ_NAMES = { ds: '数据结构', os: '操作系统', cn: '计算机网络', co: '计算机组成原理' };
    const FILTERS = [{ k: 'all', n: '全部' }, { k: 'new', n: '未掌握' }, { k: 'known', n: '已掌握' }];
    const KNOWN_KEY = 'cards_known_v1';
    const POS_KEY = 'cards_pos_v1';
    const SUBJ_KEY = 'cards_subj_v1';
    const FILTER_KEY = 'cards_filter_v1';

    let ALL = {};              // {subject: [card]}
    let subject = 'ds';
    let filter = 'all';
    let index = 0;             // 当前卡在「筛选后列表」中的下标
    let known = {};            // {cardId: 1}
    let list = [];             // 当前筛选后的卡列表
    let flipped = false;

    function readJson(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; }
    }
    function writeJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }

    async function load() {
        subject = readJson(SUBJ_KEY, 'ds');
        if (SUBJ_ORDER.indexOf(subject) < 0) subject = 'ds';
        filter = readJson(FILTER_KEY, 'all');
        known = readJson(KNOWN_KEY, {});
        const resp = await fetch('data/cards.json');
        const data = await resp.json();
        ALL = data.cards || {};
        index = (readJson(POS_KEY, {})[subject] || 0);
        applyFilter();
        render();
        bindGestures();
    }

    function applyFilter() {
        const src = ALL[subject] || [];
        list = src.filter(c => filter === 'all' ? true : filter === 'known' ? !!known[c.id] : !known[c.id]);
        if (!list.length) { index = 0; return; }
        if (index >= list.length) index = list.length - 1;
        if (index < 0) index = 0;
    }

    function savePos() {
        const p = readJson(POS_KEY, {});
        p[subject] = index;
        writeJson(POS_KEY, p);
    }

    function render() {
        // 科目 chips
        document.getElementById('fcSubjects').innerHTML = SUBJ_ORDER.map(s =>
            `<button class="fc-chip ${s === subject ? 'on' : ''}" onclick="switchSubject('${s}')">${SUBJ_NAMES[s]}（${(ALL[s] || []).length}）</button>`
        ).join('');
        // 筛选 chips
        document.getElementById('fcFilters').innerHTML = FILTERS.map(f =>
            `<button class="fc-chip ${f.k === filter ? 'on' : ''}" onclick="switchFilter('${f.k}')">${f.n}</button>`
        ).join('');

        const total = list.length;
        const c = list[index];
        const knownCount = (ALL[subject] || []).filter(x => known[x.id]).length;
        document.getElementById('fcCount').textContent = total ? `${index + 1} / ${total}` : '0 / 0';
        document.getElementById('fcKnown').textContent = `已掌握 ${knownCount}`;
        document.getElementById('fcBar').style.width = total ? Math.round((index + 1) / total * 100) + '%' : '0%';

        const front = document.getElementById('fcFront');
        const back = document.getElementById('fcBack');
        if (!c) {
            front.innerHTML = '';
            back.innerHTML = '';
            const tip = document.createElement('div');
            tip.className = 'fc-hint';
            tip.style.justifyContent = 'center';
            tip.textContent = filter === 'known' ? '还没有标记为「记住了」的卡片' : '该科目暂无卡片';
            front.appendChild(tip);
            document.getElementById('fcKnownBtn').classList.remove('on');
            return;
        }

        // 正面：考点名（纯文本，避免 HTML 注入）
        front.innerHTML = '';
        const ch = document.createElement('div');
        ch.className = 'fc-chapter';
        ch.textContent = [c.chapter, c.section].filter(Boolean).join(' · ');
        const ti = document.createElement('div');
        ti.className = 'fc-title';
        ti.textContent = c.title;
        const hint = document.createElement('div');
        hint.className = 'fc-hint';
        hint.textContent = '点击卡片 / 点「翻转」看要点';
        front.appendChild(ch); front.appendChild(ti); front.appendChild(hint);

        // 背面：要点 + 易错提示
        back.innerHTML = '';
        const bti = document.createElement('div');
        bti.className = 'fc-chapter';
        bti.textContent = c.title;
        back.appendChild(bti);
        const ul = document.createElement('ul');
        ul.className = 'fc-pts';
        (c.points || []).forEach(p => {
            const li = document.createElement('li');
            li.textContent = p;
            ul.appendChild(li);
        });
        back.appendChild(ul);
        if (c.tip) {
            const t = document.createElement('div');
            t.className = 'fc-tip';
            t.textContent = '易错点：' + c.tip;
            back.appendChild(t);
        }

        document.getElementById('fcKnownBtn').classList.toggle('on', !!known[c.id]);
        document.getElementById('fcKnownBtn').textContent = known[c.id] ? '已记住 ✓' : '记住了';
    }

    function flipCard() {
        if (!list.length) return;
        flipped = !flipped;
        document.getElementById('fcCard').classList.toggle('flipped', flipped);
        document.getElementById('fcFlipBtn').textContent = flipped ? '看正面' : '翻转';
    }

    function go(delta) {
        if (!list.length) return;
        index = (index + delta + list.length) % list.length;
        flipped = false;
        document.getElementById('fcCard').classList.remove('flipped');
        document.getElementById('fcFlipBtn').textContent = '翻转';
        savePos();
        render();
    }
    function nextCard() { go(1); }
    function prevCard() { go(-1); }

    function toggleKnown() {
        const c = list[index];
        if (!c) return;
        if (known[c.id]) delete known[c.id]; else known[c.id] = 1;
        writeJson(KNOWN_KEY, known);
        render();
    }

    function switchSubject(s) {
        if (s === subject) return;
        savePos();
        subject = s;
        writeJson(SUBJ_KEY, s);
        index = (readJson(POS_KEY, {})[s] || 0);
        flipped = false;
        document.getElementById('fcCard').classList.remove('flipped');
        document.getElementById('fcFlipBtn').textContent = '翻转';
        applyFilter();
        render();
    }

    function switchFilter(f) {
        if (f === filter) return;
        filter = f;
        writeJson(FILTER_KEY, f);
        index = 0;
        applyFilter();
        render();
    }

    // ---------- 移动端手势：左右滑动切题（滑动时不触发翻转） ----------
    function bindGestures() {
        const stage = document.getElementById('fcStage');
        let sx = 0, sy = 0, moved = false;
        stage.addEventListener('touchstart', e => {
            const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; moved = false;
        }, { passive: true });
        stage.addEventListener('touchmove', e => {
            const t = e.changedTouches[0];
            if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
        }, { passive: true });
        stage.addEventListener('touchend', e => {
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            // 只处理横向滑动切题；「点击翻转」交给 click（避免 touchend+click 双触发）
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? nextCard() : prevCard(); }
        }, { passive: true });
        // 桌面：键盘方向键
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') nextCard();
            else if (e.key === 'ArrowLeft') prevCard();
            else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
        });
        // 点击（鼠标或触屏）翻转；刚才若是滑动则忽略
        document.getElementById('fcCard').addEventListener('click', () => { if (!moved) flipCard(); });
    }

    window.flipCard = flipCard;
    window.nextCard = nextCard;
    window.prevCard = prevCard;
    window.toggleKnown = toggleKnown;
    window.switchSubject = switchSubject;
    window.switchFilter = switchFilter;
    window.Cards = { load, get state() { return { subject, filter, index, total: list.length, known }; } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
})();
