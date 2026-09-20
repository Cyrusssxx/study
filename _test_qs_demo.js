// 快速排序演示组件 冒烟测试（容器生成、预演正确性、条形图渲染）
// 用法：NODE_PATH=<workspace>/node_modules node _test_qs_demo.js
const fs = require('fs');
const path = require('path');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom'); process.exit(0); }

const ROOT = __dirname;
const SRC = fs.readFileSync(path.resolve(ROOT, 'pwa/algo.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : ' -> 实际 ' + JSON.stringify(got) + ' 期望 ' + JSON.stringify(want));
  ok ? pass++ : fail++;
}

(async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/algo.html', runScripts: 'dangerously'
  });
  const d = dom.window.document;
  const weval = s => dom.window.eval('(' + s + ')');

  // 提取 qsDemoHtml 并执行（在 jsdom 上下文求值，使函数内 document 指向 jsdom）
  const m1 = SRC.match(/function qsDemoHtml\(\) \{[\s\S]*?\n    \}/);
  const demoHtml = weval(m1[0])();
  check('qsDemoHtml 能生成容器', demoHtml.indexOf('data-qs-demo') > -1, true);
  check('容器含启动按钮(data-qs-run)', demoHtml.indexOf('data-qs-run') > -1, true);
  check('容器含重来按钮(data-qs-restart)', demoHtml.indexOf('data-qs-restart') > -1, true);
  check('容器含换组按钮(data-qs-shuffle)', demoHtml.indexOf('data-qs-shuffle') > -1, true);
  check('容器含调速按钮(data-qs-spd)', demoHtml.indexOf('data-qs-spd') > -1, true);

  // 提取 qsBuildFrames 并预演快排
  const m2 = SRC.match(/function qsBuildFrames\(arr0\) \{[\s\S]*?\n    \}/);
  const qsBuildFrames = weval(m2[0]);
  const frames = qsBuildFrames([49, 38, 65, 97, 76, 13, 27]);
  check('预演帧数 > 20', frames.length > 20, true);
  const last = frames[frames.length - 1];
  check('最后一帧 fixed 覆盖全部元素', last.fixed.size, 7);
  check('最终数组升序', JSON.stringify(last.a), JSON.stringify([13, 27, 38, 49, 65, 76, 97]));
  check('第一帧基准高亮 pi=0', frames[0].pi, 0);
  check('过程中存在交换帧 swp', frames.some(f => f.swp), true);

  // 提取 qsRenderFrame 并验证条形图渲染
  const m3 = SRC.match(/function qsRenderFrame\(dm, f\) \{[\s\S]*?\n    \}/);
  const qsRenderFrame = weval(m3[0]);
  d.body.innerHTML = demoHtml;
  const dm = d.querySelector('[data-qs-demo]');
  qsRenderFrame(dm, frames[0]);
  check('渲染 7 根柱子', d.querySelectorAll('.qs-bar').length, 7);
  check('第一根柱子高亮为基准(pivot)', d.querySelectorAll('.qs-bar.pivot').length, 1);
  const msg = dm.querySelector('[data-qs-msg]').textContent;
  check('消息含区间[0,6]', msg.indexOf('[0,6]') > -1, true);

  console.log('\nPASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();