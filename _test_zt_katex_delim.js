// 真题 LaTeX 排版回归：
//   1) KaTeX 可拉伸括号（\left[ \right]）是内联 SVG，不能和题图一样外置成块级 div holder；
//      否则 .zt-svgholder 的 flex + min-height:56px 会把矩阵撑散、括号挤进正文（2015-42 答案）。
//   2) 源站题图容器的 width:120% 会顶破卡片右边界（2015-43 题干），构建期收敛到 100%。
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_katex_delim.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : `  → 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`}`);
}

const BUILD = fs.readFileSync(path.join(ROOT, 'tools/build_zt.py'), 'utf8');
const ZTJS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const SVGDIR = path.join(ROOT, 'pwa/data/zt_svg');
const years = fs.readdirSync(path.join(ROOT, 'pwa/data/zt'))
  .filter(f => /^zt_\d{4}\.json$/.test(f)).sort();

let inlineHolders = 0, divHolders = 0, overWide = 0;
const inlineNames = [];
const cells = [];
for (const f of years) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt', f), 'utf8'));
  for (const it of d.items) {
    for (const k of ['q', 'an', 'o']) {
      const v = it[k];
      const html = Array.isArray(v) ? v.join('') : (v || '');
      if (typeof html !== 'string') continue;
      cells.push({ year: +f.slice(3, 7), i: it.i, k, html });
      inlineHolders += (html.match(/<span class="zt-svgholder zt-svg-inline"/g) || []).length;
      divHolders += (html.match(/<div class="zt-svgholder"/g) || []).length;
      overWide += [...html.matchAll(/width:\s*(\d+(?:\.\d+)?)%/g)]
        .filter(wm => parseFloat(wm[1]) > 100).length;
      for (const m of html.matchAll(/<span class="zt-svgholder zt-svg-inline" data-svg="([^"]+)"/g)) {
        inlineNames.push(m[1]);
      }
    }
  }
}

console.log('\n--- 一、括号 SVG 全部改为内联 holder ---');
check('内联 holder 共 11 个（KaTeX 定界符）', inlineHolders, 11);
check('题图 holder 仍为 div（共 204 个）', divHolders, 204);
check('holder 总数 = 外置 SVG 数 215', inlineHolders + divHolders, 215);
check('全库不再有 <div class="zt-svgholder" 的括号（2015-42 已清零）',
  (cells.find(c => c.year === 2015 && c.i === 42 && c.k === 'an').html.match(/<div class="zt-svgholder"/g) || []).length, 0);
check('2015-42 答案 4 个括号都是内联 span',
  (cells.find(c => c.year === 2015 && c.i === 42 && c.k === 'an').html.match(/zt-svg-inline/g) || []).length, 4);
check('每个内联 holder 都有对应 SVG 文件',
  inlineNames.filter(n => !fs.existsSync(path.join(SVGDIR, n + '.svg'))), []);
check('括号 SVG 内容是 em 尺寸 + path（不是题图）',
  inlineNames.every(n => {
    const s = fs.readFileSync(path.join(SVGDIR, n + '.svg'), 'utf8');
    return /<svg[^>]*(?:width|height)="[^"]*em"/.test(s) && /<path/.test(s) && /viewbox=/i.test(s);
  }), true);

// 内联 holder 必须仍在 KaTeX 定界符的子树里（前后 500 字符含 delimsizing）
const an42 = cells.find(c => c.year === 2015 && c.i === 42 && c.k === 'an').html;
const ctxOk = [...an42.matchAll(/<span class="zt-svgholder zt-svg-inline"/g)]
  .every(m => /delimsizing/.test(an42.slice(Math.max(0, m.index - 500), m.index)));
check('4 个内联括号都位于 .delimsizing 结构内', ctxOk, true);

console.log('\n--- 二、题图容器不再超宽 ---');
check('全库 width>100% 已清零', overWide, 0);
const q43 = cells.find(c => c.year === 2015 && c.i === 43 && c.k === 'q').html;
check('2015-43 图容器收敛为 width:100%', /class="svg-container"[^>]*width:100%/.test(q43), true);
check('题图仍是块级 div holder', /<div class="zt-svgholder" data-svg="zt_2015_43_1"><\/div>/.test(q43), true);

console.log('\n--- 三、构建期实现 ---');
check('extract_svgs 按 viewbox+em 判定内联括号',
  /inline = \('viewbox=' in head\.lower\(\)/.test(BUILD), true);
check('内联 holder 用 <span class="zt-svgholder zt-svg-inline">',
  /<span class="zt-svgholder zt-svg-inline" data-svg="%s"><\/span>/.test(BUILD), true);
check('题图 holder 仍用 <div class="zt-svgholder">',
  /<div class="zt-svgholder" data-svg="%s"><\/div>/.test(BUILD), true);
check('clean_html 收敛 >100% 宽度', /def _cap_width\(m\)/.test(BUILD) && /width:\\s\*\(\\d\+/.test(BUILD), true);
check('2026 分值修正仍在（重跑幂等护栏）', /SCORE_FIX = \{\(2026, 45\): 7, \(2026, 46\): 8, \(2026, 47\): 9\}/.test(BUILD), true);
const y26 = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/zt_2026.json'), 'utf8'));
check('产物里 2026 大题分值 7/8/9',
  y26.items.filter(x => [45, 46, 47].includes(x.i)).map(x => x.s), [7, 8, 9]);

console.log('\n--- 四、前端注入与样式 ---');
// 2026-11-10：SVG 注入拆出 applySvg —— 缓存命中时同步注入（避免整卡重绘时
// 题图退回 56px 占位、按钮行跳动），内联/块级判定随之搬进 applySvg。断言跟着改。
check('applySvg 识别 zt-svg-inline', /holder\.classList\.contains\('zt-svg-inline'\)/.test(ZTJS), true);
check('内联分支直接 holder.innerHTML = t（不包块级 wrap）', /if \(holder\.classList\.contains\('zt-svg-inline'\)\) \{ holder\.innerHTML = t; return; \}/.test(ZTJS), true);
check('题图分支仍包 .zt-svg-wrap', /wrap\.className = 'zt-svg-wrap'/.test(ZTJS), true);
check('CSS 把内联 holder 覆盖成 inline-block',
  /\.zt-svgholder\.zt-svg-inline \{ display: inline-block; min-height: 0;/.test(CSS), true);
check('CSS 去掉内联 holder 的「图加载中…」占位',
  /\.zt-svgholder\.zt-svg-inline::before \{ content: none; \}/.test(CSS), true);
check('CSS 给旧缓存的 svg-container 兜底 max-width:100%',
  /\.question-content \.svg-container, \.explanation-body \.svg-container \{ max-width: 100%; \}/.test(CSS), true);
check('题图样式 .zt-svg-wrap svg 未被误改',
  /\.zt-svg-wrap svg \{ max-width: 100%; height: auto; display: block;/.test(CSS), true);

console.log('\n--- 五、运行时：内联括号不被块级样式撑散 ---');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) {
  console.log('  ⏭ 跳过（未安装 jsdom）');
} else {
  // 必须注入完整样式表：按行过滤会把多行注释切断，导致后面的规则被吞进注释里
  const win = new JSDOM('<!doctype html><html><head><style>' + CSS + '</style></head><body>' + an42 + '</body></html>').window;
  const doc = win.document;
  const spans = doc.querySelectorAll('.zt-svgholder.zt-svg-inline');
  check('2015-42 渲染出 4 个内联括号容器', spans.length, 4);
  const cs0 = win.getComputedStyle(spans[0]);
  check('内联括号 display = inline-block（不是 flex）', cs0.display, 'inline-block');
  check('内联括号 min-height = 0px（不撑高 KaTeX 行盒）', cs0.minHeight, '0px');
  check('外层仍是 KaTeX 的 em 尺寸 span',
    /em/.test((spans[0].parentElement && spans[0].parentElement.getAttribute('style')) || ''), true);
  // 模拟 injectSvgs 的内联分支：直接写 innerHTML，不包 .zt-svg-wrap
  spans.forEach(sp => { sp.innerHTML = fs.readFileSync(path.join(SVGDIR, sp.dataset.svg + '.svg'), 'utf8'); });
  check('注入后 4 个括号都是 inline 容器里的 svg',
    doc.querySelectorAll('.zt-svgholder.zt-svg-inline > svg').length, 4);
  check('没有被替换成块级 .zt-svg-wrap', doc.querySelectorAll('.zt-svg-wrap').length, 0);
  const csSvg = win.getComputedStyle(doc.querySelector('.zt-svgholder.zt-svg-inline > svg'));
  check('注入的 svg 仍是默认 inline（未被 height:auto/display:block 覆盖）',
    csSvg.display !== 'block', true);
  win.close();
}

console.log(`\n结果: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed ? 1 : 0);
