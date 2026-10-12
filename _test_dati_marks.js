// dati.html 大题专项「不熟 / 不会」标记 + 筛选 + 全站顶栏统一 回归测试
//
// 覆盖点：
//   1) 题卡操作行新增「🟡 不熟 ｜ 🔴 不会」，接在「📝 笔记」之后；两种视图模式共用
//   2) 点「不熟」→ 写入后端 unfamiliar 库（dati_ 前缀 + subject 正确），按钮变色
//   3) 点「不会」→ 与「不熟」互斥（旧标记被清）；再点一次取消
//   4) 筛选 chip 计数（cntUnfam / cntDontknow）与筛选生效（unfam / dontknow）
//   5) 在「不熟」筛选下取消标记 → 该题移出列表（重渲染）；筛选状态持久化
//   6) 全站 17 页顶栏链接集合与顺序完全一致（13 项），当前页带 active
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_marks.js
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
const DATI_SRC = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');
const DATI_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/dati.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const curId = () => {
    const c = root().querySelector('.dati-qcard');
    return c ? c.id.replace(/^q/, '') : '';
  };

  // 等待页面初始化完成（题库载入 + 首屏渲染）
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    if (root().querySelectorAll('.dati-qcard').length === 1) break;
    await sleep(40);
  }

  const sub = w.localStorage.getItem('datiSubject') || 'os';
  const L = flat(sub);
  const q0 = L[0].q;

  console.log('\n--- 1) 按钮就位（单题模式，与列表模式共用题卡） ---');
  const row = () => root().querySelector('.dati-actions');
  let btns = [...row().querySelectorAll('button')].map(b => b.textContent.trim());
  check('操作行 5 个按钮', btns.length, 5);
  check('顺序：未练/答案/笔记/不熟/不会', btns.map(t => t.replace(/\s+/g, '')), ['○未练', '查看答案', '📝笔记', '🟡不熟', '🔴不会']);
  check('新按钮接在「📝 笔记」之后',
    [...row().querySelectorAll('button')].slice(3).map(b => b.dataset.qid ? 1 : 0), [1, 1]);
  check('初始为中性态（无 on-unfam / on-dk）',
    !!root().querySelector('.dati-mark-u.on-unfam') || !!root().querySelector('.dati-mark-d.on-dk'), false);

  console.log('\n--- 2) 标记「不熟」写入后端库 ---');
  const markU = () => root().querySelector(`.dati-mark-u[data-qid="${curId()}"]`);
  const markD = () => root().querySelector(`.dati-mark-d[data-qid="${curId()}"]`);
  const cur = curId();
  await w.toggleMark(cur, 'unfamiliar');
  await sleep(60);
  let rows = await w.dbAll('unfamiliar');
  let mine = rows.find(r => r.question_id === cur);
  check('已写入 unfamiliar 库', !!mine, true);
  check('subject 记录为当前科目', mine && mine.subject, sub);
  check('按钮变为选中（on-unfam）', markU().classList.contains('on-unfam'), true);
  check('标签计数已更新', doc.getElementById('cntUnfam').textContent, '1');

  console.log('\n--- 3) 互斥：标「不会」顶掉「不熟」 ---');
  await w.toggleMark(cur, 'dontknow');
  await sleep(60);
  rows = await w.dbAll('unfamiliar');
  check('unfamiliar 库中已移除该题', !!rows.find(r => r.question_id === cur), false);
  let dRows = await w.dbAll('dontknow');
  check('dontknow 库中已写入', !!dRows.find(r => r.question_id === cur), true);
  check('「不熟」按钮恢复中性', markU().classList.contains('on-unfam'), false);
  check('「不会」按钮选中（on-dk）', markD().classList.contains('on-dk'), true);
  check('不熟计数回到 0', doc.getElementById('cntUnfam').textContent, '0');
  check('不会计数为 1', doc.getElementById('cntDontknow').textContent, '1');

  console.log('\n--- 4) 再点一次 = 取消 ---');
  await w.toggleMark(cur, 'dontknow');
  await sleep(60);
  dRows = await w.dbAll('dontknow');
  check('dontknow 库中已移除', !!dRows.find(r => r.question_id === cur), false);
  check('「不会」按钮恢复中性', markD().classList.contains('on-dk'), false);
  check('不会计数回到 0', doc.getElementById('cntDontknow').textContent, '0');

  console.log('\n--- 5) 筛选：标记若干题后按不熟/不会过滤 ---');
  const q1 = L[1].q, q2 = L[2].q;
  await w.toggleMark(q1.id, 'unfamiliar');
  await w.toggleMark(q2.id, 'dontknow');
  await sleep(80);
  check('不熟计数 = 1', doc.getElementById('cntUnfam').textContent, '1');
  check('不会计数 = 1', doc.getElementById('cntDontknow').textContent, '1');

  w.setFilter('unfam');
  await sleep(80);
  check('不熟筛选已持久化', w.localStorage.getItem('datiFilter'), 'unfam');
  check('不熟筛选 chip 高亮', doc.getElementById('fUnfam').classList.contains('active'), true);
  check('不熟筛选只出 q1', curId(), q1.id);
  const unfamProg = root().querySelector('.dati-single-prog').textContent.trim();
  check('不熟筛选下集合大小 = 1', unfamProg, '1 / 1');

  w.setFilter('dontknow');
  await sleep(80);
  check('不会筛选只出 q2', curId(), q2.id);

  console.log('\n--- 6) 筛选状态下取消标记 → 移出列表 ---');
  await w.toggleMark(q2.id, 'dontknow');
  await sleep(100);
  check('取消后不会筛选集为空', root().querySelectorAll('.dati-qcard').length, 0);
  check('空态提示', /该筛选条件下暂无题目/.test(root().textContent), true);

  console.log('\n--- 7) 列表模式共用同一排按钮 ---');
  w.setFilter('all');
  w.setView('list');
  await sleep(120);
  const firstCard = root().querySelector('.dati-qcard');
  const listBtns = [...firstCard.querySelectorAll('.dati-actions button')].map(b => b.textContent.trim());
  check('列表模式题卡也是 5 个按钮', listBtns.length, 5);
  check('列表模式含不熟/不会', listBtns.slice(3).map(t => t.replace(/\s+/g, '')), ['🟡不熟', '🔴不会']);
  w.setView('single');
  await sleep(80);

  console.log('\n--- 8) 全站顶栏统一（17 页 13 项、顺序一致） ---');
  const EXPECT = ['首页|index.html', '刷题|quiz.html', '真题套卷|zhenti.html', '每日一题|daily.html', '记忆卡|cards.html',
    '打卡表|daka.html', '大题专项|dati.html', '算法讲义|algo.html',
    '错题本|wrong.html', '收藏夹|favorites.html', '模拟考试|exam.html', '学习统计|stats.html', '搜题|search.html'];
  const pages = fs.readdirSync(path.join(ROOT, 'pwa')).filter(f => f.endsWith('.html'));
  const bad = [];
  let checked = 0;
  for (const f of pages) {
    const src = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    const m = src.match(/<div class="nav-links">([\s\S]*?)<\/div>/);
    if (!m) continue;
    checked++;
    const got = [...m[1].matchAll(/<a href="([^"]+)" class="nav-link[^"]*">([^<]+)<\/a>/g)]
      .map(x => `${x[2].trim()}|${x[1]}`);
    if (JSON.stringify(got) !== JSON.stringify(EXPECT)) bad.push(f);
  }
  check('含顶栏的页面数 = 17', checked, 17);
  check('全部页面链接集合与顺序一致', bad, []);
  const idx = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
  check('当前页高亮（首页 active）', /<a href="index.html" class="nav-link active">首页<\/a>/.test(idx), true);
  const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
  const datiSrc = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');
  check('链接组靠左（flex-start）', /\.nav-links\s*\{[^}]*justify-content:\s*flex-start/.test(css), true);
  check('窄屏为折叠钮留位（≤1400px）', /@media \(max-width: 1400px\)[\s\S]*?\.nav-container\s*\{[^}]*padding-right:\s*56px/.test(css), true);
  check('移动端链接独占一行（flex 0 0 100%）', /@media \(max-width: 768px\)[\s\S]*?\.nav-links\s*\{[^}]*flex:\s*0 0 100%/.test(css), true);
  check('移动端链接单行横滑（nowrap）', /@media \(max-width: 768px\)[\s\S]*?\.nav-links\s*\{[^}]*flex-wrap:\s*nowrap/.test(css), true);
  check('移动端容器也给折叠钮留位', /@media \(max-width: 768px\)[\s\S]*?\.nav-container\s*\{[^}]*padding:\s*8px 48px 8px 12px/.test(css), true);
  check('标记态自带 hover（不落到 btn-secondary 灰底）', /\.dati-mark-btn\.on-unfam:hover\s*\{[^}]*background:/.test(datiSrc), true);
  check('active 高亮样式存在', /\.nav-link\.active\s*\{[^}]*color:\s*var\(--primary\)/.test(css), true);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
