// 模拟卷（三）/（五）/（1019）数据回归（2026-11-26）
// 校验 index 登记、47题、考点分析、答案、科目归属、题图存在、目录项可点击。
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_mock_vols.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const INDEX = J('pwa/data/zt/index.json');
const ZT = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');

check('模拟卷目录四项（一/三/五/1019）', (INDEX.mocks || []).map(m => m.y), ['mock1', 'mock3', 'mock5', 'mock1019']);
check('目录项 onclick 用单引号包裹字符串年份',
  /typeof y === 'number' \? String\(y\) : "'" \+ String\(y\)/.test(ZT), true);

for (const [y, label, paperY] of [['mock3', '模拟卷（三）', '模拟三'], ['mock5', '模拟卷（五）', '模拟五'], ['mock1019', '模拟卷（1019）', '模考1019']]) {
  const d = J(`pwa/data/zt/zt_${y}.json`);
  check(`${label} 47题`, d.items.length, 47);
  check(`${label} 数据内卷标识`, d.y, paperY);
  check(`${label} 选择题答案齐全`, d.items.filter(i => i.t === 1 && i.a).length, 40);
  check(`${label} 科目归属齐全`, d.items.every(i => ['ds', 'co', 'os', 'cn'].includes(i.sid)), true);
  check(`${label} 47题考点分析齐全`, d.items.filter(i => i.kp && i.kp.trim()).length, 47);
  check(`${label} 考点格式统一`, d.items.every(i => i.kp.startsWith('<div class="kp-sec"><b>考点</b>') && i.kp.includes('<b>易错点</b><span class="kp-trap">')), true);
  const figs = [];
  for (const it of d.items) for (const m of it.q.matchAll(/data\/zt_img\/(zt_mock\d+_\d+\.png)/g)) figs.push(m[1]);
  check(`${label} 题图均为 fig-img 可放大`, d.items.filter(i => i.q.includes('fig-img')).length, figs.length);
  check(`${label} 题图文件存在`, figs.every(f => fs.existsSync(path.join(ROOT, 'pwa/data/zt_img', f))), true);
  check(`${label} 题图无整题截图残留`, d.items.every(i => !i.q.includes('img-container')), true);
}

// 2026-11-26：mock1/3/5 曾有 21 道选择题选项为空（截图清 o 或 OCR 把选项挤进题干），页面只剩 A/B/C/D 空框。
for (const [y, label] of [['mock1', '模拟卷（一）'], ['mock3', '模拟卷（三）'], ['mock5', '模拟卷（五）'], ['mock1019', '模拟卷（1019）']]) {
  const d = J(`pwa/data/zt/zt_${y}.json`);
  const choices = d.items.filter(i => i.t === 1);
  check(`${label} 40道选择题选项均为4项非空`,
    choices.filter(i => i.o && i.o.length === 4 && i.o.every(x => String(x).trim())).length, 40);
  // 题干里不得残留挤成一行的 A./B./D. 选项文字
  const inline = choices.filter(i => /A[.．]\s*\S{1,250}?B[.．]/.test(i.q.replace(/<[^>]+>/g, '')) && /D[.．]/.test(i.q));
  check(`${label} 题干无挤行选项残留`, inline.map(i => i.i), []);
}
console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? '有失败' : '全部通过'}`);
process.exit(fail ? 1 : 0);
