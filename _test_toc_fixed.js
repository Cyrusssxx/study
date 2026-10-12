// 全站「侧栏/目录贴屏固定」统一形态回归测试（2026-10-11 定稿）
// 覆盖：7 个页面接入 .toc-fixed；左目录/左章节栏/右题号栏贴边规则；收起联动；
//       窄屏不泄漏（规则必须位于 801+/901+ 媒体查询内）；body 状态类同步。
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}

const PAGES = ['quiz.html', 'notes.html', 'algo.html', 'map.html', 'code.html', 'daka.html', 'exam.html'];
const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const readPage = f => fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');

// 取出 @media (min-width: XXXpx) 块（配对大括号解析，返回块内文本）
function extractMedia(cssText, query) {
  const idx = cssText.indexOf('@media ' + query);
  if (idx < 0) return null;
  let i = cssText.indexOf('{', idx);
  const start = i;
  let depth = 0;
  for (; i < cssText.length; i++) {
    if (cssText[i] === '{') depth++;
    else if (cssText[i] === '}') { depth--; if (depth === 0) break; }
  }
  return cssText.slice(start + 1, i);
}

function stripMedia(cssText, query) {
  const idx = cssText.indexOf('@media ' + query);
  if (idx < 0) return cssText;
  let i = cssText.indexOf('{', idx);
  const start = idx;
  let depth = 0;
  for (; i < cssText.length; i++) {
    if (cssText[i] === '{') depth++;
    else if (cssText[i] === '}') { depth--; if (depth === 0) break; }
  }
  return cssText.slice(0, start) + cssText.slice(i + 1);
}

const m801 = extractMedia(css, '(min-width: 801px)') || '';
const m901 = extractMedia(css, '(min-width: 901px)') || '';

// ============ 1. 页面接入 ============
console.log('▸ 页面接入（7 页）');
for (const f of PAGES) {
  check(`${f} main 带 toc-fixed 类`, /<main class="container toc-fixed">/.test(readPage(f)));
}
check('旧 algo-page 作用域无残留', !/\.algo-page/.test(css) && !PAGES.some(f => /algo-page/.test(readPage(f))));

// ============ 2. CSS · 801+ 笔记/讲义左目录 ============
console.log('▸ CSS · 笔记/讲义左目录（801+）');
check('--bleed 变量定义', /\.toc-fixed \{[^}]*--bleed:\s*calc\(/.test(m801));
check('垂直留白变量（--toc-top / --toc-gap / --toc-fab）',
  /\.toc-fixed \{[^}]*--toc-top:\s*\d+px[^}]*--toc-gap:\s*\d+px[^}]*--toc-fab:\s*\d+px/.test(m801));
{
  const top = +(m801.match(/--toc-top:\s*(\d+)px/)?.[1] ?? -1);
  const gap = +(m801.match(/--toc-gap:\s*(\d+)px/)?.[1] ?? -2);
  // 对称口径：目录顶边「距顶栏下沿」= 底边「距视口底」（顶栏 60px）
  check('上下留白对称（距顶栏 = 距视口底）', top - 60 === gap, `距顶栏 ${top - 60} / 距底 ${gap}`);
  check('顶部与正文顶线齐平（顶栏 60 + 容器内边距 24）', top === 84, `--toc-top=${top}`);
}
check('目录贴左（fixed + left:6px）', /\.toc-fixed \.notes-toc \{[^}]*position:\s*fixed[^}]*left:\s*6px/.test(m801));
check('页头+正文 262px 让位', /\.toc-fixed \.notes-content,\s*[\r\n]+\s*\.toc-fixed \.notes-header \{[^}]*margin-left:\s*262px/.test(m801));
check('收起时正文回收（26px）', /\.toc-fixed \.notes-layout\.notes-toc-collapsed \.notes-content \{[^}]*margin-left:\s*26px/.test(m801));
check('body.toc-collapsed 页头回收（26px）', /body\.toc-collapsed \.toc-fixed \.notes-header \{[^}]*margin-left:\s*calc\(var\(--bleed\) \+ 26px\)/.test(m801));
check('箭头 fixed 钉中段（top:50%）', /\.toc-fixed \.notes-toc-toggle \{[^}]*position:\s*fixed[^}]*top:\s*50%/.test(m801));
check('收起时箭头移到最左（left:4px）', /\.toc-fixed \.notes-layout\.notes-toc-collapsed \.notes-toc-toggle \{[^}]*left:\s*4px/.test(m801));

// ============ 3. CSS · 801+ 刷题页三栏 ============
console.log('▸ CSS · 刷题页（801+）');
check('章节栏贴左（fixed + left:6px）', /\.toc-fixed \.chapter-sidebar \{[^}]*position:\s*fixed[^}]*left:\s*6px/.test(m801));
check('题号栏贴右（fixed + right:6px）', /\.toc-fixed \.number-sidebar \{[^}]*position:\s*fixed[^}]*right:\s*6px/.test(m801));
check('题号栏底部用 --toc-gap（与左栏对称）', /\.toc-fixed \.number-sidebar \{[^}]*bottom:\s*var\(--toc-gap\)/.test(m801));
check('题号栏内部底部留白避让 🎨', /\.toc-fixed \.number-sidebar \.number-panel \{[^}]*padding-bottom:\s*var\(--toc-fab\)/.test(m801));
check('章节栏收起=滑出（translateX(-115%)）', /\.toc-fixed \.quiz-layout\.chapter-collapsed \.chapter-sidebar \{[^}]*translateX\(-115%\)/.test(m801));
check('题号栏收起=滑出（translateX(115%)）', /\.toc-fixed \.quiz-layout\.number-collapsed \.number-sidebar \{[^}]*translateX\(115%\)/.test(m801));
check('章节按钮 left:288px（贴栏右缘）', /\.toc-fixed #chapterToggle \{[^}]*left:\s*288px/.test(m801));
check('题号按钮 right:238px（贴栏左缘）', /\.toc-fixed #numberToggle \{[^}]*right:\s*238px/.test(m801));
check('正文让位区间（padding 312/266，内容居中其中）', /\.toc-fixed \.quiz-layout \{[^}]*padding-left:\s*312px[^}]*padding-right:\s*266px/.test(m801));
check('章节收起后正文回收（26px）', /\.toc-fixed \.quiz-layout\.chapter-collapsed \{[^}]*padding-left:\s*26px/.test(m801));
check('题号收起后正文回收（26px）', /\.toc-fixed \.quiz-layout\.number-collapsed \{[^}]*padding-right:\s*26px/.test(m801));
check('栏内面板撑满+自滚（flex:1 1 auto / min-height:0）', /\.toc-fixed \.chapter-sidebar \.chapter-tree,\s*[\r\n]+\s*\.toc-fixed \.number-sidebar \.number-panel \{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0/.test(m801));

// ============ 4. CSS · 801+ 真题卷右题号 ============
console.log('▸ CSS · 真题卷（801+）');
check('题号栏贴右（fixed + right:6px）', /\.toc-fixed \.exam-numbers \{[^}]*position:\s*fixed[^}]*right:\s*6px/.test(m801));
check('题号栏底部用 --toc-gap（与左栏对称）', /\.toc-fixed \.exam-numbers \{[^}]*bottom:\s*var\(--toc-gap\)/.test(m801));
check('题号栏内部底部留白避让 🎨', /\.toc-fixed \.exam-numbers \{[^}]*padding-bottom:\s*calc\(12px \+ var\(--toc-fab\)\)/.test(m801));
check('试卷主体右让位（252px）', /\.toc-fixed \.exam-main \{[^}]*margin-right:\s*252px/.test(m801));

// ============ 5. CSS · 901+ 导图/打卡/代码题 ============
console.log('▸ CSS · ol-nav 三页（901+，≤900 为右侧抽屉）');
check('目录贴左（fixed + left:6px）', /\.toc-fixed \.ol-nav \{[^}]*position:\s*fixed[^}]*left:\s*6px/.test(m901));
check('收起=滑出（translateX(-115%)）', /\.toc-fixed \.ol-nav\.collapsed \{[^}]*translateX\(-115%\)/.test(m901));
check('正文 232px 让位', /\.toc-fixed #mapRoot,\s*[\r\n]+\s*\.toc-fixed \.question-list \{[^}]*margin-left:\s*232px/.test(m901));
check('收起后正文回收（26px）', /\.toc-fixed \.ol-nav\.collapsed~\.question-list \{[^}]*margin-left:\s*26px/.test(m901));
check('收起竖条 fixed 贴边（left:4px）', /\.toc-fixed \.ol-nav-tab \{[^}]*position:\s*fixed[^}]*left:\s*4px/.test(m901));
// 收起箭头：从头部「标题 + «」里钉到目录右缘中点（fixed），与收起竖条同一条视口中线
check('收起箭头钉右缘中点（ol-nav-toggle fixed · calc(50vh - var(--toc-top)) · left:199px）',
  /\.toc-fixed \.ol-nav-head \.ol-nav-toggle \{[^}]*position:\s*fixed[^}]*top:\s*calc\(50vh - var\(--toc-top\)\)[^}]*left:\s*199px/.test(m901));
check('ol-nav 恒等 transform（内部 fixed 包含块稳定，展开/收起坐标一致）',
  /\.toc-fixed \.ol-nav \{[^}]*transform:\s*translateX\(0\)/.test(m901));

// ============ 6. 窄屏不泄漏：所有 .toc-fixed 布局规则必须在两个媒体查询内 ============
console.log('▸ 窄屏安全（规则不泄漏到窄屏）');
{
  const outside = stripMedia(stripMedia(css, '(min-width: 801px)'), '(min-width: 901px)');
  const leaks = [
    '.toc-fixed .notes-toc {',
    '.toc-fixed .chapter-sidebar {',
    '.toc-fixed .number-sidebar {',
    '.toc-fixed .ol-nav {',
    '.toc-fixed .ol-nav-head .ol-nav-toggle {',
    '.toc-fixed .exam-numbers {',
    '.toc-fixed .quiz-layout {',
  ].filter(sel => outside.includes(sel));
  check('媒体查询外无贴边规则', leaks.length === 0, leaks.join(' / ') || '');
  check('901 块内用 --bleed（定义于 801 块）', /var\(--bleed\)/.test(m901) && /var\(--bleed\)/.test(m801));
}

// ============ 7. 状态类同步（JS） ============
console.log('▸ body 状态类同步');
{
  const notes = readPage('notes.html');
  const algo = readPage('algo.html');
  check('notes.html 定义 syncTocStateClass', /function syncTocStateClass\(\)/.test(notes));
  check('notes.html 切换 toc-collapsed', /classList\.toggle\('toc-collapsed'/.test(notes));
  const notesCalls = (notes.match(/syncTocStateClass\(\)/g) || []).length;
  check('notes.html 状态同步覆盖收起/展开/初始化（≥4 处）', notesCalls >= 4, `实际 ${notesCalls} 处`);
  check('algo.html 切换 toc-collapsed', /classList\.toggle\('toc-collapsed'/.test(algo));
  check('旧 algo-toc-collapsed 已清除', !/algo-toc-collapsed/.test(algo) && !/algo-toc-collapsed/.test(css));
}

// ============ 8. DOM 结构前置条件（收起靠 class 切换，按钮必须在场） ============
console.log('▸ DOM 结构');
{
  const quiz = readPage('quiz.html');
  check('quiz #chapterToggle 在场', /id="chapterToggle"/.test(quiz));
  check('quiz #numberToggle 在场', /id="numberToggle"/.test(quiz));
  const map = readPage('map.html');
  check('map ol-nav 与 ol-nav-tab 相邻（收起用 + 选择器）', /<aside class="ol-nav" id="olNav"><\/aside>\s*[\r\n]+\s*<button class="ol-nav-tab"/.test(map));
  const code = readPage('code.html');
  check('code ol-nav 后邻 question-list', /<aside class="ol-nav" id="codeNav"><\/aside>[\s\S]{0,200}?<div class="question-list" id="codeList">/.test(code));
  const daka = readPage('daka.html');
  check('daka ol-nav 后邻 question-list', /<aside class="ol-nav" id="dakaNav"><\/aside>[\s\S]{0,200}?<div class="question-list" id="dakaList">/.test(daka));
}

// ============ 9. 页头让位（ol-layout 之外的全宽区块，防被贴屏目录压住） ============
console.log('▸ 页头让位（打卡表首行不再被目录压住）');
{
  check('901+ 页头/筛选条 232px 让位',
    /\.toc-fixed > \.page-header,[\s\S]{0,500}?margin-left:\s*calc\(var\(--bleed\) \+ 232px\)/.test(m901));
  check('收起后回收 26px（body 类 + :has 兜底）',
    /body\.toc-collapsed \.toc-fixed > \.page-header/.test(m901) &&
    /\.toc-fixed:has\(\.ol-nav\.collapsed\) > \.page-header/.test(m901));
  check('daka 命中（daka-summary / daka-filters）',
    /\.toc-fixed > \.daka-summary/.test(m901) && /\.toc-fixed > \.daka-filters/.test(m901));
  check('map 命中（map-header / map-toolbar / map-search-hint）',
    /\.toc-fixed > \.map-header/.test(m901) && /\.toc-fixed > \.map-toolbar/.test(m901) &&
    /\.toc-fixed > \.map-search-hint/.test(m901));
  // 结构侧：这些页头必须是 main 的直接子级且位于 ol-layout 之前，否则 CSS 不命中
  for (const f of ['daka.html', 'code.html', 'map.html']) {
    const html = readPage(f);
    const seg = html.slice(html.indexOf('<main'));
    const head = seg.slice(0, seg.indexOf('class="ol-layout"'));
    check(`${f} 页头在 ol-layout 之前（需让位）`,
      /class="(page-header|map-header|daka-summary|daka-filters|map-toolbar|map-search-hint)"/.test(head));
  }
}

// ============ 10. body.toc-collapsed 同步（ol-nav 结构页 + 真题页） ============
console.log('▸ body 状态同步（ol-nav 结构页）');
{
  const targets = { 'daka.html': 3, 'code.html': 2, 'map.html': 3, 'js/zhenti.js': 3 };
  for (const [f, min] of Object.entries(targets)) {
    const src = f.endsWith('.js') ? fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8') : readPage(f);
    const n = (src.match(/syncTocBodyClass\(/g) || []).length;
    check(`${f} 同步调用 ≥${min} 处`, n >= min, `实际 ${n}`);
  }
  const common = fs.readFileSync(path.join(ROOT, 'pwa/js/common.js'), 'utf8');
  check('common.js 定义 syncTocBodyClass', /function syncTocBodyClass\(collapsed\)/.test(common));
}

// ============ 11. 贴屏面板统一外观（细边框 + 细滚动条） ============
console.log('▸ 统一外观（去掉突兀的粗滚动条 / 无框白板）');
{
  check('801+ 四类面板细边框', /\.toc-fixed \.notes-toc,[\s\S]{0,220}?border:\s*1px solid var\(--toc-line\)/.test(m801));
  check('901+ ol-nav 细边框', /\.toc-fixed \.ol-nav \{[^}]*border:\s*1px solid var\(--toc-line\)/.test(m901));
  check('细滚动条（scrollbar-width: thin）', /\.toc-fixed \.ol-nav-body \{[^}]*scrollbar-width:\s*thin/.test(m901));
  check('--toc-line 变量定义', /--toc-line:\s*rgba\(/.test(m801));
}

console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
process.exit(failed ? 1 : 0);
