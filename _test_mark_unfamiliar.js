// 验证「不熟 / 不会」标记功能（新增于收藏链路之后）：
//   /api/mark/<unfamiliar|dontknow>/<qid>  切换标记，返回 is_unfamiliar / is_dontknow
//   /api/questions?mode=unfamiliar|dontknow 只出对应标记题，且题目带 is_unfamiliar/is_dontknow
//   备份 export/import 包含 unfamiliar/dontknow store
// 在 jsdom 里真实执行 pwa/js/backend.js（配 fake-indexeddb）。
// 用法：NODE_PATH=<workspace>/node_modules node _test_mark_unfamiliar.js
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

  w.eval('(function(){' + SRC + '\n;globalThis.__api = api; globalThis.__dbAll = dbAll;})()');
  const { __api: api, __dbAll: dbAll } = w;

  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
  const qsInMode = async (mode) =>
    ((await api(`/api/questions/os?mode=${mode}&page=1&per_page=9999`)).json())
      .then(d => (d.questions || []).map(q => q.id));

  console.log('--- 标记切换 ---');
  check('标记 os_1 为不熟', (await post('/api/mark/unfamiliar/os_1')).is_unfamiliar, true);
  check('标记 os_2 为不会', (await post('/api/mark/dontknow/os_2')).is_dontknow, true);
  check('再点 os_1 取消不熟', (await post('/api/mark/unfamiliar/os_1')).is_unfamiliar, false);
  check('重新标记 os_1 不熟', (await post('/api/mark/unfamiliar/os_1')).is_unfamiliar, true);
  check('再点 os_2 取消不会', (await post('/api/mark/dontknow/os_2')).is_dontknow, false);
  check('重新标记 os_2 不会', (await post('/api/mark/dontknow/os_2')).is_dontknow, true);

  console.log('\n--- store 落库 ---');
  check('unfamiliar store = [os_1]', (await dbAll('unfamiliar')).map(x => x.question_id), ['os_1']);
  check('dontknow store = [os_2]', (await dbAll('dontknow')).map(x => x.question_id), ['os_2']);
  check('favorites 不受影响 = 0', (await dbAll('favorites')).length, 0);

  console.log('\n--- 模式过滤 ---');
  check('mode=unfamiliar 只出不熟题', await qsInMode('unfamiliar'), ['os_1']);
  check('mode=dontknow 只出不会题', await qsInMode('dontknow'), ['os_2']);
  check('mode=sequential 全出', (await qsInMode('sequential')).length, 4);
  check('mode=favorite 不受标记影响(空)', await qsInMode('favorite'), []);

  console.log('\n--- 题目标记字段 ---');
  const seqQs = await ((await api('/api/questions/os?mode=sequential&page=1&per_page=9999')).json());
  const q1 = seqQs.questions.find(q => q.id === 'os_1');
  const q2 = seqQs.questions.find(q => q.id === 'os_2');
  const q4 = seqQs.questions.find(q => q.id === 'os_4');
  check('os_1 is_unfamiliar=true', q1.is_unfamiliar, true);
  check('os_1 is_dontknow=false', q1.is_dontknow, false);
  check('os_2 is_dontknow=true', q2.is_dontknow, true);
  check('os_2 is_unfamiliar=false', q2.is_unfamiliar, false);
  check('os_4 两个标记均 false', [q4.is_unfamiliar, q4.is_dontknow], [false, false]);

  console.log('\n--- 边界与备份 ---');
  check('非法标记类型 400', (await api('/api/mark/badtype/os_1')).status, 400);
  check('非法题目 400', (await api('/api/mark/unfamiliar/bad_1')).status, 400);
  const marksAll = await ((await api('/api/marks?subject=os&kind=all')).json());
  check('/api/marks 返回 2 条', marksAll.total, 2);
  const exportData = await ((await api('/api/backup/export')).json());
  check('备份含 unfamiliar = 1', (exportData.unfamiliar || []).length, 1);
  check('备份含 dontknow = 1', (exportData.dontknow || []).length, 1);
  const r = await (await api('/api/backup/import', { method: 'POST', body: JSON.stringify({
    progress: [], wrong: [], favorites: [], notes: [], exams: [],
    unfamiliar: [{ question_id: 'os_3', subject: 'os', added_at: 'x' }],
    dontknow: [{ question_id: 'os_4', subject: 'os', added_at: 'x' }]
  }) })).json();
  check('import 计数 unfamiliar=1/dontknow=1', [r.counts.unfamiliar, r.counts.dontknow], [1, 1]);
  check('import 后 store 被替换', (await dbAll('unfamiliar')).map(x => x.question_id), ['os_3']);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
