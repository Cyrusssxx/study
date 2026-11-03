// dati.html 大题专项「真题按年份排序 / 笔记在上答案在下 / 底栏把手固定位置」回归测试
//
// 覆盖点：
//   1) 「统考真题」筛选下：单题模式的题目顺序按年份**倒序**（2025 → 2009），同年内保持章节顺序
//   2) 列表模式：按年份分组渲染（每年一个 details 组），组标题年份倒序
//   3) 右侧导航：同样按年份分组出题号，与列表/单题口径一致
//   4) 年份下拉：选中某年后只保留该年真题，分组只剩一组
//   5) 题卡内 DOM 顺序：笔记面板在答案面板**上面**（用户要求）
//   6) 底栏：收起/展开把手始终是最后一个元素（恒靠右），收起态 CSS 用 flex-end 对齐
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

// 某科目全部真题，按年份倒序（同年保持章节顺序）——与页面 flatItems 的口径
function realExpected(subKey) {
  const sub = DATI_DATA.subjects.find(s => s.key === subKey);
  const out = [];
  for (const ch of sub.chapters)
    for (const sec of ch.sections)
      for (const q of sec.questions) if (q.real) out.push(q);
  return out.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

(async () => {
  const html = DATI_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  });

  const styleText = (DATI_SRC.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });

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
  const curId = () => { const c = cards()[0]; return c ? c.id.replace(/^q/, '') : ''; };

  const ok0 = await waitFor(() => cards().length > 0);
  if (!ok0) { console.log('FAIL 页面未加载出题卡'); process.exit(1); }

  const subKey = w.localStorage.getItem('datiSubject') || 'os';
  const realQ = realExpected(subKey);

  console.log('\n--- 场景 1：真题筛选后单题模式按年份倒序 ---');
  w.setFilter('real');
  await sleep(120);
  check('真题数 = 数据源真题数', w.eval('flatItems().length'), realQ.length);
  check('首题为最新年份', w.eval('flatItems()[0].q.year'), realQ[0].year);
  check('末题为最早年份', w.eval(`flatItems()[${realQ.length - 1}].q.year`), realQ[realQ.length - 1].year);
  check('当前题 = 年份倒序首题', curId(), realQ[0].id);
  check('年份序列严格非递增', w.eval('flatItems().map(i=>Number(i.q.year))').every((y, i, a) => i === 0 || a[i - 1] >= y), true);

  console.log('\n--- 场景 2：年份下拉只留该年 ---');
  const someYear = realQ[0].year;
  const cntThatYear = realQ.filter(q => q.year === someYear).length;
  w.setYear(String(someYear));
  await sleep(120);
  check(`选 ${someYear} 年后只剩该年真题`, w.eval('flatItems().length'), cntThatYear);
  check(`全部是该年题`, w.eval('flatItems().every(i=>Number(i.q.year)===' + someYear + ')'), true);
  w.setYear('');
  await sleep(100);

  console.log('\n--- 场景 3：列表模式按年份分组（年份倒序） ---');
  w.setView('list');
  await sleep(200);
  const groups = [...root().querySelectorAll('details.daka-group')];
  const yearsExpected = [...new Set(realQ.map(q => q.year))];
  check('分组数 = 真题年份数', groups.length, yearsExpected.length);
  const titles = groups.map(g => g.querySelector('.daka-group-title').textContent);
  check('首组标题含最新年份', titles[0].startsWith(String(yearsExpected[0])), true);
  check('末组标题含最早年份', titles[titles.length - 1].startsWith(String(yearsExpected[yearsExpected.length - 1])), true);
  check('每组都标注题数', titles.every(t => /（\d+ 题）/.test(t)), true);
  check('年份组用年份 key（可被 openChapters 记忆）', groups[0].dataset.chkey.includes('::year::'), true);
  check('组标题为「YYYY 年统考真题」', titles[0], `${yearsExpected[0]} 年统考真题（${realQ.filter(q => q.year === yearsExpected[0]).length} 题）`);

  console.log('\n--- 场景 4：导航按年份分组 ---');
  const navTitles = [...doc.querySelectorAll('#datiNav .num-group-title')].map(e => e.textContent.trim());
  check('导航分组标题数 = 年份数', navTitles.length, yearsExpected.length);
  check('导航首组 = 最新年份', navTitles[0], `${yearsExpected[0]} 年统考真题`);
  check('导航题号总数 = 真题数', doc.querySelectorAll('#datiNav .num-btn').length, realQ.length);

  console.log('\n--- 场景 5：笔记面板在答案面板上面 ---');
  w.setFilter('all');
  w.setView('single');
  await sleep(200);
  const card0 = cards()[0];
  const kidx = [...card0.children].map(el => el.className);
  const iNote = kidx.findIndex(c => String(c).includes('note-panel'));
  const iAns = kidx.findIndex(c => String(c).includes('dati-abody'));
  check('笔记面板与答案面板都在题卡内', iNote > -1 && iAns > -1, true);
  check('笔记面板在答案面板之前', iNote < iAns, true);

  console.log('\n--- 场景 6：底栏收起/展开把手恒靠右 ---');
  const bar = doc.getElementById('datiSingleBar');
  check('底栏存在', !!bar, true);
  const btns = [...bar.querySelectorAll('button')];
  check('把手是底栏最后一个按钮', btns[btns.length - 1].classList.contains('dati-bar-toggle'), true);
  check('把手文案为「▾ 收起」', btns[btns.length - 1].textContent.trim(), '▾ 收起');
  check('底栏顺序：上一题 → 进度 → 下一题', (() => {
    const t = bar.textContent;
    return t.indexOf('上一题') < t.indexOf('题') && bar.querySelectorAll('.dati-single-pos').length === 1;
  })(), true);
  check('步骤提示有 margin-left:auto（把右侧组推到右边）', /\.dati-single-bar \.dati-step-key[^}]*margin-left:\s*auto/.test(styleText), true);
  check('收起态用 flex-end 对齐（与展开态同位置）', /\.dati-single-bar\.collapsed[^}]*justify-content:\s*flex-end/.test(styleText), true);
  check('收起态右侧内边距与展开态一致（14px）', /\.dati-single-bar\.collapsed[^}]*padding:\s*0\s+14px/.test(styleText), true);

  // 收起后：
  w.toggleSingleBar();
  await sleep(80);
  const bar2 = doc.getElementById('datiSingleBar');
  check('收起后只剩把手', bar2.querySelectorAll('button').length, 1);
  check('收起后把手仍在（位置靠 CSS 保证）', bar2.querySelector('.dati-bar-toggle') !== null, true);
  w.toggleSingleBar();

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('异常:', e && e.message); process.exit(1); });
