// 2017-2026 真题「题目 / 答案」内容与排版回归（2026-11-11）
//
// 审计发现并修复的 5 类问题：
//  ① 2026-2 四个代码块选项因旧 OPT_RE 不容忍缩进而全部漏拆（题干变一整段、无法作答）；
//  ② 2026 五题答案页字母与 meta/解析冲突，被误写进 ans 字段（页面同时显示两个答案）；
//  ③ 2021-42 源 meta 记 6 分（卷面 8 分），全卷只有 148 分；
//  ④ 题图 13 处 <img> 指向 408os.cn 静态资源/相对路径，PWA 里 404；
//  ⑤ 2010-3 / 2017-8 题干多余 </div> 会提前关掉题卡容器。
// 全部修复写在构建期（tools/build_zt.py），本测试锁死产物与前端配套。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_audit_17_26.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const papers = {};
for (let y = 2017; y <= 2026; y++) papers[y] = JSON.parse(read(`pwa/data/zt/zt_${y}.json`));
const years = Object.keys(papers).map(Number);
const allItems = years.flatMap(y => papers[y].items.map(it => ({ y, it })));
const fieldsOf = it => [it.q || '', it.an || '', ...(it.o || [])];

console.log('--- 一、卷面结构 ---');
check('17-26 十年齐全', [years.length, years[0], years[years.length - 1]], [10, 2017, 2026]);
check('每年 47 题且题号 1..47 连续', years.filter(y =>
    papers[y].n !== 47 || papers[y].items.length !== 47 ||
    papers[y].items.some((it, k) => it.i !== k + 1)), []);
check('每年总分 150', years.filter(y => papers[y].items.reduce((n, it) => n + it.s, 0) !== 150), []);
check('每年选择题 40 道 × 2 分 = 80', years.filter(y =>
    papers[y].items.slice(0, 40).reduce((n, it) => n + it.s, 0) !== 80), []);
check('每年大题 7 道合计 70 分', years.filter(y =>
    papers[y].items.slice(40).reduce((n, it) => n + it.s, 0) !== 70), []);
check('2021-42 分值 8（源 meta 误记 6）', papers[2021].items.find(x => x.i === 42).s, 8);

console.log('\n--- 二、题目与答案字段 ---');
const choice = allItems.filter(({ it }) => it.i <= 40);
const big = allItems.filter(({ it }) => it.i > 40);
check('选择题一律 4 个选项且非空', choice.filter(({ it }) =>
    (it.o || []).length !== 4 || (it.o || []).some(o => !o.trim())).map(({ y, it }) => `${y}-${it.i}`), []);
check('选择题答案均为 A-D', choice.filter(({ it }) => !'ABCD'.includes(it.a)).map(({ y, it }) => `${y}-${it.i}`), []);
check('题干与解析均非空', allItems.filter(({ it }) => !it.q.trim() || !it.an.trim()).map(({ y, it }) => `${y}-${it.i}`), []);
check('大题无选项、无字母答案', big.filter(({ it }) => (it.o || []).length || it.a).map(({ y, it }) => `${y}-${it.i}`), []);
check('全库无「正确答案：X」混入 ans 字段', allItems.filter(({ it }) => /正确答案/.test(it.ans || '')).map(({ y, it }) => `${y}-${it.i}`), []);
check('题干不残留未拆出的 option 块', choice.filter(({ it }) => it.q.includes('class="option"')).map(({ y, it }) => `${y}-${it.i}`), []);

console.log('\n--- 三、本轮定点修复 ---');
const q2 = papers[2026].items.find(x => x.i === 2);
check('2026-2 拆出 4 个代码块选项', q2.o.length, 4);
check('2026-2 每个选项都是 <pre><code>', q2.o.every(o => /^<pre><code>/.test(o)), true);
check('2026-2 题干只剩引导段', /<div class="option">|<pre>/.test(q2.q), false);
check('2026-2 答案 D 与解析一致', [q2.a, /✅\s*D/.test(q2.an)], ['D', true]);
const conflict = [11, 17, 20, 29, 37];
check('2026 五题不再带冲突 ans', conflict.filter(i => 'ans' in papers[2026].items.find(x => x.i === i)), []);
check('2026 五题 a 与解析结论一致', conflict.filter(i => {
    const it = papers[2026].items.find(x => x.i === i);
    const m = (it.an.match(/选择\s*([A-D])/) || [])[1];
    return m !== it.a;
}), []);

console.log('\n--- 四、排版结构 ---');
const divBad = allItems.filter(({ it }) => fieldsOf(it).some(v => {
    const a = (v.match(/<div\b/gi) || []).length, b = (v.match(/<\/div>/gi) || []).length;
    return a !== b;
})).map(({ y, it }) => `${y}-${it.i}`);
check('题干/解析/选项 <div> 开闭配平', divBad, []);
check('无残留内联 <svg>', allItems.filter(({ it }) => fieldsOf(it).some(v => /<svg/i.test(v))).length, 0);
check('无残留 <pre style=...> / display:flex', allItems.filter(({ it }) =>
    fieldsOf(it).some(v => /<pre\s+[^>]*>/i.test(v) || /display:\s*flex/i.test(v))).length, 0);
check('无 >100% 宽度', allItems.filter(({ it }) => fieldsOf(it).some(v =>
    (v.match(/width:\s*(\d+(?:\.\d+)?)%/g) || []).some(s => parseFloat(s.match(/[\d.]+/)[0]) > 100))).length, 0);

console.log('\n--- 五、外链题图本地化 ---');
const imgRefs = new Set();
allItems.forEach(({ it }) => fieldsOf(it).forEach(v =>
    (v.match(/<img[^>]+src="([^"]+)"/g) || []).forEach(tag => imgRefs.add(tag.match(/src="([^"]+)"/)[1]))));
check('17-26 共 6 处配图引用', imgRefs.size, 6);
check('配图全部指向本地 data/zt_img/', [...imgRefs].filter(s => !s.startsWith('data/zt_img/')), []);
check('引用的本地图片文件全部存在', [...imgRefs].filter(s => !fs.existsSync(path.join(ROOT, 'pwa', s))), []);
const svgRefs = new Set();
allItems.forEach(({ it }) => fieldsOf(it).forEach(v =>
    (v.match(/data-svg="([^"]+)"/g) || []).forEach(tag => svgRefs.add(tag.match(/"([^"]+)"/)[1]))));
check('题图 SVG 引用全部存在', [...svgRefs].filter(s => !fs.existsSync(path.join(ROOT, 'pwa/data/zt_svg', s + '.svg'))), []);

console.log('\n--- 六、构建期与前端配套 ---');
const BUILD = read('tools/build_zt.py');
const SW = read('pwa/sw.js');
const CSS = read('pwa/css/style.css');
const ZTJS = read('pwa/js/zhenti.js');
check('构建期分值修正含 2021-42', /SCORE_FIX = \{\(2021, 42\): 8/.test(BUILD), true);
check('构建期过滤纯字母答案页', /ANS_PAGE_LETTER/.test(BUILD) && /not ANS_PAGE_LETTER\.match\(ans_txt\)/.test(BUILD), true);
check('OPT_RE 容忍选项块内缩进', /<div class="option">\\s\*<span class="opt-label">/.test(BUILD), true);
check('选项按匹配区间移除（不再重建字符串 replace）', /OPT_RE\.finditer\(content\)/.test(BUILD), true);
check('题干多余 </div> 在 SVG 外置后配平', /def balance_div\(body\):/.test(BUILD) && /stem = balance_div\(stem\)/.test(BUILD), true);
check('外链图改写有映射表', /IMG_MAP = \{/.test(BUILD) && /def rewrite_img_src/.test(BUILD), true);
check('extract_content 按 div 配平决定是否剥离', /if closes > opens:/.test(BUILD), true);
check('SW 懒缓存纳入 data/zt_img/', /'data\/zt_img\/'/.test(SW), true);
check('CSS 代码型选项整行 + pre 样式', /\.zt-page \.option-item\.opt-code \{ grid-column: 1 \/ -1/.test(CSS) && /\.zt-page \.option-text pre \{/.test(CSS), true);
check('zhenti.js 给代码块选项加 opt-code', /if \(\/<pre\\b\/i\.test\(text\)\) cls \+= ' opt-code'/.test(ZTJS), true);

console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
