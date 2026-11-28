// 知识点笔记排序可视化（直接插入 / 简单选择）回归
// 覆盖：数据挂载位置、行号零漂移、共享引擎帧正确性、jsdom 单步交互
// 用法：NODE_PATH=<workspace>/node_modules node _test_sort_demo_notes.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const notesRaw = read('pwa/data/notes/ds_notes.json');
const notes = JSON.parse(notesRaw);
const ENGINE = read('pwa/js/sort_demo.js');
const NOTES_HTML = read('pwa/notes.html');
const ALGO_HTML = read('pwa/algo.html');
const SW = read('pwa/sw.js');
const CSS = read('pwa/css/style.css');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const subHtml = name => {
  for (const ch of notes.chapters) for (const sec of ch.sections || [])
    for (const s of sec.subsections || []) if (s.section === name) return s.html;
  return null;
};
const insertHtml = subHtml('8.2.1 直接插入排序');
const selectHtml = subHtml('8.4.1 简单选择排序');

console.log('--- 一、知识点笔记挂载 ---');
check('8.2.1 有插入排序演示', /data-qs-demo[^>]*data-qs-kind="is"/.test(insertHtml || ''), true);
check('8.4.1 有选择排序演示', /data-qs-demo[^>]*data-qs-kind="ss"/.test(selectHtml || ''), true);
check('插入演示标题', /① 直接插入排序 · 可视化演示/.test(insertHtml), true);
check('选择演示标题', /② 简单选择排序 · 可视化演示/.test(selectHtml), true);
const demoRe = /<div class="qs-demo"[\s\S]*?<div class="qs-msg" data-qs-msg>[^<]*<\/div>\s*<\/div>/g;
const demoBlocks = [...(insertHtml + selectHtml).matchAll(demoRe)].map(m => m[0]);
check('恰好两个演示容器', demoBlocks.length, 2);
check('演示容器不引入可批注 p / li', demoBlocks.some(h => /<p\b|<li\b/.test(h)), false);
check('演示在黄框之后、图题之前',
  insertHtml.indexOf('key-callout') < insertHtml.indexOf('data-qs-demo') &&
  insertHtml.indexOf('data-qs-demo') < insertHtml.indexOf('data-fig'), true);

console.log('\n--- 二、行号零漂移 ---');
let annoLines = 0, openTags = 0;
for (const c of notes.chapters) for (const s of c.sections || []) {
  for (const x of [s].concat(s.subsections || [])) {
    const h = x.html || '';
    (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => { if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++; });
    (h.match(/<p\b[^>]*>/g) || []).forEach(t => { if (!/data-fig/.test(t)) openTags++; });
    annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
    openTags += (h.match(/<li\b[^>]*>/g) || []).length;
  }
}
check('可批注行数锁死 1173', annoLines, 1173);
check('开标签行数锁死 1175', openTags, 1175);

console.log('\n--- 三、共享引擎接线 ---');
check('algo.html 已改由共享脚本加载', ALGO_HTML.includes('<script src="js/sort_demo.js"></script>'), true);
check('algo.html 不再内联播放器', ALGO_HTML.includes('function qsDemoHtml('), false);
check('notes.html 加载共享脚本', NOTES_HTML.includes('<script src="js/sort_demo.js"></script>'), true);
check('notes.html 分片渲染后初始化演示', /initQsDemos\(slot\)/.test(NOTES_HTML), true);
check('SW 预缓存共享脚本', SW.includes("'js/sort_demo.js'"), true);
check('CSS 保留演示样式', CSS.includes('.qs-demo {') && CSS.includes('.qs-bar > s.qs-tip.tip-li'), true);

console.log('\n--- 四、帧构建器正确性 ---');
const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' });
const w = dom.window;
const grab = name => {
  const m = ENGINE.match(new RegExp(`function ${name}\\(arr0\\) \\{[\\s\\S]*?\\n    \\}`));
  if (!m) throw new Error('找不到 ' + name);
  return w.eval('(' + m[0] + ')');
};
const isBuildFrames = grab('isBuildFrames');
const ssBuildFrames = grab('ssBuildFrames');
for (const [name, build] of [['is', isBuildFrames], ['ss', ssBuildFrames]]) {
  const arr = [49, 38, 65, 97, 76, 13, 27];
  const frames = build(arr);
  const last = frames[frames.length - 1];
  check(`${name} 末帧全部归位`, last.fixed.size, arr.length);
  check(`${name} 末帧升序`, JSON.stringify(last.a), JSON.stringify([...arr].sort((a, b) => a - b)));
  check(`${name} 过程中有移动/交换帧`, frames.some(f => f.swp), true);
  check(`${name} 首帧有操作提示`, typeof frames[0].msg === 'string' && frames[0].msg.length > 0, true);
}

console.log('\n--- 五、jsdom 挂载与单步交互 ---');
w.eval(ENGINE + '\nwindow.qsDemoHtml = qsDemoHtml; window.qsInitDemo = qsInitDemo; window.initQsDemos = initQsDemos;');
w.document.body.innerHTML = demoBlocks.join('');
w.initQsDemos(w.document.body);
const boxes = [...w.document.querySelectorAll('[data-qs-demo]')];
check('挂载出两个演示', boxes.length, 2);
for (const [i, kind] of [[0, 'is'], [1, 'ss']]) {
  const box = boxes[i];
  const stage = box.querySelector('[data-qs-stage]');
  const prev = box.querySelector('[data-qs-prev]');
  const next = box.querySelector('[data-qs-next]');
  check(`${kind} 初始画 8 根柱`, stage.querySelectorAll('.qs-bar').length, 8);
  check(`${kind} 初始上一步禁用`, prev.disabled, true);
  check(`${kind} 初始下一步可用`, next.disabled, false);
  const before = stage.innerHTML;
  next.click();
  check(`${kind} 下一步切换画面`, stage.innerHTML !== before, true);
  check(`${kind} 下一步后上一步可用`, prev.disabled, false);
  prev.click();
  check(`${kind} 上一步回到首帧`, stage.innerHTML, before);
  check(`${kind} 图例存在`, box.querySelectorAll('.qs-legend s').length >= 4, true);
  box.querySelector('[data-qs-restart]').click();
  check(`${kind} 重来停在首帧`, prev.disabled, true);
  box.querySelector('[data-qs-shuffle]').click();
  check(`${kind} 换组仍为 8 根柱`, stage.querySelectorAll('.qs-bar').length, 8);
}
dom.window.close();

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
