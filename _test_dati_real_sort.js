// dati.html 大题专项（纯真题版）回归测试：章节模式 / 真题模式 / 笔记层级 / 左右箭头
//
// 覆盖点：
//   1) 数据只剩统考真题（每题 real=true），每节 num 从 1 连续
//   2) 「真题模式」：单题顺序按年份倒序（2025→2009），列表与导航按年份分组
//   3) 年份下拉只在真题模式生效，选中后只留该年
//   4) 「章节模式」：单题按章节顺序，列表与导航按章节分组
//   5) 题卡内 DOM 顺序：笔记面板在答案面板上面
//   6) 底栏已弃用，改左右悬浮箭头；首/末题禁用
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_real_sort.js
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
const styleText = (DATI_SRC.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await sleep(30); }
  return false;
}

const subData = key => DATI_DATA.subjects.find(s => s.key === key);
// 章节顺序（与页面 mode=chapter 的 flatItems 一致）
function chapterOrdered(key) {
  const out = [];
  for (const ch of subData(key).chapters) for (const sec of ch.sections) for (const q of sec.questions) out.push(q);
  return out;
}
// 年份倒序（与页面 mode=year 的 flatItems 一致）
function yearOrdered(key) {
  return chapterOrdered(key).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

(async () => {
  const html = DATI_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  });

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/dati.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.scrollTo = () => { };
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        if (u.includes('data/dati.json')) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DATI_DATA)) };
        return { ok: true, status: 200, json: async () => ({ questions: [], chapters: [] }) };
      };
    }
  });
  const w = dom.window, doc = w.document;
  const root = () => doc.getElementById('datiRoot');
  const cards = () => [...root().querySelectorAll('.dati-qcard')];
  const curId = () => { const c = cards()[0]; return c ? c.id.replace(/^q/, '') : ''; };

  const ok0 = await waitFor(() => cards().length > 0);
  check('页面加载出题卡', ok0, true);
  const subKey = w.localStorage.getItem('datiSubject') || 'os';
  const chapQ = chapterOrdered(subKey);
  const yearQ = yearOrdered(subKey);

  console.log('\n--- 场景 1：数据只剩真题 ---');
  const allReal = DATI_DATA.subjects.every(s => s.chapters.every(c => c.sections.every(sec => sec.questions.every(q => q.real))));
  check('全部题目均为统考真题', allReal, true);
  check('总题数 = 89', DATI_DATA.subjects.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.sections.reduce((k, sec) => k + sec.questions.length, 0), 0), 0), 89);
  check('每节 num 从 1 连续', DATI_DATA.subjects.every(s => s.chapters.every(c => c.sections.every(sec => sec.questions.every((q, i) => q.num === i + 1)))), true);
  check('旧的「全部/统考真题」胶囊已移除', [!!doc.getElementById('fAll'), !!doc.getElementById('fReal')], [false, false]);
  check('章节/真题两个模式胶囊存在', [!!doc.getElementById('fModeChapter'), !!doc.getElementById('fModeYear')], [true, true]);

  console.log('\n--- 场景 2：章节模式（默认） ---');
  check('默认模式 = chapter', w.localStorage.getItem('datiMode') ?? 'chapter', 'chapter');
  check('章节模式单题首题 = 章节顺序首题', curId(), chapQ[0].id);
  check('章节模式年份下拉隐藏', doc.getElementById('yearSel').style.display, 'none');

  w.setView('list');
  await sleep(250);
  const chGroups = [...root().querySelectorAll('details.daka-group')];
  const chWithQ = subData(subKey).chapters.filter(c => c.sections.some(s => s.questions.length));
  check('列表分组数 = 有题章节数', chGroups.length, chWithQ.length);
  check('组标题 = 章名开头', chGroups[0].querySelector('.daka-group-title').textContent.includes(chWithQ[0].name.split('  ')[1] || ''), true);
  const navCh = [...doc.querySelectorAll('#datiNav .num-group-title')].map(e => e.textContent.trim());
  check('导航分组 = 章名', navCh[0], chWithQ[0].name);

  console.log('\n--- 场景 3：真题模式（按年份倒序） ---');
  w.setMode('year');
  await sleep(200);
  check('模式已持久化', w.localStorage.getItem('datiMode'), 'year');
  check('真题模式单题首题 = 最新年份首题', curId(), yearQ[0].id);
  check('首题为最新年份', w.eval('flatItems()[0].q.year'), yearQ[0].year);
  check('末题为最早年份', w.eval(`flatItems()[${yearQ.length - 1}].q.year`), yearQ[yearQ.length - 1].year);
  check('年份序列严格非递增', w.eval('flatItems().map(i=>Number(i.q.year))').every((y, i, a) => i === 0 || a[i - 1] >= y), true);
  check('真题模式显示年份下拉', doc.getElementById('yearSel').style.display, '');

  const yearsExpected = [...new Set(yearQ.map(q => q.year))];
  const groups = [...root().querySelectorAll('details.daka-group')];
  check('列表分组数 = 年份数', groups.length, yearsExpected.length);
  const titles = groups.map(g => g.querySelector('.daka-group-title').textContent);
  check('首组标题 = 最新年份', titles[0], `${yearsExpected[0]} 年统考真题（${yearQ.filter(q => q.year === yearsExpected[0]).length} 题）`);
  check('末组 = 最早年份', titles[titles.length - 1].startsWith(String(yearsExpected[yearsExpected.length - 1])), true);
  const navTitles = [...doc.querySelectorAll('#datiNav .num-group-title')].map(e => e.textContent.trim());
  check('导航分组数 = 年份数', navTitles.length, yearsExpected.length);
  check('导航首组 = 最新年份', navTitles[0], `${yearsExpected[0]} 年统考真题`);

  console.log('\n--- 场景 4：年份下拉（仅真题模式生效） ---');
  const y0 = yearsExpected[0], n0 = yearQ.filter(q => q.year === y0).length;
  w.setYear(String(y0));
  await sleep(150);
  check(`选 ${y0} 年只剩该年题`, w.eval('flatItems().length'), n0);
  check('全部是该年题', w.eval(`flatItems().every(i=>Number(i.q.year)===${y0})`), true);
  w.setMode('chapter');
  await sleep(150);
  check('切回章节模式后不再按年份过滤', w.eval('flatItems().length'), chapQ.length);
  w.setYear('');
  w.setMode('year');
  await sleep(120);

  console.log('\n--- 场景 5：笔记面板在答案上面 ---');
  w.setMode('chapter');
  w.setView('single');
  await sleep(250);
  const card0 = cards()[0];
  const cls = [...card0.children].map(el => String(el.className));
  const iNote = cls.findIndex(c => c.includes('note-panel'));
  const iAns = cls.findIndex(c => c.includes('dati-abody'));
  check('笔记与答案都在题卡内', iNote > -1 && iAns > -1, true);
  check('笔记面板在答案面板之前', iNote < iAns, true);

  console.log('\n--- 场景 6：左右悬浮箭头 ---');  check('底栏整条不再渲染', doc.querySelectorAll('.dati-single-bar').length, 0);
  check('左右箭头各一枚', root().querySelectorAll('.dati-arrow').length, 2);
  check('箭头 fixed 定位 + 垂直居中', /\.dati-arrow\s*\{[^}]*position:\s*fixed[^}]*top:\s*50%/.test(styleText), true);
  w.setMode('year');
  await sleep(200);
  w.singleGoTo(yearQ[0].id);
  await sleep(100);
  check('真题模式首题：左箭头禁用', doc.getElementById('datiArrowPrev').disabled, true);
  w.singleGoTo(yearQ[yearQ.length - 1].id);
  await sleep(100);
  check('真题模式末题：右箭头禁用', doc.getElementById('datiArrowNext').disabled, true);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('异常:', e && e.stack); process.exit(1); });
