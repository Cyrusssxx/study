// 真题套卷：右侧题号点击跳转的可靠性回归（2026-11-10）
//
// 用户反馈：「题号的点击跳转功能有时候还是跳不了」。
// 根因：旧实现 `el.scrollIntoView({behavior:'smooth'})`。
//   题图 / KaTeX 可拉伸括号的 SVG 是异步注入的 —— 卡片里的 .zt-svgholder 先是
//   「图加载中…」的 56px 占位，注入完成后才恢复真实高度。smooth 动画的目的地是
//   按**启动那一刻**的布局算死的；动画途中上方卡片高度变了，落点就偏，
//   偏到当前视口附近时看起来就是「点了没反应 / 只跳了一点点」。布局稳定后再点就正常，
//   于是表现为「有时候跳不了」。
//
// 现行契约：
//   ① 改为「立即跳」（window.scrollTo + 顶栏留白 GOTO_OFFSET=92），不再用 smooth；
//   ② 布局稳定后（140 / 380 / 800ms）把目标卡重新对齐 —— 只校正偏离 > 6px 的情况；
//   ③ 用户自己滚过（wheel / touchstart / 方向键）就完全放手，绝不抢滚动；
//   ④ 同一毫秒基准的跳转才校正（跳到别处就不再纠正旧目标）。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_goto.js
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

console.log('--- 一、源码：立即跳 + 事后校正，不再 smooth scrollIntoView ---');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
check('gotoQ 不再用 el.scrollIntoView', /el\.scrollIntoView\(/.test(JS), false);
check('gotoQ 用 window.scrollTo 立即定位', /window\.scrollTo\(0, top\)/.test(JS), true);
check('顶栏留白常量 GOTO_OFFSET = 92', /const GOTO_OFFSET = 92;/.test(JS), true);
check('布局稳定后做 3 次校正（140/380/800）', /\[140, 380, 800\]\.forEach/.test(JS), true);
check('校正前避让用户滚动（userScrollAt > clickedAt）', /if \(userScrollAt > clickedAt\) return;/.test(JS), true);
check('用户滚动信号：wheel / touchstart / 方向键',
  /addEventListener\('wheel'/.test(JS) && /addEventListener\('touchstart'/.test(JS) &&
  /\^\(Arrow\|Page\|Home\|End\| \)/.test(JS), true);
check('跳转后立刻同步题号高亮（不等滚动事件）', /scrollToCard\(el\);\s*\n\s*syncFqCur\(\);/.test(JS), true);

let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

const PAPER = {
  y: 2020, n: 3,
  items: [
    { i: 1, t: 1, sid: 'os', s: 2, q: '题干一', o: ['甲', '乙', '丙', '丁'], a: 'A', an: '解析一', qid: 'os_0001' },
    { i: 2, t: 1, sid: 'os', s: 2, q: '题干二', o: ['甲', '乙', '丙', '丁'], a: 'B', an: '解析二' },
    { i: 3, t: 2, sid: 'os', s: 7, q: '综合题三', a: '答案三', an: '大题解析三' }
  ]
};
const INDEX = { years: [2020], counts: { 2020: { choice: 2, big: 1 } }, iids: { 2020: [] } };

(async () => {
  const page = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8')
    .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
      try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', src), 'utf8') + '</script>'; } catch (e) { return ''; }
    });

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const calls = [];                       // scrollTo 记录（单位 px）
  const dom = new JSDOM(page, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://x.test/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.__scrollY = 0;
      w.__tops = {};
      Object.defineProperty(w, 'scrollY', { get: () => w.__scrollY, configurable: true });
      Object.defineProperty(w, 'pageYOffset', { get: () => w.__scrollY, configurable: true });
      // 用可注入的假布局坐标代替 jsdom 恒为 0 的 rect
      w.Element.prototype.getBoundingClientRect = function () {
        const top = (this.id && w.__tops[this.id] != null) ? w.__tops[this.id] : 0;
        return { top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON() { return {}; } };
      };
      w.scrollTo = (x, y) => {
        const v = (typeof y === 'number') ? y : x;      // 两种签名：scrollTo(y) / scrollTo(x,y)
        calls.push(v);
        w.__scrollY = v;
      };
      w.fetch = async url => {
        const u = String(url);
        const j = o => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(o)) });
        if (/data\/zt\/index\.json/.test(u)) return j(INDEX);
        if (/data\/zt\/zt_2020\.json/.test(u)) return j(PAPER);
        if (/data\/zt_svg\//.test(u)) return { ok: true, status: 200, text: async () => '<svg></svg>' };
        return j({ questions: [], chapters: [], sections: [] });
      };
    }
  });
  const w = dom.window;
  await sleep(600);

  const cardId = iid => 'card-' + iid;
  const setTop = (iid, top) => { w.__tops[cardId(iid)] = top; };

  console.log('\n--- 二、运行时：立即跳到「卡片顶 - 92」 ---');
  // 当前 scrollY=0，第 2 题卡片在视口 y=600 → 目标滚动位置 = 600 - 92
  setTop('os_0001', 0); setTop('os_zt2020_2', 600); setTop('os_zt2020_3', 1400);
  calls.length = 0;
  w.gotoQ('os_zt2020_2');
  await sleep(30);
  check('跳转立刻滚动一次', calls.length >= 1, true);
  check('落点 = 卡片 top - 92', calls[0], 508);
  check('scrollY 已落到目标位置', w.__scrollY, 508);

  console.log('\n--- 三、SVG 注入把上方撑高后自动重新对齐 ---');
  // 模拟布局位移：滚到 508 后，卡片在视口里变成 y=292（相当于上方内容长了 200px）
  setTop('os_zt2020_2', 292);
  calls.length = 0;
  await sleep(500);                       // 等 140 / 380ms 两次校正
  check('发生校正', calls.length >= 1, true);
  check('校正到 292 + 508 - 92 = 708', calls[0], 708);

  console.log('\n--- 四、用户自己接管滚动后不再纠正 ---');
  await sleep(600);                       // 让上一轮的 800ms 校正走完
  calls.length = 0;
  w.gotoQ('os_zt2020_3');
  await sleep(20);
  const afterClick = calls.slice();
  w.dispatchEvent(new w.Event('wheel'));  // 用户开始手动滚
  setTop('os_zt2020_3', 100);             // 再制造一次位移
  await sleep(900);
  check('点击后只跳一次（不重复滚）', afterClick.length, 1);
  check('用户滚动后校正被完全放弃', calls.length, afterClick.length);

  console.log('\n--- 五、目标不在 DOM 时直接返回、不记去重 ---');
  calls.length = 0;
  w.gotoQ('os_zt2020_999');
  await sleep(60);
  check('目标缺失：不滚动', calls.length, 0);
  w.gotoQ('os_zt2020_2');                 // 紧跟一次正常跳转应生效（没被空跳记成 lastGoto）
  await sleep(30);
  check('目标缺失不污染去重：随后的跳转照常生效', calls.length, 1);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
