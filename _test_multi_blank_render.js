// 回归测试：多空题每空独立选项渲染（blank_opts）+ (①)(②) 括号空 + 共享选项回退
// 提取 quiz.html 真实 fmtMultiContent 源码 + common.js 真实 fmtContent 源码（fmtFormula 用恒等 stub），
// 在 jsdom 中验证：
//   A) 每空独立选项：q.blank_opts 数组 → 每个 (①) 生成独立 <select>，选项与空位一一对应
//   B) 空括号 ( ) + blank_opts：同样生效（6.5-04 型）
//   C) 兼容旧数据：无 blank_opts、共享 q.options、( ) 空 → 每个 select 用共享选项
//   D) <pre> 代码块不被替换（防回归）
const fs = require('fs');
const { JSDOM } = require('jsdom');

const QUIZ = fs.readFileSync('pwa/quiz.html', 'utf8');
const COMMON = fs.readFileSync('pwa/js/common.js', 'utf8');

// 提取 fmtContent（common.js，含 fmtFormula 依赖，stub 之）
const fcStart = COMMON.indexOf('function fmtContent');
if (fcStart < 0) { console.error('FAIL: common.js 找不到 fmtContent'); process.exit(1); }
const fcEnd = COMMON.indexOf('function warmFigureCache');
const fmtContentCode = COMMON.slice(fcStart, fcEnd);

// 提取 fmtMultiContent（quiz.html）
const mcStart = QUIZ.indexOf('function fmtMultiContent');
if (mcStart < 0) { console.error('FAIL: quiz.html 找不到 fmtMultiContent'); process.exit(1); }
const mcEnd = QUIZ.indexOf('renderShuffleBtn();', mcStart);
const fmtMultiContentCode = QUIZ.slice(mcStart, mcEnd);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
const { window } = dom;
window.eval('function fmtFormula(h){ return h; }');           // stub
window.eval(fmtContentCode);                                  // 真实 fmtContent
window.eval(fmtMultiContentCode);                             // 真实 fmtMultiContent

let fails = 0;
function assert(cond, msg) { if (!cond) { console.error('  ✗ ' + msg); fails++; } else { console.log('  ✓ ' + msg); } }

// ---- A: 每空独立选项 + (①)(②)(③) ----
const qA = {
  content: '首选的交换方式是(①)；不应选用(②)；改进是(③)。',
  blank_opts: [
    { A: '电路交换', B: '报文交换', C: '分组交换' },
    { A: '电路交换', B: '报文交换', C: '分组交换' },
    { A: '传输单位更小', B: '传输单位更大', C: '差错控制更完善', D: '路由算法更简单' },
  ],
  options: { A: 'x', B: 'y', C: 'z' },
};
const htmlA = window.fmtMultiContent(qA, false);
const selectsA = htmlA.match(/<select class="blank-select"/g);
assert(selectsA && selectsA.length === 3, 'A: (①)(②)(③) 生成 3 个 select');
assert(htmlA.includes('>A. 电路交换<') && htmlA.includes('>C. 分组交换<'), 'A: 空1 选项为 ① 的选项');
assert(htmlA.includes('>A. 传输单位更小<') && htmlA.includes('>D. 路由算法更简单<'), 'A: 空3 选项为 ③ 的选项（与空1 不同组）');
assert(!htmlA.includes('>x<'), 'A: 未使用共享 options 的占位值');

// ---- B: 空括号 + blank_opts（6.5-04 型）----
const qB = {
  content: '应用层协议有( )，传输层协议有( )。',
  blank_opts: [
    { A: 'FTP、HTTP', B: 'DNS、FTP', C: 'DNS、HTTP', D: 'TELNET、HTTP' },
    { A: 'UDP', B: 'TCP', C: 'UDP、TCP', D: 'TCP、IP' },
  ],
  options: { A: 'x' },
};
const htmlB = window.fmtMultiContent(qB, false);
const selectsB = htmlB.match(/<select class="blank-select"/g);
assert(selectsB && selectsB.length === 2, 'B: 两个空括号生成 2 个 select');
assert(htmlB.includes('>C. DNS、HTTP<') && htmlB.includes('>C. UDP、TCP<'), 'B: 两空各自独立选项');

// ---- C: 兼容旧数据（共享 q.options + 空括号）----
const qC = { content: '空表条件为( )；( )为真。', options: { A: 'head==NULL', B: 'head->next==NULL', C: 'next==head', D: 'head!=NULL' } };
const htmlC = window.fmtMultiContent(qC, false);
const selectsC = htmlC.match(/<select class="blank-select"/g);
assert(selectsC && selectsC.length === 2, 'C: 共享选项也生成 2 个 select');
assert(htmlC.includes('>A. head==NULL<') && htmlC.includes('>D. head!=NULL<'), 'C: 两空都用共享选项组');

// ---- D: <pre> 代码块不被替换 ----
const qD = { content: '代码：<pre class="code-block">int main(){return 0;}</pre> 然后填空( )。', options: { A: 'a', B: 'b', C: 'c', D: 'd' } };
const htmlD = window.fmtMultiContent(qD, false);
assert(htmlD.includes('<pre class="code-block">int main(){return 0;}</pre>'), 'D: <pre> 代码块原样保留');
assert((htmlD.match(/<select class="blank-select"/g) || []).length === 1, 'D: 仅真正的空括号被替换');

if (fails) { console.error('\n多空题渲染回归测试：失败 ' + fails + ' 项'); process.exit(1); }
console.log('\n多空题渲染回归测试：全部通过 ✅');
