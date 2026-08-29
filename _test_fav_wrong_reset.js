// 验证「清空收藏错题」/「清空重做」两个破坏性接口的作用范围。
// 在 jsdom 里真实执行 pwa/js/backend.js（配 fake-indexeddb），
// 通过真实 API 造数据，断言只删该删的 store：
//   /api/favorites/reset-wrong/<科目>  只删 wrong，保留 progress + favorites
//   /api/favorites/reset/<科目>        删 progress + wrong，保留 favorites
// 为什么要有这个测试：两个接口共用一段删除循环，key 路径不同
// （progress 用 autoIncrement 的 r.pk，wrong 用 r.question_id），
// 改错一处会静默删不掉或误删，页面上完全看不出来。
// 用法：NODE_PATH=<workspace>/node_modules node _test_fav_wrong_reset.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');

// 4 道题：os_1/os_2/os_3 有标准答案，os_4 用于校验「同科目非收藏题」不受影响
const FIXTURE = {
  subject: 'os',
  questions: [
    { id: 'os_1', number: 1, content: '题一', options: { A: '甲', B: '乙' }, answer: 'A' },
    { id: 'os_2', number: 2, content: '题二', options: { A: '甲', B: '乙' }, answer: 'B' },
    { id: 'os_3', number: 3, content: '题三', options: { A: '甲', B: '乙' }, answer: 'C' },
    { id: 'os_4', number: 4, content: '题四', options: { A: '甲', B: '乙' }, answer: 'A' }
  ]
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://x.test/quiz.html'
  });
  const w = dom.window;
  w.indexedDB = new IDBFactory();
  w.IDBKeyRange = IDBKeyRange;
  w.fetch = async (url) => ({
    ok: true, status: 200,
    json: async () => {
      if (String(url).includes('os.json')) return FIXTURE;
      return {};
    }
  });

  // 整份 backend.js 放进一个作用域执行，末尾导出真实函数（不重写路由逻辑）
  w.eval('(function(){' + SRC + '\n;globalThis.__api = api; globalThis.__dbAll = dbAll;})()');
  const { __api: api, __dbAll: dbAll } = w;

  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
  const wrongIds = async (subject = 'os') =>
    ((await api(`/api/wrong?subject=${subject}&include_resolved=true`)).json())
      .then(d => (d.wrong_questions || []).map(x => x.question_id).sort());
  const lastStatus = async (mode, qid) =>
    ((await api(`/api/questions/os?mode=${mode}&page=1&per_page=9999`)).json())
      .then(d => (d.questions.find(q => q.id === qid) || {}).last_status || null);

  // ---------- 造数据 ----------
  // 收藏 os_1、os_3
  check('收藏 os_1', (await post('/api/favorite/os_1')).is_favorited, true);
  check('收藏 os_3', (await post('/api/favorite/os_3')).is_favorited, true);
  // 答错 os_1（收藏）、os_2（未收藏）→ 两个 store 各有两条
  check('os_1 答错判定', (await post('/api/submit', { question_id: 'os_1', answer: 'B' })).is_correct, false);
  check('os_2 答错判定', (await post('/api/submit', { question_id: 'os_2', answer: 'A' })).is_correct, false);
  // 答对 os_3（收藏）→ 只有 progress，没有 wrong
  check('os_3 答对判定', (await post('/api/submit', { question_id: 'os_3', answer: 'C' })).is_correct, true);

  check('初始错题记录 = [os_1, os_2]', await wrongIds(), ['os_1', 'os_2']);
  check('初始 progress = 3 条', (await dbAll('progress')).length, 3);
  check('初始收藏 = 2 条', (await dbAll('favorites')).length, 2);

  console.log('\n--- /api/favorites/reset-wrong：只清错题记录 ---');
  const r1j = await (await api('/api/favorites/reset-wrong/os')).json();
  check('scope=wrong', r1j.scope, 'wrong');
  check('deleted=1（仅收藏题 os_1 的 wrong 行，os_2 非收藏被跳过）', r1j.cleared, 1);
  check('favs=2', r1j.favs, 2);
  check('错题记录只剩未收藏的 os_2', await wrongIds(), ['os_2']);
  check('progress 一条没动 = 3 条', (await dbAll('progress')).length, 3);
  check('os_1 作答记录保留（收藏视图可见）', !!(await lastStatus('favorite', 'os_1')), true);
  check('os_3 作答记录保留', !!(await lastStatus('favorite', 'os_3')), true);
  check('os_2 作答记录保留', !!(await lastStatus('sequential', 'os_2')), true);
  check('收藏保留 = 2 条', (await dbAll('favorites')).length, 2);
  check('未收藏题的错题记录未被误删', await wrongIds(), ['os_2']);

  console.log('\n--- /api/favorites/reset：作答 + 错题一起清 ---');
  const r2j = await (await api('/api/favorites/reset/os')).json();
  check('scope=all', r2j.scope, 'all');
  check('deleted=2（os_1、os_3 的 progress；wrong 行上一步已删）', r2j.cleared, 2);
  check('错题记录只剩非收藏的 os_2', await wrongIds(), ['os_2']);
  check('progress 只剩未收藏的 os_2 = 1 条', (await dbAll('progress')).length, 1);
  check('os_1 作答记录已清', await lastStatus('favorite', 'os_1'), null);
  check('os_3 作答记录已清', await lastStatus('favorite', 'os_3'), null);
  check('os_2 作答记录仍在', !!(await lastStatus('sequential', 'os_2')), true);
  check('收藏依然保留 = 2 条', (await dbAll('favorites')).length, 2);

  console.log('\n--- 边界 ---');
  check('非法科目 404', (await api('/api/favorites/reset-wrong/bad')).status, 404);
  check('无收藏的科目 cleared=0', (await (await api('/api/favorites/reset-wrong/cn')).json()).cleared, 0);
  check('重复调用幂等 cleared=0', (await (await api('/api/favorites/reset-wrong/os')).json()).cleared, 0);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
