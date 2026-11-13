// 模拟考抽题比例回归（真跑 /api/exam/generate，不是正则匹配）
//
// 用户口径（2026-11-13）：
//   ① 错题（含到期错题）合计必须**严格小于 1/3**（40 题 → ≤ 13 题）；
//   ② 每一场里**新题（没做过）占比必须最大**；
//   ③ 旧实现里「到期错题(≤1/3) → 做过的错题 → 没做过」的插队逻辑必须消失
//      （实测曾出现 40 题全是错题、新题 0 道）。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_ratio.js
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

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SUBS = ['ds', 'co', 'os', 'cn'];

// 每科 n 题：id = <科目>_0001 …
function fixture(k, n) {
  return {
    subject: k, title: k, source: 'test',
    questions: Array.from({ length: n }, (_, i) => ({
      id: `${k}_${String(i + 1).padStart(4, '0')}`,
      number: i + 1, content: '题干' + (i + 1),
      options: { A: '甲', B: '乙', C: '丙', D: '丁' }, answer: 'A', explanation: '',
      chapter: '第1章 测试', section: '1.1 测试'
    }))
  };
}

(async () => {
  const idb = new IDBFactory();
  let html = EXAM_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const fixtures = {};
  for (const k of SUBS) fixtures[k] = fixture(k, 60);

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
        const mm = u.match(/data\/(ds|co|os|cn)\.json/);
        const obj = mm ? fixtures[mm[1]]
          : (u.includes('data/notes/') || u.includes('_map.json') || u.includes('algo_notes'))
            ? { chapters: [], sections: [] }
            : { subject: 'x', questions: [] };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(obj)) };
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
  const clear = (store) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });

  // 直接指定每科每种状态各占多少题：fresh = 没做过 / correct = 做过且对 / wrong = 做过且错
  async function seed({ fresh, correct, wrong, total = 60, favoritesAll = true }) {
    for (const st of ['favorites', 'progress', 'wrong', 'exams']) await clear(st);
    const favRows = [], progRows = [], wrongRows = [];
    for (const k of SUBS) {
      const ids = Array.from({ length: total }, (_, i) => `${k}_${String(i + 1).padStart(4, '0')}`);
      const qs = ['ds', 'co', 'os', 'cn'];
      if (favoritesAll) for (const id of ids) favRows.push({ question_id: id, subject: k, added_at: '2026-09-01 10:00:00' });
      // fresh = 前 fresh 题（不写 progress）
      let idx = fresh;
      for (let i = 0; i < correct; i++) {
        progRows.push({ question_id: ids[idx++], subject: k, answered_at: '2026-09-02 10:00:00', is_correct: 1, user_answer: 'A' });
      }
      for (let i = 0; i < wrong; i++) {
        const id = ids[idx++];
        progRows.push({ question_id: id, subject: k, answered_at: '2026-09-03 10:00:00', is_correct: 0, user_answer: 'B' });
        wrongRows.push({ question_id: id, subject: k, wrong_count: 1, is_resolved: 0, last_wrong_at: '2026-09-03 10:00:00' });
      }
    }
    await put('favorites', favRows);
    await put('progress', progRows);
    await put('wrong', wrongRows);
  }

  const gen = (mode, count) => w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, count })
  }).then(r => r.json());

  // 把抽到的题按当前库内状态分类
  async function classify(ids) {
    const prog = new Map((await w.dbAll('progress')).map(r => [r.question_id, r]));
    const wrong = new Map((await w.dbAll('wrong')).map(r => [r.question_id, r]));
    const out = { fresh: 0, correct: 0, wrong: 0, order: [] };
    for (const id of ids) {
      const p = prog.get(id);
      const ww = wrong.get(id);
      if (ww && !ww.is_resolved) { out.wrong++; out.order.push('wrong'); }
      else if (!p) { out.fresh++; out.order.push('fresh'); }
      else { out.correct++; out.order.push('correct'); }
    }
    return out;
  }

  console.log('--- 一、新题充足：40 题应全部是新题（错题 0）---');
  await seed({ fresh: 30, correct: 20, wrong: 10 });
  let g = await gen('favorites', 40);
  let c = await classify((g.questions || []).map(q => q.id));
  check('抽出 40 题', (g.questions || []).length, 40);
  check('新题 40 道（占比 100%）', c.fresh, 40);
  check('错题 0 道（远低于 1/3）', c.wrong, 0);
  check('新题是最大的一档', c.fresh > c.correct && c.fresh > c.wrong, true);

  console.log('\n--- 二、新题略少、做过的对题充足：错题仍应 0 ---');
  await seed({ fresh: 3, correct: 20, wrong: 37 });
  g = await gen('favorites', 40);
  c = await classify((g.questions || []).map(q => q.id));
  check('新题全被抽中（12 道）', c.fresh, 12);
  check('其余用做过的对题补满', c.correct, 28);
  check('错题仍是 0（有对题就不用错题）', c.wrong, 0);

  console.log('\n--- 三、某一科新题与对题全空：错题受 1/3 预算约束 ---');
  // cn 只有错题；其余三科新题充足
  await seed({ fresh: 30, correct: 0, wrong: 30 });
  // 把 cn 改成「全是错题」：清掉 cn 的 progress 后重写为全错
  {
    const allProg = (await w.dbAll('progress')).filter(r => !String(r.question_id).startsWith('cn_'));
    const cnProg = Array.from({ length: 60 }, (_, i) => {
      const id = `cn_${String(i + 1).padStart(4, '0')}`;
      return { question_id: id, subject: 'cn', answered_at: '2026-09-03 10:00:00', is_correct: 0, user_answer: 'B' };
    });
    const cnWrong = cnProg.map(r => ({ question_id: r.question_id, subject: 'cn', wrong_count: 1, is_resolved: 0, last_wrong_at: '2026-09-03 10:00:00' }));
    await clear('progress'); await clear('wrong');
    await put('progress', allProg.concat(cnProg));
    await put('wrong', cnWrong);
  }
  g = await gen('favorites', 40);
  c = await classify((g.questions || []).map(q => q.id));
  check('凑满 40 题', (g.questions || []).length, 40);
  check('cn 配额 8 题全来自错题档', c.wrong, 8);
  check('错题占比 20% < 1/3', c.wrong / 40 < 1 / 3, true);
  check('新题 32 道仍是最大一档', c.fresh, 32);

  console.log('\n--- 四、整卷模式（full）同样受约束 ---');
  await seed({ fresh: 30, correct: 20, wrong: 10 });
  g = await gen('full', 40);
  c = await classify((g.questions || []).map(q => q.id));
  check('full 抽出 40 题', (g.questions || []).length, 40);
  check('full 全是新题（错题 0）', c.wrong, 0);
  check('full 新题 40 道', c.fresh, 40);

  console.log('\n--- 五、模拟考答对过的题在 full 模式也退出抽题 ---');
  // 造一场 full 考，答对 ds_0001…ds_0010（这 10 道本来就是新题）
  const rightIds = Array.from({ length: 10 }, (_, i) => `ds_${String(i + 1).padStart(4, '0')}`);
  await put('exams', [{
    id: 1, mode: 'full', question_ids: rightIds,
    answers: Object.fromEntries(rightIds.map(id => [id, 'A'])),
    wrong_ids: [], right_ids: rightIds,
    total_count: 10, correct_count: 10, score: 20, duration_sec: 600,
    status: 'submitted', started_at: '2026-10-26 10:00:00', submitted_at: '2026-10-26 10:10:00'
  }]);
  g = await gen('full', 40);
  const ids5 = (g.questions || []).map(q => q.id);
  check('答对过的 10 道 ds 新题不再出现', ids5.filter(x => rightIds.includes(x)).length, 0);
  check('仍凑满 40 题', ids5.length, 40);

  console.log('\n--- 六、单科模式：错题预算 = floor(total/3) ---');
  await seed({ fresh: 5, correct: 10, wrong: 45 });
  g = await gen('cn', 40);
  c = await classify((g.questions || []).map(q => q.id));
  check('单科抽出 40 题', (g.questions || []).length, 40);
  check('新题先抽满（5 道）', c.fresh, 5);
  check('对题随后（10 道）', c.correct, 10);
  // 池子只剩 45 道错题 → 剩余 25 个位置只能靠错题，此时预算不足会兜底
  check('池子只剩错题时仍凑满题量', c.wrong, 25);

  console.log('\n--- 七、源码口径守卫 ---');
  const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
  check('无 dueCap 插队帽子', /dueCap/.test(BACKEND), false);
  check('错题预算 floor(total/3)', /Math\.floor\(total \/ 3\)/.test(BACKEND), true);
  check('三档填充顺序固定', /for \(const tier of \['fresh', 'correct', 'wrong'\]\)/.test(BACKEND), true);
  check('专项池不套预算（Infinity）', /: Infinity;/.test(BACKEND), true);

  console.log(`\n结果: ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass + fail} 项）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL 异常', e && (e.stack || e)); process.exit(1); });
