// 章节树页内跳转 + 树同步 回归测试(抽取 quiz.html 的新增函数)
// 覆盖:左键点击拦截不导航 / 同科目页内定位到章节首题 / 跨科目与无匹配整页 fallback / 树高亮展开滚动
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="chapterTree"></div></body></html>`, { url: 'http://localhost/quiz.html?subject=cn&mode=sequential' });
const { window } = dom;
const document = window.document;
if (!window.CSS || !window.CSS.escape) window.CSS = Object.assign(window.CSS || {}, { escape: s => s.replace(/"/g, '\\"').replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c.charCodeAt(0).toString(16) + ' ') });

// ---- 从 quiz.html 提取新增/相关函数 ----
const html = fs.readFileSync('pwa/quiz.html', 'utf-8');
function grab(name) {
    const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\}', 'm');
    const m = html.match(re);
    if (!m) throw new Error('未找到函数 ' + name);
    return m[0];
}
const code = [
    grab('goChapter'),
    grab('syncChapterTree'),
    grab('bindChapterTreeNav'),
    grab('chapterLink'),
    grab('scrollInContainer')
].join('\n');

// ---- 测试环境状态 ----
let CHAPTER = '第3章 数据链路层', SECTION = '';
let SUBJECT = 'cn';
let questions = [
    { id: 'a', chapter: '第1章 计算机网络体系结构', section: '1.1 计算机网络概述' },
    { id: 'b', chapter: '第3章 数据链路层', section: '3.8 数据链路层设备' },
    { id: 'c', chapter: '第3章 数据链路层', section: '3.6 局域网' },
    { id: 'd', chapter: '第5章 传输层', section: '5.3 TCP' }
];
let currentIndex = 0;
let renderCalls = 0;
const renderQuestion = () => { renderCalls++; };
let navigated = null;   // 记录整页 fallback
const chapterLink = (k, ch, sec) => `quiz.html?subject=${k}&mode=sequential&chapter=${encodeURIComponent(ch)}${sec ? '&section=' + encodeURIComponent(sec) : ''}`;

// ---- 树 DOM(与 renderChapterTree 输出同构) ----
function buildTree() {
    document.getElementById('chapterTree').innerHTML = `
      <div class="tree-subject open">
        <div class="tree-chapters">
          <div class="tree-chapter open active" data-chapter="第3章 数据链路层">
            <div class="tree-sections">
              <a class="tree-section active" href="#" data-subject="cn" data-chapter="第3章 数据链路层" data-section="">本章全部</a>
              <a class="tree-section" href="#" data-subject="cn" data-chapter="第3章 数据链路层" data-section="3.8 数据链路层设备">3.8 数据链路层设备</a>
            </div>
          </div>
          <div class="tree-chapter" data-chapter="第5章 传输层">
            <div class="tree-sections">
              <a class="tree-section" href="#" data-subject="cn" data-chapter="第5章 传输层" data-section="5.3 TCP">5.3 TCP</a>
            </div>
          </div>
        </div>
      </div>`;
}

// 组装沙箱:把函数文本里引用的变量同名注入(new Function 参数),location 用 stub(记录 href 赋值=整页导航意图)
let navTarget = null;
const stubLocation = {
    href: 'http://localhost/quiz.html?subject=cn&mode=sequential',
    search: '?subject=cn&mode=sequential',
    pathname: '/quiz.html',
    hash: ''
};
Object.defineProperty(stubLocation, 'href', {
    get() { return 'http://localhost/quiz.html?subject=cn&mode=sequential'; },
    set(v) { navTarget = v; },
    configurable: true
});
const S = new Function('CHAPTER', 'SECTION', 'SUBJECT', 'questions', 'currentIndex', 'renderQuestion', 'chapterLink', 'navigated', 'document', 'window', 'location', 'CSS', 'MODE',
    code + `
    return {
        goChapter, syncChapterTree, bindChapterTreeNav,
        get CHAPTER(){return CHAPTER}, set CHAPTER(v){CHAPTER=v},
        get SECTION(){return SECTION}, set SECTION(v){SECTION=v},
        get currentIndex(){return currentIndex}, set currentIndex(v){currentIndex=v},
        get navigated(){return navigated}, set navigated(v){navigated=v}
    };
`)(
    CHAPTER, SECTION, SUBJECT, questions, currentIndex, renderQuestion, chapterLink, null, document, window, stubLocation, window.CSS, 'sequential'
);

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

// ========== 测试1:点击被拦截,不导航,页内跳转 ==========
console.log('[1] bindChapterTreeNav 点击拦截');
buildTree();
S.bindChapterTreeNav();
const a = document.querySelector('a[data-section="3.8 数据链路层设备"]');
let defaultPrevented = false;
const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
ev.preventDefault = () => { defaultPrevented = true; };
a.dispatchEvent(ev);
assert(defaultPrevented, '左键点击被 preventDefault(不整页刷新)');
assert(S.CHAPTER === '第3章 数据链路层' && S.SECTION === '3.8 数据链路层设备', 'CHAPTER/SECTION 被更新');
assert(S.currentIndex === 1, 'currentIndex 定位到该节首题(Q1)');
assert(renderCalls === 1, 'renderQuestion 被调用');

// ========== 测试2:点击"本章全部"清空节筛选 ==========
console.log('[2] 本章全部');
S.currentIndex = 0; renderCalls = 0;
const allA = document.querySelector('a[data-section=""]');
allA.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
assert(S.SECTION === '', '点本章全部 → SECTION 清空');
assert(S.currentIndex === 1, '定位到本章首题(Q1,3.8 节)');

// ========== 测试3:syncChapterTree 高亮/展开 ==========
console.log('[3] syncChapterTree');
// 当前题在 5.3 TCP
S.currentIndex = 3; renderCalls = 0;
S.syncChapterTree();
const ch3 = document.querySelector('.tree-chapter[data-chapter="第3章 数据链路层"]');
const ch5 = document.querySelector('.tree-chapter[data-chapter="第5章 传输层"]');
assert(!ch3.classList.contains('active'), '旧章节 active 被移除');
assert(ch5.classList.contains('active') && ch5.classList.contains('open'), '当前章节展开+高亮');
const sec5 = ch5.querySelector('a[data-section="5.3 TCP"]');
assert(sec5.classList.contains('active'), '当前节高亮');
assert(document.querySelector('.tree-section.active') === sec5, '只有一个 active');

// ========== 测试4:跨科目整页跳转 ==========
console.log('[4] 跨科目 fallback');
navTarget = null;
S.goChapter('os', '第2章 进程与线程', '');
assert(navTarget && navTarget.indexOf('subject=os') >= 0 && navTarget.indexOf('chapter=') >= 0, '跨科目 → 整页导航(chapterLink 链接)');
assert(renderCalls === 0, '跨科目不触发页内 renderQuestion');

// ========== 测试5:当前筛选集无该章节 → 整页 fallback ==========
console.log('[5] 无匹配章节 fallback');
S.navigated = null;
questions = [{ id: 'x', chapter: '第2章 物理层', section: '2.1 通信基础' }];   // 替换题集(当前筛选无该章节)
renderCalls = 0;
navTarget = null;
S.goChapter('cn', '第7章 物理层', '');
assert(navTarget && navTarget.indexOf('chapter=') >= 0, '题集中无该章节 → 整页加载(chapterLink 链接)');
assert(renderCalls === 0, '无匹配不触发页内 renderQuestion');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
