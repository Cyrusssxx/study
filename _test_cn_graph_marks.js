// cn_graph.html「重点标记 + 字号行距」回归测试
//
// 缺陷背景（用户截图反馈）：
//   1) 协议首部字段名（源端口/长度/数据偏移/标志位…）、题注数值（8B / 15×4=60B）、
//      表格数据全被拖了「术语红下边线」——它们只是排版加粗，不是重点。
//      根因：.cg-layer-body b（0,1,1）与 .cg-f b / .cg-cap b（0,1,1）特异性相同，
//      但层级规则写在文件更后面 → 反杀了前面的 reset。
//   2) 正文字号 .84rem(13.4px) / 行高 1.6 偏小，长文读起来挤。
//   3) 整句加粗（>16 字、带句读）用 b 会拖一条长红线，应走 mark（黄荧光句级）。
//
// 断言方式：用 jsdom 的 getComputedStyle 拿**级联后的真实结果**，不是匹配 CSS 文本。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_cn_graph_marks.js
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }

if (!JSDOM) {
  console.log('跳过：需要 jsdom（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const SRC = fs.readFileSync(path.resolve(__dirname, 'pwa/cn_graph.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(SRC, {
    url: 'http://localhost/cn_graph.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const w = dom.window, doc = w.document;
  await sleep(200);
  const cs = el => (el ? w.getComputedStyle(el) : null);
  const pick = sel => doc.querySelector(sel);

  console.log('--- 场景 1：图示 / 题注 / 表格的 b 不该有术语红 ---');
  const cases = [
    ['协议首部字段名 .cg-f b', '.cg-f b'],
    ['题注数值 .cg-cap b', '.cg-cap b'],
    ['表格单元格 .cg-tb td b', '.cg-tb td b'],
    ['流程图 .cg-flow-i b', '.cg-flow-i b'],
    ['提示块 .cg-tip b', '.cg-tip b'],
    ['模型对照 .cg-mh b', '.cg-mh b']
  ];
  for (const [label, sel] of cases) {
    const el = pick(sel);
    if (!el) { console.log('SKIP'.padEnd(5), label, '（本页无此元素）'); continue; }
    const s = cs(el);
    check(label + ' → 无下边线', s.borderBottomStyle, 'none');
    check(label + ' → 无底色渐变', /gradient/.test(s.backgroundImage || ''), false);
  }

  console.log('\n--- 场景 2：正文要点的术语红仍然保留 ---');
  const ptsB = pick('.cg-pts > li > b');
  check('要点 b 存在', !!ptsB, true);
  check('要点 b 有 2px 红下边线', [cs(ptsB).borderBottomStyle, cs(ptsB).borderBottomWidth], ['solid', '2px']);
  check('要点 b 有淡红底渐变', /rgba\(226,\s*75,\s*74/.test(cs(ptsB).backgroundImage || ''), true);

  console.log('\n--- 场景 3：句级重点走 mark（黄荧光）---');
  const mk = pick('.cg-pts mark') || pick('mark');
  check('mark 存在', !!mk, true);
  check('mark 为黄色荧光渐变', /rgba\(250,\s*204,\s*21/.test(cs(mk).backgroundImage || ''), true);
  check('mark 无下边线', cs(mk).borderBottomStyle, 'none');
  const markCount = doc.querySelectorAll('.cg-layer-body mark').length;
  check('句级 mark 数量 ≥ 19（原 6 + 本次补 13）', markCount >= 19, true);

  console.log('\n--- 场景 4：正文里不该再有「整句拖红线」的 b ---');
  // 只看正文要点：图示/题注/表格里的 b 是排版用途，本来就该加粗（已由场景 1 保证无红线）
  const longBold = [...doc.querySelectorAll('.cg-pts > li b')]
    .map(b => b.textContent.trim())
    .filter(t => t.length > 16 && /[，。？！：]/.test(t));
  check('要点里 >16 字且带句读的 b 已清零', longBold, []);

  console.log('\n--- 场景 5：颜色未被 color:inherit 吃掉 ---');
  check('题注 b 仍是红字', cs(pick('.cg-cap b')).color, 'var(--danger)');
  check('表格 b 仍是主题色', cs(pick('.cg-tb td b')).color, 'var(--c)');

  console.log('\n--- 场景 6：字号 / 行距放大 ---');
  const li = pick('.cg-pts > li');
  check('要点字号 .93rem', cs(li).fontSize, '0.93rem');
  check('要点行高 1.8', cs(li).lineHeight, '1.8');
  check('要点上下内边距 7px', cs(li).paddingTop, '7px');
  check('块标题字号 1.04rem', cs(pick('.cg-block > h3')).fontSize, '1.04rem');
  check('题注字号 .81rem', cs(pick('.cg-cap')).fontSize, '0.81rem');
  check('题注行高 1.7', cs(pick('.cg-cap')).lineHeight, '1.7');
  check('表格字号 .87rem', cs(pick('.cg-tb')).fontSize, '0.87rem');
  check('提示块字号 .9rem', cs(pick('.cg-tip')).fontSize, '0.9rem');
  check('提示块行高 1.78', cs(pick('.cg-tip')).lineHeight, '1.78');
  check('字段名字号 .8rem', cs(pick('.cg-f b')).fontSize, '0.8rem');

  console.log('\n--- 场景 7：源码层面留痕（防止后续改样式把 reset 又写回前面）---');
  const styleBlock = SRC.slice(SRC.indexOf('<style'), SRC.indexOf('</style>'));
  const posLayerRule = styleBlock.indexOf('.cg-layer-body b, .cg-layer-body strong');
  const posReset = styleBlock.indexOf('.cg-layer-body .cg-f b');
  check('reset 块位于层级规则之后', posReset > posLayerRule, true);
  check('reset 用 .cg-layer-body 前缀提特异性', /\.cg-layer-body \.cg-f b,/.test(styleBlock), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
