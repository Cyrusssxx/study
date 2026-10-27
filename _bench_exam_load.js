// 性能基准：exam.html 加载路径各接口耗时（用真实题库 + 模拟大量历史数据）
// 用法：NODE_PATH=<workspace>/node_modules node _bench_exam_load.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'pwa/exam.html'), 'utf8');
// 真实题库：按需读文件，模拟 fetch
const DATA = {};
for (const k of ['ds', 'co', 'os', 'cn']) {
  DATA[k] = JSON.parse(fs.readFileSync(path.join(ROOT, `pwa/data/${k}.json`), 'utf8'));
}

const fmt = ms => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const DAY = 86400000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const idb = new IDBFactory();
  let html = SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
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
        const m = u.match(/data\/(ds|co|os|cn)\.json/);
        if (m) obj = DATA[m[1]];
        else if (u.includes('data/notes/') || u.includes('_map.json')) obj = { chapters: [], sections: [] };
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

  // 模拟真实使用规模：50 场模拟考（每场 40 题）、1500 条作答、400 错题、300 收藏
  const allQids = [];
  for (const k of ['ds', 'co', 'os', 'cn']) {
    for (const q of DATA[k].questions.slice(0, 400)) allQids.push(q.id);
  }
  const exams = [];
  for (let i = 0; i < 50; i++) {
    const qids = allQids.slice(i * 40, i * 40 + 40);
    const answers = {};
    for (const qid of qids) answers[qid] = Math.random() < 0.7 ? 'A' : 'B';
    exams.push({
      id: i + 1, mode: 'full', question_ids: qids, answers,
      total_count: qids.length, correct_count: 20, score: 40, duration_sec: 3600,
      status: 'submitted', started_at: fmt(Date.now() - (60 - i) * DAY), submitted_at: fmt(Date.now() - (60 - i) * DAY)
    });
  }
  await put('exams', exams);
  const prog = [], wrong = [];
  for (let i = 0; i < 1500; i++) {
    const qid = allQids[i % allQids.length];
    prog.push({ question_id: qid, subject: qid.split('_')[0], answered_at: fmt(Date.now() - (i % 30) * DAY), is_correct: i % 3 ? 1 : 0, user_answer: 'A' });
    if (i % 4 === 0) wrong.push({ question_id: qid, subject: qid.split('_')[0], wrong_count: 1, is_resolved: 0, last_wrong_at: fmt(Date.now() - (i % 20) * DAY) });
  }
  await put('progress', prog);
  await put('wrong', wrong);
  await put('favorites', allQids.slice(0, 300).map(qid => ({ question_id: qid, subject: qid.split('_')[0], added_at: fmt(Date.now() - 30 * DAY) })));

  const time = async (label, fn) => {
    const t0 = Date.now();
    const r = await fn();
    const ms = Date.now() - t0;
    console.log(`${label.padEnd(34)} ${String(ms).padStart(6)} ms`);
    return r;
  };

  console.log(`数据规模：${exams.length} 场模拟考 / ${prog.length} 条作答 / ${wrong.length} 错题 / 300 收藏`);
  console.log(`题库：${Object.keys(DATA).map(k => k + ' ' + DATA[k].questions.length).join(' · ')}\n`);

  // 冷启动：题库缓存为空时的首次调用
  await time('pool（首屏用，不碰题库）', () => w.api('/api/exam/pool').then(r => r.json()));
  await time('exam/history（首屏用）', () => w.api('/api/exam/history').then(r => r.json()));
  await time('exam/active（首屏用）', () => w.api('/api/exam/active').then(r => r.json()));
  await time('examwrong（后台补算，触发题库）', () => w.api('/api/exam/examwrong').then(r => r.json()));
  await time('pool（补算后再次）', () => w.api('/api/exam/pool').then(r => r.json()));
  await time('stats（首页用）', () => w.api('/api/stats').then(r => r.json()));
  await time('exam/generate favorites 40 题', () => w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'favorites', count: 40 })
  }).then(r => r.json()));

  dom.window.close();
})();
