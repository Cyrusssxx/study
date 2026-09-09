// warmFigureCache 性能回归：去重 + 并发上限
// 一次性丢 50 个 URL(含重复)，断言 fetch 被去重、并发峰值 ≤ 3。
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://x.test/' });
const { window } = dom;
const document = window.document;

// 从 common.js 抽取 warmFigureCache 相关代码段执行
const src = fs.readFileSync('pwa/js/common.js', 'utf-8');
const start = src.indexOf('const _warmedSet');
const end = src.indexOf('function applyDark');
const code = src.slice(start, end);

let fetched = [];          // 记录 fetch 调用
let inFlight = 0, peak = 0;
window.fetch = (u) => {
  fetched.push(u);
  inFlight++;
  peak = Math.max(peak, inFlight);
  return new Promise(res => setTimeout(() => { inFlight--; res({ ok: true }); }, 5));
};

new Function('window', 'document', 'fetch', code + '\nwindow.warmFigureCache = warmFigureCache;')(window, document, window.fetch);

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

(async () => {
  // 50 个 URL 其中 10 个重复
  const urls = [];
  for (let i = 0; i < 50; i++) urls.push('img_' + (i % 10) + '.png');   // 实际 10 个唯一
  window.warmFigureCache(urls);
  await new Promise(r => setTimeout(r, 30));
  assert(new Set(fetched).size === 10, '去重后只 fetch 10 个唯一 URL, 实际 ' + new Set(fetched).size);
  assert(peak <= 3, '并发峰值 3, 实际 ' + peak);

  // 再次调用同 URL 不再重复
  const before = fetched.length;
  window.warmFigureCache(['img_0.png', 'img_1.png']);
  await new Promise(r => setTimeout(r, 20));
  assert(fetched.length === before, '重复调用不再 fetch, 实际 ' + fetched.length + ' vs ' + before);

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();