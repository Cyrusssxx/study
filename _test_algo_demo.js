// 算法讲义「排序可视化」单步演示回归（2026-11-02）
//
// 需求：① 演示支持「上一步 / 下一步」逐帧查看；② 柱顶的 i / j 指针要显眼。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_algo_demo.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'pwa/algo.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

console.log('--- 一、控制条：上一步 / 下一步 按钮存在 ---');
check('有 data-qs-prev', /data-qs-prev/.test(SRC), true);
check('有 data-qs-next', /data-qs-next/.test(SRC), true);
check('初始状态「上一步」禁用', /data-qs-prev disabled/.test(SRC), true);
check('CSS 有禁用态', /\.qs-btn:disabled/.test(CSS), true);

console.log('\n--- 二、指针徽标样式 ---');
check('指针用实心徽标（tip-li 等类）', /\.qs-bar > s\.qs-tip\.tip-li\s*\{[^}]*background/.test(CSS), true);
check('指针下方有指示三角', /\.qs-tip\.tip-li::after\s*\{[^}]*border-top-color/.test(CSS), true);
check('i 与 j 重合时用独立颜色', /\.qs-tip\.tip-both\s*\{/.test(CSS), true);

console.log('\n--- 三、行为：渲染出的帧带正确指针 ---');
// 抽取渲染函数，喂一帧手工数据，检查柱顶徽标
const renderFn = SRC.match(/function qsRenderFrame\(dm, f\)[\s\S]*?\n    \}/)[0];
const dom = new JSDOM(
  '<div class="qs-demo"><div class="qs-stage" data-qs-stage></div><div data-qs-msg></div></div>',
  { runScripts: 'outside-only' }
);
const w = dom.window;
w.eval(renderFn + '\nwindow.qsRenderFrame = qsRenderFrame;');
const dm = w.document.querySelector('.qs-demo');
w.qsRenderFrame(dm, {
  a: [30, 10, 20], lo: 0, hi: 2,
  li: 1, rj: 2, pi: 0, swp: null, fixed: new Set(), msg: '测试帧'
});
const bars = [...dm.querySelectorAll('.qs-bar')];
check('渲染 3 根柱子', bars.length, 3);
const tipOf = i => (bars[i].querySelector('s.qs-tip') || {}).textContent || '';
const clsOf = i => {
  const s = bars[i].querySelector('s.qs-tip');
  return s ? [...s.classList].filter(c => c.startsWith('tip-')) : [];
};
check('pivot 位置显示 P', tipOf(0), 'P');
check('pivot 徽标类', clsOf(0), ['tip-pivot']);
check('i 位置显示 i', tipOf(1), 'i');
check('i 徽标类', clsOf(1), ['tip-li']);
check('j 位置显示 j', tipOf(2), 'j');
check('j 徽标类', clsOf(2), ['tip-rj']);
check('消息带区间', /\[0,2\]/.test(dm.querySelector('[data-qs-msg]').innerHTML), true);

// i 与 j 重合
w.qsRenderFrame(dm, { a: [5, 9], lo: 0, hi: 1, li: 1, rj: 1, pi: -1, swp: null, fixed: new Set(), msg: 'x' });
const b2 = [...dm.querySelectorAll('.qs-bar')];
const s2 = b2[1].querySelector('s.qs-tip');
check('i、j 重合显示 i j', s2.textContent.trim(), 'i j');
check('i、j 重合用 tip-both', s2.classList.contains('tip-both'), true);
dom.window.close();

console.log('\n--- 四、行为：上一步 / 下一步真的能逐帧走 ---');
// 抽取整套播放器（构建帧 + 渲染 + 初始化），在 jsdom 里跑一遍
const start = SRC.indexOf('function qsDemoHtml(');
const end = SRC.indexOf('function initQsDemos(');
if (start < 0 || end < 0) {
  check('能抽取播放器源码', false, true);
} else {
  const block = SRC.slice(start, end);
  const d2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const w2 = d2.window;
  try {
    w2.eval(block + '\nwindow.qsDemoHtml = qsDemoHtml; window.qsInitDemo = qsInitDemo;');
    w2.document.body.innerHTML = w2.qsDemoHtml({ kind: 'qs', title: 'T', cap: 'C' });
    const box = w2.document.querySelector('[data-qs-demo]');
    w2.qsInitDemo(box);
    const prev = box.querySelector('[data-qs-prev]');
    const next = box.querySelector('[data-qs-next]');
    const stage = box.querySelector('[data-qs-stage]');
    check('初始化后有柱子', stage.querySelectorAll('.qs-bar').length > 0, true);
    check('初始「上一步」禁用', prev.disabled, true);
    check('初始「下一步」可用', next.disabled, false);

    next.click();
    check('点一次下一步后「上一步」可用', prev.disabled, false);
    const afterOne = stage.innerHTML;

    next.click();
    const afterTwo = stage.innerHTML;
    check('再点一次画面变化', afterOne !== afterTwo, true);

    prev.click();
    check('上一步回到上一帧', stage.innerHTML, afterOne);

    prev.click();
    check('回到第一帧后「上一步」再次禁用', prev.disabled, true);

    // 一路点到底：按钮应禁用
    for (let i = 0; i < 400 && !next.disabled; i++) next.click();
    check('走到最后一帧后「下一步」禁用', next.disabled, true);
  } catch (e) {
    check('播放器可运行', false, e.message);
  }
  d2.window.close();
}

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
