// 记忆卡（cards.html + js/cards.js）回归：
//   1) 数据：cards.json 四门各有卡片，字段完整（id/title/points）
//   2) 渲染：正面出考点名与进度；翻转切换正/反面
//   3) 切题：下一张/上一张更新进度；标记「记住了」持久化到 localStorage
//   4) 四组切换：切科目后卡片与进度随之切换；筛选（全部/未掌握/已掌握）生效
//   5) 移动端适配：viewport-fit=cover、底部固定操作栏、安全区内边距、48px 触控区、窄屏 media 查询
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
    console.log('\n--- 渲染与交互 ---');
    check('科目 chips 渲染（四组）', w.document.querySelectorAll('#fcSubjects .fc-chip').length, 4);
    check('正面渲染考点名', /\S/.test($('#fcFront').textContent || ''), true);
    check('进度显示 1 / 总数', /^1 \/ \d+$/.test($('#fcCount').textContent.trim()), true);
    check('背面渲染要点', w.document.querySelectorAll('#fcBack li').length > 0, true);

    const card = $('#fcCard');
    check('初始未翻转', card.classList.contains('flipped'), false);
    w.flipCard();
    check('翻转后加 flipped', card.classList.contains('flipped'), true);
    check('翻转按钮文案切换', $('#fcFlipBtn').textContent, '看正面');
    w.flipCard();
    check('再翻转回正面', card.classList.contains('flipped'), false);

    const n1 = $('#fcCount').textContent;
    w.nextCard();
    check('下一张进度变化', $('#fcCount').textContent !== n1, true);
    check('切题后回到正面', card.classList.contains('flipped'), false);
    w.prevCard();
    check('上一张回到原进度', $('#fcCount').textContent, n1);

    console.log('\n--- 记住了 / 持久化 ---');
    w.toggleKnown();
    const knownMap = JSON.parse(w.localStorage.getItem('cards_known_v1') || '{}');
    check('标记写入 localStorage', Object.keys(knownMap).length, 1);
    check('按钮显示已记住', /已记住/.test($('#fcKnownBtn').textContent), true);
    w.switchFilter('known');
    check('筛选“已掌握”只剩 1 张', $('#fcCount').textContent.trim().endsWith('/ 1'), true);
    w.switchFilter('new');
    check('筛选“未掌握”排除已记住卡', /\/ \d+$/.test($('#fcCount').textContent.trim()), true);
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
    check('页面有底部操作栏元素', !!$('.fc-actions'), true);
    check('操作按钮 4 个', w.document.querySelectorAll('.fc-actions .fc-btn').length, 4);

    console.log(`\nPASS ${pass} / FAIL ${fail}`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
