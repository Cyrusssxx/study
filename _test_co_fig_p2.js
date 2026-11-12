/* 计组 P2（Cache 命中 / 写策略 / 编码数轴 / I/O 接口）4 张图 + 16 个黄框契约回归
 * 精确总量已移交 _test_co_fig_p3（28 图 / 48 框），本文件只守下限。
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

const FIGS = [
  ['cache_hit',         '3.5.2', '缺失则从主存将所在主存块整体调入'],
  ['cache_write',       '3.5.5', '写不命中策略'],
  ['code_numberline',   '2.1.2', '与补码仅符号位相反'],
  ['io_interface',      '7.2.2', '控制线传送读/写控制信号'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('计组配图不少于 24 张（精确总量见 _test_co_fig_p3）', (notesRaw.match(/fig-img/g) || []).length >= 24, true);
check('计组黄框不少于 44 个（精确总量见 _test_co_fig_p3）', (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 44, true);
check('加粗总量 >= 950', (notesRaw.match(/<b>/g) || []).length >= 950, true);

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
  check(name + ' 无 font-size="0" 占位残留', svg.includes('font-size="0"'), false);
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/co_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/co_fig_' + name + '.svg')), true);
}

// 16 个新增黄框小节（原来 0 框）
const CALLOUT_SECS = ['3.5.2', '3.5.5', '7.2.2', '2.1.4', '3.1.4', '3.4.1', '3.5.4',
                      '3.5.6', '3.6.2', '4.1.2', '4.2.1', '4.4.3', '5.5.2', '5.6.2',
                      '5.6.3', '6.2.1', '7.2.1'];
for (const sec of CALLOUT_SECS) {
  const h = nodeHtml(sec);
  check(sec + ' 有黄框', (h.match(/class="key-callout"/g) || []).length >= 1, true);
  check(sec + ' 黄框带重点加粗', /class="key-callout">[\s\S]*?<b>/.test(h), true);
}

// 黄框不能落在未闭合的列表里（2.1.4 曾踩到历史缺 </ul>）
for (const sec of CALLOUT_SECS) {
  const h = nodeHtml(sec);
  let bad = 0;
  for (const pat of ['<p class="paragraph" data-fig="1"><b>图', '<div class="key-callout">']) {
    let idx = -1;
    while ((idx = h.indexOf(pat, idx + 1)) >= 0) {
      const pre = h.slice(0, idx);
      for (const tag of ['ul', 'ol', 'table']) {
        const op = (pre.match(new RegExp('<' + tag + '\\b', 'g')) || []).length;
        const cl = (pre.match(new RegExp('</' + tag + '>', 'g')) || []).length;
        if (op !== cl) bad++;
      }
    }
  }
  check(sec + ' 注入点不在未闭合列表内', bad, 0);
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
check('全库可批注行数锁死 1819（P2 未新增裸 p / li）', annoLines, 1819);
check('SW 里计组图不少于 24 条（精确值见 _test_co_fig_p3）', (sw.match(/'img\/co_fig_[^']+'/g) || []).length >= 24, true);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1971 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_co_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图不少于 24 张', d.querySelectorAll('img.fig-img').length >= 24, true);
    check('真实渲染黄框不少于 44 个', d.querySelectorAll('.key-callout').length >= 44, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_co_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
