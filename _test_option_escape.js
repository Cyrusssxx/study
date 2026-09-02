// 回归测试：选项文本中的字面 < > & 必须转义为可见文字，但 <sub>/<sup> 标签须保留。
// 直接加载真实 pwa/js/common.js（仅定义函数，无顶层 DOM 依赖），避免实现漂移。
const fs = require('fs');
const path = require('path');
// common.js 在加载时会调用 applyDark()，需要最小化 DOM 桩
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { documentElement: { classList: { add() {}, remove() {} } } };
const code = fs.readFileSync(path.join(__dirname, 'pwa/js/common.js'), 'utf8');
// 加载时会有 applyDark 等 DOM 调用抛错，但 fmtOptionText 已 hoist，吞掉即可
try { eval(code); } catch (e) { /* 忽略加载期 DOM 依赖 */ }
if (typeof fmtOptionText !== 'function') { console.error('fmtOptionText 未加载'); process.exit(1); }

let pass = 0, fail = 0;
function check(name, input, wantSub, wantSup) {
  const out = fmtOptionText(input);
  const okSub = wantSub ? out.includes('<sub>') && out.includes('</sub>') : !/<sub>/.test(out);
  const okSup = wantSup ? out.includes('<sup>') && out.includes('</sup>') : !/<sup>/.test(out);
  // 除合法 sub/sup 外，不应再有裸 <
  const stray = /<(?!\/?sub>|\/?sup>)/.test(out);
  const ok = okSub && okSup && !stray && out.indexOf(input.replace(/<(?!\/?sub>|\/?sup>)/g, m => m)) >= 0;
  // 上面一行太宽松，改用：转义后文本还原应等于原文（sub/sup 还原后）
  const restored = out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const equal = restored === input;
  const good = okSub && okSup && !stray && equal;
  if (good) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  in=' + JSON.stringify(input) + '  out=' + JSON.stringify(out)); }
}

// 真实受损题（字面不等式被当标签吃掉）
check('co_0066 A 不等式', '若x,y和z为无符号整数,则z<x<y', false, false);
check('co_0042 不等式', '-2n+1<x<2n-1', false, false);
check('cn_0201 不等式', 'SIFS<PIFS<DIFS', false, false);
check('os_0246 代码比较', 'S.value<0', false, false);
// 合法下标/上标必须保留
check('co_0045 下标', 'x<sub>1</sub>为0', true, false);
check('co_0024 上标', '2.26,5.6×10<sup>-8</sup>s', false, true);
check('cn_0136 上标', '2<sup>n</sup>−1', false, true);
// 仅 > 的箭头（无害，但也应转义为可见文字）
check('ds_0046 指针箭头', 's->next=p->next', false, false);

console.log('\n选项转义回归：' + (fail === 0 ? '全部通过 ✅' : (fail + ' 项失败 ❌')) + `  (${pass} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
