// dati.html 大题专项「界面分组 + 逻辑显示」回归（2026-11-08）
//
// 覆盖点：
//   ① 控制区三层（科目 tab / 排序+显示 / 状态筛选），术语不再都叫「模式」
//   ② 状态筛选有出口：新增「全部」胶囊 + 点已选中 chip 回全部（原来点进去出不来）
//   ③ 「只做某一章」章节下拉：单题进度 / 列表分组 / 导航 / 计数 / 总览全部跟随
//   ④ 计数与总览口径跟随当前排序范围（年份 / 章节），不再永远显示全科全年份数字
//   ⑤ 题卡头部显示所属小节 + 状态汇总条，交互后就地同步
//   ⑥ 视觉统一到站点变量，且不破坏既有约定（5 个操作按钮、fAll/fReal 仍不存在）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_ui.js
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
const HTML = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/dati.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const subject = key => DATA.subjects.find(s => s.key === key);
const allQ = key => subject(key).chapters.flatMap(ch => ch.sections.flatMap(sec => sec.questions.map(q => ({ q, ch, sec }))));

(async () => {
  console.log('--- 一、静态结构 ---');
  check('控制区分两层 .dati-bar', (HTML.match(/<div class="dati-bar/g) || []).length, 2);
  check('三个分组标签 排序 / 显示 / 筛选',
    ['排序', '显示', '筛选'].every(t => new RegExp(`dati-bar-label">${t}<`).test(HTML)), true);
  check('新增「全部」状态胶囊 fStatusAll', /id="fStatusAll" onclick="setFilter\('all'\)"/.test(HTML), true);
  check('旧 fAll / fReal 胶囊仍不存在（既有约定）',
    [!!/id="fAll"/.test(HTML), !!/id="fReal"/.test(HTML)], [false, false]);
  check('新增章节下拉 chapterSel → setChapter',
    /id="chapterSel" onchange="setChapter\(this\.value\)"/.test(HTML), true);
  check('年份下拉仍在且只在按年份模式显示',
    /id="yearSel"/.test(HTML) && /getElementById\('yearSel'\)\.style\.display = mode === 'year'/.test(HTML), true);
  check('章节下拉只在按章节模式显示',
    /getElementById\('chapterSel'\)\.style\.display = mode === 'chapter'/.test(HTML), true);
  check('题卡头部输出所属小节 .dati-qsec', /class="dati-qsec" title="\$\{secName\}"/.test(HTML), true);
  check('题卡有状态汇总条 .dati-state', /class="dati-state" data-state="\$\{qid\}"/.test(HTML), true);
  check('afterRender 填充状态条', /querySelectorAll\('\.dati-state\[data-state\]'\)/.test(HTML), true);
  check('setFilter 点已选中项回「全部」', /if \(f !== 'all' && f === filter\) f = 'all';/.test(HTML), true);
  check('passFilter 有章节门控（含 typeof 守卫）',
    /mode === 'chapter' && typeof chapterIds !== 'undefined' && chapterIds && !chapterIds\.has\(q\.id\)/.test(HTML), true);
  check('顶部总览随 render 刷新', /updateOverview\(\);/.test(HTML) && /function updateOverview\(\)/.test(HTML), true);
  check('视觉统一：主色改用 var(--primary)', /\.dati-tab\.active \{ background: var\(--primary\)/.test(HTML), true);
  const inlineCss = (HTML.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  check('内联样式不再硬编码旧紫色 #4f46e5（theme-color meta 属全站统一，不计）', /#4f46e5/.test(inlineCss), false);
  check('题卡用 3px 主色左导轨 + 细边框',
    /\.dati-qcard \{[\s\S]{0,180}border-left: 3px solid var\(--primary\)/.test(HTML), true);
  check('答案面板改淡底细边框（不再是光秃秃一条虚线）',
    /\.dati-abody \{[\s\S]{0,220}border: 1px solid var\(--border\)/.test(HTML), true);

  console.log('\n--- 二、运行时：jsdom + fake-indexeddb ---');
  let html = HTML.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', src), 'utf8') + '</script>'; } catch (e) { return ''; }
  });
  const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://x.test/dati.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async url => String(url).includes('data/dati.json')
        ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DATA)) }
        : { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const w = dom.window, doc = w.document;
  const root = () => doc.getElementById('datiRoot');
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    if (root().querySelectorAll('.dati-qcard').length === 1) break;
    await sleep(40);
  }
  const subKey = w.localStorage.getItem('datiSubject') || 'os';
  const S = subject(subKey);
  const totalQ = allQ(subKey).length;
  check('首屏渲染出 1 张题卡（单题模式）', root().querySelectorAll('.dati-qcard').length, 1);

  console.log('\n--- 三、状态筛选出口 ---');
  check('默认「全部」胶囊高亮', doc.getElementById('fStatusAll').classList.contains('active'), true);
  check('顶部总览显示当前/范围题数',
    /当前 \d+ 题 · 范围共 \d+ 题/.test(doc.getElementById('datiOverview').textContent), true);
  check('总览范围 = 当前科目总题数',
    /范围共 (\d+) 题/.exec(doc.getElementById('datiOverview').textContent)[1], String(totalQ));
  w.setFilter('fav');
  await sleep(120);
  check('点收藏 → filter=fav 且 chip 高亮',
    [w.localStorage.getItem('datiFilter'), doc.getElementById('fFav').classList.contains('active')], ['fav', true]);
  w.setFilter('fav');
  await sleep(120);
  check('再点同一 chip → 回到全部（原来没有出口）',
    [w.localStorage.getItem('datiFilter'), doc.getElementById('fStatusAll').classList.contains('active')], ['all', true]);
  w.setFilter('unfam');
  await sleep(120);
  doc.getElementById('fStatusAll').click();
  await sleep(120);
  check('点「全部」胶囊也能退出筛选', w.localStorage.getItem('datiFilter'), 'all');

  console.log('\n--- 四、只做某一章 ---');
  const chSel = doc.getElementById('chapterSel');
  check('按章节模式：章节下拉显示', chSel.style.display, '');
  check('按章节模式：年份下拉隐藏', doc.getElementById('yearSel').style.display, 'none');
  const chaptersWithQ = S.chapters
    .map(ch => ({ ch, n: ch.sections.reduce((k, sec) => k + sec.questions.length, 0) }))
    .filter(x => x.n > 0);
  check('下拉只列有题的章 + 「全部章节」', chSel.options.length, chaptersWithQ.length + 1);
  check('0 题的骨架章不在下拉里（选完不会一片空白）',
    [...chSel.options].some(o => o.value && /（0 题）/.test(o.textContent)), false);
  check('下拉项标注该章题数', /（\d+ 题）/.test(chSel.options[1].textContent), true);
  const ch0 = chaptersWithQ[0].ch, ch0Q = chaptersWithQ[0].n;
  check('测试选中的章确实有题（避免空集假阳性）', ch0Q > 0, true);
  w.setChapter(ch0.name);
  await sleep(200);
  check('选章后 flatItems 只含该章', w.eval('flatItems().length'), ch0Q);
  check('选章后所有题都属于该章', w.eval(`flatItems().every(i => i.chName === ${JSON.stringify(ch0.name)})`), true);
  check('选章后总览范围 = 该章题数',
    /范围共 (\d+) 题/.exec(doc.getElementById('datiOverview').textContent)[1], String(ch0Q));
  check('选章后「未练」计数按该章统计', doc.getElementById('cntTodo').textContent, String(ch0Q));
  check('选章后题卡头部显示所属小节',
    !!root().querySelector('.dati-qsec') && root().querySelector('.dati-qsec').textContent.trim().length > 0, true);
  w.setView('list');
  await sleep(200);
  const listTitles = [...root().querySelectorAll('.daka-group-title')].map(x => x.textContent);
  check('选章后列表分组只剩该章', listTitles.length === 1 && listTitles[0].includes(ch0.name), true);
  w.setView('single');
  await sleep(200);

  w.setMode('year');
  await sleep(200);
  check('切按年份：章节下拉隐藏、年份下拉显示',
    [chSel.style.display, doc.getElementById('yearSel').style.display], ['none', '']);
  check('切按年份：章节筛选不再生效，恢复全量', w.eval('flatItems().length'), totalQ);
  const yearSel = doc.getElementById('yearSel');
  const y0 = [...yearSel.options].map(o => o.value).filter(Boolean)[0];
  const y0Q = allQ(subKey).filter(x => String(x.q.year) === String(y0)).length;
  w.setYear(y0);
  await sleep(200);
  check('选年后 flatItems 只含该年', w.eval('flatItems().length'), y0Q);
  check('选年后「未练」计数按该年统计', doc.getElementById('cntTodo').textContent, String(y0Q));
  check('选年后总览范围 = 该年题数',
    /范围共 (\d+) 题/.exec(doc.getElementById('datiOverview').textContent)[1], String(y0Q));
  w.setYear('');
  await sleep(120);
  w.setMode('chapter');
  await sleep(200);
  check('切回按章节：章节筛选自动恢复', w.eval('flatItems().length'), ch0Q);

  console.log('\n--- 五、题卡状态条与既有约定 ---');
  for (let i = 0; i < 50 && !root().querySelector('.dati-qcard'); i++) await sleep(40);
  const card0 = () => root().querySelector('.dati-qcard');
  const qid = card0().id.replace(/^q/, '');
  check('操作行仍是 5 个按钮且顺序不变',
    [...card0().querySelectorAll('.dati-actions button')].map(b => b.textContent.trim().replace(/\s+/g, '')),
    ['○未练', '查看答案', '📝笔记', '🟡不熟', '🔴不会']);
  check('初始状态条为空', card0().querySelector('.dati-state').textContent.trim(), '');
  w.toggleDone(qid);
  await sleep(80);
  check('点「未练」→ 状态条出现「✅ 已练」', /✅ 已练/.test(card0().querySelector('.dati-state').textContent), true);
  w.toggleMark(qid, 'unfamiliar');
  await sleep(150);
  check('点「不熟」→ 状态条出现「🟡 不熟」', /🟡 不熟/.test(card0().querySelector('.dati-state').textContent), true);
  w.toggleFav(qid, subKey);
  await sleep(150);
  check('点收藏星 → 状态条出现「★ 已收藏」', /★ 已收藏/.test(card0().querySelector('.dati-state').textContent), true);
  check('笔记面板仍在答案面板之前（既有约定）', (() => {
    const kids = [...card0().children].map(x => x.className);
    return kids.indexOf('note-panel dati-note-panel') < kids.indexOf('dati-abody');
  })(), true);

  console.log('\n--- 六、切科目重置章节 ---');
  const other = DATA.subjects.find(s => s.key !== subKey);
  w.switchSubject(other.key);
  await sleep(300);
  check('切科目后章节选择清空', w.localStorage.getItem('datiChapter'), '');
  const otherChaptersWithQ = other.chapters.filter(ch => ch.sections.some(sec => sec.questions.length));
  check('切科目后下拉选项按新科目重建',
    doc.getElementById('chapterSel').options.length, otherChaptersWithQ.length + 1);
  check('切科目后 flatItems 恢复该科全量', w.eval('flatItems().length'),
    other.chapters.reduce((n, ch) => n + ch.sections.reduce((m, sec) => m + sec.questions.length, 0), 0));

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? '有失败' : '全部通过'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
