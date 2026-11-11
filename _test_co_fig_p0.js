/* 计组 P0（高频考点）8 张自绘图 + 20 个重点黄框的契约回归
 * 锁死三件事：落位紧跟知识点、行号不漂移、离线可缓存。
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

const notesRaw = read('pwa/data/notes/co_notes.json');
const notes = JSON.parse(notesRaw);
const sw = read('pwa/sw.js');
const page = read('pwa/notes.html');

function nodeHtml(prefix) {
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if (x.section.indexOf(prefix) === 0) return x.html || '';
      }
    }
  }
  return '';
}

// 8 张图 → 落位小节，全部紧跟对应知识点（不是小节末尾）
const FIGS = [
  ['ieee754',      '2.3.1', 'IEEE 754 格式'],
  ['float_add',    '2.3.2', '浮点加减五步骤'],
  ['sram_dram',    '3.2.1', '用于主存'],
  ['interleave',   '3.2.3', '连续存取 m 个字时间'],
  ['alu_overflow', '2.2.1', '一位全加器'],
  ['mul_flow',     '2.2.4', '迭代式'],
  ['addressing',   '4.2.2', '表4.1'],
  ['cpu_mem_path', '3.6.6', '一句话总结'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('计组配图 13 张', (notesRaw.match(/fig-img/g) || []).length, 13);
check('全计组黄框 24 个', (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 24);
check('加粗总量 >= 900', (notesRaw.match(/<b>/g) || []).length >= 900, true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/co_fig_' + name + '.svg';
  check(sec + ' 含图 ' + name, h.includes(svgName), true);
  const iAnchor = h.indexOf(anchorText);
  const iFig = h.indexOf(svgName);
  check(sec + ' 配图紧跟「' + anchorText + '」之后', iAnchor > 0 && iFig > iAnchor, true);
  // 图题 + 图片两行都必须带 data-fig，否则会被 fmtNotes 算成可批注正文行
  const figBlock = h.slice(Math.max(0, iFig - 220), iFig + 260);
  check(sec + ' 图块两处 data-fig',
    (figBlock.match(/data-fig="1"/g) || []).length >= 2, true);
  check(sec + ' 同处有黄框', h.includes('class="key-callout"'), true);

  const svg = read('pwa/img/co_fig_' + name + '.svg');
  check(name + ' SVG 有 viewBox 与白底',
    svg.includes('viewBox="0 0 680 ') && svg.includes('fill="#ffffff"'), true);
  const svgNoNs = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  check(name + ' SVG 无外链 / 无脚本',
    /<script|https?:\/\/|xlink:href|href="http|<image\b/.test(svgNoNs), false);
  check(name + ' SVG 无 HTML 标签（b/br/p/div）',
    /<(?:b|br|p|div|span)\b/.test(svg), false);
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/co_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/co_fig_' + name + '.svg')), true);
}

// 12 个纯黄框小节（原来 0 黄框的高频 / 次高频节）
const CALLOUT_ONLY = ['2.1.2', '3.5.3', '5.6.4', '5.4.3', '6.1.3', '5.1.3',
                      '1.3.1', '3.6.5', '6.2.2', '5.3.4', '7.2.4', '4.1.4'];
for (const sec of CALLOUT_ONLY) {
  const h = nodeHtml(sec);
  check(sec + ' 补上黄框', (h.match(/class="key-callout"/g) || []).length, 1);
  check(sec + ' 黄框带重点加粗', /class="key-callout">[\s\S]*?<b>/.test(h), true);
}

// 行号漂移护栏：不带 data-fig 的 <p> + 全部 <li> = 可批注行数，必须仍是 1819
let annoLines = 0;
for (const c of notes.chapters) {
  for (const s of c.sections || []) {
    for (const x of [s].concat(s.subsections || [])) {
      const h = x.html || '';
      (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => {
        if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++;
      });
      annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
    }
  }
}
check('全库可批注行数锁死 1819', annoLines, 1819);
check('前端会跳过 data-fig 的行号标注',
  page.includes("el.hasAttribute('data-fig') || el.closest('[data-fig]')"), true);
check('表格只进搜索索引、不参与 anno-line',
  page.includes("section.querySelectorAll('.notes-body th, .notes-body td')"), true);
check('SW 里计组图恰好 13 条', (sw.match(/'img\/co_fig_[^']+'/g) || []).length, 13);

// ---- 运行时硬护栏：jsdom 真实渲染的 .anno-line 总数必须仍是 1971 ----
// 静态 1819 只数「不带 data-fig 的 <p> + <li>」，fmtNotes 还会拆行；
// 这一步验证真实渲染结果，才是已存行级批注不错位的最终依据。
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_co_fig_p0: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    const pageHtml = read('pwa/notes.html')
      .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
        try { return '<script>' + read('pwa/' + s) + '</script>'; }
        catch (e) { return ''; }
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
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(notesRaw) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    check('真实渲染 .anno-line 总数 = 1971（已存批注不错位）',
      d.querySelectorAll('.anno-line').length, 1971);
    check('真实渲染 13 张配图', d.querySelectorAll('img.fig-img').length, 13);
    check('真实渲染 24 个黄框', d.querySelectorAll('.key-callout').length, 24);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_co_fig_p0: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
