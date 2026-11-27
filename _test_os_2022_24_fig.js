// OS 1.5 新增内联图回归（2026-11-27）
//
// 背景：2022 统考真题 os_0084「OS 初始化创建什么」四个选项分别是四张表的创建时机，
// 题库 2452 题均无题内配图，笔记 1.5 原先只有「引导四段接力」图，没有选项辨析图。
// 本次在 1.5 节 boot-fig 之后插一张 figure.struct-fig.init-fig。
//
// 本测试守住：
//   ① 图挂在 1.5 节、紧跟 boot-fig 之后（不破坏 boot-fig「前面是 </p>」的既有断言）
//   ② 图自洽：四个选项都有、答案 A 明确、无 HTML 标签、viewBox 680×470
//   ③ 所有文字有内联 fill/font-size —— lightbox 与 figs.html 序列化后拿不到页面 CSS
//   ④ 不新增可批注行（data-fig + 不插裸 p/li），已有行号/批注不错位
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_os_2022_24_fig.js
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const ROOT = __dirname;
const RAW = fs.readFileSync(path.join(ROOT, 'pwa/data/notes/os_notes.json'), 'utf8');
const notes = JSON.parse(RAW);
const sec = notes.chapters[0].sections.find(s => s.section === '1.5 操作系统引导');
const H = sec.html;
const m = /<figure class="struct-fig init-fig" data-fig="2">([\s\S]*?)<\/figure>/.exec(H);

console.log('--- 一、挂载位置 ---');
check('1.5 节存在新图', !!m, true);
const svg = m ? m[1] : '';
const bootIdx = H.indexOf('<figure class="struct-fig boot-fig" data-fig="1">');
const initIdx = H.indexOf('<figure class="struct-fig init-fig" data-fig="2">');
check('新图在 boot-fig 之后', bootIdx > 0 && initIdx > bootIdx, true);
check('boot-fig 前仍是 </p>（不破坏既有断言）', H.slice(0, bootIdx).trimEnd().endsWith('</p>'), true);
check('新图后紧跟 h4，不吞后续正文', /<\/figure><h4>/.test(H.slice(initIdx)), true);
check('新图带 data-fig（不参与行号）', /^<figure class="struct-fig init-fig" data-fig="2">/.test(H.slice(initIdx)), true);

console.log('--- 二、图内容 ---');
check('class 是 figure 首属性（figs.html 识别要求）', /<figure class="struct-fig/.test(H.slice(initIdx)), true);
check('viewBox 贴近 680×470', /viewBox="0 0 680 470"/.test(svg), true);
for (const opt of ['中断向量表', '根目录 [B]', '硬盘分区表', '索引结点表'])
  check('图里点名选项 ' + opt, svg.includes(opt), true);
check('答案 A 写在图里', /答案 A：中断向量表由操作系统初始化创建/.test(svg), true);
check('易错行写明 B/C/D 的创建时机', /根目录 \/ 索引结点表在格式化时建/.test(svg), true);
check('四段接力顺序完整', ['BIOS', 'MBR', 'PBR', '内核初始化'].every(x => svg.includes('>' + x + '<')), true);
check('SVG 无 HTML 标签', /<(?:b|br|div|p|strong|i)\b/i.test(svg), false);
check('SVG 只含 svg 内的 rect/line/text/path/marker/defs',
  [...svg.matchAll(/<([a-zA-Z]+)/g)].map(x => x[1]).every(t => ['svg', 'defs', 'marker', 'path', 'rect', 'text', 'line'].includes(t)), true);

console.log('--- 三、放大层自洽（无页面 CSS） ---');
const texts = [...svg.matchAll(/<text\b[^>]*>/g)].map(x => x[0]);
check('文字数 20', texts.length, 20);
check('每个 text 都有内联 fill', texts.every(t => /fill:/.test(t)), true);
check('每个 text 都有内联 font-size', texts.every(t => /font-size:\d+(?:\.\d+)?px/.test(t)), true);
check('字号均 ≥11px', texts.every(t => Number(/font-size:([\d.]+)px/.exec(t)[1]) >= 11), true);
check('rect 有内联 fill（暗色下不跟随主题）',
  [...svg.matchAll(/<rect\b[^>]*>/g)].every(r => /fill:/.test(r[0])), true);
check('marker 箭头有独立 id（不与 boot-fig 冲突）', svg.includes('id="ixArrowA"') && svg.includes('id="ixArrowB"'), true);

console.log('--- 四、行号护栏 ---');
const lines = (H.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).filter(t => !/^<p\b[^>]*data-fig/.test(t)).length
  + (H.match(/<li\b[^>]*>/g) || []).length;
check('1.5 节静态可批注行未因新图变化', lines, 51);
check('notes os 仍是 indent=1 + LF + 尾换行',
  [RAW.includes('\r\n'), RAW.endsWith('\n')], [false, true]);
check('题库 os_0084 答案仍是 A',
  JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/os.json'), 'utf8'))
    .questions.find(q => q.id === 'os_0084').answer, 'A');

console.log(`_test_os_2022_24_fig: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
