// 真题选择题「考点分析」覆盖率回归（2026-11-11）
//
// 用户要求：zhenti 选择题的考点分析全部生成 + 常驻显示。
// 本测试是**数据侧**契约（不跑 jsdom，秒级）：
//   ① 47 套卷里每一道选择题都能解析出考点分析（题库 kp_analysis 或 data/zt_kp.json）
//   ② zt_kp.json 只放「题库里没有的」未映射选择题，key 必须真实出现在卷面里
//   ③ 每条 kp 都是两段式（考点 + 易错点），且不含 <p>/<br>/换行（常驻面板里排版会散）
//   ④ 题库侧：映射题的 kp_analysis 与常驻面板用的字段同名（BANK_KP 复用同一次拉取）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_kp_cover.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'pwa', 'data');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const read = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));
const SUBS = ['os', 'co', 'cn', 'ds'];

const banks = {};
for (const s of SUBS) banks[s] = new Map(read(s + '.json').questions.map(q => [q.id, q]));
const ztKp = read('zt_kp.json');
const years = read(path.join('zt', 'index.json')).years;

let total = 0, fromBank = 0, fromZt = 0;
const missing = [];
const bad = [];
const ztKeysUsed = new Set();
const PREFIX = '<div class="kp-sec"><b>考点</b>';
const SUFFIX = '</span></div>';

for (const y of years) {
  const d = read(path.join('zt', 'zt_' + y + '.json'));
  for (const it of d.items) {
    if (it.t !== 1) continue;                    // 只考选择题；大题走知识点跳转
    total++;
    let html = '';
    if (it.qid) {
      const q = banks[it.sid] && banks[it.sid].get(it.qid);
      html = (q && q.kp_analysis) || '';
    }
    if (html) {
      fromBank++;
    } else {
      const iid = it.qid || (it.sid + '_zt' + y + '_' + it.i);
      html = ztKp[iid] || '';
      if (html) { fromZt++; ztKeysUsed.add(iid); }
      else missing.push(iid);
    }
    if (!html) continue;
    if (!html.startsWith(PREFIX) || !html.endsWith(SUFFIX)
      || html.split('<div').length - 1 !== 2
      || html.split('</div>').length - 1 !== 2
      || /<p>|<br|[\r\n]/.test(html)) {
      bad.push((it.qid || (it.sid + '_zt' + y + '_' + it.i)));
    }
  }
}

console.log('--- 一、覆盖率：选择题必须 100% 有考点分析 ---');
console.log(`选择题 ${total} 道；题库直取 ${fromBank}，zt_kp.json 兜底 ${fromZt}`);
check('缺考点分析的选择题为 0', missing.length, 0);
if (missing.length) console.log('  缺少：' + missing.slice(0, 15).join(', '));

console.log('\n--- 二、格式：两段式（考点 + 易错点），无块级标签 ---');
check('格式不合规的条目为 0', bad.length, 0);
if (bad.length) console.log('  不合规：' + bad.slice(0, 15).join(', '));

console.log('\n--- 三、zt_kp.json 只装未映射题，且 key 真实存在 ---');
const orphan = Object.keys(ztKp).filter(k => !ztKeysUsed.has(k));
check('zt_kp.json 没有被用到的孤儿条目', orphan.length, 0);
if (orphan.length) console.log('  孤儿：' + orphan.slice(0, 10).join(', '));
check('zt_kp.json 里的 id 都不是题库 id（未映射题专用）',
  Object.keys(ztKp).every(k => /_zt\d{4}_/.test(k)), true);
check('每条 zt_kp 值都以「考点」段开头',
  Object.values(ztKp).every(v => v.startsWith(PREFIX)), true);

console.log('\n--- 四、前端契约：常驻面板的取数口径 ---');
const ZT = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
check('ensureBank 顺手收下 kp_analysis（BANK_KP）',
  /if \(q\.kp_analysis\) BANK_KP\[q\.id\] = q\.kp_analysis/.test(ZT), true);
check('loadZtKp 拉 data/zt_kp.json', /fetch\('data\/zt_kp\.json'\)/.test(ZT), true);
check('kpTextOf 三级取数：kpCache → BANK_KP → ZT_KP',
  /function kpTextOf\(iid\)/.test(ZT) && /if \(BANK_KP\[iid\]\) return BANK_KP\[iid\]/.test(ZT)
  && /if \(ZT_KP\[iid\]\) return ZT_KP\[iid\]/.test(ZT), true);
check('常驻面板默认展开（只按 kpClosed 收起）',
  /if \(state\.kpClosed\.has\(f\.iid\)\) return ''/.test(ZT)
  && /if \(state\.examMode \|\| f\.group !== 'choice'\) return ''/.test(ZT), true);
check('init 时并行加载 zt_kp.json', /loadKpTable\(\), loadZtKp\(\)/.test(ZT), true);
const SW = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
check('sw.js 把 data/zt_kp.json 纳入 DATA_PRECACHE',
  /'data\/zt_kp\.json'/.test(SW), true);

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
