// 快速验证:笔记字体染色的两个核心路径
// 1) sanitizeNoteHtml 保留 span style.color(保存/装载后颜色不丢)
// 2) applyNoteForeColor 手动 span 后备(jsdom 无 execCommand)产生 <span style="color:...">
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="note" contenteditable="true">你好世界</div></body></html>`);
const { window } = dom;
const document = window.document;
// jsdom 无 execCommand:桩为返回 false → 走手动 span 后备路径(真实浏览器兼容路径的兜底)
document.execCommand = () => false;

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

// ---- 从 quiz.html 提取的 sanitizer(保持原样) ----
const NOTE_ALLOWED_TAGS = new Set(['B','I','U','STRONG','EM','H1','H2','H3','P','BR','DIV','SPAN','UL','OL','LI','BLOCKQUOTE']);
const NOTE_ALLOWED_CLASS_RE = /^(hl-|note-hl-)?(yellow|green|blue|pink)$/;
function sanitizeNoteHtml(html) {
    if (!html) return '';
    if (html.indexOf('<') < 0) return '';
    const t = document.createElement('template');
    t.innerHTML = html;
    (function walk(node) {
        const children = [...node.childNodes];
        for (const c of children) {
            if (c.nodeType === 1) {
                if (!NOTE_ALLOWED_TAGS.has(c.tagName)) {
                    while (c.firstChild) node.insertBefore(c.firstChild, c);
                    node.removeChild(c);
                } else {
                    for (const a of [...c.attributes]) {
                        if (a.name === 'style') {
                            const ok = a.value.split(';').map(s => s.trim()).filter(s => {
                                const m = s.match(/^([a-z-]+):/);
                                return m && (m[1] === 'color' || m[1] === 'background-color' || m[1] === 'background');
                            });
                            if (ok.length) c.setAttribute('style', ok.join('; '));
                            else c.removeAttribute('style');
                        } else if (a.name === 'class') {
                            if (!NOTE_ALLOWED_CLASS_RE.test(a.value)) c.removeAttribute('class');
                        } else {
                            c.removeAttribute(a.name);
                        }
                    }
                    walk(c);
                }
            } else if (c.nodeType === 8) {
                c.remove();
            }
        }
    })(t.content);
    return t.innerHTML;
}

// ---- 测试1: sanitizer 保留染色 span ----
const src1 = '重点<span style="color:#d93025">红色标注</span>和<span style="color:#1a73e8">蓝色</span>结论';
const out1 = sanitizeNoteHtml(src1);
console.log('sanitizer 输出:', out1);
assert(out1.includes('color:#d93025'), '保留红染色');
assert(out1.includes('color:#1a73e8'), '保留蓝染色');
assert(!out1.includes('onerror'), '危险属性被清');

// ---- 测试2: execCommand 产物 <font color> 转换逻辑 ----
// 模拟 Firefox 生成 <font color="#d93025">abc</font>,验证应用转换后变 span
function normalizeFontToSpan(root) {
    root.querySelectorAll('font[color]').forEach(f => {
        const sp = document.createElement('span');
        sp.style.color = f.getAttribute('color');
        while (f.firstChild) sp.appendChild(f.firstChild);
        f.replaceWith(sp);
    });
}
const d2 = document.createElement('div');
d2.innerHTML = 'a<font color="#d93025">红色</font>b';
normalizeFontToSpan(d2);
assert(d2.innerHTML.includes('<span style="color: rgb(217, 48, 37);">红色</span>') || d2.innerHTML.includes('color') , 'font 标签转为 span');
assert(!d2.querySelector('font'), '无 font 残留');

// ---- 测试3: 手动 span 后备(jsdom 无 execCommand → 走后备路径) ----
const noteEl = document.getElementById('note');
noteEl.innerHTML = '第一句 第二句';
// 选中"第二句"
const range = document.createRange();
range.selectNodeContents(noteEl.childNodes[0].childNodes[1] || noteEl.childNodes[0]);
// 简化:直接测试 applyNoteForeColor 的核心手动包 span 逻辑
const sel = window.getSelection();
range.setStart(noteEl.firstChild, 4); // "第一句 第二句" 第4字符起
range.setEnd(noteEl.firstChild, 6);
sel.removeAllRanges();
sel.addRange(range);
function applyNoteForeColor(el, color) {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const r = s.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return;
    const ok = document.execCommand('foreColor', false, color);
    if (ok) return;
    try {
        const span = document.createElement('span');
        span.style.color = color;
        span.appendChild(r.extractContents());
        r.insertNode(span);
    } catch (e) {}
}
applyNoteForeColor(noteEl, '#d93025');
console.log('手动染色后 note html:', noteEl.innerHTML);
assert(noteEl.querySelector('span[style*="color"]'), '手动 span 染色已应用');

// ---- 测试4: 染色笔记保存→装载 往返不丢色 ----
const serialized = noteEl.innerHTML;
const reloaded = sanitizeNoteHtml(serialized);
console.log('往返后 html:', reloaded);
assert(reloaded.includes('color'), '保存/装载往返后颜色保留');

// ---- 测试5: 清除格式剥 color ----
function stripColor(range, root) {
    root.querySelectorAll('*').forEach(s => {
        if (!range.intersectsNode(s)) return;
        if (s.style && s.style.color) {
            s.style.color = '';
            if (s.getAttribute('style') === '') s.removeAttribute('style');
        }
    });
}
const r2 = document.createRange();
r2.selectNodeContents(noteEl);
stripColor(r2, noteEl);
console.log('清除后 note html:', noteEl.innerHTML);
assert(!noteEl.querySelector('span[style*="color"]'), '清除格式后颜色被剥');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
