// 回归测试：计网题库 id 顺延后，本地记录（favorites/wrong/notes/progress）的 question_id
// 通过 migrateCnQuestionIds 一次性映射到新 id。
// 在 jsdom 里真实执行 pwa/js/backend.js（配 fake-indexeddb），stub fetch 喂映射 JSON，
// 断言：旧 id 记录被重写为新 id、localStorage 标记置位、二次运行幂等。
// 用法：NODE_PATH=<workspace>/node_modules node _test_cn_id_migrate.js
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

const MAP = { 'cn_0006': 'cn_0007', 'cn_0039': 'cn_0041' };  // 抽样映射

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/quiz.html'
  });
  const w = dom.window;
  w.indexedDB = new IDBFactory();
  w.IDBKeyRange = IDBKeyRange;
  w.fetch = async (url) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('cn_id_map.json') ? MAP : {})
  });

  w.eval('(function(){' + SRC + '\n;globalThis.__dbPut=dbPut;globalThis.__dbGet=dbGet;globalThis.__dbAll=dbAll;globalThis.__migrate=migrateCnQuestionIds;})()');
  const { __dbPut: dbPut, __dbGet: dbGet, __dbAll: dbAll, __migrate: migrate } = w;

  // ---------- 造旧 id 数据 ----------
  await dbPut('favorites', { question_id: 'cn_0006', subject: 'cn', added_at: 't' });
  await dbPut('wrong', { question_id: 'cn_0006', subject: 'cn', wrong_count: 2, is_resolved: 0, last_wrong_at: 't' });
  await dbPut('notes', { question_id: 'cn_0039', subject: 'cn', content: '笔记', images: [], updated_at: 't' });
  const pk = await dbPut('progress', { question_id: 'cn_0039', subject: 'cn', user_answer: 'A', is_correct: 0, answered_at: 't' });

  // ---------- 迁移 ----------
  await migrate();
  check('localStorage 标记置位', w.localStorage.getItem('cn_id_migrated'), '1');
  check('favorites: cn_0006 → cn_0007', (await dbGet('favorites', 'cn_0007') || {}).question_id, 'cn_0007');
  check('favorites 旧键已删除', await dbGet('favorites', 'cn_0006'), undefined);
  check('wrong: cn_0006 → cn_0007', (await dbGet('wrong', 'cn_0007') || {}).question_id, 'cn_0007');
  check('notes: cn_0039 → cn_0041', (await dbGet('notes', 'cn_0041') || {}).content, '笔记');
  const prog = (await dbAll('progress')).find(r => r.pk === pk);
  check('progress: question_id 更新且 pk 保留', prog && prog.question_id, 'cn_0041');

  // ---------- 幂等：二次运行不报错、不改数据 ----------
  await migrate();
  check('幂等：favorites 仍为 cn_0007', (await dbGet('favorites', 'cn_0007') || {}).question_id, 'cn_0007');
  check('幂等：notes 仍为 cn_0041', (await dbGet('notes', 'cn_0041') || {}).question_id, 'cn_0041');

  // ---------- 未在映射中的 id 不受影响 ----------
  await dbPut('favorites', { question_id: 'os_0001', subject: 'os', added_at: 't' });
  await migrate();
  check('非计网 id 不动', (await dbGet('favorites', 'os_0001') || {}).question_id, 'os_0001');

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
