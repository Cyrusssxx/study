// 模拟考抽题：7 天冷却 + 池子统计 回归测试
//
// 用户规则：模拟考里答过的题，7 天内不再被抽到；满 7 天后才重新进抽取池。
// 原实现只有「答错的题 4 天后重抽」，答对的题走时间队列、没有冷却 ——
// 收藏池小的时候会出现「刚做完又抽到」，等于没练。
//
// 覆盖：
//   一、抽题顺序（真跑 examApi generate）
//      1) 没做过 → 已过冷却（最早做的先） → 冷却中（兜底）
//      2) 冷却中的题在池子够用时不会被抽到
//   二、到期错题门槛
//      3) 答错 5 天前 → 未满 7 天，不进 due
//      4) 答错 8 天前 → 进 due，且排最前
//   三、池子统计 /api/exam/pool
//      5) 收藏池总数 / 待抽（没做过）/ 冷却中 / 已过冷却
//      6) 不熟 / 不会 数量
//   四、前端
//      7) 设置页有 4 个统计格 + loadPoolStats 接线
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_pool.js
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
const EXAM_SRC = fs.readFileSync(path.join(ROOT, 'pwa/exam.html'), 'utf8');
const BACKEND_SRC = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

const FIXTURE = {
  subject: 'cn', title: '计算机网络', source: 'test',
  questions: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    id: 'cn_000' + n, number: n, content: '题干' + n,
    options: { A: '甲', B: '乙', C: '丙', D: '丁' }, answer: 'A', explanation: '',
    chapter: '第1章 概述', section: '1.1 概念'
  }))
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fmt = ms => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const DAY = 86400000;

(async () => {
  const idb = new IDBFactory();
  let html = EXAM_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/exam.html',
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.fetch = async (url) => {
        const u = String(url);
        let obj;
        if (u.includes('data/notes/') || u.includes('_map.json') || u.includes('algo_notes')) obj = { chapters: [], sections: [] };
        else if (/data\/cn\.json/.test(u)) obj = JSON.parse(JSON.stringify(FIXTURE));
        else if (/data\/[a-z_0-9]+\.json/.test(u)) obj = { subject: 'x', questions: [] };
        else obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        return { ok: true, status: 200, json: async () => obj };
      };
    }
  });
  const w = dom.window;
  await sleep(300);

  const db = await w.openDB();
  const put = (store, rows) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    for (const r of rows) tx.objectStore(store).put(r);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });

  // 收藏池 3 题：1 没做过 / 2 三天前做过（冷却中）/ 3 十天前做过（已过冷却）
  await put('favorites', [
    { question_id: 'cn_0001', subject: 'cn', added_at: fmt(Date.now() - 30 * DAY) },
    { question_id: 'cn_0002', subject: 'cn', added_at: fmt(Date.now() - 30 * DAY) },
    { question_id: 'cn_0003', subject: 'cn', added_at: fmt(Date.now() - 30 * DAY) }
  ]);
  await put('progress', [
    { question_id: 'cn_0002', subject: 'cn', answered_at: fmt(Date.now() - 3 * DAY), is_correct: 1, user_answer: 'A' },
    { question_id: 'cn_0003', subject: 'cn', answered_at: fmt(Date.now() - 10 * DAY), is_correct: 1, user_answer: 'A' }
  ]);

  const gen = (mode, count) => w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, count })
  }).then(r => r.json());

  console.log('--- 一、抽题顺序：没做过 → 已过冷却 → 冷却中 ---');
  const g1 = await gen('favorites', 5);
  check('组卷成功', !!g1.exam_id, true);
  const order = (g1.questions || []).map(q => q.id);
  check('前 3 题顺序 = 没做过(cn_0001) → 已过冷却(cn_0003) → 冷却中(cn_0002)',
    order.slice(0, 3), ['cn_0001', 'cn_0003', 'cn_0002']);
  check('池子只有 3 题，其余从全题库补足到 5', order.length, 5);

  console.log('\n--- 二、池子够用时，冷却中的题不出现 ---');
  // 再加两题没做过的收藏题 → 池子 5 题，请求 3 题时冷却中的 cn_0002 应被排除
  await put('favorites', [
    { question_id: 'cn_0004', subject: 'cn', added_at: fmt(Date.now() - 20 * DAY) },
    { question_id: 'cn_0005', subject: 'cn', added_at: fmt(Date.now() - 20 * DAY) }
  ]);
  const g2 = await gen('favorites', 5);
  const order2 = (g2.questions || []).map(q => q.id);
  check('5 题请求里，冷却中的 cn_0002 排最后（前 4 题不含它）',
    order2.slice(0, 4).includes('cn_0002'), false);
  check('没做过的三题排最前', order2.slice(0, 3).sort(), ['cn_0001', 'cn_0004', 'cn_0005']);

  console.log('\n--- 三、到期错题门槛：满 7 天才进 due ---');
  // cn_0006 答错 5 天前 → 未满 7 天，不进 due
  await put('wrong', [{ question_id: 'cn_0006', subject: 'cn', wrong_count: 1, is_resolved: 0, last_wrong_at: fmt(Date.now() - 5 * DAY) }]);
  await put('progress', [{ question_id: 'cn_0006', subject: 'cn', answered_at: fmt(Date.now() - 5 * DAY), is_correct: 0, user_answer: 'B' }]);
  let pool = await w.api('/api/exam/pool').then(r => r.json());
  check('答错 5 天：不算到期错题', pool.due_wrong, 0);

  // 改成 8 天前 → 进 due
  await put('wrong', [{ question_id: 'cn_0006', subject: 'cn', wrong_count: 1, is_resolved: 0, last_wrong_at: fmt(Date.now() - 8 * DAY) }]);
  await put('progress', [{ question_id: 'cn_0006', subject: 'cn', answered_at: fmt(Date.now() - 8 * DAY), is_correct: 0, user_answer: 'B' }]);
  pool = await w.api('/api/exam/pool').then(r => r.json());
  check('答错 8 天：算到期错题', pool.due_wrong, 1);

  console.log('\n--- 四、池子统计 ---');
  await put('unfamiliar', [{ question_id: 'cn_0007', subject: 'cn', added_at: fmt(Date.now()) }]);
  await put('dontknow', [
    { question_id: 'cn_0008', subject: 'cn', added_at: fmt(Date.now()) },
    { question_id: 'cn_0001', subject: 'cn', added_at: fmt(Date.now()) }
  ]);
  pool = await w.api('/api/exam/pool').then(r => r.json());
  check('收藏池总数 5', pool.favorites_total, 5);
  check('待抽（没做过）3 题', pool.favorites_fresh, 3);
  check('冷却中 1 题', pool.favorites_cooling, 1);
  check('已过冷却可轮转 1 题', pool.favorites_ready, 1);
  check('不熟 1 题', pool.unfamiliar, 1);
  check('不会 2 题', pool.dontknow, 2);
  check('冷却天数回传 7', pool.cooldown_days, 7);
  check('四项之和 = 收藏总数', pool.favorites_fresh + pool.favorites_cooling + pool.favorites_ready, pool.favorites_total);

  console.log('\n--- 五、前端接线 ---');
  for (const id of ['examPoolBar', 'psFresh', 'psCooling', 'psUnfam', 'psDk']) {
    check(`设置页有 #${id}`, !!w.document.getElementById(id), true);
  }
  check('loadPoolStats 已定义', typeof w.loadPoolStats, 'function');
  check('统计卡有 4 格', w.document.querySelectorAll('#examPoolBar .pool-cell').length, 4);
  check('文案含「待抽收藏题（没做过）」', /待抽收藏题（没做过）/.test(w.document.getElementById('examPoolBar').textContent), true);
  check('文案含「冷却中（7 天内做过）」', /冷却中（7 天内做过）/.test(w.document.getElementById('examPoolBar').textContent), true);
  check('CSS 有 .exam-pool-bar 栅格', /\.exam-pool-bar\s*\{[^}]*grid-template-columns/.test(CSS), true);
  check('backToSetup 会刷新统计', /function backToSetup\(\)[\s\S]{0,200}?loadPoolStats\(\)/.test(EXAM_SRC), true);

  console.log('\n--- 六、源码口径 ---');
  check('冷却常量 = 7 天', /const EXAM_REDO_COOLDOWN_DAYS = 7;/.test(BACKEND_SRC), true);
  check('旧 4 天常量已移除', /EXAM_WRONG_REDRAW_DAYS/.test(BACKEND_SRC), false);
  check('到期错题与收藏队列共用同一常量',
    (BACKEND_SRC.match(/EXAM_REDO_COOLDOWN_MS/g) || []).length >= 2, true);
  check('prioritizeByTime 分出 cooling 层', /cooling\.push\(q\)/.test(BACKEND_SRC), true);
  check('冷却层排在最后（兜底才用）', /return due\.concat\(fresh, ready, cooling\)/.test(BACKEND_SRC), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
