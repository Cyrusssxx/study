// 刷题页横向滚动条回归（2026-10-30）
//
// 用户反馈：刷题和试卷回顾界面底部有一条横向滑动条。
// 根因三处（都在 style.css + 题卡渲染）：
//   ① .quiz-container 是 .quiz-layout 的 flex 子项，却没有 flex:1 / min-width:0，
//      min-width:auto 使它无法收缩到 min-content 以下；
//   ② .question-header 不换行，题头 min-content = 长章节徽标(nowrap, ~330px)
//      + 标记按钮(试卷回顾最多 5 个, ~320px) + 收藏星 ≈ 700px，
//      而两侧栏展开时可用宽度只有 ~574px → 撑破视口；
//   ③ 49 道题干含 <pre>（无 overflow-x）、16 道题干含宽表格（最多 14 列，无滚动容器）。
//
// 用法：node _test_quiz_layout.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const QUIZ = fs.readFileSync(path.join(ROOT, 'pwa/quiz.html'), 'utf8');
const EXAM = fs.readFileSync(path.join(ROOT, 'pwa/exam.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// 取某条规则体（选择器后第一个 {...}），用于精确断言声明
function ruleBody(src, selRe) {
  const m = src.match(selRe);
  if (!m) return '';
  const i = src.indexOf('{', m.index);
  const j = src.indexOf('}', i);
  return i < 0 ? '' : src.slice(i, j + 1);
}

console.log('--- 一、flex 布局约束（撑破视口的主因） ---');
const container = ruleBody(CSS, /\.quiz-container\s*\{/);
check('.quiz-container 有 flex: 1 1 auto', /flex:\s*1 1 auto/.test(container), true);
check('.quiz-container 有 min-width: 0', /min-width:\s*0/.test(container), true);

const header = ruleBody(CSS, /\.question-header\s*\{/);
check('.question-header 换行（flex-wrap: wrap）', /flex-wrap:\s*wrap/.test(header), true);
check('.question-header 有 gap', /gap:\s*8px 12px/.test(header), true);

const meta = ruleBody(CSS, /\.question-meta\s*\{/);
check('.question-meta 有 min-width: 0（可收缩）', /min-width:\s*0/.test(meta), true);

const btns = ruleBody(CSS, /\.mark-btns\s*\{/);
check('.mark-btns 换行（5 按钮不再撑破）', /flex-wrap:\s*wrap/.test(btns), true);

console.log('\n--- 二、长内容不撑破 ---');
const badge = ruleBody(CSS, /\.chapter-badge\s*\{/);
check('.chapter-badge 超长省略号', /max-width:\s*100%/.test(badge) && /text-overflow:\s*ellipsis/.test(badge), true);
check('.chapter-badge 保留 nowrap（省略号的前提）', /white-space:\s*nowrap/.test(badge), true);

const qcontent = ruleBody(CSS, /\.question-content\s*\{/);
check('.question-content 用 anywhere 断长串', /overflow-wrap:\s*anywhere/.test(qcontent), true);

// 49 道题干含 pre，长代码行必须自己可滚
const preRule = CSS.match(/\.question-content pre,\s*\n\.item-content pre,[\s\S]{0,220}?\}/);
check('题干裸 pre 可横向滚动', !!preRule && /overflow-x:\s*auto/.test(preRule[0]), true);

const tableWrap = ruleBody(CSS, /\.q-table-wrap\s*\{/);
check('.q-table-wrap 容器可横向滚动', /overflow-x:\s*auto/.test(tableWrap), true);

console.log('\n--- 三、宽表格包装：quiz 与 exam 都要做 ---');
check('quiz 定义 wrapWideTables', /function wrapWideTables\(root\)/.test(QUIZ), true);
check('quiz 渲染题卡后调用', /wrapWideTables\(document\.getElementById\('questionArea'\)\)/.test(QUIZ), true);
check('quiz 幂等（已包过跳过）', /classList\.contains\('q-table-wrap'\)\) return/.test(QUIZ), true);
check('exam 定义 wrapWideTables', /function wrapWideTables\(root\)/.test(EXAM), true);
check('exam 答题视图调用', /wrapWideTables\(document\.getElementById\('examQuestionArea'\)\)/.test(EXAM), true);
check('exam 成绩回顾调用', /wrapWideTables\(document\.getElementById\('resultArea'\)\)/.test(EXAM), true);

console.log('\n--- 四、行为：包装函数真能把 table 包进滚动容器 ---');
try {
  const { JSDOM } = require('jsdom');
  const fnSrc = QUIZ.match(/function wrapWideTables\(root\)[\s\S]*?\n    \}/)[0];
  const dom = new JSDOM(
    '<div id="host"><div class="question-content">' +
    '<table class="q-table"><tr><td>14列表格</td></tr></table>' +
    '</div></div>',
    { runScripts: 'outside-only' }   // 需要 window.eval 可用
  );
  const w = dom.window;
  w.eval(fnSrc + '; window.wrapWideTables = wrapWideTables;');
  w.wrapWideTables(w.document.getElementById('host'));
  const wrap = w.document.querySelector('.q-table-wrap');
  check('表格被包进 .q-table-wrap', !!wrap, true);
  check('表格在容器内', wrap && wrap.querySelector('table.q-table') !== null, true);
  w.wrapWideTables(w.document.getElementById('host'));   // 第二次调用
  check('重复调用不嵌套（幂等）', w.document.querySelectorAll('.q-table-wrap').length, 1);
} catch (e) {
  check('包装行为测试可运行（缺 jsdom？）', false, e.message);
}

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
