// _test_backup_full.js —— 换设备全量导出/导入回归（2026-10-14）
// 背景：用户要换设备刷题，要求「全量导出和导入」。审计发现旧备份只含 IndexedDB 8 个 store，
//       localStorage 里的用户内容/进度全部丢失：记忆卡 熟/收藏/不熟不会、讲义/图谱/算法/打卡的
//       划词高亮与行级批注、大题已练(datiDone)、每日一题、冲刺计划打卡与备注。
// 本测试覆盖：① 导出含 local 全量键（原始字符串逐值一致）；② 导入回写 localStorage；
//            ③ v1 旧备份（无 local）兼容；④ local 非字符串值被忽略；⑤ 各 store 正常落库。
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

const BE = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');

// 预置 localStorage：内容/进度类 + UI 偏好类（含中文与 JSON 字符串）
const LS = {
  cards_known_v1: '{"c1":1,"c2":1}',
  cards_fav_v1: '{"c3":1}',
  cards_weak_v1: '{"c4":"u","c5":"d"}',
  cards_pos_v1: '42',
  os_hl: '[{"line":3,"text":"进程与线程"}]',
  cn_algo_anno: '[{"line":10,"note":"快排是否稳定？"}]',
  cn_daka_hl: '[{"line":7,"text":"指针"}]',
  os_map_hl: '[{"el":"n12"}]',
  datiDone: '["dati_os_1","dati_cn_3"]',
  daily_pick_v1: '{"date":"2026-10-14","picks":{"ds":[]}}',
  daily_history_v1: '[{"date":"2026-10-13","picks":{"os":[]}}]',
  sprint_done: '{"10/16":1,"11/5":1}',
  sprint_notes: '{"10/16":"打卡表第1–4张"}',
  darkMode: '1',
  quiz_pos_os_1: '88',
};
const LS_N = Object.keys(LS).length;

// 预置 IndexedDB（与 backend 相同的 quiz408 v3 结构）
function seedDB(factory) {
  return new Promise((resolve, reject) => {
    const req = factory.open('quiz408', 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('progress')) {
        const prog = db.createObjectStore('progress', { keyPath: 'pk', autoIncrement: true });
        prog.createIndex('by_qid', 'question_id');
        prog.createIndex('by_subject', 'subject');
      }
      for (const s of ['wrong', 'favorites', 'notes', 'unfamiliar', 'dontknow']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'question_id' });
      }
      if (!db.objectStoreNames.contains('exams')) db.createObjectStore('exams', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('daka_progress')) db.createObjectStore('daka_progress', { keyPath: 'question_id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['progress', 'wrong', 'favorites', 'notes', 'exams', 'daka_progress', 'unfamiliar', 'dontknow'], 'readwrite');
      tx.objectStore('progress').put({ question_id: 'os_0001', subject: 'os', user_answer: 'A', is_correct: 1, answered_at: '2026-10-12 10:00:00' });
      tx.objectStore('progress').put({ question_id: 'ds_0143', subject: 'ds', user_answer: 'B', is_correct: 0, answered_at: '2026-10-12 11:00:00' });
      tx.objectStore('wrong').put({ question_id: 'ds_0143', subject: 'ds', wrong_count: 2, last_wrong_at: '2026-10-12 11:00:00', is_resolved: 0, correct_streak: 0 });
      tx.objectStore('favorites').put({ question_id: 'os_0001', subject: 'os', created_at: '2026-10-12 10:30:00' });
      tx.objectStore('notes').put({ question_id: 'ds_0143', subject: 'ds', content: '<p>双指针</p>', images: [], updated_at: '2026-10-13 09:00:00' });
      tx.objectStore('unfamiliar').put({ question_id: 'cn_0009', subject: 'cn', marked_at: '2026-10-13 09:30:00' });
      tx.objectStore('dontknow').put({ question_id: 'co_0007', subject: 'co', marked_at: '2026-10-13 09:40:00' });
      tx.objectStore('exams').put({ mode: 'os', status: 'finished', score: 80, created_at: '2026-10-13 20:00:00' });
      tx.objectStore('daka_progress').put({ question_id: 'ds_daka_01', done: 1, updated_at: '2026-10-13 21:00:00' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function readStore(factory, store) {
  return new Promise((resolve, reject) => {
    const req = factory.open('quiz408', 3);
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => { db.close(); resolve(r.result); };
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function boot({ ls, factory }) {
  const html = '<!DOCTYPE html><html><body><script>' + BE + '</script></body></html>';
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.log('JSDOM ERR:', e.message));
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = factory;
      w.IDBKeyRange = IDBKeyRange;
      if (ls) for (const [k, v] of Object.entries(ls)) w.localStorage.setItem(k, v);
    }
  });
}

(async () => {
  console.log('▸ 静态结构（backend.js）');
  check('collectLocalStorage 定义（遍历 localStorage.length/key(i)，失败不抛）',
    /function collectLocalStorage\(\) \{[\s\S]{0,400}?localStorage\.length[\s\S]{0,200}?localStorage\.key\(i\)/.test(BE)
    && /collectLocalStorage[\s\S]*?catch \(e\) \{ console\.warn\('localStorage 收集失败'/.test(BE), true);
  check('导出含 local 全量键且 version 升为 2',
    /version: 2, exported_at: now\(\), source: 'pwa'/.test(BE) && /local: collectLocalStorage\(\)/.test(BE), true);
  check('导入回写 localStorage（仅字符串值，计入 counts.local）',
    /const localRows = \(body\.local && typeof body\.local === 'object' && !Array\.isArray\(body\.local\)\) \? body\.local : null;/.test(BE)
    && /if \(typeof v !== 'string'\) continue;/.test(BE) && /counts\.local = n;/.test(BE), true);

  console.log('\n▸ 端到端：导出（localStorage 全量 + 8 个 store）');
  const factory1 = new IDBFactory();
  await seedDB(factory1);
  const dom1 = boot({ ls: LS, factory: factory1 });
  const w1 = dom1.window;
  await sleep(80);
  const resp1 = await w1.eval('api("/api/backup/export")');
  const data = await resp1.json();
  check('version = 2', data.version, 2);
  check('local 键数 = 预置的 %d 个', Object.keys(data.local || {}).length, LS_N);
  let allExact = true, diffKey = '';
  for (const [k, v] of Object.entries(LS)) {
    if (data.local[k] !== v) { allExact = false; diffKey = k; break; }
  }
  check('local 每个键逐字节一致（含中文/JSON）', diffKey || allExact, true);
  check('8 个 store 全部导出（progress 2 / wrong 1 / favorites 1 / notes 1 / exams 1 / daka 1 / unfamiliar 1 / dontknow 1）',
    [data.progress.length, data.wrong.length, data.favorites.length, data.notes.length,
      data.exams.length, data.daka.length, data.unfamiliar.length, data.dontknow.length],
    [2, 1, 1, 1, 1, 1, 1, 1]);
  check('自增主键已剥离（progress 无 pk、exams 无 id）',
    data.progress.every(r => !('pk' in r)) && data.exams.every(r => !('id' in r)), true);
  dom1.window.close();

  console.log('\n▸ 端到端：导入到全新设备（空 localStorage + 空库）');
  const factory2 = new IDBFactory();
  await seedDB(factory2);   // 预置旧数据，验证导入是全量覆盖
  const dom2 = boot({ ls: null, factory: factory2 });
  const w2 = dom2.window;
  await sleep(80);
  const resp2 = await w2.eval('api("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: ' + JSON.stringify(JSON.stringify(data)) + ' })');
  const r2 = await resp2.json();
  check('导入成功', r2.success, true);
  check('counts.local = %d', r2.counts && r2.counts.local, LS_N);
  check('counts.progress = 2 / daka = 1', [r2.counts.progress, r2.counts.daka], [2, 1]);
  let lsOk = true, lsDiff = '';
  for (const [k, v] of Object.entries(LS)) {
    if (w2.localStorage.getItem(k) !== v) { lsOk = false; lsDiff = k + ' → ' + w2.localStorage.getItem(k); break; }
  }
  check('localStorage 全部键原样恢复（记忆卡/批注/大题已练/每日一题/冲刺计划/偏好）', lsDiff || lsOk, true);
  check('新设备进度落库（progress 2 条、daka_progress 1 条）',
    [(await readStore(factory2, 'progress')).length, (await readStore(factory2, 'daka_progress')).length], [2, 1]);
  dom2.window.close();

  console.log('\n▸ 兼容与边界');
  // v1 旧备份（无 local 字段）应正常导入
  const v1 = { ...data }; delete v1.local;
  const factory3 = new IDBFactory();
  const dom3 = boot({ ls: { cards_known_v1: LS.cards_known_v1 }, factory: factory3 });
  const w3 = dom3.window;
  await sleep(80);
  const r3 = await (await w3.eval('api("/api/backup/import", { method: "POST", body: ' + JSON.stringify(JSON.stringify(v1)) + ' })')).json();
  check('v1 旧备份（无 local）导入成功且不写本地存储',
    [r3.success, r3.counts.progress, 'local' in (r3.counts || {})], [true, 2, false]);
  check('v1 导入不清空已有 localStorage（cards_known_v1 保持预置值）',
    w3.localStorage.getItem('cards_known_v1'), LS.cards_known_v1);
  dom3.window.close();

  // local 非字符串值忽略；字符串照写
  const factory4 = new IDBFactory();
  const dom4 = boot({ ls: null, factory: factory4 });
  const w4 = dom4.window;
  await sleep(80);
  const r4 = await (await w4.eval('api("/api/backup/import", { method: "POST", body: ' +
    JSON.stringify(JSON.stringify({ progress: [], local: { good_key: '1', bad_obj: { a: 1 }, bad_num: 123, bad_null: null } })) + ' })')).json();
  check('非字符串 local 值被忽略（只写 1 个）',
    [r4.success, r4.counts.local, w4.localStorage.getItem('good_key'), w4.localStorage.getItem('bad_obj')],
    [true, 1, '1', null]);
  dom4.window.close();

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
