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
    const FILTERS = [{ k: 'all', n: '全部' }, { k: 'new', n: '未熟' }, { k: 'known', n: '熟' }, { k: 'fav', n: '收藏' }];
    const KNOWN_KEY = 'cards_known_v1';   // 熟：{cardId: 1}
    const FAV_KEY = 'cards_fav_v1';       // 收藏：{cardId: 1}
    const WEAK_KEY = 'cards_weak_v1';     // 不熟/不会：{cardId: 'u' | 'd'}（互斥）
    const POS_KEY = 'cards_pos_v1';
    const SUBJ_KEY = 'cards_subj_v1';
    const FILTER_KEY = 'cards_filter_v1';
    const KEYS_KEY = 'cards_keys_v1';       // 自定义快捷键 {act: key}
    const AUTONEXT_KEY = 'cards_autonext_v1'; // 标记后自动下一张 '1'|'0'
    const TOC_KEY = 'cards_toc_v1';           // 左侧目录是否展开
    const NOTE_KEY = 'cards_notes_v1';        // 自建笔记：{cardId: 文本}

    // 鼠标侧键：button 3 = 后退侧键，4 = 前进侧键（浏览器默认会触发前进/后退，需拦截）
    const MOUSE_KEY = { 3: 'Mouse4', 4: 'Mouse5' };

    // 默认快捷键（e.key 值；字母统一小写比较）
    const DEFAULT_KEYS = {
        prev: 'ArrowLeft',
        next: 'ArrowRight',
        view: ' ',
        known: 'k',
        fav: 'f',
        weakU: 'u',
        weakD: 'd'
    };
    // 可自定义的动作（顺序即设置面板里的顺序）
    const KEY_ACTIONS = [
        { act: 'prev', name: '上一张', run: () => prevCard() },
        { act: 'next', name: '下一张', run: () => nextCard() },
        { act: 'view', name: '查看 / 收起要点', run: () => toggleView() },
        { act: 'known', name: '标记「熟」', run: () => toggleKnown() },
        { act: 'fav', name: '收藏卡片', run: () => toggleFav() },
        { act: 'weakU', name: '标记「不熟」', run: () => toggleWeak('u') },
        { act: 'weakD', name: '标记「不会」', run: () => toggleWeak('d') }
    ];

    let ALL = {};              // {subject: [card]}
    let subject = 'ds';
    let filter = 'all';
    let index = 0;             // 当前卡在「筛选后列表」中的下标
    let known = {};            // {cardId: 1}
    let fav = {};              // {cardId: 1}
    let weak = {};             // {cardId: 'u'|'d'}
    let list = [];             // 当前筛选后的卡列表
    let viewing = false;       // 是否处于「查看要点」状态
    let keys = Object.assign({}, DEFAULT_KEYS);  // 当前快捷键
    let autoNext = false;      // 标记后自动下一张
    let capturing = null;      // 正在录制快捷键的动作名
    let tocOpen = false;       // 左侧目录是否固定展开（点击 ☰ 切换，持久化）
    let tocHover = false;      // 鼠标悬停左边缘时的临时展开（不写存储）
    let notes = {};            // {cardId: '我的笔记'}
    let noteDirty = false;     // 正在输入同一张卡，避免被覆盖
    let noteCardId = null;     // 笔记框当前属于哪张卡

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
        keys = Object.assign({}, DEFAULT_KEYS, readJson(KEYS_KEY, {}) || {});
        autoNext = readJson(AUTONEXT_KEY, false) === true;
        tocOpen = readJson(TOC_KEY, window.innerWidth > 900) === true;
        notes = readJson(NOTE_KEY, {}) || {};
        const resp = await fetch('data/cards.json');
        const data = await resp.json();
        ALL = data.cards || {};
        index = (readJson(POS_KEY, {})[subject] || 0);
        applyFilter();
        render();
        bindGestures();
        bindNote();
        bindTocHover();
        applyToc();
    }

    function applyFilter() {
        const src = ALL[subject] || [];
        list = src.filter(c =>
            filter === 'all' ? true :
            filter === 'known' ? !!known[c.id] :
            filter === 'fav' ? !!fav[c.id] : !known[c.id]);
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

    // 要点里的标记：
    //   **重点**  → 红色加粗（考点笔记里作者加粗的术语/结论）
    //   ≈≈公式≈≈ → 黄色半高亮荧光笔（复杂度/取整/取模/等式等）
    function mdInline(s) {
        return esc(s)
            .replace(/\*\*(.+?)\*\*/g, '<strong class="fc-em">$1</strong>')
            .replace(/≈≈(.+?)≈≈/g, '<em class="fc-em fx">$1</em>');
    }

    function render() {
        // 科目 chips
        document.getElementById('fcSubjects').innerHTML = SUBJ_ORDER.map(s =>
            `<button class="fc-chip ${s === subject ? 'on' : ''}" onclick="switchSubject('${s}')">${SUBJ_NAMES[s]}（${(ALL[s] || []).length}）</button>`
        ).join('');
        // 筛选 chips
        const knownTotal = (ALL[subject] || []).filter(x => known[x.id]).length;
        const favTotal = (ALL[subject] || []).filter(x => fav[x.id]).length;
        document.getElementById('fcFilters').innerHTML = FILTERS.map(f => {
            const cnt = f.k === 'known' ? knownTotal : f.k === 'fav' ? favTotal : '';
            return `<button class="fc-chip ${f.k === filter ? 'on' : ''}" onclick="switchFilter('${f.k}')">${f.n}${cnt ? ' ' + cnt : ''}</button>`;
        }).join('');

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
                (filter === 'fav' ? '还没有收藏的卡片，点卡片右上角 ☆ 收藏' :
                (filter === 'new' && (ALL[subject] || []).length ? '全部都已「熟」，去「熟」筛选里回顾吧' : '该科目暂无卡片'));
            body.appendChild(tip);
            syncButtons(null);
            renderNote(null);
            renderToc();
            return;
        }

        const htmlParts = [];
        if (viewing) {
            // 查看态：小标题 + 要点 + 易错提示
            htmlParts.push(`<div class="fc-chapter">${esc(c.title)}</div>`);
            htmlParts.push('<ul class="fc-pts">' + (c.points || []).map(p =>
                `<li>${mdInline(p)}</li>`).join('') + '</ul>');
            if (c.tip) htmlParts.push(`<div class="fc-tip">易错点：${mdInline(c.tip)}</div>`);
            if (c.tables && c.tables.length) {
                // 表格多时默认只展开第一张，其余折叠，避免一屏全是表
                htmlParts.push('<div class="fc-tables">' + c.tables.map((t, ti) =>
                    `<details class="fc-tbl-item"${ti === 0 ? ' open' : ''}>`
                    + `<summary>${esc(t.sub || '重点表格')}</summary>`
                    + `<div class="fc-table">${t.html || ''}</div></details>`
                ).join('') + '</div>');
            }
            htmlParts.push('<div class="fc-hint">点击卡片收起</div>');
        } else {
            // 问题态：章节 + 考点名 + 状态小标签 + 提示
            const badge = weak[c.id] === 'u' ? '<span class="fc-badge u">不熟</span>' :
                (weak[c.id] === 'd' ? '<span class="fc-badge d">不会</span>' : '');
            const noteBadge = notes[c.id] ? '<span class="fc-badge n">有笔记</span>' : '';
            htmlParts.push(`<div class="fc-chapter">${esc([c.chapter, c.section].filter(Boolean).join(' · '))}</div>`);
            htmlParts.push(`<div class="fc-title">${esc(c.title)}${badge}${noteBadge}</div>`);
            htmlParts.push(`<div class="fc-hint">${c.tables && c.tables.length ? '点击卡片查看表格' : '点击卡片查看要点'}</div>`);
        }
        body.innerHTML = htmlParts.join('');
        syncButtons(c);
        renderNote(c);
        renderToc();
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
        buzz(10);
        // 在「未熟」队列中标记熟 → 自动移出队列（index 由 applyFilter 收敛，等效自动下一张）
        if (filter === 'new' && known[c.id]) applyFilter();
        render();
        afterMark(c);
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
        buzz(10);
        if (filter === 'known' && !known[c.id]) applyFilter();   // 从「熟」队列移除
        render();
        afterMark(c);
    }

    // 轻震动反馈（移动端支持才触发）
    function buzz(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { }
    }

    // 「标记后自动下一张」：当前列表已因筛选自动移出时不重复前进
    function afterMark(c) {
        if (!autoNext || !c) return;
        if (filter === 'new' && known[c.id]) return;
        if (filter === 'known' && !known[c.id]) return;
        go(1);
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
        // 桌面：快捷键（可在 ⚙ 设置里自定义）
        document.addEventListener('keydown', onKeyDown);
        // 鼠标侧键：3=后退 4=前进，默认会触发浏览器前进/后退，这里拦下来当快捷键
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('auxclick', e => { if (MOUSE_KEY[e.button]) e.preventDefault(); });
        // 点击卡片（鼠标或触屏）查看/收起；滑动后忽略
        document.getElementById('fcCard').addEventListener('click', () => { if (!moved) toggleView(); });
    }

    // ==================== 左侧目录 ====================
    function applyToc() {
        const toc = document.getElementById('fcToc');
        if (!toc) return;
        const open = tocOpen || tocHover;      // 固定展开 或 悬停展开
        toc.classList.toggle('open', open);
        document.body.classList.toggle('fc-toc-open', open);
        const fab = document.getElementById('fcTocFab');
        if (fab) fab.style.opacity = open ? '0' : '';
        if (open) renderToc();
    }

    function toggleToc(force) {
        tocOpen = (force === undefined) ? !tocOpen : !!force;
        writeJson(TOC_KEY, tocOpen);
        applyToc();
    }

    // 悬停左边缘 → 临时展开；鼠标离开目录 → 收起（未固定展开时）
    function bindTocHover() {
        const strip = document.getElementById('fcTocHover');
        const toc = document.getElementById('fcToc');
        if (strip) {
            strip.addEventListener('mouseenter', () => {
                if (tocOpen) return;
                tocHover = true;
                applyToc();
            });
        }
        if (toc) {
            toc.addEventListener('mouseleave', () => {
                if (!tocHover) return;
                tocHover = false;
                applyToc();
            });
        }
    }

    function renderToc() {
        const box = document.getElementById('fcTocBody');
        if (!box) return;
        const cards = ALL[subject] || [];
        const cur = list[index];
        const order = [];
        const map = new Map();
        for (const c of cards) {
            const ch = c.chapter || '未分类';
            if (!map.has(ch)) { map.set(ch, []); order.push(ch); }
            map.get(ch).push(c);
        }
        let html = '';
        for (const ch of order) {
            html += `<div class="fc-toc-chapter">${esc(ch)}</div>`;
            for (const c of map.get(ch)) {
                const on = cur && cur.id === c.id;
                // 收藏 / 有笔记 的卡片在目录里打标，收藏后条目不会消失，只是多个 ★
                const mark = ((c.tables && c.tables.length) ? '<span class="fc-toc-mark tbl">📋</span>' : '')
                    + (fav[c.id] ? '<span class="fc-toc-mark fav">★</span>' : '')
                    + (notes[c.id] ? '<span class="fc-toc-mark note">✎</span>' : '');
                html += `<button class="fc-toc-item${on ? ' on' : ''}" onclick="jumpToCard('${c.id}')">${mark}${esc(c.title)}</button>`;
            }
        }
        box.innerHTML = html || '<div class="fc-toc-empty">本科目暂无卡片</div>';
    }

    function jumpToCard(id) {
        let i = list.findIndex(x => x.id === id);
        if (i < 0 && filter !== 'all') {
            filter = 'all';
            writeJson(FILTER_KEY, filter);
            applyFilter();
            i = list.findIndex(x => x.id === id);
        }
        if (i < 0) return;
        index = i;
        viewing = false;
        savePos();
        render();
        if (window.innerWidth <= 900) toggleToc(false);   // 手机跳转后收起，别挡内容
    }

    // ==================== 自建笔记 ====================
    function renderNote(c) {
        const wrap = document.getElementById('fcNoteWrap');
        const box = document.getElementById('fcNote');
        const state = document.getElementById('fcNoteState');
        if (!wrap || !box) return;
        if (!c) { wrap.style.display = 'none'; noteCardId = null; return; }
        wrap.style.display = '';
        // 换了卡就重新装载（哪怕正在输入），避免把上一张的笔记带到下一张
        if (!noteDirty || noteCardId !== c.id) {
            box.value = notes[c.id] || '';
            noteDirty = false;
            noteCardId = c.id;
        }
        if (state) state.textContent = notes[c.id] ? '已保存' : '';
    }

    function saveNote() {
        const c = list[index];
        const box = document.getElementById('fcNote');
        if (!c || !box) return;
        noteDirty = true;
        noteCardId = c.id;
        const v = box.value;
        if (v) notes[c.id] = v; else delete notes[c.id];
        writeJson(NOTE_KEY, notes);
        document.getElementById('fcNoteState').textContent = v ? '已保存' : '';
        renderToc();      // 刷新「有笔记」角标
    }

    function clearNote() {
        const c = list[index];
        if (!c) return;
        delete notes[c.id];
        writeJson(NOTE_KEY, notes);
        document.getElementById('fcNote').value = '';
        document.getElementById('fcNoteState').textContent = '';
        render();
    }

    function bindNote() {
        const box = document.getElementById('fcNote');
        if (!box) return;
        box.addEventListener('input', saveNote);
        box.addEventListener('blur', () => { noteDirty = false; });
        // 切题时若正聚焦在输入框，先失焦再走切题逻辑，避免丢字
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.blur(); nextCard(); }
        });
    }

    // ==================== 快捷键设置 ====================
    function normKey(k) {
        if (k === ' ' || k === 'Spacebar') return ' ';
        const s = String(k == null ? '' : k);
        return s.length === 1 ? s.toLowerCase() : s;
    }

    function keyLabel(k) {
        if (!k) return '未设置';
        const map = {
            ' ': '空格', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
            Enter: '回车', Escape: 'Esc', Backspace: '退格', Tab: 'Tab',
            Mouse4: '侧键·后退', Mouse5: '侧键·前进'
        };
        return map[k] || (k.length === 1 ? k.toUpperCase() : k);
    }

    function onKeyDown(e) {
        if (capturing) return;                       // 录制中由 startCapture 处理
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;  // 不抢浏览器快捷键
        if (e.key === 'Escape' && !document.getElementById('fcModal').hidden) { closeCardSettings(); return; }
        const k = normKey(e.key);
        const hit = KEY_ACTIONS.find(a => keys[a.act] && normKey(keys[a.act]) === k);
        if (hit) { e.preventDefault(); hit.run(); return; }
        // 回车：未被占用时仍可查看要点（默认行为）
        if (e.key === 'Enter' && !Object.values(keys).some(v => v && normKey(v) === 'Enter')) {
            e.preventDefault(); toggleView();
        }
    }

    function onMouseDown(e) {
        const mk = MOUSE_KEY[e.button];
        if (!mk) return;
        e.preventDefault();                  // 阻止浏览器后退/前进
        if (capturing) return;               // 录制中交给 startCapture
        const hit = KEY_ACTIONS.find(a => keys[a.act] && normKey(keys[a.act]) === mk);
        if (hit) hit.run();
    }

    function openCardSettings() {
        renderSettings();
        document.getElementById('fcModal').hidden = false;
        document.body.classList.add('fc-modal-open');
    }

    function closeCardSettings() {
        capturing = null;
        document.getElementById('fcModal').hidden = true;
        document.body.classList.remove('fc-modal-open');
    }

    function renderSettings() {
        const body = document.getElementById('fcSettingsBody');
        if (!body) return;
        const rows = KEY_ACTIONS.map(a => {
            const k = keys[a.act];
            const rec = capturing === a.act;
            return `<div class="fc-set-row">
                <span class="fc-set-name">${a.name}</span>
                <button class="fc-key ${rec ? 'recording' : ''} ${k ? '' : 'empty'}" onclick="startCapture('${a.act}')">${rec ? '请按键…' : keyLabel(k)}</button>
            </div>`;
        }).join('');
        body.innerHTML = rows + `
            <div class="fc-set-row">
                <span class="fc-set-name">标记后自动下一张</span>
                <button class="fc-switch ${autoNext ? 'on' : ''}" onclick="toggleAutoNext()" aria-pressed="${autoNext}"><span></span></button>
            </div>
            <div class="fc-set-hint">点右侧按键即可重新绑定（支持鼠标侧键），按 Esc 取消。快捷键只在电脑端生效；手机用左右滑动 + 底部按钮。</div>`;
    }

    function startCapture(act) {
        capturing = act;
        renderSettings();

        function finish(k) {
            document.removeEventListener('keydown', handler, true);
            document.removeEventListener('mousedown', mhandler, true);
            if (!k) { capturing = null; renderSettings(); return; }
            for (const a of KEY_ACTIONS) if (a.act !== act && normKey(keys[a.act]) === k) keys[a.act] = '';
            keys[act] = k;
            writeJson(KEYS_KEY, keys);
            capturing = null;
            renderSettings();
        }
        function handler(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            finish(ev.key === 'Escape' ? '' : normKey(ev.key));
        }
        function mhandler(ev) {
            const mk = MOUSE_KEY[ev.button];
            if (!mk) return;                  // 只认侧键，左/右键不参与绑定
            ev.preventDefault();
            ev.stopPropagation();
            finish(mk);
        }
        document.addEventListener('keydown', handler, true);
        document.addEventListener('mousedown', mhandler, true);
    }

    function resetCardKeys() {
        keys = Object.assign({}, DEFAULT_KEYS);
        writeJson(KEYS_KEY, keys);
        capturing = null;
        renderSettings();
    }

    function toggleAutoNext() {
        autoNext = !autoNext;
        writeJson(AUTONEXT_KEY, !!autoNext);
        renderSettings();
    }

    window.toggleView = toggleView;
    window.nextCard = nextCard;
    window.prevCard = prevCard;
    window.toggleKnown = toggleKnown;
    window.toggleFav = toggleFav;
    window.toggleWeak = toggleWeak;
    window.switchSubject = switchSubject;
    window.switchFilter = switchFilter;
    window.openCardSettings = openCardSettings;
    window.closeCardSettings = closeCardSettings;
    window.startCapture = startCapture;
    window.resetCardKeys = resetCardKeys;
    window.toggleAutoNext = toggleAutoNext;
    window.toggleToc = toggleToc;
    window.clearNote = clearNote;
    window.jumpToCard = jumpToCard;
    window.Cards = { load, get state() { return { subject, filter, index, total: list.length, known, fav, weak, keys, autoNext }; } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
})();
