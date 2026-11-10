// 折叠面板「向下展开」回归（2026-11-07）
//
// 用户要求：答案、笔记等按钮的展开逻辑统一向下展开。
// 根因：旧实现用 panel.scrollIntoView({block:'nearest'})，浏览器为把整块面板塞进
//       视口可能向上滚动，把刚点的按钮顶出屏幕，视觉上像面板「往上弹」。
// 现行实现（zhenti.js / dati.html 同源，2026-11-10 第二次收敛）：
//   · 用户反馈「点一下画面就跟着移动」——旧版把按钮固定带到视口 30% 高，
//     按钮在中下部时要向下滚几百像素；
//   · 新规则：按钮下方还有 140px 余量就**完全不滚**；只有贴近视口底部才补
//     最小滚动量，且不把按钮滚出顶部 84px；永不向上滚；
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
  check(`${name}：有 revealBelow(btn)`, /function revealBelow\(btn\)/.test(src), true);
  check(`${name}：不再用 scrollIntoView({block:'nearest'}) 展开面板`,
    /block:\s*'nearest'/.test(src), false);
  check(`${name}：有 140px 余量阈值`, /const REVEAL_HEADROOM = 140;/.test(src), true);
  check(`${name}：空间够就完全不滚`, /if \(gap >= REVEAL_HEADROOM\) return;/.test(src), true);
  check(`${name}：贴底只补最小滚动量`,
    /if \(need > 2\) window\.scrollBy\(\{ top: need, behavior: 'smooth' \}\)/.test(src), true);
  check(`${name}：不再把按钮固定带到 30% 视口高`,
    /Math\.max\(84, Math\.min\(vh \* 0\.3, 220\)\)/.test(src), false);
}
check('zhenti：三类按钮都有 data-toggle',
  ['ans', 'note', 'kp'].every(k => ZT.includes(`data-toggle="${k}"`)), true);
check('zhenti：答案 / 笔记 / 考点分析三处都调用 revealCardPanel',
  (ZT.match(/revealCardPanel\(iid, '(ans|note|kp)'/g) || []).length, 3);
check('zhenti：仅展开时滚（收起不滚）',
  /if \(opening\) revealCardPanel\(iid, 'ans'/.test(ZT) && /if \(!opening\) return;/.test(ZT), true);
check('dati：答案 / 笔记两处都调用 revealBelow(btn)',
  (DATI.match(/revealBelow\(btn\);/g) || []).length >= 2, true);
check('dati：笔记聚焦不触发滚动',
  /el\.focus\(\{ preventScroll: true \}\)/.test(DATI), true);

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
      Object.defineProperty(w, 'innerHeight', { value: 768, configurable: true });
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

  // vh 固定 768（beforeParse 里 defineProperty），按钮高 30
  // ① 按钮在视口中部（下方余量充足）→ 展开时完全不滚
  btnTop = 300;
  scrolls.length = 0;
  clickAns();
  await sleep(120);
  check('视口中部展开答案：完全不滚', scrolls.length, 0);
  check('答案面板确实展开了', !!doc.querySelector('.question-card .explanation-panel'), true);

  // ② 收起：完全不滚
  scrolls.length = 0;
  clickAns();
  await sleep(120);
  check('收起答案：完全不滚', scrolls.length, 0);

  // ③ 贴近视口底部（bottom=730，gap=38）→ 只补 140-38=102
  btnTop = 700;
  scrolls.length = 0;
  clickAns();
  await sleep(120);
  check('贴底展开：触发一次滚动', scrolls.length, 1);
  check('补的量 = 140 - gap（102）', scrolls.length ? Math.round(scrolls[0].top) : -1, 102);
  check('只向下滚', scrolls.every(s => s.top > 0), true);
  check('平滑滚动', scrolls.every(s => s.behavior === 'smooth'), true);

  // ④ 已越过视口底部（bottom=790，gap=-22）→ 162，且不超过「按钮到距顶 84」
  btnTop = 760;
  scrolls.length = 0;
  clickAns();                       // 先收起
  await sleep(60);
  scrolls.length = 0;
  clickAns();                       // 再展开
  await sleep(120);
  check('越出视口底：仍只向下滚', scrolls.every(s => s.top > 0), true);
  check('滚动量不超过按钮到距顶 84 的余量', scrolls.length ? scrolls[0].top <= 162 : false, true);

  // ⑤ 笔记按钮同逻辑：视口中部不滚
  btnTop = 300;
  scrolls.length = 0;
  const nb = doc.querySelector('.question-card [data-toggle="note"]');
  check('能取到笔记按钮', !!nb, true);
  if (nb) nb.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(160);
  check('视口中部展开笔记：完全不滚', scrolls.length, 0);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
