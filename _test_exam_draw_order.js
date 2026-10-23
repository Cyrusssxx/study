// 收藏题抽题逻辑的行为验证（真跑一遍排序函数，不是正则匹配）：
//   最早做过的题必须最先抽；做完后自动沉到队尾形成轮转；未做过的排最前且顺序稳定。
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

// ---- 从 backend.js 抽出 prioritizeByTime（含 progMap 依赖）----
const m = BACKEND.match(/function prioritizeByTime\(pool\) \{[\s\S]*?\n        \}\n/);
if (!m) {
  console.log('FAIL 抽不到 prioritizeByTime');
  process.exit(1);
}
const src = m[0];

function makeOrder(progRows) {
  const ctx = { progMap: new Map(progRows.map(r => [r.question_id, r])) };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.f = prioritizeByTime;', ctx);
  return ctx.f;
}

const Q = id => ({ id });

// 场景 1：做过三题，时间分别为 1/1、1/2、1/3（越早做越靠前）
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

// 场景 5：不受错题本影响（错题加权不参与收藏题排序）
{
  const withWrong = BACKEND.match(/function prioritizeByTime\(pool\) \{[\s\S]*?\n        \}\n/)[0];
  ok('时间队列函数体内不引用 wrongMap',
    !/wrongMap/.test(withWrong) && !/is_resolved/.test(withWrong));
}

// 场景 6：收藏模式选用时间队列；错题本模式仍用三层优先级
{
  ok('收藏模式 → 时间队列', /mode === 'favorites' \? prioritizeByTime : prioritize/.test(BACKEND));
  ok('三层优先级函数仍在（错题本用）', /function prioritize\(pool\)/.test(BACKEND));
  ok('第三轮跨科补题仍是兜底随机（不改）', /for \(const q of shuffled\(rest\)\.slice\(0, short\)\)/.test(BACKEND));
}

console.log(`\n结果: ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
