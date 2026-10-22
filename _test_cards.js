// 记忆卡（cards.html + js/cards.js）回归：
//   1) 数据：cards.json 四门各有卡片，字段完整（id/title/points）
//   2) 渲染：正面出考点名与进度；点击卡片查看要点（无 3D 翻面）
//   3) 右上角：熟（熟了不再加入记忆队列）/ 收藏
//   4) 底部：不熟 / 不会（互斥，标记时清掉「熟」）
//   5) 切题：下一张/上一张更新进度；四组切换；筛选（全部/未熟/熟）
//   6) 移动端适配：viewport-fit=cover、底部固定操作栏、安全区内边距、48px 触控区、窄屏 media 查询
// 用法：NODE_PATH=<workspace>/node_modules node _test_cards.js
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom（NODE_PATH=<workspace>/node_modules）'); process.exit(0); }

const ROOT = __dirname;
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa', 'data', 'cards.json'), 'utf8'));
const CSS = fs.readFileSync(path.join(ROOT, 'pwa', 'css', 'style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}

console.log('--- 数据：cards.json ---');
const SUBS = ['ds', 'os', 'cn', 'co'];
check('四门科目都有卡片组', SUBS.every(s => (CARDS.cards[s] || []).length > 0), true);
for (const s of SUBS) {
    const cs = CARDS.cards[s];
    check(`${s} 卡片字段完整`, cs.every(c => c.id && c.title && (c.points || []).length > 0), true);
}
console.log('   卡片数：' + SUBS.map(s => `${s}=${CARDS.cards[s].length}`).join(' / '));

// ---- 页面 ----
let html = fs.readFileSync(path.join(ROOT, 'pwa', 'cards.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
});
check('页面 viewport 含 viewport-fit=cover', /viewport-fit=cover/.test(html), true);
check('卡片为单面结构（无 fc-face 双面/翻转）', !/fc-face|fc-back|fc-front|flipCard|翻转/.test(html), true);
check('右上角有「熟」按钮', /id="fcKnownBtn"/.test(html), true);
check('右上角有「收藏」按钮', /id="fcFavBtn"/.test(html), true);
check('底部有不熟/不会按钮', /fcWeakUBtn/.test(html) && /fcWeakDBtn/.test(html), true);

const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/cards.html',
    beforeParse(w) {
        w.alert = () => { };
        w.confirm = () => true;
        w.fetch = async (u) => {
            if (String(u).includes('cards.json')) return { ok: true, status: 200, json: async () => CARDS };
            return { ok: true, status: 200, json: async () => ({}) };
        };
    }
});
const w = dom.window;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = sel => w.document.querySelector(sel);

(async () => {
    await sleep(600);
    console.log('\n--- 渲染与「点击查看」 ---');
    check('科目 chips 渲染（四组）', w.document.querySelectorAll('#fcSubjects .fc-chip').length, 4);
    check('正面渲染考点名', /\S/.test($('#fcBody').textContent || ''), true);
    check('进度显示 1 / 总数', /^1 \/ \d+$/.test($('#fcCount').textContent.trim()), true);
    check('初始为问题态（未查看要点）', !/点击卡片收起/.test($('#fcBody').textContent), true);

    w.toggleView();
    check('点击查看后渲染要点列表', w.document.querySelectorAll('#fcBody li').length > 0, true);
    check('查看态含易错提示容器', !!$('#fcBody .fc-tip') || !!$('#fcBody .fc-hint'), true);
    w.toggleView();
    check('再点回到问题态', /点击卡片查看要点/.test($('#fcBody').textContent), true);

    const n1 = $('#fcCount').textContent;
    w.nextCard();
    check('下一张进度变化', $('#fcCount').textContent !== n1, true);
    check('切题后回到问题态', !/点击卡片收起/.test($('#fcBody').textContent), true);
    w.prevCard();
    check('上一张回到原进度', $('#fcCount').textContent, n1);

    console.log('\n--- 右上角：熟 / 收藏 ---');
    const knownBtn = $('#fcKnownBtn');
    const favBtn = $('#fcFavBtn');
    check('右上角有 2 个角标按钮', w.document.querySelectorAll('.fc-corner-btn').length, 2);
    w.toggleKnown();
    let knownMap = JSON.parse(w.localStorage.getItem('cards_known_v1') || '{}');
    check('标记「熟」写入 localStorage', Object.keys(knownMap).length, 1);
    check('熟按钮激活态', knownBtn.classList.contains('known'), true);
    check('熟按钮文案变化', knownBtn.textContent, '熟 ✓');

    w.switchFilter('known');
    check('筛选「熟」只剩 1 张', $('#fcCount').textContent.trim().endsWith('/ 1'), true);
    w.switchFilter('all');

    w.toggleFav();
    const favMap = JSON.parse(w.localStorage.getItem('cards_fav_v1') || '{}');
    check('收藏写入 localStorage', Object.keys(favMap).length, 1);
    check('收藏按钮激活态', favBtn.classList.contains('fav'), true);
    check('收藏按钮文案变化', favBtn.textContent, '★ 已收藏');
    w.toggleFav();
    check('再点取消收藏', !favBtn.classList.contains('fav'), true);

    console.log('\n--- 底部：不熟 / 不会（互斥） ---');
    const uBtn = $('#fcWeakUBtn');
    const dBtn = $('#fcWeakDBtn');
    check('底部操作按钮 4 个', w.document.querySelectorAll('.fc-actions .fc-btn').length, 4);
    w.toggleWeak('u');
    let weakMap = JSON.parse(w.localStorage.getItem('cards_weak_v1') || '{}');
    check('标记「不熟」写入 localStorage', weakMap[Object.keys(weakMap)[0]], 'u');
    check('不熟按钮激活态（橙）', uBtn.classList.contains('on-u'), true);
    check('标记不熟后「熟」被清除（互斥）', Object.keys(knownMap).length >= 0 ? (JSON.parse(w.localStorage.getItem('cards_known_v1') || '{}') || {})[Object.keys(weakMap)[0]] : true, undefined);
    w.toggleWeak('d');
    weakMap = JSON.parse(w.localStorage.getItem('cards_weak_v1') || '{}');
    check('「不会」顶掉「不熟」（互斥）', weakMap[Object.keys(weakMap)[0]], 'd');
    check('不会按钮激活态（红）', dBtn.classList.contains('on-d'), true);
    check('不熟按钮取消激活', !uBtn.classList.contains('on-u'), true);
    check('问题态标题带「不会」小标签', /fc-badge d/.test($('#fcBody').innerHTML), true);
    w.toggleWeak('d');
    check('再点取消标记', Object.keys(JSON.parse(w.localStorage.getItem('cards_weak_v1') || '{}')).length, 0);

    console.log('\n--- 熟了不再加入记忆队列 ---');
    // 切到「未熟」筛选并切到第 2 张，标记熟 → 当前卡自动移出队列（总数减 1 且换到下一张）
    w.switchFilter('new');
    const totalNew = parseInt($('#fcCount').textContent.trim().split('/')[1], 10);
    w.nextCard();
    const posBefore = $('#fcCount').textContent.trim();
    w.toggleKnown();
    const totalAfter = parseInt($('#fcCount').textContent.trim().split('/')[1], 10);
    check('标记熟后「未熟」队列少 1 张', totalAfter, totalNew - 1);
    check('标记熟后自动切到下一张', $('#fcCount').textContent.trim() !== posBefore, true);
    w.switchFilter('all');

    console.log('\n--- 四组切换 ---');
    const before = $('#fcCount').textContent;
    w.switchSubject('os');
    check('切到操作系统', $('#fcSubjects .fc-chip.on').textContent.indexOf('操作系统') >= 0, true);
    check('切换后进度重置为第 1 张', /^1 \/ \d+$/.test($('#fcCount').textContent.trim()), true);
    check('切换后总数变化', $('#fcCount').textContent !== before, true);
    check('科目偏好已持久化', JSON.parse(w.localStorage.getItem('cards_subj_v1') || '""'), 'os');

    console.log('\n--- 移动端适配（样式静态检查） ---');
    check('底部操作栏固定定位', /\.fc-actions\s*\{[^}]*position:\s*fixed/.test(CSS), true);
    check('按钮触控区 ≥48px', /\.fc-btn\s*\{[^}]*min-height:\s*48px/.test(CSS), true);
    check('iOS 安全区内边距', /env\(safe-area-inset-bottom\)/.test(CSS), true);
    check('窄屏 media 查询（≤600px）', /@media\s*\(max-width:\s*600px\)/.test(CSS), true);
    check('矮屏 media 查询（横屏）', /@media\s*\(max-height:\s*520px\)/.test(CSS), true);
    check('禁用横向溢出', /\.fc-page\s*\{[^}]*overflow-x:\s*hidden/.test(CSS), true);
    check('卡片区随视口（vh 单位）', /\.fc-card\s*\{[^}]*min-height:\s*\d+vh/.test(CSS), true);
    check('角标绝对定位于卡片右上角', /\.fc-corner\s*\{[^}]*position:\s*absolute/.test(CSS), true);
    check('不熟按钮橙语义色', /\.fc-btn\.on-u\s*\{[^}]*rgba\(234,\s*88,\s*12/.test(CSS), true);
    check('不会按钮红语义色', /\.fc-btn\.on-d\s*\{[^}]*rgba\(220,\s*38,\s*38/.test(CSS), true);
    check('页面有底部操作栏元素', !!$('.fc-actions'), true);

    console.log('\n--- 设置面板：自定义快捷键 ---');
    check('进度行有设置按钮', !!$('#fcGear'), true);
    check('页面有设置面板', !!$('#fcModal'), true);
    check('面板默认隐藏', $('#fcModal').hidden, true);
    w.openCardSettings();
    check('打开后可见', $('#fcModal').hidden, false);
    const rows = w.document.querySelectorAll('#fcSettingsBody .fc-set-row');
    check('7 个动作 + 1 个开关行', rows.length, 8);
    const keyBtns = [...w.document.querySelectorAll('#fcSettingsBody .fc-key')];
    check('7 个快捷键按钮', keyBtns.length, 7);
    check('默认「上一张」显示 ←', keyBtns[0].textContent.trim(), '←');
    check('默认「下一张」显示 →', keyBtns[1].textContent.trim(), '→');
    check('默认「查看」显示 空格', keyBtns[2].textContent.trim(), '空格');
    check('默认「熟」显示 K', keyBtns[3].textContent.trim(), 'K');

    // 录制：把「下一张」改成 J
    w.startCapture('next');
    check('录制态提示', [...w.document.querySelectorAll('#fcSettingsBody .fc-key')][1].textContent.trim(), '请按键…');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    const savedKeys = JSON.parse(w.localStorage.getItem('cards_keys_v1') || '{}');
    check('新键已持久化', savedKeys.next, 'j');
    check('新键已显示', [...w.document.querySelectorAll('#fcSettingsBody .fc-key')][1].textContent.trim(), 'J');
    check('按 J 会切到下一张', (() => {
        const before = $('#fcCount').textContent.trim();
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'j', bubbles: true }));
        return $('#fcCount').textContent.trim() !== before;
    })(), true);

    // 冲突：把「上一张」也绑到 J → 「下一张」应被清空
    w.startCapture('prev');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    const conflict = JSON.parse(w.localStorage.getItem('cards_keys_v1') || '{}');
    check('冲突时旧动作被清空', conflict.next, '');
    check('新动作生效', conflict.prev, 'j');

    // 恢复默认
    w.resetCardKeys();
    const defKeys = JSON.parse(w.localStorage.getItem('cards_keys_v1') || '{}');
    check('恢复默认 → next', defKeys.next, 'ArrowRight');
    check('恢复默认 → known', defKeys.known, 'k');

    // 自动下一张开关
    check('自动下一张默认关', $('#fcSettingsBody .fc-switch').classList.contains('on'), false);
    w.toggleAutoNext();
    check('开启后持久化', JSON.parse(w.localStorage.getItem('cards_autonext_v1') || 'false'), true);
    check('开关呈 on 态', $('#fcSettingsBody .fc-switch').classList.contains('on'), true);
    w.toggleAutoNext();
    check('关闭后持久化', JSON.parse(w.localStorage.getItem('cards_autonext_v1') || 'true'), false);

    // Esc 关闭
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Esc 关闭面板', $('#fcModal').hidden, true);

    console.log('\n--- 设置面板 / 移动端样式 ---');
    check('设置按钮有触控尺寸', /\.fc-gear\s*\{[^}]*width:\s*28px/.test(CSS), true);
    check('移动端面板为底部抽屉', /@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.fc-modal\s*\{\s*align-items:\s*flex-end/.test(CSS.replace(/\s+/g, ' ')), true);
    check('面板打开时锁滚动', /body\.fc-modal-open\s*\{\s*overflow:\s*hidden/.test(CSS), true);
    check('卡片区 touch-action 交给脚本', /\.fc-stage\s*\{[^}]*touch-action:\s*pan-y/.test(CSS), true);
    check('按钮去点击延迟', /touch-action:\s*manipulation/.test(CSS), true);
    check('深色模式适配设置面板', /\.dark\s+\.fc-modal-panel/.test(CSS), true);

    console.log('\n--- 重点标红 ---');
    w.switchFilter('all');
    w.toggleView();
    const emCount = w.document.querySelectorAll('#fcBody .fc-em').length;
    check('查看态渲染出红色重点', emCount > 0, true);
    check('正文无 ** 标记残留', !/\*\*/.test($('#fcBody').textContent), true);
    w.toggleView();
    const markedCards = ['ds', 'os', 'cn', 'co'].reduce((n, s) =>
        n + (CARDS.cards[s] || []).filter(c => (c.points || []).some(p => p.includes('**'))).length, 0);
    check('cards.json 含重点标记的卡片 > 200', markedCards > 200, true);

    console.log('\n--- 鼠标侧键 ---');
    w.openCardSettings();
    w.startCapture('prev');
    w.document.dispatchEvent(new w.MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true }));
    check('侧键可绑定到动作', JSON.parse(w.localStorage.getItem('cards_keys_v1') || '{}').prev, 'Mouse4');
    check('面板显示侧键标签', /侧键/.test(w.document.getElementById('fcSettingsBody').textContent), true);
    w.resetCardKeys();
    // 用默认键位测触发：把「下一张」绑到前进侧键
    w.startCapture('next');
    w.document.dispatchEvent(new w.MouseEvent('mousedown', { button: 4, bubbles: true, cancelable: true }));
    check('前进侧键绑定成功', JSON.parse(w.localStorage.getItem('cards_keys_v1') || '{}').next, 'Mouse5');
    w.closeCardSettings();
    const cBefore = $('#fcCount').textContent;
    w.document.dispatchEvent(new w.MouseEvent('mousedown', { button: 4, bubbles: true, cancelable: true }));
    check('按前进侧键触发下一张', $('#fcCount').textContent !== cBefore, true);
    w.resetCardKeys();

    console.log('\n--- 左侧目录 ---');
    check('页面有目录容器', !!$('#fcToc'), true);
    check('收起时有浮动入口', !!$('#fcTocFab'), true);
    const subjNow = w.Cards.state.subject;
    w.toggleToc(true);
    const items = w.document.querySelectorAll('#fcTocBody .fc-toc-item');
    check('目录条目数 = 本科目卡片数', items.length, (CARDS.cards[subjNow] || []).length);
    const chapters = w.document.querySelectorAll('#fcTocBody .fc-toc-chapter');
    check('目录按章分组', chapters.length > 0, true);
    const target = (CARDS.cards[subjNow] || [])[4];
    w.jumpToCard(target.id);
    const wantIdx = (CARDS.cards[subjNow] || []).findIndex(c => c.id === target.id);
    check('点目录跳到对应卡', w.Cards.state.index, wantIdx);
    check('当前项高亮', !!$('#fcTocBody .fc-toc-item.on'), true);
    w.toggleToc(false);
    check('收起状态持久化', JSON.parse(w.localStorage.getItem('cards_toc_v1') || 'true'), false);
    check('收起后移除 fc-toc-open', w.document.body.classList.contains('fc-toc-open'), false);
    w.toggleToc(true);
    check('展开后加 fc-toc-open', w.document.body.classList.contains('fc-toc-open'), true);

    console.log('\n--- 目录/标红样式 ---');
    check('CSS 半透明目录', CSS.includes('.fc-toc') && CSS.includes('rgba(var(--card-rgb)'), true);
    check('CSS 毛玻璃', CSS.includes('backdrop-filter: blur'), true);
    check('CSS 收起位移', CSS.includes('transform: translateX(-100%)'), true);
    check('CSS 展开复位', CSS.includes('.fc-toc.open') && CSS.includes('transform: none'), true);
    check('CSS 重点标红', CSS.includes('.fc-em') && CSS.includes('color: var(--danger)'), true);

    console.log(`\nPASS ${pass} / FAIL ${fail}`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
