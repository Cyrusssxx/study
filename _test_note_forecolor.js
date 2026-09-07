// 富文本笔记工具回归测试(共享 pwa/js/note_richtext.js)
// 覆盖:quiz 刷题笔记染色 + notes/map 批注编辑器富文本(工具栏/回填/序列化/渲染/sanitize/清除)
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
const { window } = dom;
const document = window.document;
// jsdom 无 execCommand:桩为返回 false → 走手动 span 后备路径(真实浏览器兼容路径的兜底)
document.execCommand = () => false;

// 加载共享 JS(与三页 <script src="js/note_richtext.js"> 同源)——new Function 显式注入 window/document,避免跨 realm
const shared = fs.readFileSync('pwa/js/note_richtext.js', 'utf-8');
new Function('window', 'document', shared)(window, document);

const {
    sanitizeNoteHtml, isHtmlNote, loadNoteIntoEditor, serializeNote,
    updateNotePlaceholder, bindNoteToolbar, noteToolbarHtml,
    applyNoteForeColor, clearNoteFormat
} = window;

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

// ========== 1) sanitizer 保留染色/高亮、剥危险属性 ==========
console.log('[1] sanitizeNoteHtml');
const src1 = '重点<span style="color:#d93025">红色标注</span><span class="hl hl-yellow">黄底</span>结论';
const out1 = sanitizeNoteHtml(src1);
assert(out1.includes('color:#d93025'), '保留红染色');
assert(out1.includes('hl-yellow'), '保留高亮 class');
assert(!out1.includes('onerror'), '危险属性被清');

// ========== 2) isHtmlNote 判定 ==========
console.log('[2] isHtmlNote');
assert(!isHtmlNote('纯文本批注 abc'), '纯文本判定为 false');
assert(isHtmlNote('<b>粗体</b>'), 'HTML 判定为 true');

// ========== 3) 批注编辑器:工具栏生成 + 装载回填 + 序列化 ==========
console.log('[3] 批注编辑器流程(notes/map 同款)');
// 模拟 notes.html openAnnoEditor 生成的容器
const editor = document.createElement('div');
editor.className = 'line-anno line-anno-editor';
editor.innerHTML = `
    ${noteToolbarHtml()}
    <div class="note-input line-anno-input" contenteditable="true" spellcheck="false" data-placeholder="写批注"></div>`;
document.body.appendChild(editor);
const input = editor.querySelector('.line-anno-input');
const tb = editor.querySelector('.note-toolbar');
assert(!!input && input.getAttribute('contenteditable') === 'true', '批注输入区为 contenteditable');
assert(tb && tb.querySelectorAll('[data-cmd]').length >= 14, '工具栏含 14+ 按钮(B/I/H1/H2/4高亮/6色/清除)');
assert(tb.querySelector('[data-cmd="color"][data-color="#d93025"]'), '含红色字按钮');
assert(tb.querySelector('[data-cmd="hl"][data-color="yellow"]'), '含黄高亮按钮');

// 回填旧纯文本批注
loadNoteIntoEditor(input, '旧批注文本 abc');
assert(serializeNote(input) === '旧批注文本 abc', '纯文本批注回填/序列化无损');
assert(input.classList.contains('is-empty') === false, '非空不显示占位');

// 回填富文本批注(染红色+加粗)
loadNoteIntoEditor(input, '注意<span style="color:#d93025">红色结论</span><b>重点</b>');
const ser1 = serializeNote(input);
assert(ser1.includes('color') && ser1.includes('<b>重点</b>'), '富文本回填后序列化保留染色与加粗');
assert(!ser1.includes('onerror'), '序列化无注入');

// 空内容序列化 → 空串(空气批注不保存)
loadNoteIntoEditor(input, '');
assert(serializeNote(input) === '', '空批注序列化为空串');

// ========== 4) 绑定工具栏:点击颜色按钮产生染色(手动后备) ==========
console.log('[4] bindNoteToolbar + 染色');
bindNoteToolbar(input);
loadNoteIntoEditor(input, '第一句 第二句 第三句');
const range = document.createRange();
range.setStart(input.firstChild, 4);
range.setEnd(input.firstChild, 6);
const sel = window.getSelection();
sel.removeAllRanges(); sel.addRange(range);
tb.querySelector('[data-cmd="color"][data-color="#d93025"]').click();
assert(!!input.querySelector('span[style*="color"]'), '点色块后文字被染色');
assert(serializeNote(input).includes('color'), '染色可序列化');

// ========== 5) 清除格式剥色 ==========
console.log('[5] clearNoteFormat');
loadNoteIntoEditor(input, '测试<span style="color:#d93025">红字</span>结尾');
const r2 = document.createRange();
r2.selectNodeContents(input);
sel.removeAllRanges(); sel.addRange(r2);
clearNoteFormat(input);
assert(!input.querySelector('span[style*="color"]'), '清除格式后颜色被剥');

// ========== 6) 批注渲染显示(notes innerHTML/sanitize / map 富文本替换逻辑) ==========
console.log('[6] 批注渲染');
const display = document.createElement('div');
display.className = 'line-anno-text';
display.innerHTML = sanitizeNoteHtml('重点<span style="color:#1a73e8">蓝字</span><span class="hl hl-green">绿底</span>');
assert(display.querySelector('span[style*="color"]'), '渲染块保留染色');
assert(display.querySelector('.hl-green'), '渲染块保留高亮 class(CSS 兜底 .line-anno-text .hl-green)');
// 注入测试
display.innerHTML = sanitizeNoteHtml('<img src=x onerror=alert(1)>你好');
assert(!display.querySelector('img'), '注入的 img 被剥');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
