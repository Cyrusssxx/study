/* 笔记标题（H1/H2）排版与清洗回归 —— 2026-11-13
 * 背景：真实笔记库里 85 条含标题笔记，标题几乎全是从网页整段粘贴来的，出现四个问题：
 *   ① 标题字号 1.2rem 远大于正文 .88rem，整段正文被带成标题后折两三行、把正文挤掉；
 *   ② H2 左侧竖线用 --border(#e0e0e0) 几乎不可见，层级看起来是"没了"；
 *   ③ .note-input 的 white-space:pre-wrap 被标题继承，粘贴源码缩进在标题里撑出大空隙；
 *   ④ 空标题（点了 H1 没打字 / 把字删光）会画出孤立的横线、竖线；标题还带着粘贴残留的
 *      background-color: rgba(255,255,255,.25) 白底，深色主题下就是一块白斑。
 * 本测试锁：CSS 收敛字号 + 标题不吃 pre-wrap + 剥标题底色 + 折叠标签间空白 + 清空标题。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

// ---------- 1. CSS 规则 ----------
const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
// 选择器匹配前先剥注释：共用选择器块前面常挂着一段 /* 说明 */，不清掉会取不到该块
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');

// 抽出 .note-input h1 / h2 的规则体（含共用选择器块）
function ruleBodies(sel) {
    const out = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(cssNoComment))) {
        const sels = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '));
        if (sels.includes(sel)) out.push(m[2]);
    }
    return out.join('\n');
}
const h1Body = ruleBodies('.note-input h1');
const h2Body = ruleBodies('.note-input h2');
const bothBody = ruleBodies('.note-input h1');

const pxOf = (body) => {
    const m = body.match(/font-size:\s*([\d.]+)rem/);
    return m ? parseFloat(m[1]) : null;
};
check('H1 字号已收敛到 <= 1.05rem（原 1.2rem 会把整段正文变成巨型标题）',
    pxOf(h1Body), n => n !== null && n <= 1.05);
check('H2 字号已收敛到 <= 0.96rem 且大于正文 0.88rem',
    pxOf(h2Body), n => n !== null && n > 0.88 && n <= 0.96);
check('H1 仍靠下边框分层', /border-bottom:\s*1px solid/.test(h1Body), true);
check('H2 仍靠左竖线分层', /border-left:\s*[\d.]+px solid/.test(h2Body), true);
check('H1/H2 都设了 white-space: normal（标题不吃 .note-input 的 pre-wrap）',
    /white-space:\s*normal/.test(h1Body) && /white-space:\s*normal/.test(h2Body), true);
check('H1/H2 都强清粘贴残留底色（background: none !important）',
    /background:\s*none\s*!important/.test(h1Body) && /background:\s*none\s*!important/.test(h2Body), true);
check('H1/H2 都清了 text-indent / letter-spacing（粘贴带来的缩进与字距）',
    /text-indent:\s*0/.test(h1Body) && /letter-spacing:\s*0/.test(h1Body) &&
    /text-indent:\s*0/.test(h2Body) && /letter-spacing:\s*0/.test(h2Body), true);
check('空标题不画线（H1:empty / H2:empty display:none）',
    /\.note-input h1:empty[^{]*\{[^}]*display:\s*none/.test(css) &&
    /\.note-input h2:empty[^{]*\{[^}]*display:\s*none/.test(css), true);
check('连续标题不留双倍空档（h1 + h2 等相邻规则）',
    /\.note-input h1 \+ h2/.test(css), true);
check('旧 1.2rem 标题字号已彻底移除（防回退）',
    /\.note-input h1[^{]*\{[^}]*font-size:\s*1\.2rem/.test(css), false);

// 长段落可读性
const baseBody = ruleBodies('.note-input');
check('正文行高已放宽到 >= 1.6（中文长段落 1.5 会挤成一坨）',
    parseFloat((baseBody.match(/line-height:\s*([\d.]+)/) || [0, 0])[1]), n => n >= 1.6);
check('段落间距已放宽到 >= 0.28em',
    parseFloat((css.match(/\.note-input p\s*\{\s*margin:\s*([\d.]+)em/) || [0, 0])[1]), n => n >= 0.28);

// H3 与列表：粘贴内容常带，缺样式就是浏览器默认（1.17em + 1em 外边距 / 缩进被全局 reset 清零）
const h3Body = ruleBodies('.note-input h3');
check('H3 有收敛字号（不落浏览器默认 1.17em）',
    parseFloat((h3Body.match(/font-size:\s*([\d.]+)rem/) || [0, 0])[1]), n => n > 0.85 && n <= 0.95);
check('H3 有明确外边距（不落浏览器默认 1em）',
    /margin:\s*[\d.]+em 0 [\d.]+em/.test(h3Body), true);
check('H3 也清底色、不吃 pre-wrap',
    /background:\s*none/.test(h3Body) && /white-space:\s*normal/.test(h3Body), true);
check('列表恢复了缩进（全局 * reset 把 padding 清零，ul 会顶格）',
    /\.note-input ul,\s*\.note-input ol\s*\{[^}]*padding-left:\s*1\.5em/.test(cssNoComment), true);
check('列表恢复了项目符号（disc / decimal）',
    /\.note-input ul\s*\{[^}]*list-style:\s*disc/.test(cssNoComment) &&
    /\.note-input ol\s*\{[^}]*list-style:\s*decimal/.test(cssNoComment), true);

// ---------- 2. sanitize：剥标题底色、折叠标签间空白 ----------
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const { window } = dom;
const document = window.document;
document.execCommand = () => false;
new Function('window', 'document',
    fs.readFileSync(path.join(ROOT, 'pwa/js/note_richtext.js'), 'utf8'))(window, document);
const { sanitizeNoteHtml, loadNoteIntoEditor, serializeNote, pruneEmptyNoteHeadings } = window;

// 真实样本：从网页粘来的 H2，span 上带半透明白底 + 字号 + 字距
const pastedH2 = '<h2><span style="font-size: 14.4px; letter-spacing: 0.288px; text-align: justify; background-color: rgba(255, 255, 255, 0.25);">数<b>据链路</b>层实现<b>相邻节点</b>之间的流量控制</span></h2>';
const h2out = sanitizeNoteHtml(pastedH2);
check('标题内的 background-color 被剥掉（深色主题不再出现白斑）',
    /background/i.test(h2out), false);
check('标题内的 font-size / letter-spacing / text-align 一并剥掉',
    /font-size|letter-spacing|text-align/.test(h2out), false);
check('标题结构本身保留（h2 + b）', /<h2>/.test(h2out) && /<b>/.test(h2out), true);

check('标题元素自身的底色也剥掉',
    /background/i.test(sanitizeNoteHtml('<h2 style="background-color:#ffffff">标题</h2>')), false);
check('标题内的 color 保留（用户手动染的标题色不算脏）',
    /color:\s*#d93025/.test(sanitizeNoteHtml('<h2><span style="color:#d93025">红标题</span></h2>')), true);

// 正文里的高亮底色必须保留 —— 不能为了清标题一刀切
check('正文 span 的高亮底色照旧保留',
    /background-color/.test(sanitizeNoteHtml('<p><span style="background-color: rgb(255, 243, 163)">重点</span></p>')), true);
check('正文内的 class 高亮照旧保留',
    /hl-yellow/.test(sanitizeNoteHtml('<p><span class="hl hl-yellow">重点</span></p>')), true);

// 标签之间的源码缩进在 pre-wrap 下会变成空行
const indented = '<h1>标题</h1>\n      <p>正文</p>\n\n      <h2>小标题</h2>\n      <p>正文</p>';
const indOut = sanitizeNoteHtml(indented);
check('标签之间的纯空白换行被折叠（pre-wrap 不再撑出空行）',
    />\s*\n\s*</.test(indOut), false);
check('折叠后块结构不变（h1/p/h2/p 都在）',
    /^<h1>标题<\/h1><p>正文<\/p><h2>小标题<\/h2><p>正文<\/p>$/.test(indOut), true);
check('文本节点内部的换行不受影响（<b>a\\nb</b> 原样保留）',
    sanitizeNoteHtml('<b>a\nb</b>'), '<b>a\nb</b>');
check('文本节点里「换行 + 缩进」被清掉（粘贴源码缩进不再变成缩进行）',
    /第二段/.test(sanitizeNoteHtml('<p>第一段\n      第二段</p>')) &&
    !/\n\s{2,}/.test(sanitizeNoteHtml('<p>第一段\n      第二段</p>')), true);
check('文本节点里的连续空行被折叠为单个换行',
    sanitizeNoteHtml('<p>上\n\n\n下</p>').includes('\n\n'), false);

// ---------- 3. load：清掉历史脏数据里的空标题 ----------
const ed = document.createElement('div');
ed.className = 'note-input';
loadNoteIntoEditor(ed, '<p>上一行</p><h1><br></h1><h2></h2><p>下一行</p>');
check('装载时空 H1/H2 被清掉（否则出现孤立横线/竖线）',
    [ed.querySelectorAll('h1').length, ed.querySelectorAll('h2').length], [0, 0]);
check('清空标题后正文原样保留',
    ed.textContent.replace(/\s/g, ''), '上一行下一行');

loadNoteIntoEditor(ed, '<h1>真标题</h1><p>正文</p>');
check('有文字的标题不会被误删',
    ed.querySelectorAll('h1').length, 1);
loadNoteIntoEditor(ed, '<h1>&nbsp;</h1><h2> </h2><p>正文</p>');
check('只有空格/不换行空格的标题同样被清',
    [ed.querySelectorAll('h1').length, ed.querySelectorAll('h2').length], [0, 0]);

loadNoteIntoEditor(ed, '<p>正文</p>');
pruneEmptyNoteHeadings && check('pruneEmptyNoteHeadings 已导出为 window 函数', typeof pruneEmptyNoteHeadings, 'function');

// ---------- 4. serialize：空标题不进库 ----------
ed.innerHTML = '<p>正文</p><h1><br></h1><h2><br><br></h2>';
check('序列化时清掉空标题（不改 DOM，避免正在输入光标被打断）',
    /<h1|<h2/.test(serializeNote(ed)), false);
check('序列化清空标题后不动 DOM 本身', ed.querySelectorAll('h1').length, 1);

ed.innerHTML = '<h1>第一章 概述</h1><p>正文</p>';
const ser = serializeNote(ed);
check('正常标题原样保存', /<h1>第一章 概述<\/h1>/.test(ser), true);

ed.innerHTML = '<h1><br></h1>';
check('整条笔记只有空标题时按空笔记处理（不写库）', serializeNote(ed), '');

// ---------- 5. 回归：纯文本与富文本主链路不变 ----------
loadNoteIntoEditor(ed, '第一行\n第二行');
check('纯文本仍按 <br> 换行', ed.innerHTML, '第一行<br>第二行');
loadNoteIntoEditor(ed, '<p><b>粗</b><span style="color:#188038">绿</span></p>');
check('富文本回填无损', ed.innerHTML, '<p><b>粗</b><span style="color:#188038">绿</span></p>');

// ---------- 6. 工具栏：H1/H2 走开关语义（再点一次退回正文） ----------
const tbHtml = window.noteToolbarHtml();
check('工具栏仍有 H1 / H2 按钮',
    /data-cmd="h1"/.test(tbHtml) && /data-cmd="h2"/.test(tbHtml), true);
const js = fs.readFileSync(path.join(ROOT, 'pwa/js/note_richtext.js'), 'utf8');
check('formatBlock 使用规范的 <h1> 形式（裸 "H1" 部分浏览器不认）',
    /formatBlock', false, '<' \+ next \+ '>'/.test(js), true);
check('H1/H2 再点一次可退回正文（toggle 判当前块）',
    /cur === tag\) \? 'p' : tag\.toLowerCase\(\)/.test(js) || /cur === tag/.test(js), true);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' ' + pass + ' ok, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
