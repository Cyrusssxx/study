// 「📷 解答原图」按钮位置 + 面板内容顺序 的跨页面结构校验
// 约束（2026-09-21 用户要求）：
//   ① 按钮紧贴在「考点分析 · 易错点 · 讲义解法」折叠标题（summary）右侧，不再放卡片头部；
//   ② 面板里考点分析·易错点（daka-analysis）必须排在解法一（sol-item）之前。
// code.html 无 jsdom 全链路测试，这里对源码模板做静态结构断言；daka.html 另有运行期用例。
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}
const read = f => fs.readFileSync(path.resolve(__dirname, 'pwa', f), 'utf8');
// 取两个标记之间的源码片段
function slice(src, from, to) {
    const i = src.indexOf(from), j = src.indexOf(to, i + 1);
    return (i < 0 || j < 0) ? '' : src.slice(i, j);
}

console.log('--- code.html ---');
const CODE = read('code.html');
const codeRender = slice(CODE, 'function renderCard', 'function toggleAnsFig');
check('renderCard 片段可提取', codeRender.length > 500, true);
check('按钮放在折叠标题 summary 内（紧贴）', codeRender.includes('考点分析 · 易错点 · 讲义解法${ansfigBtn}</summary>'), true);
const codeHeader = slice(codeRender, '<div class="daka-card-header">', '</div>');
check('卡片头部不再放按钮', codeHeader.includes('ansfigBtn'), false);
check('按钮点击阻止冒泡到折叠（preventDefault）', codeRender.includes('event.preventDefault()'), true);
check('按钮点击阻止冒泡到折叠（stopPropagation）', codeRender.includes('event.stopPropagation()'), true);
const codeDetails = slice(codeRender, '<details class="daka-answer">', '</details>');
const codeAnalysisPos = codeDetails.indexOf('daka-analysis');
const codeSolPos = codeDetails.indexOf('${solHtml(q)}');
check('考点分析区在面板内存在', codeAnalysisPos > -1, true);
check('考点分析/易错点排在解法一之前', codeAnalysisPos > -1 && codeSolPos > -1 && codeAnalysisPos < codeSolPos, true);
check('解答原图独立区在折叠面板之后', codeRender.indexOf('${answerFigBlock}') > codeRender.indexOf('</details>'), true);

console.log('\n--- daka.html ---');
const DAKA = read('daka.html');
const dakaRender = slice(DAKA, 'function renderCard', 'function toggleAnsFig');
check('renderCard 片段可提取', dakaRender.length > 500, true);
check('按钮放在折叠标题 summary 内（紧贴）', dakaRender.includes('<summary>${summary}${annoBtn}${ansfigBtn}</summary>'), true);
check('「📝 批注」按钮与解答原图按钮并排在同一 summary', /<summary>\$\{summary\}\$\{annoBtn\}\$\{ansfigBtn\}<\/summary>/.test(dakaRender), true);
check('笔记区 .daka-notes 位于折叠面板之前', dakaRender.indexOf('<div class="daka-notes"></div>') > -1
    && dakaRender.indexOf('<div class="daka-notes"></div>') < dakaRender.indexOf('<details class="daka-answer">'), true);
const dakaHeader = slice(dakaRender, '<div class="daka-card-header">', '</div>');
check('卡片头部不再放按钮', dakaHeader.includes('ansfigBtn'), false);
check('按钮点击阻止冒泡（preventDefault）', dakaRender.includes('event.preventDefault()'), true);
check('按钮点击阻止冒泡（stopPropagation）', dakaRender.includes('event.stopPropagation()'), true);
// answer 组装段：analysis 先于 solHtml(cd)
const answerSeg = slice(dakaRender, 'if (hasLecture) {', '} else if (isReal)');
const dkA = answerSeg.indexOf('daka-analysis');
const dkS = answerSeg.indexOf('${solHtml(cd)}');
check('考点分析/易错点排在解法一之前', dkA > -1 && dkS > -1 && dkA < dkS, true);
check('解答原图独立区在折叠面板之后', dakaRender.indexOf('${ansfigBlock}') > dakaRender.indexOf('</details>'), true);

console.log('\n--- style.css ---');
const CSS = read('css/style.css');
check('summary 内小按钮样式存在（紧贴）', /\.daka-answer > summary \.ansfig-toggle\s*\{/.test(CSS), true);
check('小按钮有左外边距（紧贴而非撑开）', /\.daka-answer > summary \.ansfig-toggle\s*\{[^}]*margin-left:\s*8px/.test(CSS), true);

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
