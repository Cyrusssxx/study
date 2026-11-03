// zhenti.html 工具栏改版回归：做题模式按钮移到顶栏 + 卡片「🎬 视频讲解」外链
//
// 覆盖点：
//   1) 「做题中/做题模式」按钮位于 nav .nav-tools 内，onclick=toggleExamMode()
//   2) 套卷工具栏不再生成该按钮（避免两处重复）
//   3) syncExamModeBtn() 存在，且 renderPaper 渲染后调用
//   4) 三种卡片（选择/大题/算法题）的「笔记」按钮右侧都有「🎬 视频讲解」外链
//   5) 外链安全属性 target=_blank rel=noopener noreferrer；关键词含 年份 + 408 + 科目
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_toolbar.js
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom（NODE_PATH=<workspace>/node_modules）'); process.exit(0); }

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

console.log('\n--- 1. 做题模式按钮在顶栏 ---');
const doc = new JSDOM(HTML).window.document;
const btn = doc.querySelector('nav .nav-tools #ztExamModeBtn');
check('按钮位于 nav .nav-tools 内', !!btn, true);
check('初始文案为「做题中」', btn && btn.textContent.trim(), '做题中');
check('onclick 指向 toggleExamMode()', btn && btn.getAttribute('onclick'), 'toggleExamMode()');
check('初始带 on 类', btn && btn.classList.contains('on'), true);
check('与夜间开关同处一个容器', btn && btn.parentElement.id === '' && btn.parentElement.className, 'nav-tools');

console.log('\n--- 2. 工具栏不再重复渲染 ---');
const toolbarBlock = JS.slice(JS.indexOf('class="zt-toolbar"'), JS.indexOf('class="zt-toolbar"') + 1400);
check('工具栏 HTML 里无 toggleExamMode', toolbarBlock.includes('toggleExamMode'), false);
check('工具栏仍有「对答案」（做题模式）', toolbarBlock.includes('checkPending()'), true);

console.log('\n--- 3. 状态同步 ---');
check('存在 syncExamModeBtn()', JS.includes('function syncExamModeBtn()'), true);
check('renderPaper 渲染后调用同步', /renderFq\(\);[\s\S]{0,90}syncExamModeBtn\(\)/.test(JS), true);
check('同步时按 examMode 切换文案', /state\.examMode \? '做题中' : '做题模式'/.test(JS), true);

console.log('\n--- 4. 视频讲解外链（三张卡各一处） ---');
check('zt-bili-btn 出现 3 次', (JS.match(/zt-bili-btn/g) || []).length, 3);
const seq = JS.match(/笔记\$\{hasNote[\s\S]{0,400}?zt-bili-btn/g) || [];
check('三处都紧跟「笔记」按钮之后', seq.length, 3);
check('外链新窗口 + 安全属性', (JS.match(/target="_blank" rel="noopener noreferrer"/g) || []).length >= 3, true);
check('关键词含年份 / 408 / 科目', /\[state\.year \|\| ''\s*,\s*'408'\s*,\s*SUBJ_NAME/.test(JS), true);
check('用 encodeURIComponent 编码', /encodeURIComponent\(kw\)/.test(JS), true);
check('按钮文案为「🎬 视频讲解」', JS.includes('🎬 视频讲解'), true);

console.log('\n--- 5. 样式 ---');
check('外链去下划线样式存在', /\.question-tools \.zt-bili-btn\s*\{[^}]*text-decoration:\s*none/.test(CSS), true);
check('沿用 btn-explanation 外观', JS.includes('class="btn-explanation zt-bili-btn"'), true);

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
