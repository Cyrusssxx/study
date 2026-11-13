// 模拟考三档排序的行为验证（真跑 splitTiers，不是正则匹配）：
//   2026-11-13 用户口径：新题（没做过）必须是占比最大的一档；
//   做过的对题其次；错题（含到期错题）垫底，且合计必须 < 1/3。
//   旧实现「到期错题(≤1/3) → 做过的错题 → 没做过」的到期错题插队逻辑已删除，
//   到期只决定「错题档内部」的先后（逾期越久越靠前）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL').padEnd(5), name, cond ? '' : `→ ${extra || ''}`);
  cond ? pass++ : fail++;
}

// ---- 从 backend.js 抽出 wrongishOf + splitTiers（依赖 progMap / wrongMap / dueRank 等外层局部变量）----
const mWrong = BACKEND.match(/function wrongishOf\(qid\) \{[\s\S]*?\n        \}\n/);
const mSplit = BACKEND.match(/function splitTiers\(pool\) \{[\s\S]*?\n        \}\n/);
if (!mWrong || !mSplit) {
  console.log('FAIL 抽不到 wrongishOf / splitTiers');
  process.exit(1);
}

function makeSplit(progRows, opts) {
  const o = opts || {};
  const ctx = {
    progMap: new Map(progRows.map(r => [r.question_id, r])),
    wrongMap: new Map((o.wrongRows || []).map(r => [r.question_id, r])),
    dueRank: new Map(o.dueRank || []),
    ztCooling: new Set(o.ztCooling || []),
    examRightSet: new Set(o.examRightSet || []),
    guessedSet: new Set(o.guessedSet || []),
  };
  vm.createContext(ctx);
  vm.runInContext(mWrong[0] + mSplit[0] + '\nthis.f = splitTiers;', ctx);
  return ctx.f;
}

const Q = id => ({ id });
const ids = arr => arr.map(x => x.id);

// 场景 1：三档齐全 —— 新题在前，做过的对题居中，错题垫底
{
  const split = makeSplit([
    { question_id: 'c1', answered_at: '2026-01-02 10:00:00', is_correct: true },
    { question_id: 'w1', answered_at: '2026-01-03 10:00:00', is_correct: false },
  ], { wrongRows: [{ question_id: 'w1', is_resolved: 0 }] });
  const t = split([Q('w1'), Q('c1'), Q('f1'), Q('f2')]);
  ok('新题全在第一档（题号升序，不随机）', ids(t.fresh).join(',') === 'f1,f2', ids(t.fresh).join(','));
  ok('做过的对题在第二档', ids(t.correct).join(',') === 'c1', ids(t.correct).join(','));
  ok('错题在第三档', ids(t.wrong).join(',') === 'w1', ids(t.wrong).join(','));
}

// 场景 2：到期错题不再插队 —— 即使 dueRank 有它，也只排在错题档内
{
  const split = makeSplit([
    { question_id: 'w1', answered_at: '2026-01-06 10:00:00', is_correct: false },
    { question_id: 'w2', answered_at: '2026-01-05 10:00:00', is_correct: false },
    { question_id: 'w3', answered_at: '2026-01-04 10:00:00', is_correct: false },
    { question_id: 'd1', answered_at: '2026-01-01 10:00:00', is_correct: true },
  ], {
    wrongRows: ['w1', 'w2', 'w3'].map(id => ({ question_id: id, is_resolved: 0 })),
    dueRank: [['w1', 0], ['w2', 1], ['w3', 2]],
  });
  const t = split([Q('f1'), Q('d1'), Q('w1'), Q('w2'), Q('w3')]);
  ok('到期错题不越过新题（新题仍独占第一档）', ids(t.fresh).join(',') === 'f1', ids(t.fresh).join(','));
  ok('到期错题不越过做过的对题', ids(t.correct).join(',') === 'd1', ids(t.correct).join(','));
  ok('错题档内逾期越久越靠前（w1→w2→w3）', ids(t.wrong).join(',') === 'w1,w2,w3', ids(t.wrong).join(','));
}

// 场景 3：模拟考答对过的题退出抽题；标「猜对了」的回到第二档
{
  const split = makeSplit([
    { question_id: 'a', answered_at: '2026-01-01 10:00:00', is_correct: true },
    { question_id: 'b', answered_at: '2026-01-01 10:00:00', is_correct: true },
  ], { examRightSet: ['a', 'b'] });
  const t = split([Q('a'), Q('b'), Q('f')]);
  ok('模拟考答对且没标猜对了 → 整题不出现',
    !ids(t.fresh).concat(ids(t.correct), ids(t.wrong)).includes('a'), ids(t.correct).join(','));
  const split2 = makeSplit([
    { question_id: 'a', answered_at: '2026-01-01 10:00:00', is_correct: true },
  ], { examRightSet: ['a'], guessedSet: ['a'] });
  const t2 = split2([Q('a')]);
  ok('标「猜对了」→ 放回做过的对题档', ids(t2.correct).join(',') === 'a', ids(t2.correct).join(','));
}

// 场景 4：刚入错题池的 7 天冷却 → 整题不进任何档
{
  const split = makeSplit([], { ztCooling: ['x'] });
  const t = split([Q('x'), Q('y')]);
  ok('冷却中的题整题不进池', ids(t.fresh).join(',') === 'y', ids(t.fresh).join(','));
}

// 场景 5：同一时刻做过的题按题号兜底，不随机
{
  const rows = ['z', 'y', 'x'].map(id => ({ question_id: id, answered_at: '2026-01-01 09:00:00', is_correct: true }));
  const split = makeSplit(rows);
  const got1 = ids(split([Q('z'), Q('y'), Q('x')]).correct).join(',');
  const got2 = ids(split([Q('x'), Q('y'), Q('z')]).correct).join(',');
  ok('同一时刻按题号稳定排序（两次一致）', got1 === got2 && got1 === 'x,y,z', got1);
}

// 场景 6：做过的按 answered_at 升序（最早做的先抽）
{
  const split = makeSplit([
    { question_id: 'b', answered_at: '2026-01-02 10:00:00', is_correct: true },
    { question_id: 'a', answered_at: '2026-01-01 10:00:00', is_correct: true },
    { question_id: 'c', answered_at: '2026-01-03 10:00:00', is_correct: true },
  ]);
  ok('最早做过的排最前（a→b→c）', ids(split([Q('c'), Q('a'), Q('b')]).correct).join(',') === 'a,b,c',
    ids(split([Q('c'), Q('a'), Q('b')]).correct).join(','));
}

// 场景 7：三档互斥，并集 = 池子（除被排除项）
{
  const split = makeSplit([
    { question_id: 'c', answered_at: '2026-01-01 10:00:00', is_correct: true },
    { question_id: 'w', answered_at: '2026-01-01 10:00:00', is_correct: false },
    { question_id: 'gone', answered_at: '2026-01-01 10:00:00', is_correct: true },
  ], { wrongRows: [{ question_id: 'w', is_resolved: 0 }], examRightSet: ['gone'] });
  const t = split([Q('f'), Q('c'), Q('w'), Q('gone')]);
  const all = ids(t.fresh).concat(ids(t.correct), ids(t.wrong));
  ok('三档并集 = 池子 − 被排除项', all.slice().sort().join(',') === 'c,f,w', all.join(','));
  ok('三档无重复', new Set(all).size === all.length, all.join(','));
}

// 场景 8：源码口径守卫
{
  ok('已无 dueCap 帽子逻辑（旧插队实现）', !/dueCap/.test(BACKEND));
  ok('已无 prioritizeByTime（旧时间队列）', !/prioritizeByTime/.test(BACKEND));
  ok('三档顺序写死在主循环', /for \(const tier of \['fresh', 'correct', 'wrong'\]\)/.test(BACKEND));
  ok('错题预算 = floor(total/3)', /const wrongCap = isExamMode \? Math\.floor\(total \/ 3\) : Infinity;/.test(BACKEND));
  ok('专项池仍用三层优先级', /function prioritize\(pool\)/.test(BACKEND));
  ok('第三轮跨科补题仍是兜底随机（不改）', /for \(const q of shuffled\(rest\)\.slice\(0, short\)\)/.test(BACKEND));
}

// ---- examDueWrongIds 行为验证（未改动，保留原护栏）----
const em = BACKEND.match(/const EXAM_REDO_COOLDOWN_DAYS = 7;[\s\S]*?async function examDueWrongIds\(\) \{[\s\S]*?\n\}\n/);
if (!em) {
  console.log('FAIL 抽不到 examDueWrongIds');
  process.exit(1);
}
const fmt = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const DAY = 86400000;
const now = Date.now();

function makeDue(wrongRows, statusMap) {
  const ctx = {
    tsToStr: v => (typeof v === 'string' ? v : ''),
    dbAll: async () => wrongRows,
    latestStatuses: async () => statusMap || {},
  };
  vm.createContext(ctx);
  vm.runInContext(em[0] + '\nthis.f = examDueWrongIds;', ctx);
  return ctx.f;
}

(async () => {
  const wrongRows = [
    { question_id: 'w_old1', last_wrong_at: fmt(now - 10 * DAY) },
    { question_id: 'w_old2', last_wrong_at: fmt(now - 9 * DAY) },
    { question_id: 'w_recent', last_wrong_at: fmt(now - 1 * DAY) },
    { question_id: 'w_res', last_wrong_at: fmt(now - 30 * DAY), is_resolved: 1 },
    { question_id: 'w_fixed', last_wrong_at: fmt(now - 30 * DAY) },
    { question_id: 'w_rewrong', last_wrong_at: fmt(now - 8 * DAY) },
  ];
  const statusMap = {
    w_fixed: { is_correct: 1, answered_at: fmt(now - 2 * DAY) },
    w_rewrong: { is_correct: 1, answered_at: fmt(now - 20 * DAY) },
  };
  const got = await makeDue(wrongRows, statusMap)();
  ok('做错满 7 天到期；做对不抽；又做错重新计 7 天；逾期久的在前',
    got.join(',') === 'w_old1,w_old2,w_rewrong', got.join(','));

  const got2 = await makeDue([{ question_id: 'w_edge', last_wrong_at: fmt(now - 7 * DAY) }], {})();
  ok('恰好满 7 天即到期', got2.join(',') === 'w_edge', got2.join(','));

  const got3 = await makeDue([{ question_id: 'w_early', last_wrong_at: fmt(now - 6 * DAY) }], {})();
  ok('未满 7 天不到期', got3.length === 0, got3.join(','));

  console.log(`\n结果: ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass + fail} 项）`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL 异常', e); process.exit(1); });
