// 折叠面板「向下展开」回归（2026-11-07）
//
// 用户要求：答案、笔记等按钮的展开逻辑统一向下展开。
// 根因：旧实现用 panel.scrollIntoView({block:'nearest'})，浏览器为把整块面板塞进
//       视口可能向上滚动，把刚点的按钮顶出屏幕，视觉上像面板「往上弹」。
// 新实现（zhenti.js / dati.html 同源）：
//   · 把按钮带到视口上部（≥84px、≤220px、约 30% 视口高），内容从按钮下方铺开；
//   · 只有 delta > 0 才 window.scrollBy，即只允许向下滚，绝不向上滚；
//   · 收起时完全不滚；
//   · 答案 / 笔记 / 考点分析三类按钮走同一套 revealCardPanel。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_expand_down.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ZT = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const DATI = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');

console.log('--- 一、源码：两个页面同源的向下展开逻辑 ---');
for (const [name, src] of [['zhenti.js', ZT], ['dati.html', DATI]]) {
  check(`${name}：有 revealBelow`, /function revealBelow\(btn, panel\)/.test(src), true);
  check(`${name}：不再用 scrollIntoView({block:'nearest'}) 展开面板`,
    /block:\s*'nearest'/.test(src), false);
  check(`${name}：只向下滚（delta > 2 才 scrollBy）`,
    /if \(delta > 2\) window\.scrollBy\(\{ top: delta, behavior: 'smooth' \}\)/.test(src), true);
  check(`${name}：避开 60px 顶栏`, /Math\.max\(84, Math\.min\(vh \* 0\.3, 220\)\)/.test(src), true);
}
check('zhenti：三类按钮都有 data-toggle',
  ['ans', 'note', 'kp'].every(k => ZT.includes(`data-toggle="${k}"`)), true);
check('zhenti：答案 / 笔记 / 考点分析三处都调用 revealCardPanel',
  (ZT.match(/revealCardPanel\(iid, '(ans|note|kp)'/g) || []).length, 3);
check('zhenti：仅展开时滚（收起不滚）',
  /if \(opening\) revealCardPanel\(iid, 'ans'/.test(ZT) && /if \(!opening\) return;/.test(ZT), true);
check('dati：答案展开调用 revealBelow', /revealBelow\(btn, box\)/.test(DATI), true);
check('dati：笔记展开调用 revealBelow 且聚焦不触发滚动',
  /revealBelow\(btn, p\)/.test(DATI) && /el\.focus\(\{ preventScroll: true \}\)/.test(DATI), true);

let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  console.log('\n--- 二、运行时：点击展开只向下滚，收起不滚 ---');
  const cache = {};
  const readFile = f => {
    if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    return cache[f];
  };
  const html = readFile('zhenti.html').replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
  }).replace(/<link\b[^>]*>/gi, '');

  const vc = new VC(); vc.on('jsdomError', () => { });
  const scrolls = [];
  let btnTop = 600;                    // 模拟按钮在视口下半部
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.scrollBy = opt => scrolls.push(opt);          // 捕获所有滚动
      w.scrollTo = () => { };
      const orig = w.Element.prototype.getBoundingClientRect;
      w.Element.prototype.getBoundingClientRect = function () {
        if (this.hasAttribute && this.hasAttribute('data-toggle')) {
          return { top: btnTop, bottom: btnTop + 30, left: 0, right: 200, width: 200, height: 30, x: 0, y: btnTop, toJSON() { return {}; } };
        }
        return orig.call(this);
      };
      w.fetch = async u => {
        const m = String(u).match(/data\/[\w./-]+\.(json|svg)/);
        if (m) {
          try {
            const t = readFile(m[0]);
            const isSvg = /\.svg$/.test(m[0]);
            return { ok: true, status: 200,
              text: async () => (isSvg ? t.replace(/\s*color-scheme:\s*[^;"']*/g, '') : t),
              json: async () => JSON.parse(t) };
          } catch (e) { return { ok: false, status: 404, text: async () => '', json: async () => ({}) }; }
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
    }
  });
  const w = dom.window, doc = w.document;
  for (let i = 0; i < 60; i++) { await sleep(100); if (doc.querySelectorAll('#yearList .ol-nav-item').length) break; }
  await sleep(500);

  // 默认已取消做题模式，答案按钮可直接展开（无需再切换）
  await sleep(500);
  const clickAns = () => {
    const b = doc.querySelector('.question-card [data-toggle="ans"]');
    if (b) b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return b;
  };
  check('能取到答案按钮', !!doc.querySelector('.question-card [data-toggle="ans"]'), true);

  scrolls.length = 0;
  clickAns();
  await sleep(120);
  check('展开答案：触发了滚动', scrolls.length >= 1, true);
  check('展开答案：只向下滚（top 为正）', scrolls.length > 0 && scrolls.every(s => s.top > 0), true);
  check('展开答案：平滑滚动', scrolls.length > 0 && scrolls.every(s => s.behavior === 'smooth'), true);

  scrolls.length = 0;
  clickAns();                          // 收起
  await sleep(120);
  check('收起答案：完全不滚动', scrolls.length, 0);

  // 按钮本就在视口上部时，不应再滚（避免把内容往上拽）
  btnTop = 100;
  scrolls.length = 0;
  clickAns();
  await sleep(120);
  check('按钮已在视口上部：不再滚动', scrolls.length, 0);

  // 笔记按钮同样只向下滚
  btnTop = 600;
  scrolls.length = 0;
  const nb = doc.querySelector('.question-card [data-toggle="note"]');
  if (nb) nb.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check('展开笔记：同样只向下滚', scrolls.length > 0 && scrolls.every(s => s.top > 0), true);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
