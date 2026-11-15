/* 左侧 sticky 目录跟随正文滚动：滚动高亮 + 把高亮项带进目录可视区。
 *
 * 背景：notes.html 原本只有 finishNotes() 里的「滚动切 active 类」，目录本身
 *   position:sticky + overflow-y:auto，正文读到后半本时高亮项早已滚出侧栏视野，
 *   用户视角就是「目录不跟着走」。本轮补 syncTocFollow()：
 *   ① 高亮最深可见小节；② 越界时把高亮项带回目录中部；
 *   ③ 目录被手动滚动/折叠时暂停跟随；④ 小节分组被折叠时回退到父节。
 * 纯 DOM class + scrollTop，不碰讲义正文 DOM，.anno-line 行号与批注零影响。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
    const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

const notes = read('pwa/notes.html');
const css = read('pwa/css/style.css');

// ---------- 1. 静态：跟随逻辑挂在该在的地方 ----------
const startMark = '                /* 目录跟随滚动';
const endMark = 'setTimeout(() => syncTocFollow(currentTocSection(), false), 900);';
const s = notes.indexOf(startMark);
const e = notes.indexOf(endMark, s);
check('能截出目录跟随片段', s > 0 && e > s, true);
const snippet = s > 0 && e > s ? notes.slice(s, e + endMark.length) : '';
check('跟随逻辑在 finishNotes 内（等切片渲染跑完再遍历正文）',
    notes.indexOf('function finishNotes()') < s, true);
check('同时高亮 .notes-section 与 .notes-sub',
    snippet.includes("contentEl.querySelectorAll('.notes-section, .notes-sub')"), true);
check('判定线仍是顶栏下沿 90px', snippet.includes('top <= 90'), true);
check('抽象出 currentTocSection / syncTocFollow 两个函数',
    snippet.includes('function currentTocSection()') && snippet.includes('function syncTocFollow(activeEl, force)'), true);
check('scroll 监听仍是 passive + rAF 节流',
    snippet.includes("{ passive: true }") && snippet.includes('requestAnimationFrame(() => {'), true);
check('目录手动滚动时暂停跟随（wheel / touchmove / pointerdown）',
    ["addEventListener('wheel'", "addEventListener('touchmove'", "addEventListener('pointerdown'"].every(x => snippet.includes(x)), true);
check('暂停窗口 2.5s', snippet.includes('Date.now() + 2500'), true);
check('目录整栏收起时不抢滚动', snippet.includes("classList.contains('notes-toc-collapsed')"), true);
check('小节分组折叠时回退到父节',
    snippet.includes("link.closest('.notes-toc-subs.collapsed')") &&
    snippet.includes("activeEl.closest('.notes-section')"), true);
check('只在越界时滚动目录，且 scrollTop 做上下界钳制',
    snippet.includes('lr.top < tr.top + pad || lr.bottom > tr.bottom - pad') &&
    snippet.includes('Math.max(0, Math.min(max, followBox.scrollTop + delta))'), true);
check('首屏对齐 + 恢复滚动后 900ms 再校准',
    snippet.includes('requestAnimationFrame(() => syncTocFollow(currentTocSection(), true))') &&
    snippet.includes('setTimeout(() => syncTocFollow(currentTocSection(), false), 900)'), true);
check('高亮切换不受「目录手动滚动暂停」影响（暂停只管目录滚动）',
    snippet.indexOf('tocLinks.forEach(l => l.classList.toggle') < snippet.indexOf('Date.now() < tocUserScrollUntil'), true);

// ---------- 2. CSS：当前项竖标 + 暗色适配 ----------
check('当前项加主色竖标（不改字重）',
    /\.notes-toc-sec\.active, \.notes-toc-sub\.active \{\s*\n\s*box-shadow: inset 3px 0 0 var\(--primary\);/s.test(css), true);
check('暗色主题给 active 换深色底',
    /\.dark \.notes-toc-sec\.active, \.dark \.notes-toc-sub\.active \{[^}]*rgba\(143, 176, 217/s.test(css), true);
// 用花括号深度判断规则是否在顶层：文件后面还有大量响应式 @media，
// 简单比 lastIndexOf('@media') 会把所有靠前的顶层规则误判成「在媒体查询里」。
function braceDepthAt(pos) {
    let d = 0;
    for (let i = 0; i < pos; i++) {
        if (css[i] === '{') d++;
        else if (css[i] === '}') d--;
    }
    return d;
}
check('竖标规则写在顶层（花括号深度为 0，不落进 @media）',
    braceDepthAt(css.indexOf('.notes-toc-sec.active, .notes-toc-sub.active {')), 0);
check('目录仍是 sticky + 内部可滚（跟随的前提）',
    /\.notes-toc \{[^}]*position: sticky;[^}]*overflow-y: auto;/s.test(css), true);

// ---------- 3. jsdom 真实执行跟随片段 ----------
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="notesLayout"></div>
  <aside id="notesToc">
    <a class="notes-toc-sec" data-sec="1.1 A">1.1 A</a>
    <div class="notes-toc-subs">
      <a class="notes-toc-sub" data-sec="1.1.1 X">1.1.1 X</a>
      <a class="notes-toc-sub" data-sec="1.1.2 Y">1.1.2 Y</a>
    </div>
    <a class="notes-toc-sec" data-sec="1.2 B">1.2 B</a>
    <div class="notes-toc-subs">
      <a class="notes-toc-sub" data-sec="1.2.1 Z">1.2.1 Z</a>
    </div>
  </aside>
  <div id="notesContent">
    <section class="notes-section" data-sec="1.1 A">
      <div class="notes-sub" data-sec="1.1.1 X"></div>
      <div class="notes-sub" data-sec="1.1.2 Y"></div>
    </section>
    <section class="notes-section" data-sec="1.2 B">
      <div class="notes-sub" data-sec="1.2.1 Z"></div>
    </section>
  </div>
</body></html>`, { url: 'https://x.test/notes.html?subject=os', runScripts: 'outside-only' });
const w = dom.window;
const doc = w.document;
const box = doc.getElementById('notesToc');

// jsdom 不做布局：给正文块、目录项、目录容器各自返回可控矩形
const SEC_TOP = { '1.1 A': -120, '1.1.1 X': -40, '1.1.2 Y': 260, '1.2 B': 340, '1.2.1 Z': 420 };
let TOC_LINK_TOP = 250;     // 默认越界（目录容器 0..200）
const mkRect = (top, height) => ({
    top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON() { return {}; }
});
w.Element.prototype.getBoundingClientRect = function () {
    if (this === box) return mkRect(0, 200);
    if (this.classList.contains('notes-toc-sec') || this.classList.contains('notes-toc-sub')) return mkRect(TOC_LINK_TOP, 20);
    if (this.dataset && Object.prototype.hasOwnProperty.call(SEC_TOP, this.dataset.sec)) return mkRect(SEC_TOP[this.dataset.sec], 30);
    return mkRect(0, 20);
};
Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 1000 });
Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 200 });
w.requestAnimationFrame = cb => { cb(); return 1; };   // 同步执行，测试不用等帧
w.CSS = { escape: x => String(x) };

const activeSecs = () => [...doc.querySelectorAll('.notes-toc-sec.active, .notes-toc-sub.active')]
    .map(l => l.dataset.sec);

w.eval('var contentEl = document.getElementById("notesContent");\n' + snippet);
check('首屏即对齐当前小节（1.1.1 X 是最后一个越过顶栏的块）', activeSecs(), ['1.1.1 X']);
check('越界高亮项被带回目录中部（scrollTop = 250 - (200-20)/2 = 160）', box.scrollTop, 160);

// 正文继续下滚：最深可见块变成 1.2.1 Z
SEC_TOP['1.2 B'] = -30;
SEC_TOP['1.2.1 Z'] = 40;
TOC_LINK_TOP = 90;   // 高亮项已在目录可视区内
const before = box.scrollTop;
w.dispatchEvent(new w.Event('scroll'));
check('滚动后高亮跟到最深可见小节', activeSecs(), ['1.2.1 Z']);
check('高亮项本来就在可视区时不抢滚动条', box.scrollTop, before);

// 目录被用户手动滚动：暂停期间不再自动跟随
box.dispatchEvent(new w.Event('wheel'));
TOC_LINK_TOP = 320;   // 越界
const paused = box.scrollTop;
w.dispatchEvent(new w.Event('scroll'));
check('手动滚动目录后 2.5s 内暂停跟随', box.scrollTop, paused);
check('暂停期间高亮仍继续更新', activeSecs(), ['1.2.1 Z']);

// 目录整栏收起：即使不暂停也不动
box.dispatchEvent(new w.Event('pointerdown'));
doc.getElementById('notesLayout').classList.add('notes-toc-collapsed');
w.eval('tocUserScrollUntil = 0;');
w.dispatchEvent(new w.Event('scroll'));
check('目录收起时不改 scrollTop', box.scrollTop, paused);
doc.getElementById('notesLayout').classList.remove('notes-toc-collapsed');

// 小节所在分组被折叠：回退到父节链接，不抛异常
doc.querySelector('.notes-toc-subs').classList.add('collapsed');
TOC_LINK_TOP = 0;
let threw = false;
try { w.dispatchEvent(new w.Event('scroll')); } catch (err) { threw = true; }
check('分组折叠时回退父节不抛异常', threw, false);
check('回退路径仍保留高亮', activeSecs(), ['1.2.1 Z']);

console.log((fail ? 'RED' : 'GREEN') + ' _test_toc_follow: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
