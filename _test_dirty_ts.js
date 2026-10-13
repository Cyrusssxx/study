// _test_dirty_ts.js —— 历史脏时间戳（数字毫秒）修复回归（2026-10-14）
// 背景：早期 zhenti 提交把 Date.now() 数字写进 progress.answered_at / wrong.last_wrong_at，
//       _reviewStageOf 的 .slice 在数字上抛错 → 首页「总统计 + 该科统计」整科失败显示 0
//       （用户报：数据结构 632 题 已完成 0/632；黄条：...slice is not a function）。
// 覆盖：① 首页加载时自动迁移（数字 → 'YYYY-MM-DD HH:MM:SS'）；② 迁移后无 warnings；
//       ③ 顶部与科目卡片数字恢复；④ 无法迁移的歪值（0/负数）不再让统计崩溃。
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

const DIRTY_MS = 1791792848553;   // 备份里的真实坏值（ds_0143 / ds_zt2009_4 同款数字时间戳）

// 用与 backend 相同的库结构（quiz408 v3）预置脏数据
function seed(factory) {
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
      const tx = db.transaction(['progress', 'wrong'], 'readwrite');
      const P = tx.objectStore('progress'), W = tx.objectStore('wrong');
      // 坏记录（zhenti 真题提交写下的数字时间戳，ds 科目）
      P.put({ question_id: 'ds_0143', subject: 'ds', user_answer: 'A', is_correct: 0, answered_at: DIRTY_MS });
      W.put({ question_id: 'ds_0143', subject: 'ds', wrong_count: 1, last_wrong_at: DIRTY_MS, is_resolved: 0, correct_streak: 0 });
      // 歪值（0 → 不可迁移、也不能崩统计）
      W.put({ question_id: 'ds_bad2', subject: 'ds', wrong_count: 1, last_wrong_at: 0, is_resolved: 0, correct_streak: 0 });
      // 正常记录
      P.put({ question_id: 'ds_ok1', subject: 'ds', user_answer: 'B', is_correct: 1, answered_at: '2026-10-12 10:00:00' });
      P.put({ question_id: 'os_ok1', subject: 'os', user_answer: 'C', is_correct: 1, answered_at: '2026-10-12 11:00:00' });
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

(async () => {
  console.log('▸ 预置脏数据 → 加载首页 → 自动迁移与统计恢复');
  const factory = new IDBFactory();
  await seed(factory);

  const html = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8')
    .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
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
      w.indexedDB = factory;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.scrollTo = () => { };
      w.fetch = async (u) => {
        const s = String(u);
        if (s.includes('data/meta.json')) {
          return { ok: true, status: 200, json: async () => ({ ds_daka: 62, subjects: { os: { total: 1200 }, co: { total: 1100 }, ds: { total: 632 }, cn: { total: 900 } } }) };
        }
        return { ok: true, status: 200, json: async () => ({ questions: [] }) };
      };
    }
  });
  const w = dom.window, d = w.document;
  for (let i = 0; i < 60 && d.querySelectorAll('.subject-card').length === 0; i++) await sleep(50);
  await sleep(400);   // 等统计与迁移完成

  const bar = d.getElementById('statsBar').textContent;
  check('统计不再报「部分统计读取失败」（黄条消失，迁移把坏值修掉了）',
    /部分统计读取失败/.test(bar), false);
  check('统计不报「没读到答题记录」（数据没丢）',
    /没读到答题记录/.test(bar), false);

  const nums = [...d.querySelectorAll('.stat-item .stat-number')].map(x => x.textContent.trim());
  check('顶部「已做题目」= 3（不再被吞成 0）', nums[0], '3');
  check('顶部「错题数」= 2（ds_0143 + ds_bad2）', nums[2], '2');
  check('顶部「收藏数」= 0（确实没有收藏）', nums[4], '0');

  const cards = [...d.querySelectorAll('#subjectsGrid .subject-card')];
  const dsCard = cards[2] ? cards[2].textContent : '';
  check('DS 卡片恢复「已完成 2/632」（不再 0/632）',
    /已完成 2\/632/.test(dsCard.replace(/\s+/g, ' ')), true);
  check('DS 卡片不再正确率 0%（1/2 对 → 50%）',
    /正确率 50%/.test(dsCard.replace(/\s+/g, ' ')), true);

  // —— 库内迁移结果 ——
  const pr = await readStore(factory, 'progress');
  const rec = pr.find(r => r.question_id === 'ds_0143');
  check('progress.answered_at 已迁移为字符串', typeof rec.answered_at, 'string');
  check('迁移格式 = YYYY-MM-DD HH:MM:SS（2026 年）',
    /^2026-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rec.answered_at), true);
  check('正常记录未被改动', pr.find(r => r.question_id === 'os_ok1').answered_at, '2026-10-12 11:00:00');

  const wr = await readStore(factory, 'wrong');
  check('wrong.last_wrong_at 已迁移为字符串',
    typeof wr.find(r => r.question_id === 'ds_0143').last_wrong_at, 'string');
  check('歪值（0）保持原样但统计不崩（无从迁移）',
    wr.find(r => r.question_id === 'ds_bad2').last_wrong_at, 0);
  dom.window.close();

  // —— 二次加载：迁移幂等（再跑一次不报错、数字不变） ——
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/index.html',
    virtualConsole: vc,
    beforeParse(w2) {
      w2.indexedDB = factory;
      w2.IDBKeyRange = IDBKeyRange;
      w2.alert = () => { }; w2.scrollTo = () => { };
      w2.fetch = async (u) => (String(u).includes('meta')
        ? { ok: true, status: 200, json: async () => ({ ds_daka: 62, subjects: { ds: { total: 632 } } }) }
        : { ok: true, status: 200, json: async () => ({ questions: [] }) });
    }
  });
  const d2 = dom2.window.document;
  for (let i = 0; i < 60 && d2.querySelectorAll('.subject-card').length === 0; i++) await sleep(50);
  await sleep(300);
  const nums2 = [...d2.querySelectorAll('.stat-item .stat-number')].map(x => x.textContent.trim());
  check('二次加载数字一致（迁移幂等）', nums2[0], '3');
  dom2.window.close();

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
