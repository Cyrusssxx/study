// ==================== 记忆卡（cards.html） ====================
// 四组卡片＝四门科目的知识点卡（数据来自 pwa/data/cards.json，由考点笔记小节提取）：
//   卡片内容 = 考点名 + 核心要点 + 易错提示。
// 交互（无 3D 翻面，点击查看）：
//   - 点击卡片 = 查看/收起要点；
//   - 右上角「熟」= 会了，不再加入记忆队列（标记后自动切到下一张）；
//   - 右上角「☆ 收藏」= 收藏卡片；
//   - 底部「不熟 / 不会」= 两级掌握程度标记（互斥，标记时清掉「熟」）。
// 移动端优先：滑动手势、底部固定大按钮（≥48px）、iOS 安全区内边距、卡片区随视口伸缩。
(function () {
    const SUBJ_ORDER = ['ds', 'os', 'cn', 'co'];
    const SUBJ_NAMES = { ds: '数据结构', os: '操作系统', cn: '计算机网络', co: '计算机组成原理' };
    const FILTERS = [{ k: 'all', n: '全部' }, { k: 'new', n: '未熟' }, { k: 'known', n: '熟' }];
    const KNOWN_KEY = 'cards_known_v1';   // 熟：{cardId: 1}
    const FAV_KEY = 'cards_fav_v1';       // 收藏：{cardId: 1}
    const WEAK_KEY = 'cards_weak_v1';     // 不熟/不会：{cardId: 'u' | 'd'}（互斥）
    const POS_KEY = 'cards_pos_v1';
    const SUBJ_KEY = 'cards_subj_v1';
    const FILTER_KEY = 'cards_filter_v1';

    let ALL = {};              // {subject: [card]}
    let subject = 'ds';
    let filter = 'all';
    let index = 0;             // 当前卡在「筛选后列表」中的下标
    let known = {};            // {cardId: 1}
    let fav = {};              // {cardId: 1}
    let weak = {};             // {cardId: 'u'|'d'}
    let list = [];             // 当前筛选后的卡列表
    let viewing = false;       // 是否处于「查看要点」状态

    function readJson(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; }
    }
    function writeJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }

    async function load() {
        subject = readJson(SUBJ_KEY, 'ds');
        if (SUBJ_ORDER.indexOf(subject) < 0) subject = 'ds';
        filter = readJson(FILTER_KEY, 'all');
        known = readJson(KNOWN_KEY, {});
        fav = readJson(FAV_KEY, {});
        weak = readJson(WEAK_KEY, {});
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

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        document.getElementById('fcKnown').textContent = `熟 ${knownCount}`;
        document.getElementById('fcBar').style.width = total ? Math.round((index + 1) / total * 100) + '%' : '0%';

        const body = document.getElementById('fcBody');
        if (!c) {
            body.innerHTML = '';
            const tip = document.createElement('div');
            tip.className = 'fc-hint';
            tip.style.justifyContent = 'center';
            tip.textContent = filter === 'known' ? '还没有标记为「熟」的卡片' :
                (filter === 'new' && (ALL[subject] || []).length ? '全部都已「熟」，去「熟」筛选里回顾吧' : '该科目暂无卡片');
            body.appendChild(tip);
            syncButtons(null);
            return;
        }

        const htmlParts = [];
        if (viewing) {
            // 查看态：小标题 + 要点 + 易错提示
            htmlParts.push(`<div class="fc-chapter">${esc(c.title)}</div>`);
            htmlParts.push('<ul class="fc-pts">' + (c.points || []).map(p =>
                `<li>${esc(p)}</li>`).join('') + '</ul>');
            if (c.tip) htmlParts.push(`<div class="fc-tip">易错点：${esc(c.tip)}</div>`);
            htmlParts.push('<div class="fc-hint">点击卡片收起</div>');
        } else {
            // 问题态：章节 + 考点名 + 状态小标签 + 提示
            const badge = weak[c.id] === 'u' ? '<span class="fc-badge u">不熟</span>' :
                (weak[c.id] === 'd' ? '<span class="fc-badge d">不会</span>' : '');
            htmlParts.push(`<div class="fc-chapter">${esc([c.chapter, c.section].filter(Boolean).join(' · '))}</div>`);
            htmlParts.push(`<div class="fc-title">${esc(c.title)}${badge}</div>`);
            htmlParts.push('<div class="fc-hint">点击卡片查看要点</div>');
        }
        body.innerHTML = htmlParts.join('');
        syncButtons(c);
    }

    function syncButtons(c) {
        const kb = document.getElementById('fcKnownBtn');
        const fb = document.getElementById('fcFavBtn');
        const ub = document.getElementById('fcWeakUBtn');
        const db = document.getElementById('fcWeakDBtn');
        if (!c) {
            kb.classList.remove('known'); kb.textContent = '熟';
            fb.classList.remove('fav'); fb.textContent = '☆ 收藏';
            ub.classList.remove('on-u'); ub.textContent = '不熟';
            db.classList.remove('on-d'); db.textContent = '不会';
            return;
        }
        kb.classList.toggle('known', !!known[c.id]);
        kb.textContent = known[c.id] ? '熟 ✓' : '熟';
        fb.classList.toggle('fav', !!fav[c.id]);
        fb.textContent = fav[c.id] ? '★ 已收藏' : '☆ 收藏';
        ub.classList.toggle('on-u', weak[c.id] === 'u');
        ub.textContent = weak[c.id] === 'u' ? '不熟 ✓' : '不熟';
        db.classList.toggle('on-d', weak[c.id] === 'd');
        db.textContent = weak[c.id] === 'd' ? '不会 ✓' : '不会';
    }

    // 点击卡片：查看 / 收起要点（无 3D 翻面）
    function toggleView() {
        if (!list.length) return;
        viewing = !viewing;
        render();
    }

    function go(delta) {
        if (!list.length) return;
        index = (index + delta + list.length) % list.length;
        viewing = false;
        savePos();
        render();
    }
    function nextCard() { go(1); }
    function prevCard() { go(-1); }

    // 熟：会了，不再加入记忆队列
    function toggleKnown() {
        const c = list[index];
        if (!c) return;
        if (known[c.id]) {
            delete known[c.id];
        } else {
            known[c.id] = 1;
            delete weak[c.id];       // 熟 与 不熟/不会 互斥
        }
        writeJson(KNOWN_KEY, known);
        writeJson(WEAK_KEY, weak);
        // 在「未熟」队列中标记熟 → 自动移出队列（index 由 applyFilter 收敛，等效自动下一张）
        if (filter === 'new' && known[c.id]) applyFilter();
        render();
    }

    function toggleFav() {
        const c = list[index];
        if (!c) return;
        if (fav[c.id]) delete fav[c.id]; else fav[c.id] = 1;
        writeJson(FAV_KEY, fav);
        render();
    }

    // 不熟 / 不会：两级弱标记（互斥），标记时清掉「熟」
    function toggleWeak(k) {
        const c = list[index];
        if (!c) return;
        if (weak[c.id] === k) {
            delete weak[c.id];
        } else {
            weak[c.id] = k;
            delete known[c.id];      // 与「熟」互斥
        }
        writeJson(WEAK_KEY, weak);
        writeJson(KNOWN_KEY, known);
        if (filter === 'known' && !known[c.id]) applyFilter();   // 从「熟」队列移除
        render();
    }

    function switchSubject(s) {
        if (s === subject) return;
        savePos();
        subject = s;
        writeJson(SUBJ_KEY, s);
        index = (readJson(POS_KEY, {})[s] || 0);
        viewing = false;
        applyFilter();
        render();
    }

    function switchFilter(f) {
        if (f === filter) return;
        filter = f;
        writeJson(FILTER_KEY, f);
        index = 0;
        viewing = false;
        applyFilter();
        render();
    }

    // ---------- 移动端手势：左右滑动切题；点击卡片查看 ----------
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
            // 横向滑动切题；「点击查看」交给 click（避免 touchend+click 双触发）
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? nextCard() : prevCard(); }
        }, { passive: true });
        // 桌面：方向键切题，空格/回车查看
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') nextCard();
            else if (e.key === 'ArrowLeft') prevCard();
            else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleView(); }
        });
        // 点击卡片（鼠标或触屏）查看/收起；滑动后忽略
        document.getElementById('fcCard').addEventListener('click', () => { if (!moved) toggleView(); });
    }

    window.toggleView = toggleView;
    window.nextCard = nextCard;
    window.prevCard = prevCard;
    window.toggleKnown = toggleKnown;
    window.toggleFav = toggleFav;
    window.toggleWeak = toggleWeak;
    window.switchSubject = switchSubject;
    window.switchFilter = switchFilter;
    window.Cards = { load, get state() { return { subject, filter, index, total: list.length, known, fav, weak }; } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
})();
