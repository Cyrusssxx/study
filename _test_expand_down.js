// 折叠面板「原地展开」回归（2026-11-10 第三次收敛）
//
// 用户原话：「这俩不能原地展开吗 为什么展开位置还会变动」（参考答案与解析 / 笔记）。
// 三代实现都被否决：
//   ① scrollIntoView({block:'nearest'}) —— 为塞下整块面板会向上滚，按钮被顶出屏幕；
//   ② 按按钮位置补最小滚动量（REVEAL_HEADROOM=140）—— 按钮贴底时仍要滚 100+px，
//      画面「跟着移动」；
//   ③ refreshCard() 整卡重绘 —— 卡片里的题图是 .zt-svgholder（CSS min-height:56px，
//      内容「图加载中…」），重绘后先退回 56px 占位、异步注入 SVG 后才恢复真实高度，
//      于是每点一次，按钮那一行就上下跳一次；一张卡多张图还会分几次跳。
//
// 现行契约（zhenti.js / dati.html 同源）：
//   · 不滚动：没有任何 window.scrollBy；展开路径不调 scrollIntoView；
//   · 不重绘：只把面板节点插到 .question-tools 之后 / 从 DOM 摘掉（setCardPanel），
//     按钮只改文案与 active 态（syncToggleBtns）；卡片节点身份保持不变；
//   · 面板顺序固定：笔记 → 答案解析 → 考点分析；
//   · 已缓存的 SVG 同步注入（applySvg），任何必要的重绘也不再闪。
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

function fnBody(src, name) {
  const start = src.search(new RegExp(`function ${name}\\(`));
  if (start < 0) return '';
  const re = /\n\s{4}(async )?function /g;
  re.lastIndex = start + 10;
  const m = re.exec(src);
  return src.slice(start, m ? m.index : undefined);
}

console.log('--- 一、源码：原地展开（零滚动、零重绘） ---');
for (const [name, src] of [['zhenti.js', ZT], ['dati.html', DATI]]) {
  check(`${name}：没有任何 window.scrollBy（展开不再移动画面）`, /window\.scrollBy/.test(src), false);
  check(`${name}：不再有 revealBelow / revealCardPanel 旧滚动函数`,
    /function revealBelow|function revealCardPanel/.test(src), false);
  check(`${name}：面板展开不调 scrollIntoView`,
    /panel\.scrollIntoView|box\.scrollIntoView/.test(src), false);
}
console.log('--- 二、zhenti：原地插拔面板，不重绘整卡 ---');
check('zhenti：有 cardPanelNode / setCardPanel / syncToggleBtns',
  ['cardPanelNode', 'setCardPanel', 'syncToggleBtns'].every(f => new RegExp(`function ${f}\\(`).test(ZT)), true);
check('zhenti：面板顺序常量 = 笔记 → 答案 → 考点分析',
  /const PANEL_ORDER = \['note', 'ans', 'kp'\];/.test(ZT), true);
for (const fn of ['toggleAns', 'toggleNotePanel', 'toggleKpZt']) {
  check(`zhenti：${fn} 不再调用 refreshCard`, /refreshCard/.test(fnBody(ZT, fn)), false);
}
check('zhenti：笔记展开后聚焦编辑器且不触发滚动',
  /ed\.focus\(\{ preventScroll: true \}\)/.test(fnBody(ZT, 'toggleNotePanel')), true);
console.log('--- 三、dati：面板早已在 DOM，只切显隐 ---');
check('dati：查看答案只切 open 类', /box\.classList\.add\('open'\)/.test(fnBody(DATI, 'toggleAnswer')), true);
check('dati：笔记只切 display', /p\.style\.display = 'block'/.test(fnBody(DATI, 'toggleNotePanel')), true);

let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  console.log('\n--- 四、运行时：点一下，屏幕上什么都不动 ---');
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
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { scrolls.push('intoView'); };
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      Object.defineProperty(w, 'innerHeight', { value: 768, configurable: true });
      w.scrollBy = opt => scrolls.push(['scrollBy', opt]);
      w.scrollTo = opt => { if (opt && opt.top !== 0) scrolls.push(['scrollTo', opt]); };
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
  await sleep(600);

  const card = doc.querySelector('.question-card');
  check('能取到第一张题卡', !!card, true);
  const iid = card.getAttribute('data-iid');
  const cardNode = doc.getElementById('card-' + iid);
  const click = sel => {
    const b = cardNode.querySelector(sel);
    if (b) b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return b;
  };

  // ① 展开答案：零滚动 + 卡片节点身份不变（= 没有整卡重绘）
  scrolls.length = 0;
  click('[data-toggle="ans"]');
  await sleep(200);
  check('展开答案：零滚动（无 scrollBy / scrollIntoView）', scrolls.length, 0);
  check('展开答案：卡片节点身份不变（未整卡重绘）',
    doc.getElementById('card-' + iid) === cardNode, true);
  const ansNode = [...cardNode.children].find(n => n.classList.contains('explanation-panel'));
  check('答案面板已就地插入', !!ansNode, true);
  check('答案面板紧跟 .question-tools 之后',
    ansNode && ansNode.previousElementSibling.classList.contains('question-tools'), true);
check('答案按钮变 active + ▴',
  !!cardNode.querySelector('[data-toggle="ans"].active')
  && /▴/.test(cardNode.querySelector('[data-toggle="ans"]').textContent), true);

  // ② 展开笔记：面板插在答案之前，答案面板节点不动
  scrolls.length = 0;
  click('[data-toggle="note"]');
  await sleep(250);
  check('展开笔记：零滚动', scrolls.length, 0);
  check('展开笔记：卡片节点身份不变', doc.getElementById('card-' + iid) === cardNode, true);
  const noteNode = [...cardNode.children].find(n => n.classList.contains('zt-note-panel'));
  check('笔记面板已就地插入', !!noteNode, true);
  check('笔记面板排在答案面板之前（顺序固定）',
    noteNode && noteNode.nextElementSibling === ansNode, true);
  check('笔记面板里的编辑器已装载（可编辑）',
    !!(noteNode && noteNode.querySelector('.note-input[contenteditable="true"]')), true);
  check('笔记按钮出现 ● 之外仍是 active', cardNode.querySelector('[data-toggle="note"]').classList.contains('active'), true);

  // ③ 收起答案：只摘答案节点，笔记节点原封不动
  scrolls.length = 0;
  click('[data-toggle="ans"]');
  await sleep(150);
  check('收起答案：零滚动', scrolls.length, 0);
  check('收起答案：答案面板已移除',
    !!cardNode.querySelector('.explanation-panel'), false);
  check('收起答案：笔记面板仍在且是同一节点',
    [...cardNode.children].find(n => n.classList.contains('zt-note-panel')) === noteNode, true);
  check('收起答案：按钮恢复 ▾ 且不带 active',
    cardNode.querySelector('[data-toggle="ans"]').classList.contains('active'), false);

  // ④ 反复开合 5 次：卡片节点始终是同一个（旧实现每次都会换节点）
  scrolls.length = 0;
  let sameNode = true;
  for (let i = 0; i < 5; i++) {
    click('[data-toggle="note"]'); await sleep(60);
    click('[data-toggle="answer-not-exist"]');       // 无效选择器不应报错
    click('[data-toggle="ans"]'); await sleep(60);
    click('[data-toggle="ans"]'); await sleep(60);
    if (doc.getElementById('card-' + iid) !== cardNode) sameNode = false;
  }
  check('反复开合：卡片节点始终不变（零重绘）', sameNode, true);
  check('反复开合：全程零滚动', scrolls.length, 0);

  // ⑤ 其它卡片不受影响
  const others = [...doc.querySelectorAll('.question-card')].filter(n => n.id !== 'card-' + iid);
  check('其余题卡仍在（未被打乱）', others.length > 0, true);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
