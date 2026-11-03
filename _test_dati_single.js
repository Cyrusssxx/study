// dati.html 大题专项「单题模式（一题一题加载）」回归测试
//
// 覆盖点：
//   1) 默认进入单题模式，DOM 中只有 1 张题卡；题干图直接挂 src（不走 data-src 懒挂载）
//   2) 切题时上一题整体从 DOM 移除 —— 即"一题一题加载"，不会累积请求
//   3) 答案图与题干一并加载（节点在 DOM 内但不展开）——点「查看答案」只是展开，不再等网络
//   4) 首题「上一题」/ 末题「下一题」不越界；切换后进度与 localStorage 同步
//   5) 键盘 ← / → 切题；焦点在笔记输入框时不拦截
//   6) singleGoTo：目标题不在当前筛选集内时自动退回「全部」再定位（避免点了没反应）
//   7) setView：切列表模式渲染章节折叠 + data-src 懒挂载，切回单题模式恢复正常
//   8) 切题前未保存的笔记自动落库（flushDatiNote）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_single.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const ROOT = __dirname;
const DATI_PATH = path.resolve(ROOT, process.env.DATI_HTML || 'pwa/dati.html');
const DATI_SRC = fs.readFileSync(DATI_PATH, 'utf8');
const DATI_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/dati.json'), 'utf8'));
const styleText = (DATI_SRC.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];   // 断言 CSS 规则用

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(30);
  }
  return false;
}

// 把某科目的题按「章 → 节 → 题」拉平成与页面 flatItems 相同的顺序
function flat(subKey) {
  const sub = DATI_DATA.subjects.find(s => s.key === subKey);
  const out = [];
  for (const ch of sub.chapters)
    for (const sec of ch.sections)
      for (const q of sec.questions) out.push({ q, chName: ch.name, secName: sec.name });
  return out;
}

(async () => {
  let html = DATI_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  });

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });   // 忽略 jsdom 的 scrollTo 等未实现告警

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/dati.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      // jsdom 未实现 scrollIntoView / scrollTo（真实浏览器均有）——补桩，否则 toggleAnswer 抛错
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        if (u.includes('data/dati.json')) {
          return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DATI_DATA)) };
        }
        return { ok: true, status: 200, json: async () => ({ questions: [], chapters: [] }) };
      };
    }
  });
  const w = dom.window;
  const doc = w.document;

  const root = () => doc.getElementById('datiRoot');
  const cards = () => [...root().querySelectorAll('.dati-qcard')];
  const srcImgs = () => [...root().querySelectorAll('img[src*="data/dati_figs/"]')];
  const lazyImgs = () => [...root().querySelectorAll('img[data-src]')];
  const curId = () => {
    const c = cards()[0];
    return c ? c.id.replace(/^q/, '') : '';
  };
  const prog = () => {
    const el = root().querySelector('.dati-single-prog');
    return el ? el.textContent.trim() : '';
  };
  const items = () => flat(w.localStorage.getItem('datiSubject') || 'os');

  // ---------- 初始化 ----------
  const ok = await waitFor(() => cards().length > 0);
  check('页面加载出题卡', ok, true);

  console.log('\n--- 场景 1：默认单题模式 ---');
  check('默认视图模式 = single', w.localStorage.getItem('datiView') ?? 'single', 'single');
  check('DOM 中只有 1 张题卡', cards().length, 1);

  const L = items();
  check('当前题 = 集合首题', curId(), L[0].q.id);
  check('进度显示 1 / N', prog(), `1 / ${L.length}`);
  check('单题模式胶囊高亮', doc.getElementById('fSingle').classList.contains('active'), true);
  check('列表胶囊未高亮', doc.getElementById('fList').classList.contains('active'), false);
  check('「展开全部」在单题模式隐藏', doc.getElementById('datiExpandAll').style.display, 'none');

  console.log('\n--- 场景 2：一题一题加载（图片随题切换） ---');
  const q0 = L[0].q, q1 = L[1].q;
  check('题干图直接挂 src（不走惰挂载）', lazyImgs().length, 0);
  check('当前题题干图数量正确', srcImgs().filter(i => i.src.includes(q0.id.replace(/^dati_/, 'dati_'))).length >= q0.q.length, true);
  const imgsOfQ = (q) => srcImgs().filter(i => q.q.some(fn => i.getAttribute('src').endsWith(fn)));
  check('第 1 题题干图已进 DOM', imgsOfQ(q0).length, q0.q.length);
  check('第 2 题题干图未进 DOM', imgsOfQ(q1).length, 0);
  check('答案图随题干一并就绪', root().querySelectorAll('img[src*="_a_"]').length, q0.a.length);
  check('答案区默认不展开（仍是做题状态）', root().querySelector('.dati-abody').classList.contains('open'), false);
  check('答案区已填充（filled=1，无需再注入）', root().querySelector('.dati-abody').dataset.filled, '1');

  w.singleStep(1);
  await sleep(60);
  check('切题后第 2 题题干图已进 DOM', imgsOfQ(q1).length, q1.q.length);
  check('切题后第 1 题图片已从 DOM 移除', imgsOfQ(q0).length, 0);
  check('仍只有 1 张题卡', cards().length, 1);
  check('当前题切换到第 2 题', curId(), q1.id);
  check('localStorage 记住当前题', w.localStorage.getItem('datiSingleQ'), q1.id);
  check('进度更新为 2 / N', prog(), `2 / ${L.length}`);
  check('切题后答案图同步就绪', root().querySelectorAll('img[src*="_a_"]').length, q1.a.length);
  check('切换后答案区仍未展开', root().querySelector('.dati-abody').classList.contains('open'), false);

  console.log('\n--- 场景 3：答案点开即显示（图已随题一并加载） ---');
  const abox = () => root().querySelector('.dati-abody');
  check('点开前答案区已填充 filled=1', abox().dataset.filled, '1');
  const aCountBefore = root().querySelectorAll('img[src*="_a_"]').length;
  w.toggleAnswer(q1.id);
  await sleep(30);
  check('点「查看答案」后展开（无需等网络）', abox().classList.contains('open'), true);
  check('展开未产生重复注入', root().querySelectorAll('img[src*="_a_"]').length, aCountBefore);
  w.toggleAnswer(q1.id);
  await sleep(30);
  check('收起后 open 类移除', abox().classList.contains('open'), false);
  check('收起后填充状态保留（再次点开不重复注入）', abox().dataset.filled, '1');

  console.log('\n--- 场景 3b：底栏已弃用 → 题卡「查看答案」+ 左右箭头 ---');
  const q2 = L[2].q;
  w.singleGoTo(q2.id);
  await sleep(60);
  check('底栏整条已移除', root().querySelectorAll('.dati-single-bar').length, 0);
  check('左右箭头各一枚', root().querySelectorAll('.dati-arrow').length, 2);
  check('箭头为 fixed 定位（滚动恒在两侧）', /\.dati-arrow\s*\{[^}]*position:\s*fixed/.test(styleText), true);
  check('新题答案图已就绪', root().querySelectorAll('img[src*="_a_"]').length, q2.a.length);
  check('新题答案区未展开', root().querySelector('.dati-abody').classList.contains('open'), false);
  const cardAnsBtn = () => root().querySelector('.dati-ans-btn');
  check('题卡内保留「查看答案」按钮', !!cardAnsBtn(), true);
  cardAnsBtn().click();
  await sleep(80);
  check('点题卡按钮后答案区展开', root().querySelector('.dati-abody').classList.contains('open'), true);
  check('展开后图片数量不变（未重复注入）', root().querySelectorAll('img[src*="_a_"]').length, q2.a.length);
  cardAnsBtn().click();
  await sleep(80);
  check('再点收起后答案区关闭', root().querySelector('.dati-abody').classList.contains('open'), false);

  console.log('\n--- 场景 4：边界与键盘 ---');
  w.singleGoTo(L[0].q.id);           // 回第一题
  await sleep(40);
  check('回到第 1 题', curId(), L[0].q.id);
  w.singleStep(-1);
  await sleep(30);
  check('首题「上一题」不越界', curId(), L[0].q.id);

  const lastQ = L[L.length - 1].q;
  w.singleGoTo(lastQ.id);
  await sleep(40);
  check('跳到末题', curId(), lastQ.id);
  w.singleStep(1);
  await sleep(30);
  check('末题「下一题」不越界', curId(), lastQ.id);

  w.singleGoTo(L[0].q.id);
  await sleep(40);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(60);
  check('键盘 → 切到下一题', curId(), L[1].q.id);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await sleep(60);
  check('键盘 ← 切回上一题', curId(), L[0].q.id);

  // 焦点在笔记输入框内时，方向键不切题
  w.toggleNotePanel(L[0].q.id);
  await sleep(30);
  const ta = root().querySelector(`[data-note-input="${L[0].q.id}"]`);
  check('笔记编辑器为富文本 contenteditable（非 textarea）', ta.tagName + ':' + ta.getAttribute('contenteditable'), 'DIV:true');
  check('笔记面板含富文本工具条（加粗按钮）',
    !!ta.closest('.dati-note-panel').querySelector('.note-toolbar [data-cmd="bold"]'), true);
  ta.focus();
  ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(50);
  check('输入框内的方向键不切题', curId(), L[0].q.id);

  console.log('\n--- 场景 5：切题前自动落库笔记（flushDatiNote） ---');
  ta.innerHTML = '单题模式下的笔记内容';
  w.singleStep(1);
  await sleep(200);
  const notesRows = await w.dbAll('notes');
  const saved = notesRows.find(n => n.question_id === L[0].q.id);
  check('切题前未保存的笔记已入库', !!(saved && saved.content.includes('单题模式下的笔记内容')), true);

  console.log('\n--- 场景 6：singleGoTo 目标不在筛选集内时退回「全部」 ---');
  // 切到「已练」筛选：全新 localStorage 下无已练题 → 空集，此时跳任意题都应能自动兜底
  w.setFilter('done');
  await sleep(80);
  check('已练筛选下无题（空态）', cards().length, 0);
  check('筛选已切到 done', w.localStorage.getItem('datiFilter'), 'done');
  w.singleGoTo(L[3].q.id);
  await sleep(80);
  check('跳转后筛选退回 all', w.localStorage.getItem('datiFilter'), 'all');
  check('跳转后定位到目标题', curId(), L[3].q.id);

  console.log('\n--- 场景 7：列表模式切换 ---');
  w.setFilter('all');
  await sleep(60);
  w.setView('list');
  await sleep(80);
  check('列表模式已持久化', w.localStorage.getItem('datiView'), 'list');
  check('列表模式渲染章节折叠', root().querySelectorAll('details.daka-group').length > 0, true);
  check('列表模式题干图走惰挂载', lazyImgs().length > 0, true);
  check('列表模式无左右箭头', root().querySelectorAll('.dati-arrow').length, 0);
  check('「展开全部」恢复显示', doc.getElementById('datiExpandAll').style.display, '');
  check('列表胶囊高亮', doc.getElementById('fList').classList.contains('active'), true);

  w.setView('single');
  await sleep(80);
  check('切回单题模式只有 1 张题卡', cards().length, 1);
  check('切回单题模式无惰挂载图', lazyImgs().length, 0);

  console.log('\n--- 场景 8：模式切换后单题定位兜底 ---');
  w.setMode('year');                 // 真题模式：按年份倒序（原"统考真题"筛选已并入模式）
  await sleep(120);
  const yearItems = items();
  check('真题模式下有题', yearItems.length > 0, true);
  check('单题定位在年份集合内', yearItems.map(x => x.q.id).includes(curId()), true);
  w.setMode('chapter');
  await sleep(100);

  console.log('\n--- 场景 9：左右悬浮箭头（首题/末题禁用，切题后状态更新） ---');
  const prevA = () => doc.getElementById('datiArrowPrev');
  const nextA = () => doc.getElementById('datiArrowNext');
  check('左右箭头各一枚', root().querySelectorAll('.dati-arrow').length, 2);
  check('左箭头带 prev 类（贴左边）', prevA().classList.contains('prev'), true);
  check('右箭头带 next 类（贴右边）', nextA().classList.contains('next'), true);

  w.singleGoTo(L[0].q.id);
  await sleep(60);
  check('首题：上一题箭头禁用', prevA().disabled, true);
  check('首题：下一题箭头可用', nextA().disabled, false);

  nextA().click();
  await sleep(80);
  check('点右箭头切到第 2 题', curId(), L[1].q.id);
  check('第 2 题：上一题箭头恢复可用', prevA().disabled, false);

  prevA().click();
  await sleep(80);
  check('点左箭头切回第 1 题', curId(), L[0].q.id);

  w.singleGoTo(L[L.length - 1].q.id);
  await sleep(60);
  check('末题：下一题箭头禁用', nextA().disabled, true);
  check('末题：上一题箭头可用', prevA().disabled, false);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
