// _test_home_layout.js —— 首页板块布局回归（2026-10-13）
// 需求：① 「📌 数据结构强化打卡 + 💻 代码题」并入「📝 大题专项」卡内（位于其下方）；
//       ② 新增「🗓 考研冲刺计划」板块（→ plan.html）；③ 总板块数保持不变（4 科 + 2 = 6）。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  if (ok) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, `\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expect)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const IDX = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

(async () => {
  console.log('▸ 静态结构');
  check('计划页存在于 pwa/', fs.existsSync(path.join(ROOT, 'pwa/plan.html')), true);
  const plan = fs.readFileSync(path.join(ROOT, 'pwa/plan.html'), 'utf8');
  check('计划页已去掉单词环节', /单词/.test(plan), false);
  check('计划页数学列统一「30题」', /<td class="cma">30题<\/td>/.test(plan), true);
  check('计划页阅读重做按年份分组（含括注篇目）', /阅读重做：2020（T1、T3、新题型）/.test(plan), true);
  check('阅读重做落位为隔天（10 个年份组、20 篇）',
    (plan.match(/阅读重做：/g) || []).length, 10);
  check('plan.html 进 APP_PRECACHE（SW 外壳）', /APP_PRECACHE = \[[\s\S]*?'plan\.html'/.test(SW), true);
  check('首页卡片在「大题专项」块内含打卡子区块（card-sub-block）',
    /📝 大题专项[\s\S]*?card-sub-block[\s\S]*?📌 数据结构强化打卡/.test(IDX), true);
  check('打卡子区块含进度占位与两个入口（进入打卡 / 代码题）',
    /dakaHomeProgress[\s\S]*?进入打卡[\s\S]*?code\.html/.test(IDX), true);
  check('冲刺计划卡在打卡子区块之后（板块顺序：大题专项 → 冲刺计划）',
    IDX.indexOf('🗓 考研冲刺计划') > IDX.indexOf('📌 数据结构强化打卡'), true);
  check('冲刺计划入口指向 plan.html', /href="plan\.html"/.test(IDX), true);
  check('共用样式：卡内子区块（淡蓝底 + 细边框）',
    /\.card-sub-block\s*\{[^}]*background:\s*rgba\(74, 122, 184, \.06\)[^}]*border:\s*1px solid/.test(CSS), true);
  // 接口异常防护（2026-10-13：用户报 "Cannot read properties of undefined (reading 'total_answered')"）
  check('前端防御：overall/subjects 缺失时兜底为 {}',
    /const s = \(data && data\.overall\) \|\| \{\};/.test(IDX) && /const subjects = \(data && data\.subjects\) \|\| \{\};/.test(IDX), true);
  check('前端：接口异常横幅 + 重试按钮（stat-warn / stat-retry / apiErr）',
    /stat-warn/.test(IDX) && /stat-retry/.test(IDX) && /onclick="loadHome\(\)"/.test(IDX) && /apiErr/.test(IDX), true);
  const BE = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
  check('后端：/api/stats 局部容错（单科失败返回 EMPTY，不整体 500）',
    /if \(seg\[1\] === 'stats' && !seg\[2\]\)[\s\S]{0,1200}?catch \(e\) \{ console\.error\('stats ' \+ key/.test(BE), true);
  check('后端：openDB blocked 超时 reject + 失败不缓存（可重试）',
    /req\.onblocked = \(\) =>/.test(BE) && /_dbPromise = null;   \/\/ 失败不缓存/.test(BE), true);
  check('横幅样式（stat-warn 独占一行 + 深色适配）',
    /\.stats-bar\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS) && /\.dark \.stat-warn/.test(CSS), true);

  console.log('\n▸ 动态渲染（jsdom：板块数与顺序）');
  const STATS = {
    overall: { total_answered: 100, accuracy: 80, wrong_count: 5, due_review_count: 2, favorite_count: 3 },
    subjects: {
      os: { name: '操作系统', total_questions: 10, total_answered: 1, accuracy: 70, wrong_count: 1, due_review_count: 0, review_upcoming: 0 },
      co: { name: '计算机组成原理', total_questions: 10, total_answered: 1, accuracy: 70, wrong_count: 1, due_review_count: 0, review_upcoming: 0 },
      ds: { name: '数据结构', total_questions: 10, total_answered: 1, accuracy: 70, wrong_count: 1, due_review_count: 0, review_upcoming: 0 },
      cn: { name: '计算机网络', total_questions: 10, total_answered: 1, accuracy: 70, wrong_count: 1, due_review_count: 0, review_upcoming: 0 }
    }
  };
  let html = IDX.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
  });
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/index.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.scrollTo = () => { };
      w.api = async (p) => {
        if (String(p).includes('/api/daka/progress')) {
          return { json: async () => ({ progress: { a: 1, b: 2 } }) };
        }
        return { json: async () => STATS };
      };
      w.fetch = async (url) => {
        const u = String(url);
        if (u.includes('data/meta.json')) return { ok: true, status: 200, json: async () => ({ ds_daka: 62 }) };
        return { ok: true, status: 200, json: async () => ({ progress: { a: 1, b: 2 } }) };
      };
    }
  });
  const w = dom.window, d = w.document;
  for (let i = 0; i < 60 && d.querySelectorAll('.subject-card').length === 0; i++) await sleep(50);

  const cards = [...d.querySelectorAll('#subjectsGrid .subject-card')];
  check('板块（卡片）总数 = 6（4 科 + 大题专项 + 冲刺计划，数量不变）', cards.length, 6);
  check('第 5 张 = 大题专项（内含打卡子区块）',
    !!cards[4] && cards[4].querySelector('.card-header h2').textContent.includes('大题专项')
      && !!cards[4].querySelector('.card-sub-block'), true);
  check('第 6 张 = 考研冲刺计划（含 🌙 计划入口）',
    !!cards[5] && cards[5].querySelector('.card-header h2').textContent.includes('考研冲刺计划')
      && !!cards[5].querySelector('a[href="plan.html"]'), true);
  // 进度来自 IndexedDB（jsdom 空库 → 0 条打卡）；此处验证「总数来自 meta.json + 格式正确」
  check('打卡进度已注入（总数 62 来自 meta.json）',
    /^已打卡 \d+ \/ 62 题$/.test((cards[4] && cards[4].querySelector('#dakaHomeProgress').textContent.trim()) || ''), true);

  // 降级路径：IndexedDB 不可用（隐私模式/被占用/损坏）→ /api/stats 局部容错，首页不崩
  console.log('\n▸ 降级路径（IndexedDB 不可用）');
  const vc2 = new VirtualConsole();
  vc2.on('jsdomError', () => { });
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/index.html',
    virtualConsole: vc2,
    beforeParse(w) {
      w.alert = () => { };
      w.scrollTo = () => { };
      // 故意不注入 indexedDB：backend 的 dbAll/openDB 会失败，走 /api/stats 局部容错
      w.fetch = async (url) => {
        const u = String(url);
        if (u.includes('data/meta.json')) {
          return { ok: true, status: 200, json: async () => ({ ds_daka: 62, subjects: { os: { total: 1200 }, co: { total: 1100 }, ds: { total: 1000 }, cn: { total: 900 } } }) };
        }
        return { ok: true, status: 200, json: async () => ({ questions: [] }) };
      };
    }
  });
  const w2 = dom2.window, d2 = w2.document;
  for (let i = 0; i < 100 && d2.querySelectorAll('.subject-card').length === 0; i++) await sleep(50);
  const cards2 = [...d2.querySelectorAll('#subjectsGrid .subject-card')];
  check('IndexedDB 不可用时首页仍渲染 6 张卡（不再整体崩）', cards2.length, 6);
  check('总题数回退到 meta.json（os=1200 出现在卡上）',
    /1200/.test(cards2[0] ? cards2[0].textContent : ''), true);
  check('统计条正常显示（无「加载失败」）',
    /已做题目/.test(d2.getElementById('statsBar').textContent) && !/加载失败/.test(d2.getElementById('statsBar').textContent), true);
  dom2.window.close();

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  dom.window.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
