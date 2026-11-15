/* CO 5.5.2 的「异常 vs 中断：处理完回到哪条指令」分类图。
 *
 * 为什么画：5.5.2 整节 1796 字纯文字，「故障回本条 / 自陷回下一条 / 终止不返回」
 *   这三句是 2015-434、2020-425、2020-436 的必考点，靠段落文字最容易背串；
 *   一条指令流把三种返回位置画在同一根轴上，一眼分清。
 *
 * 同源：图内所有分类名、举例都取自 5.5.2 正文
 *   （故障/自陷/终止、缺页、断点、系统调用、可屏蔽中断 INTR、不可屏蔽中断 NMI）。
 *   I1–I4 是示意图的指令序号（正文无具体指令序列），仅作返回位置的载体。
 * 基线：CO jsdom .anno-line = 1971。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

const SVG = 'pwa/img/co_fig_exception_class.svg';
const svg = read(SVG);
const coRaw = read('pwa/data/notes/co_notes.json');
const co = JSON.parse(coRaw);
const sw = read('pwa/sw.js');

// ---------- 1. SVG 自身 ----------
check('SVG 以 </svg> 收尾', svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'), true);
check('SVG viewBox 800 宽', /viewBox="0 0 800 \d+"/.test(svg), true);
check('SVG 有白底', svg.includes('<rect width="800"') && svg.includes('fill="#fbfcfe"'), true);
check('SVG 无 HTML 标签', ['<b>', '</b>', '<i>', '</i>', '<br>', '<p>'].every(t => !svg.includes(t)), true);
check('SVG 不在 <g> 上写 stroke（会让文字继承描边）', !/<g[^>]*stroke=/.test(svg), true);

// ---------- 2. 图落位（必须在 5.5.2，不能是 5.5 节级） ----------
function secHtml(num) {
  for (const ch of co.chapters) {
    for (const s of ch.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if ((x.section || '').split(' ')[0] === num) return x.html || '';
      }
    }
  }
  return '';
}
const h = secHtml('5.5.2');
check('5.5.2 含本图', h.includes('img/co_fig_exception_class.svg'), true);
check('5.5.2 图引用唯一 1 处', (h.match(/co_fig_exception_class/g) || []).length, 1);
check('5.5 节级 html 不含本图（5.5 有 3 个子节，图只该在 5.5.2）',
  secHtml('5.5').includes('co_fig_exception_class'), false);

const starAt = h.indexOf('<h4>★ 高频真题考点与陷阱</h4>');
check('★ 锚点存在', starAt > 0, true);
const figAt = h.indexOf('co_fig_exception_class.svg');
check('图在 ★ 之前', figAt > 0 && figAt < starAt, true);

const blockAt = h.indexOf('<p class="paragraph" data-fig="1"><b>图：异常 vs 中断');
check('图题与 img 是紧邻两段 data-fig',
  blockAt > 0 && /^<p class="paragraph" data-fig="1"><b>图：异常 vs 中断[\s\S]*?<\/p>\r?\n<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/co_fig_exception_class\.svg"/.test(h.slice(blockAt)), true);
check('图块前缀是闭合标签（不塞进 <p>/<li> 正文）',
  blockAt > 0 && /[>\r\n]/.test(h[blockAt - 1]), true);
check('图块前面紧跟的是 </p>（不在未闭合的 <ul> 里）',
  h.slice(0, blockAt).trim().endsWith('</p>'), true);
check('图块所在 <ul> 已闭合（前缀里 <ul> 与 </ul> 数量配平）',
  (h.slice(0, blockAt).match(/<ul>/g) || []).length === (h.slice(0, blockAt).match(/<\/ul>/g) || []).length, true);

// ---------- 3. SW 预缓存 ----------
check('SW DATA_PRECACHE 含本图', sw.includes("'img/co_fig_exception_class.svg'"), true);

// ---------- 4. 与正文同源（只挑单文本节点内的短词，跨 tspan 拼不出来） ----------
const svgText = (svg.match(/<text[^>]*>[\s\S]*?<\/text>/g) || [])
  .map(t => t.replace(/<[^>]+>/g, '')).join('\n');
const SAME = ['故障', '自陷', '终止', '缺页', '断点', '系统调用',
  '可屏蔽中断', '不可屏蔽中断', 'NMI', 'INTR'];
check('正文的分类名/举例图里全有（且都在单个 text 节点内）',
  SAME.every(t => h.includes(t) && svgText.includes(t)), true);
check('图明确写出「故障回本条」', /故障（[^）]*）[\s\S]{0,80}重新执行 I2 本条/.test(svgText), true);
check('图明确写出「自陷/外中断都回下一条 I4」', /→ 都回 I4/.test(svgText), true);
check('图明确写出「终止不返回」', /终止：不返回/.test(svgText), true);
check('图里「可屏蔽」用 INTR 标注（与正文请求线一致）',
  /可屏蔽中断[\s\S]{0,120}INTR/.test(svgText), true);
check('图里「不可屏蔽」用 NMI 标注（与正文请求线一致）',
  /不可屏蔽中断 NMI/.test(svgText), true);
check('图里内/外分类口径与正文一致（内=异常，外=中断）',
  svgText.includes('中断＝外中断') && h.includes('故障和自陷属于程序性异常'), true);

// ---------- 5. 返回位置三分类与正文一一对应 ----------
['重新执行同一条指令', '从自陷指令的下一条指令继续执行', '程序被迫终止'].forEach(t =>
  check('正文有返回方式描述：' + t, h.includes(t), true));
check('正文三分类齐全（故障/自陷/终止都在 <li> 里）',
  ['故障（Fault）', '自陷（Trap）', '终止（Abort）'].every(t => h.includes(t)), true);

// ---------- 6. 数据文件不带 SVG 专有标签 ----------
check('笔记 JSON 里没有 tspan', coRaw.includes('tspan'), false);
check('5.5.2 没有内联 <svg>（图走 img 外链，不占行号）', h.includes('<svg'), false);
check('5.5.2 非 data-fig 的 <p> 仍是 8 段（插图没新增裸 <p>）', (h.match(/<p>/g) || []).length, 8);

// ---------- 7. jsdom 真实渲染：行号零漂移 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_co_exception_fig: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    const pageHtml = read('pwa/notes.html')
      .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
        try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
      }).replace(/<link\b[^>]*>/gi, '');
    const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
    const dom = new JSDOM(pageHtml, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'https://x.test/notes.html?subject=co', virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
        w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(coRaw) });
      }
    });
    // 轮询等待渲染完成，避免单跑/串跑节奏差异导致假红
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline &&
      dom.window.document.querySelectorAll('.anno-line').length < 1971) {
      await new Promise(r => setTimeout(r, 200));
    }
    const d = dom.window.document;
    check('真实渲染 .anno-line = 1971（插图零漂移）', d.querySelectorAll('.anno-line').length, 1971);
    check('图块没被算进行号',
      [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
    const img = [...d.querySelectorAll('img.fig-img')]
      .find(el => (el.getAttribute('src') || '').includes('co_fig_exception_class'));
    check('本图在真实 DOM 里渲染出来了', !!img, true);
    check('本图不在 <li> 内部', !!img && !img.closest('li'), true);
    console.log('_test_co_exception_fig: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
