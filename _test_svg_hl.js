// 回归测试：示意图(SVG)文字高亮后消失的 bug
// 提取 notes.html 中真实的 inAnno/inSvg/hlWalkFilter/cleanTextOf/offsetInRoot/wrapRange
// 原函数源码（逐字 eval），在 jsdom 中验证：
//   A) 选区落在 SVG <text> 上时，wrapRange 不得把 HTML <span> 包进 svg（否则文字不渲染、消失）
//   B) 普通正文文字高亮仍正常包裹
const fs = require('fs');
const { JSDOM } = require('jsdom');

const SRC = 'pwa/notes.html';
const raw = fs.readFileSync(SRC, 'utf8').split('\n');

// 提取区间：从 `function inAnno(n) {` 到 `function bodyOf(n) {` 之前（含 wrapRange 全函数）
const startIdx = raw.findIndex(l => l.includes('function inAnno(n) {'));
const endIdx = raw.findIndex((l, i) => i > startIdx && l.includes('function bodyOf(n) {'));
if (startIdx < 0 || endIdx < 0) { console.error('FAIL: 无法定位函数区间'); process.exit(1); }
const code = raw.slice(startIdx, endIdx).join('\n');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
const { window } = dom;
// 在 window 作用域逐字执行真实源码，得到真实函数
window.eval(code);

const { document } = window;
const body = document.createElement('div');
body.className = 'notes-body';
body.innerHTML = '<svg><text>报文交换</text></svg><p>正常文字内容ABC</p>';
document.body.appendChild(body);

let fails = 0;
function assert(cond, msg) { if (!cond) { console.error('  ✗ ' + msg); fails++; } else { console.log('  ✓ ' + msg); } }

// ---- 测试 A：SVG 文字不得被高亮包裹 ----
const svgText = body.querySelector('svg text').firstChild; // 文本节点 "报文交换"
const svgStart = window.offsetInRoot(body, svgText, 0);
const svgEnd = svgStart + svgText.nodeValue.length;
window.wrapRange(body, svgStart, svgEnd, 'note-hl note-hl-yellow', { start: svgStart, color: 'yellow' });
assert(body.querySelector('svg text').textContent === '报文交换',
    'SVG <text> 文本保持原样 ("报文交换")');
assert(body.querySelector('svg text .note-hl') === null,
    'SVG <text> 内未插入 HTML <span class="note-hl">（文字不会消失）');

// ---- 测试 B：普通正文高亮仍生效 ----
const pText = body.querySelector('p').firstChild; // "正常文字内容ABC"
const s = window.offsetInRoot(body, pText, 0);
const e = window.offsetInRoot(body, pText, 4);     // "正常文字"
window.wrapRange(body, s, e, 'note-hl note-hl-yellow', { start: s, color: 'yellow' });
const hl = body.querySelector('p .note-hl');
assert(hl !== null, '普通正文高亮生成了 .note-hl 包裹');
assert(hl && hl.textContent === '正常文字', '高亮包裹内容正确 ("正常文字")');
assert(body.querySelector('p').textContent === '正常文字内容ABC', '正文整体文本未被破坏');

// ---- 测试 C：cleanTextOf 跳过 SVG（偏移计数口径一致）----
const full = window.cleanTextOf(body);
assert(full === '正常文字内容ABC', 'cleanTextOf 跳过 SVG 文本，仅计正文');

if (fails) { console.error('\nSVG 高亮回归测试：失败 ' + fails + ' 项'); process.exit(1); }
console.log('\nSVG 高亮回归测试：全部通过 ✅');
