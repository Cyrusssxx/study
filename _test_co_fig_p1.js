/* 计组 P1（数据通路 / 控制器 / 主存扩展 / 指令周期 / 总线）7 张自绘图契约回归
 * 与 P0 同一套口径：落位紧跟知识点、行号不漂移、离线可缓存。
 * 精确总量（配图 20 张 / 黄框 27 个）由本文件统管，旧测试只守下限。
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

// 7 张图 → 落位小节 + 必须排在其后的知识点原文
const FIGS = [
  ['single_bus',     '5.3.4', 'ALU 输出不能直接连总线'],
  ['dedicated_path', '5.3.5', '易错点：①专用数据通路以面积换速度'],
  ['microprogram',   '5.4.3', '执行完自动返回取指微程序入口'],
  ['mem_expand',     '3.3.2', '3. 字位同时扩展'],
  ['instr_cycle',    '5.2.3', '变长指令周期'],
  ['bus_structure',  '6.1.4', '③I/O 通路直连'],
  ['bus_timing',     '6.2.2', '有同步、异步、半同步和分离式四种'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
// 精确总量归 _test_co_fig_p2.js 统管，这里只守下限
check('计组配图 >= 20 张', (notesRaw.match(/fig-img/g) || []).length >= 20, true);
check('计组黄框 >= 27 个', (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 27, true);
check('加粗总量 >= 900', (notesRaw.match(/<b>/g) || []).length >= 900, true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/co_fig_' + name + '.svg';
  check(sec + ' 含图 ' + name, h.includes(svgName), true);
  const iAnchor = h.indexOf(anchorText);
  const iFig = h.indexOf(svgName);
  check(sec + ' 配图紧跟「' + anchorText + '」之后', iAnchor >= 0 && iFig > iAnchor, true);
  const figBlock = h.slice(Math.max(0, iFig - 240), iFig + 280);
  check(sec + ' 图块两处 data-fig',
    (figBlock.match(/data-fig="1"/g) || []).length >= 2, true);

  const svg = read('pwa/img/co_fig_' + name + '.svg');
  check(name + ' SVG 有 viewBox 与白底',
    svg.includes('viewBox="0 0 680 ') && svg.includes('fill="#ffffff"'), true);
  const svgNoNs = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  check(name + ' SVG 无外链 / 无脚本',
    /<script|https?:\/\/|xlink:href|href="http|<image\b/.test(svgNoNs), false);
  check(name + ' SVG 无 HTML 标签（b/br/p/div/span）',
    /<(?:b|br|p|div|span|strong|i|em)\b/.test(svg), false);
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/co_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/co_fig_' + name + '.svg')), true);
}

// 本轮新增的 3 个黄框（原本 0 框的高频节）
for (const sec of ['5.2.3', '5.3.5', '6.1.4']) {
  const h = nodeHtml(sec);
  check(sec + ' 有黄框', (h.match(/class="key-callout"/g) || []).length >= 1, true);
  check(sec + ' 黄框带重点加粗', /class="key-callout">[\s\S]*?<b>/.test(h), true);
}

// 行号漂移护栏
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
check('全库可批注行数锁死 1819（P1 未新增裸 p / li）', annoLines, 1819);
check('SW 里计组图 >= 20 条', (sw.match(/'img\/co_fig_[^']+'/g) || []).length >= 20, true);
check('前端会跳过 data-fig 的行号标注',
  page.includes("el.hasAttribute('data-fig') || el.closest('[data-fig]')"), true);

// ---- 运行时硬护栏：jsdom 真实渲染的 .anno-line 总数必须仍是 1971 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_co_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 >= 20 张', d.querySelectorAll('img.fig-img').length >= 20, true);
    check('真实渲染黄框 >= 27 个', d.querySelectorAll('.key-callout').length >= 27, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_co_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
