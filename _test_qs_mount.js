// 完整路径验证：loadAlgo 渲染后演示组件确实挂在快排代码块下方
const fs = require('fs');
const path = require('path');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过'); process.exit(0); }

const SRC = fs.readFileSync(path.resolve(__dirname, 'pwa/algo.html'), 'utf8');
const DATA = fs.readFileSync(path.resolve(__dirname, 'pwa/data/algo_notes.json'), 'utf8');

(async () => {
  const dom = new JSDOM(SRC, {
    url: 'http://localhost/algo.html', runScripts: 'dangerously',
    beforeParse(w) {
      w.fetch = (url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(DATA)) });
      // 提供 api 让 initAlgoAnnoIfReady -> loadAlgo() 走通（jsdom 无 backend.js）
      w.api = (path) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note: null }) });
      w.scrollTo = () => {};
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 300));
  const d = w.document;
  let pass = 0, fail = 0;
  const check = (n, g, x) => { const ok = JSON.stringify(g) === JSON.stringify(x); console.log((ok?'PASS':'FAIL').padEnd(5), n, ok?'':' -> '+JSON.stringify(g)+' != '+JSON.stringify(x)); ok?pass++:fail++; };

  check('页面加载无致命错误', !!d.getElementById('algoBody'), true);
  const demos = d.querySelectorAll('[data-qs-demo]');
  check('快排演示组件已挂载(1 个)', demos.length, 1);
  const demo = demos[0];
  const pre = demo.previousElementSibling;
  check('紧挨在代码块之后', pre && pre.classList.contains('algo-code'), true);
  check('演示容器内有条形图', demo.querySelectorAll('.qs-bar').length, 8);
  check('有基准高亮', demo.querySelectorAll('.qs-bar.pivot').length, 1);
  check('图例 5 项', demo.querySelectorAll('.qs-legend s').length, 5);
  check('按钮: 启动 + 换一组', !!demo.querySelector('[data-qs-run]') && !!demo.querySelector('[data-qs-shuffle]'), true);
  check('调速档 3 个', demo.querySelectorAll('[data-qs-spd]').length, 3);
  check('初始消息就绪', /准备好/.test(demo.querySelector('[data-qs-msg]').textContent), true);

  const runBtn = demo.querySelector('[data-qs-run]');
  runBtn.click();
  await new Promise(r => setTimeout(r, 60));
  check('点击后进入运行(按钮含暂停)', runBtn.textContent.indexOf('暂停') > -1, true);
  await new Promise(r => setTimeout(r, 1200));
  const stage1 = demo.querySelector('[data-qs-msg]').textContent;
  check('运行中产生进度消息(非初始就绪)', !/准备好/.test(stage1), true);

  runBtn.click();
  check('暂停后按钮含继续', runBtn.textContent.indexOf('继续') > -1, true);
  await new Promise(r => setTimeout(r, 900));
  check('暂停后文字保持继续', runBtn.textContent.indexOf('继续') > -1, true);

  demo.querySelector('[data-qs-shuffle]').click();
  await new Promise(r => setTimeout(r, 50));
  check('换组后按钮含启动', runBtn.textContent.indexOf('启动') > -1, true);
  check('换组后消息提示新数据', /新数据/.test(demo.querySelector('[data-qs-msg]').textContent), true);

  console.log('\nPASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
