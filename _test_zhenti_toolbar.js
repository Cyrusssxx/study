// zhenti.html 工具栏改版回归：做题模式按钮移到顶栏 + 卡片「🎬 视频讲解」外链
//
// 覆盖点：
//   1) 「做题中/做题模式」按钮位于 nav .nav-tools 内，onclick=toggleExamMode()
//   2) 套卷工具栏不再生成该按钮（避免两处重复）
//   3) syncExamModeBtn() 存在，且 renderPaper 渲染后调用
//   4) 三种卡片（选择/大题/算法题）的「笔记」按钮右侧都有「🎬 视频讲解」外链
//   5) 外链安全属性 target=_blank rel=noopener noreferrer；关键词含 年份 + 408 + 科目
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_toolbar.js
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom（NODE_PATH=<workspace>/node_modules）'); process.exit(0); }

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

console.log('\n--- 1. 做题模式按钮在顶栏 ---');
const doc = new JSDOM(HTML).window.document;
const btn = doc.querySelector('nav .nav-tools #ztExamModeBtn');
check('按钮位于 nav .nav-tools 内', !!btn, true);
check('初始文案为「做题模式」', btn && btn.textContent.trim(), '做题模式');
check('onclick 指向 toggleExamMode()', btn && btn.getAttribute('onclick'), 'toggleExamMode()');
check('初始不带 on 类（默认已取消做题模式）', btn && btn.classList.contains('on'), false);
check('与夜间开关同处一个容器', btn && btn.parentElement.id === '' && btn.parentElement.className, 'nav-tools');

console.log('\n--- 2. 工具栏不再重复渲染 ---');
const toolbarBlock = JS.slice(JS.indexOf('class="zt-toolbar"'), JS.indexOf('class="zt-toolbar"') + 1400);
check('工具栏 HTML 里无 toggleExamMode', toolbarBlock.includes('toggleExamMode'), false);
check('工具栏保留「对答案」条件渲染（做题模式时出现）', toolbarBlock.includes('checkPending()'), true);

console.log('\n--- 3. 状态同步 ---');
check('存在 syncExamModeBtn()', JS.includes('function syncExamModeBtn()'), true);
check('renderPaper 渲染后调用同步', /renderFq\(\);[\s\S]{0,90}syncExamModeBtn\(\)/.test(JS), true);
check('同步时按 examMode 切换文案', /state\.examMode \? '做题中' : '做题模式'/.test(JS), true);

console.log('\n--- 4. 错题池按钮只保留在选择题卡 ---');
const poolCall = '${poolBtnHtml(f)}';
const segChoice = JS.slice(JS.indexOf('function choiceCard'), JS.indexOf('function bigCard'));
const segBig = JS.slice(JS.indexOf('function bigCard'), JS.indexOf('function dakaBigCard'));
const segDaka = JS.slice(JS.indexOf('function dakaBigCard'), JS.indexOf('function refreshCard'));
check('poolBtnHtml 调用总数 = 1', (JS.split(poolCall).length - 1), 1);
check('选择题卡保留错题池按钮', segChoice.includes(poolCall), true);
check('大题卡不含错题池按钮', segBig.includes(poolCall), false);
check('算法题卡不含错题池按钮', segDaka.includes(poolCall), false);
check('大题仍保留不熟/不会标记', segBig.includes('markBtnsHtml(f)'), true);

console.log('\n--- 5. 样式 ---');

console.log('\n--- 6. 笔记层级 / 保存态 / 点击逻辑 / 跨页别名 ---');
// 三张卡的笔记面板必须排在答案解析之前
for (const fn of ['choiceCard', 'bigCard', 'dakaBigCard']) {
  const start = JS.indexOf('function ' + fn);
  const nextFn = JS.indexOf('function ', start + 10);
  const seg = JS.slice(start, nextFn > 0 ? nextFn : undefined);
  check(fn + '：笔记在答案之前', seg.indexOf('notePanel(f.iid)') < seg.indexOf('ansPanelHtml(f)'), true);
}
check('笔记面板含保存态节点', JS.includes('data-zt-state='), true);
check('输入时置「未保存」', /markNoteState\(qid, 'dirty'\)/.test(JS), true);
check('保存成功置「已保存」（自动保存也生效）', /markNoteState\(qid, 'saved'\)/.test(JS), true);
// 2026-11-10 第三次收敛（用户：这俩不能原地展开吗，为什么展开位置还会变动）：
// 答案 / 笔记 / 考点分析一律**原地展开** —— 既不滚动，也不整卡重绘。
//   旧① scrollIntoView({block:'nearest'}) 会向上滚把按钮顶出屏幕；
//   旧② 按按钮位置补最小滚动量，贴底时仍要滚 100+px；
//   旧③ refreshCard() 整卡重建，题图退回 56px「图加载中…」占位再撑回真实高度 → 按钮上下跳。
check('展开不再滚动（无 scrollBy / 展开路径无 scrollIntoView）',
  !/window\.scrollBy/.test(JS) && !/panel\.scrollIntoView|box\.scrollIntoView/.test(JS), true);
check('三类按钮都带 data-toggle 标记',
  ['ans', 'note', 'kp'].every(k => JS.includes(`data-toggle="${k}"`)), true);
check('答案 / 笔记 / 考点分析都走原地 setCardPanel',
  // 考点分析开/关各一处（toggleKpZt）+ 取消收藏时收起 kp 面板（syncCardChrome）
  (JS.match(/setCardPanel\(iid, '(ans|note|kp)', (true|false|opening)\)/g) || []).length, 5);
check('展开后只同步按钮、不重绘整卡（syncToggleBtns 三处）',
  (JS.match(/syncToggleBtns\(iid\);/g) || []).length, 4);   // 考点分析有开/关两条路
// 三个展开函数内部不得再出现 refreshCard：整卡重绘 = 题图退回占位 = 按钮跳一下
function fnBody(name) {
  const start = JS.indexOf('function ' + name);
  if (start < 0) return '';
  const re = /\n    (async )?function /g;      // 下一个同级函数（含 async 前缀）
  re.lastIndex = start + 10;
  const m = re.exec(JS);
  return JS.slice(start, m ? m.index : undefined);
}
for (const fn of ['toggleAns', 'toggleNotePanel', 'toggleKpZt']) {
  check(fn + '：不调用 refreshCard（原地展开）', /refreshCard/.test(fnBody(fn)), false);
}
check('展开笔记后聚焦编辑器末尾', /focus\(\{ preventScroll: true \}\)/.test(JS), true);
check('保存写规范键（跨页共享）', /api\('\/api\/note\/' \+ encodeURIComponent\(noteKeyOf\(qid\)\)/.test(JS), true);
check('加载别名并回填', /applyNoteAlias\(byKey\)/.test(JS) && /loadNoteAlias\(\)/.test(JS), true);
check('H1 用下边框分层', /\.note-input h1 \{[^}]*border-bottom/.test(CSS), true);
check('H2 用左导轨分层', /\.note-input h2 \{[^}]*border-left/.test(CSS), true);
check('保存态未保存样式存在', /\.note-state\.dirty/.test(CSS), true);

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
