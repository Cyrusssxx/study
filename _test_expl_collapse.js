// 长解析默认折叠「先重点、后全文」回归（2026-11-16）
//
// 需求：做错后自动展开的解析框对长题（多段推导，最长 789 字）太长——
//   ① 长解析默认只显示首屏约 5 行 + 底部渐隐 +「展开完整解析」；
//   ② 长解析里的「易错点」段提到最前并黄色强调（重点放前面）；
//   ③ 短解析（中位数约 115 字）原样全显；
//   ④ 全站生效：common.js 用 MutationObserver 监听 .explanation-body 挂载，
//      quiz/zhenti/exam/wrong/dati 不改渲染代码；
//   ⑤ 展开状态按解析正文记忆：面板重渲染（切笔记/重开解析）不丢，换题回默认折叠。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_expl_collapse.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom'); process.exit(0); }

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const COMMON = fs.readFileSync(path.join(ROOT, 'pwa/js/common.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

// ---------- 1. 静态断言 ----------
console.log('--- 一、common.js 实现 ---');
check('折叠阈值常量 EXPL_COLLAPSE_LEN = 260',
    /const EXPL_COLLAPSE_LEN = 260;/.test(COMMON), true);
check('展开记忆有上限（防止 Set 无限涨）',
    /if \(_explExpanded\.size > EXPL_EXPANDED_MAX\)/.test(COMMON), true);
check('防重入：dataset.explDone 只增强一次',
    /body\.dataset\.explDone/.test(COMMON) && /body\.dataset\.explDone = '1'/.test(COMMON), true);
check('易错点段提到最前（顶层子元素匹配 + insertBefore）',
    /insertBefore\(keyNode, body\.firstChild\)/.test(COMMON) &&
    /expl-key/.test(COMMON), true);
check('MutationObserver 监听挂载（全站生效，不改各页渲染代码）',
    /new MutationObserver/.test(COMMON) && /classList\.contains\('explanation-body'\)/.test(COMMON), true);
check('折叠/展开切换写回 class + 按钮文案',
    /classList\.toggle\('expl-collapsed', !expanded\)/.test(COMMON) &&
    /展开完整解析 ▾/.test(COMMON) && /收起解析 ▴/.test(COMMON), true);
check('短解析早退（不加按钮不折叠）',
    /if \(key\.length <= EXPL_COLLAPSE_LEN\) return;/.test(COMMON), true);

console.log('\n--- 二、style.css 规则 ---');
check('收起态 max-height 152px + overflow hidden',
    /#?\.explanation-body\.expl-collapsed \{\s*\n\s*max-height: 152px;\s*\n\s*overflow: hidden;/.test(CSS), true);
check('收起态底部渐隐 ::after（用卡片底色变量，亮暗通用）',
    /\.explanation-body\.expl-collapsed::after \{[^}]*linear-gradient\(rgba\(var\(--card-rgb\), 0\), rgba\(var\(--card-rgb\), var\(--ui-alpha\)\)\)/s.test(CSS), true);
check('展开/收起按钮 .expl-toggle（胶囊描边，暗色有覆盖）',
    CSS.includes('.expl-toggle {') && CSS.includes('.dark .expl-toggle {'), true);
check('易错点强调 .expl-key（黄底 + 左黄条）',
    /\.explanation-body \.expl-key \{[^}]*rgba\(250, 204, 21, \.14\)[^}]*#e8b60f/s.test(CSS), true);
check('规则不与既有解析样式冲突（写在 .explanation-empty 之后、响应式之前）',
    CSS.indexOf('.explanation-body.expl-collapsed {') > CSS.indexOf('.explanation-empty {') &&
    CSS.indexOf('.explanation-body.expl-collapsed {') < CSS.indexOf('/* 响应式 */'), true);

// ---------- 2. jsdom 真实执行 ----------
console.log('\n--- 三、jsdom 行为 ---');
const LONG = '<p>' + '多层循环展开推导：把外层 i 取值 1,2,4,8,… 逐趟列出并统计内层执行次数，再对等比数列求和。'.repeat(6) + '</p>';
const LONG_KEY = '<p>' + '先按常规思路逐趟展开推导，中间涉及多步代数化简与不等式放缩，篇幅较长。'.repeat(8) + '</p>' +
                 '<p>易错点：别把 2t 与 t+1 的下标混用。</p>';
const SHORT = '<p>SMTP 端口号 25，POP3 端口号 110。</p>';

const html = `<!DOCTYPE html><html><body>
<div class="question-card" id="cardA">
  <div class="question-content">题干A：下列说法正确的是（ ）</div>
  <div class="explanation-panel"><div class="explanation-body" id="longA">${LONG}</div></div>
</div>
<div class="question-card" id="cardS">
  <div class="question-content">题干S：SMTP 端口号是？</div>
  <div class="explanation-panel"><div class="explanation-body" id="shortA">${SHORT}</div></div>
</div>
<div class="question-card" id="cardK">
  <div class="question-content">题干K：分析该算法的饥饿现象</div>
  <div class="explanation-panel"><div class="explanation-body" id="longKey">${LONG_KEY}</div></div>
</div>
</body></html>`;

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/quiz.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.alert = () => { };
      w.scrollTo = () => { };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    }
  });
  const w = dom.window, d = w.document;
  // 内联 common.js（MutationObserver + enhanceExplanation 所在），同步执行到 explScan()
  const s = d.createElement('script');
  s.textContent = COMMON;
  d.body.appendChild(s);

  const longA = d.getElementById('longA');
  const shortA = d.getElementById('shortA');
  const longKey = d.getElementById('longKey');

  check('长解析收起（expl-collapsed）', longA.classList.contains('expl-collapsed'), true);
  const btnA = longA.nextElementSibling;
  check('长解析带展开按钮且在 body 之后', !!btnA && btnA.classList.contains('expl-toggle'), true);
  check('按钮初始文案「展开完整解析 ▾」', btnA.textContent, '展开完整解析 ▾');
  check('短解析原样全显（无折叠无按钮）',
      !shortA.classList.contains('expl-collapsed') && !shortA.nextElementSibling?.classList.contains('expl-toggle'), true);
  check('短解析也不写展开记忆（正文字数未过阈值）',
      w.eval('_explExpanded.size'), 0);

  check('易错点段被提到最前', longKey.firstElementChild.textContent.startsWith('易错点'), true);
  check('易错点段带 expl-key 黄色强调', longKey.firstElementChild.classList.contains('expl-key'), true);
  check('长解析（带易错点）同样收起', longKey.classList.contains('expl-collapsed'), true);

  // 展开按钮点击
  btnA.click();
  check('点击后展开（去掉 expl-collapsed）', longA.classList.contains('expl-collapsed'), false);
  check('按钮文案变「收起解析 ▴」', btnA.textContent, '收起解析 ▴');
  check('展开状态写入记忆', w.eval('_explExpanded.size'), 1);

  // 防重入：重复增强不重复插按钮
  w.eval('enhanceExplanation(document.getElementById("longA"))');
  check('重复增强不追加第二个按钮',
      d.querySelectorAll('#cardA .expl-toggle').length, 1);

  // 模拟面板重渲染（innerHTML 整块替换，同题干同解析）→ 展开状态不丢
  const cardA = d.getElementById('cardA');
  const fresh = cardA.cloneNode(false);
  fresh.innerHTML = '<div class="question-content">题干A：下列说法正确的是（ ）</div>' +
      '<div class="explanation-panel"><div class="explanation-body">' + LONG + '</div></div>';
  cardA.replaceWith(fresh);
  await new Promise(r => setTimeout(r, 30));   // 等 MutationObserver 微任务
  const freshBody = fresh.querySelector('.explanation-body');
  const freshBtn = freshBody.nextElementSibling;
  check('同题重渲染后仍保持展开（不回折叠）', freshBody.classList.contains('expl-collapsed'), false);
  check('同题重渲染按钮仍为「收起解析 ▴」', freshBtn?.textContent, '收起解析 ▴');

  // 换一道长题（不同正文）→ 回到默认折叠
  const other = d.createElement('div');
  other.innerHTML = '<div class="question-card"><div class="question-content">题干B</div>' +
      '<div class="explanation-panel"><div class="explanation-body">' +
      '<p>' + '另一道题的长解析，正文完全不同，不应继承上一题的展开状态。'.repeat(10) + '</p>' +
      '</div></div></div>';
  d.body.appendChild(other);
  await new Promise(r => setTimeout(r, 30));
  const otherBody = other.querySelector('.explanation-body');
  check('换题后新长解析回到默认折叠', otherBody.classList.contains('expl-collapsed'), true);
  check('新长解析按钮为「展开完整解析 ▾」', otherBody.nextElementSibling?.textContent, '展开完整解析 ▾');

  // 收回展开状态 → 从记忆中移除
  freshBtn.click();
  check('手动收起后从记忆移除', w.eval('_explExpanded.size'), 0);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
