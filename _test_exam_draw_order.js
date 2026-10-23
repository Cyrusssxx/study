// 收藏题抽题逻辑的行为验证（真跑一遍排序函数，不是正则匹配）：
//   到期错题最优先（受 1/3 帽子约束、内部按最近动态倒序）；
//   未做过的排其次且按题号稳定；其余按最早做过先抽、做完沉队尾形成轮转。
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

// ---- 从 backend.js 抽出 prioritizeByTime（含 progMap/wrongMap/dueSet 依赖）----
const m = BACKEND.match(/function prioritizeByTime\(pool, take\) \{[\s\S]*?\n        \}\n/);
if (!m) {
  console.log('FAIL 抽不到 prioritizeByTime');
  process.exit(1);
}
const src = m[0];

function makeOrder(progRows, wrongRows, dueIds) {
  const ctx = {
    progMap: new Map(progRows.map(r => [r.question_id, r])),
    wrongMap: new Map((wrongRows || []).map(r => [r.question_id, r])),
    dueSet: new Set(dueIds || []),
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.f = prioritizeByTime;', ctx);
  return ctx.f;
}

const Q = id => ({ id });

// 场景 1：无到期错题时——做过三题，时间 1/1、1/2、1/3（越早做越靠前）
{
  const order = makeOrder([
    { question_id: 'c', answered_at: '2026-01-03 10:00:00' },
    { question_id: 'a', answered_at: '2026-01-01 10:00:00' },
    { question_id: 'b', answered_at: '2026-01-02 10:00:00' },
  ]);
  const got = order([Q('a'), Q('b'), Q('c'), Q('d')]).map(x => x.id);
  ok('最早做过的排最前（a→b→c），未做过的 d 排最前',
    got[0] === 'd' && got[1] === 'a' && got[2] === 'b' && got[3] === 'c', got.join(','));
}

// 场景 2：做完 a 之后（时间刷新到今天），a 应沉到已做队列的队尾
{
  const order = makeOrder([
    { question_id: 'a', answered_at: '2026-10-23 09:00:00' },   // 刚做完
    { question_id: 'b', answered_at: '2026-01-02 10:00:00' },
    { question_id: 'c', answered_at: '2026-01-03 10:00:00' },
  ]);
  const got = order([Q('a'), Q('b'), Q('c')]).map(x => x.id);
  ok('做完的题沉到队尾，下一场先抽更早做的 b', got[0] === 'b' && got[1] === 'c' && got[2] === 'a', got.join(','));
}

// 场景 3：同一时刻做的题，按题号兜底，不随机
{
  const rows = ['z', 'y', 'x'].map(id => ({ question_id: id, answered_at: '2026-01-01 09:00:00' }));
  const order = makeOrder(rows);
  const got1 = order([Q('z'), Q('y'), Q('x')]).map(x => x.id);
  const got2 = order([Q('x'), Q('y'), Q('z')]).map(x => x.id);
  ok('同一时刻按题号稳定排序（两次结果一致）',
    got1.join(',') === got2.join(',') && got1.join(',') === 'x,y,z', got1.join(','));
}

// 场景 4：未做过的多题，按题号顺序（不是随机）
{
  const order = makeOrder([]);
  const pool = ['ds_0030', 'ds_0005', 'ds_0012'].map(Q);
  const got1 = order(pool).map(x => x.id);
  const got2 = order(pool.slice().reverse()).map(x => x.id);
  ok('未做过的按题号升序（与入参顺序无关）',
    got1.join(',') === 'ds_0005,ds_0012,ds_0030' && got2.join(',') === got1.join(','), got1.join(','));
}

// 场景 5：到期错题最优先 + 1/3 帽子：超帽的回流时间队列按 answered_at 排序
{
  const order = makeOrder([
    { question_id: 'w1', answered_at: '2026-01-06 10:00:00' },
    { question_id: 'w2', answered_at: '2026-01-05 10:00:00' },
    { question_id: 'w3', answered_at: '2026-01-04 10:00:00' },
    { question_id: 'd1', answered_at: '2026-01-01 10:00:00' },
  ], [], ['w1', 'w2', 'w3']);
  // take=3 → 帽子 ceil(3/3)=1 → 只有最近错的 w1 进到期层；w2/w3 回流 done：
  // done 按 answered_at 升序 = d1(01-01) → w3(01-04) → w2(01-05)
  const got = order([Q('f1'), Q('d1'), Q('w1'), Q('w2'), Q('w3')], 3).map(x => x.id);
  ok('到期错题受 1/3 帽子约束（w1→f1→d1→w3→w2）',
    got.join(',') === 'w1,f1,d1,w3,w2', got.join(','));
}

// 场景 6：到期错题内部按最近动态倒序——最近做错的先回卷（"这次错的尽快回来"）
{
  const order = makeOrder([
    { question_id: 'w1', answered_at: '2026-01-06 10:00:00' },
    { question_id: 'w2', answered_at: '2026-01-05 10:00:00' },
    { question_id: 'w3', answered_at: '2026-01-04 10:00:00' },
  ], [], ['w1', 'w2', 'w3']);
  // take=9 → 帽子 3 不约束 → 三道到期错题全进到期层，最近错的 w1 最前
  const got = order([Q('w3'), Q('w1'), Q('w2')], 9).map(x => x.id);
  ok('到期层内最近错的排最前（w1→w2→w3）', got.join(',') === 'w1,w2,w3', got.join(','));
}

// 场景 7：最近动态可来自 wrong.last_wrong_at（无 progress 行时，如错题本记录）
{
  const order = makeOrder([], [
    { question_id: 'w1', last_wrong_at: '2026-01-06 10:00:00' },
    { question_id: 'w2', last_wrong_at: '2026-01-05 10:00:00' },
  ], ['w1', 'w2']);
  const got = order([Q('w1'), Q('w2')], 2).map(x => x.id);
  ok('最近动态取 last_wrong_at（w1 先于 w2）', got.join(',') === 'w1,w2', got.join(','));
}

// 场景 8：不熟/不会标记不参与收藏题抽题（到期错题是唯一的错题加权）
{
  const body = m[0];
  ok('时间队列函数体内不引用 不熟/不会 集合', !/unfam|dontknow/i.test(body));
  ok('到期错题最近动态引用 wrongMap（last_wrong_at）', /last_wrong_at/.test(body));
}

// 场景 9：收藏模式选用时间队列；错题本模式仍用三层优先级
{
  ok('收藏模式 → 时间队列', /mode === 'favorites' \? prioritizeByTime : prioritize/.test(BACKEND));
  ok('三层优先级函数仍在（错题本用）', /function prioritize\(pool\)/.test(BACKEND));
  ok('第三轮跨科补题仍是兜底随机（不改）', /for \(const q of shuffled\(rest\)\.slice\(0, short\)\)/.test(BACKEND));
}

console.log(`\n结果: ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
