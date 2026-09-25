// 回归测试：选项文本中的字面 < > & 必须转义为可见文字，但 <sub>/<sup> 标签须保留。
// 同时覆盖「数据里已存实体（&lt; 等）」的题：不得二次转义显示成 &amp;lt;（页面看到 &lt;）。
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

// 把 HTML 文本还原成「浏览器里眼睛看到的字符」，顺序与 fmtOptionText 的还原顺序一致
const visible = (t) => t.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');

let pass = 0, fail = 0;
function check(name, input, wantSub, wantSup) {
  const out = fmtOptionText(input);
  const okSub = wantSub ? out.includes('<sub>') && out.includes('</sub>') : !/<sub>/.test(out);
  const okSup = wantSup ? out.includes('<sup>') && out.includes('</sup>') : !/<sup>/.test(out);
  // 除合法 sub/sup 外，不应再有裸 <
  const stray = /<(?!\/?sub>|\/?sup>)/.test(out);
  // 二次转义产物：&amp;lt; / &amp;gt; / &amp;amp; 一旦出现，页面就会把 &lt; 当文字显示
  const dbl = /&amp;(?:lt|gt|amp);/.test(out);
  // 渲染语义一致：输入与输出还原成可见字符后必须相同
  const equal = visible(out) === visible(input);
  const good = okSub && okSup && !stray && !dbl && equal;
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
// 数据里存成 HTML 实体的选项（ds_0458 / cn_0201 / co_0042 / ds_0462 等 25 个）
check('ds_0458 A 实体下标不等式', 'x<sub>1</sub>&lt;x<sub>2</sub>&lt;x<sub>5</sub>', true, false);
check('ds_0458 C 实体下标不等式', 'x<sub>3</sub>&lt;x<sub>5</sub>&lt;x<sub>4</sub>', true, false);
check('cn_0201 A 实体不等式', 'SIFS&lt;PIFS&lt;DIFS', false, false);
check('co_0042 A 实体+字面混合', '-2<sup>n</sup>+1&lt;x<2<sup>n</sup>-1', false, true);
check('ds_0462 D 实体下标', 'k<sub>3</sub>&lt;x&lt;k<sub>2</sub>', true, false);
// 实体形式的下标标签本身也要还原成真标签
check('双重转义下标', 'x&lt;sub&gt;1&lt;/sub&gt;为0', true, false);

console.log('\n选项转义回归：' + (fail === 0 ? '全部通过 ✅' : (fail + ' 项失败 ❌')) + `  (${pass} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
