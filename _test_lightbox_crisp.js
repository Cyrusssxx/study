/* ============================================================
 * _test_lightbox_crisp.js
 * 锁住图片放大预览的「不糊」实现：
 *   1. 缩放必须走内联 width/height（真实布局尺寸 → 浏览器按新尺寸重新矢量栅格化），
 *      绝不能退回 transform: scale()（会提升合成层，只在初始尺寸栅格化一次再 GPU 拉伸）。
 *   2. .fig-lb-stage img 不得出现 will-change: transform（它把这个坏行为钉死）。
 *   3. 提供「复制高清图」按钮，按 >=3 倍重绘成 PNG，并有 6000px 单边上限。
 *   4. 位图在 100% 时不被拉伸到超过原始像素（SVG 不限制）。
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, actual, expect) {
    let ok;
    if (typeof expect === 'function') ok = expect(actual);
    else if (Array.isArray(expect)) ok = JSON.stringify(actual) === JSON.stringify(expect);
    else ok = actual === expect;
    if (ok) { pass++; }
    else { fail++; console.log('FAIL ' + name + '\n  实际: ' + JSON.stringify(actual) + '\n  期望: ' + JSON.stringify(expect)); }
}

const jsRaw = read('pwa/js/lightbox.js');
const cssRaw = read('pwa/css/style.css');
// 断言只针对代码本体：先剥掉注释，否则「注释里提到 will-change / scale()」会误判
const stripC = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const js = stripC(jsRaw);
const css = stripC(cssRaw);

/* ---------- 1. 缩放机制 ---------- */
check('apply() 用内联 width/height 放大', /imgEl\.style\.width\s*=\s*\(baseW \* scale\)/.test(js), true);
check('apply() 的 transform 只做平移，不含 scale（防退回合成层缩放）',
    /imgEl\.style\.transform\s*=\s*'translate\('/.test(js), true);
check('全文件不再出现 transform: … scale(… 赋值写法',
    /style\.transform\s*=\s*'[^']*scale\(/.test(js), false);
check('不再设置 will-change（JS 里）', /will-change/.test(js), false);
check('CSS 的 .fig-lb-stage img 规则里没有 will-change',
    /\.fig-lb-stage img\s*\{[^}]*will-change/.test(css), false);

/* ---------- 2. 基准尺寸与舞台适配 ---------- */
check('有 measureFitted() 量基准尺寸', /function measureFitted\(\)/.test(js), true);
check('量完解除 max-width 限制，否则会被 94vw 卡住',
    /imgEl\.style\.maxWidth\s*=\s*'none'/.test(js), true);
check('窗口 resize 后重新量基准并重绘', /addEventListener\('resize'[\s\S]{0,120}measureFitted\(\)/.test(js), true);
check('openFigLightbox 先 show 再量（舞台要有尺寸）',
    js.indexOf("box.classList.add('show')") < js.lastIndexOf('imgEl.onload = function'), true);

/* ---------- 3. 位图不被拉伸 ---------- */
check('含 SVG 判定正则（矢量不限制、位图封顶原始像素）',
    /isVector\s*=\s*\/\\\.svg/.test(js), true);
check('位图超原始像素时按比例回落', /!isVector && w > imgEl\.naturalWidth/.test(js), true);

/* ---------- 4. 复制高清图 ---------- */
check('工具栏有复制按钮 data-act="copy"', /data-act="copy"/.test(js), true);
check('点击分发到 copyImage()', /act === 'copy'\)\s*copyImage\(\)/.test(js), true);
check('按 3 倍导出', /var k = 3;/.test(js), true);
check('单边 6000px 上限（防爆内存）', /6000/.test(js), true);
check('导出前铺白底（粘到深色模板不发黑）', /ctx\.fillStyle = '#ffffff'/.test(js), true);
check('优先写剪贴板，失败降级为下载',
    /navigator\.clipboard[\s\S]{0,200}downloadPng\(blob\)/.test(js), true);
check('复制与下载都有可见反馈（toast）', /fig-lb-toast/.test(js) && /\.fig-lb-toast\s*\{/.test(css), true);

/* ---------- 5. 既有行为未被破坏 ---------- */
check('滚轮缩放仍在', /addEventListener\('wheel'/.test(js), true);
check('拖拽平移仍在', /mousemove/.test(js) && /dragging/.test(js), true);
check('双击重置仍在', /dblclick/.test(js), true);
check('单击图片走短延迟关闭（区分双击）',
    /addEventListener\('click'[\s\S]{0,260}clickCloseTimer\s*=\s*setTimeout[\s\S]{0,120}close\(\)/.test(js)
        && /close\(\); \}, 240\)/.test(js), true);
check('双击取消待执行的单击关闭',
    /dblclick[\s\S]{0,220}clearTimeout\(clickCloseTimer\)/.test(js), true);
check('拖拽位移超阈值抑制尾随 click 关闭',
    /dragDist\s*\+=\s*Math\.abs\(dx\)/.test(js) && /if \(dragDist > 3\) suppressClickClose = true/.test(js), true);
check('close / openSrc 都清理关闭定时器（切图不误关）',
    (js.match(/clearTimeout\(clickCloseTimer\)/g) || []).length >= 3, true);
check('Esc / +- / 0 键盘仍在', /e\.key === 'Escape'/.test(js) && /e\.key === '0'/.test(js), true);
check('关闭时清空内联尺寸与基准（下次打开不会串）',
    /imgEl\.src = ''[\s\S]{0,300}baseW = 0; baseH = 0;/.test(js), true);
check('对外仍暴露 window.openFigLightbox', /window\.openFigLightbox = function/.test(js), true);
check('对外仍暴露 window.closeFigLightbox', /window\.closeFigLightbox = close/.test(js), true);

/* ---------- 6. 初始放大倍数 140% ---------- */
check('定义初始倍数 INITIAL_SCALE = 1.4', /var INITIAL_SCALE\s*=\s*1\.4/.test(js), true);
check('打开图片时初始 scale 用 INITIAL_SCALE', /scale = INITIAL_SCALE; tx = 0; ty = 0/.test(js), true);
check('工具栏初始显示 140%（由 INITIAL_SCALE 计算，不写死）',
    /zoomLabel\.textContent = Math\.round\(INITIAL_SCALE \* 100\)/.test(js), true);
check('1:1 重置仍回 100%（按钮语义不变）', /function reset\(\)\s*\{\s*scale = 1;/.test(js), true);

/* ---------- 7. 讲义内联结构图（struct-fig）点击放大 ---------- */
const commonJs = read('pwa/js/common.js');
check('暴露内联图放大入口 openInlineFigLightbox', /window\.openInlineFigLightbox\s*=/.test(js), true);
check('内联放大复用同一个 figLightbox', /window\.openInlineFigLightbox[\s\S]{0,120}window\.openFigLightbox\(src\)/.test(js), true);
check('只序列化 <svg> 外层（防 data URL 根元素非法破图）',
    /<svg\[\\s\\S\]\*\?<\\\/svg>/.test(js) || /<svg[\s\S]*?<\/svg>/.test(jsRaw), true);
check('注入固定亮色变量（放大层白底配深字，亮暗态都自洽可读）', /:root\{--text:#333333[\s\S]{0,120}--primary:#4a90d9/.test(js), true);
check('读 styleSheets 复用页面 CSS 规则（含 .ct-/.boot-/.wave-）',
    /document\.styleSheets/.test(js) && /\.ct-/.test(js) && /\.boot-/.test(js), true);
check('ev-* 新样式图放大也注入着色规则（白名单 + 剥 .ev-fig 祖先前缀）',
    js.includes('/\\.ev-/') && js.includes('wave|ev'), true);
check('data URL SVG 按矢量处理（不被位图封顶误伤）', /data:image\\\/svg/.test(js) || /data:image\/svg/.test(jsRaw), true);
check('common.js 委托命中 figure.struct-fig 并调内联放大',
    /closest\('figure\.struct-fig'\)/.test(commonJs) && /openInlineFigLightbox\(inlineFig\)/.test(commonJs), true);
check('内联图给 zoom-in 手型提示', /figure\.struct-fig\s*\{\s*cursor:\s*zoom-in/.test(css), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
