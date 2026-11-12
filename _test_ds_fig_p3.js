/* 数据结构第三批配图（顺序表 / KMP / 哈夫曼 / BFS-DFS / B+树 / 快排 / 归并 / 基数）
 * 8 张图 + 8 个黄框的契约回归。DS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) DS 各章小节末尾常有「★ 高频真题考点与陷阱」整章汇总，图必须在 ★ 之前；
 * 2) 图内容必须与笔记正文的示例数据一致 —— KMP 用 T = abaabc（next 0,1,1,2,2,3），
 *    不是常见的 ababaa；快排用 {49,38,65,97,76,13,27}；基数排序用笔记里那 8 个数。
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

const notesRaw = read('pwa/data/notes/ds_notes.json');
const notes = JSON.parse(notesRaw);
const sw = read('pwa/sw.js');

function nodeHtml(prefix) {
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if ((x.section || '').indexOf(prefix) === 0) return x.html || '';
      }
    }
  }
  return '';
}

// [图名, 小节前缀, 图前必须出现的知识点锚点]
const FIGS = [
  ['seqlist_move',        '2.2.2', '双指针归并合并有序表'],
  ['kmp_next',            '4.2.2', '得 0 1 1 2 2 3'],
  ['huffman',             '5.5.1', '6+11+18 = 35'],
  ['bfs_dfs',             '6.3.1', '连通分量数'],
  ['bplus_tree',          '7.4.2', '磁盘 I/O 更少'],
  ['quicksort_partition', '8.3.2', '一趟结果 {27,38,13,49,76,97,65}'],
  ['merge_sort',          '8.5.1', '⌈log₂6⌉=3 趟'],
  ['radix_sort',          '8.5.2', '每趟分配收集必须稳定'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('DS 配图不少于 25 张（精确总量见 _test_fig_p5）',
  (notesRaw.match(/fig-img/g) || []).length >= 25, true);
check('DS 黄框不少于 93 个（精确总量见 _test_fig_p5）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 93, true);
check('SW 里 DS 图不少于 25 条', (sw.match(/'img\/ds_fig_[^']+'/g) || []).length >= 25, true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/ds_fig_' + name + '.svg';
  check(sec + ' 含图 ' + name, h.includes(svgName), true);

  const iAnchor = h.indexOf(anchorText);
  const iFig = h.indexOf(svgName);
  check(sec + ' 图紧跟「' + anchorText + '」', iAnchor >= 0 && iFig > iAnchor, true);

  // 图必须在 ★ 真题汇总之前（该小节没有 ★ 时跳过）
  const iStar = h.indexOf('★');
  check(sec + ' 图在「★ 高频真题考点」之前', iStar < 0 || iFig < iStar, true);

  const figBlock = h.slice(Math.max(0, iFig - 240), iFig + 280);
  check(sec + ' 图块两处 data-fig',
    (figBlock.match(/data-fig="1"/g) || []).length >= 2, true);
  check(sec + ' 有黄框且带加粗',
    /class="key-callout">[\s\S]*?<b>/.test(h), true);

  // 注入点不在未闭合列表 / 表格内
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

  const svg = read('pwa/img/ds_fig_' + name + '.svg');
  check(name + ' SVG 有 viewBox 与白底',
    svg.includes('viewBox="0 0 680 ') && svg.includes('fill="#ffffff"'), true);
  const svgNoNs = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  check(name + ' SVG 无外链 / 无脚本',
    /<script|https?:\/\/|xlink:href|href="http|<image\b/.test(svgNoNs), false);
  check(name + ' SVG 无 HTML 标签（b/br/p/div/span）',
    /<(?:b|br|p|div|span|strong|i|em)\b/.test(svg), false);
  check(name + ' 无 font-size="0" 占位残留', svg.includes('font-size="0"'), false);
  check(name + ' 加粗用 tspan 而非 b 标签', /<tspan[^>]*font-weight="700"/.test(svg), true);
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/ds_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/ds_fig_' + name + '.svg')), true);
}

// ---- 图与正文示例必须同源（防止图自己编一组数据） ----
const kmpSvg = read('pwa/img/ds_fig_kmp_next.svg');
check('KMP 图用笔记里的 T = abaabc（不是 ababaa）',
  [kmpSvg.includes('abaabc'), kmpSvg.includes('ababaa')], [true, false]);
check('KMP 图 next 序列 0 1 1 2 2 3 与正文一致',
  nodeHtml('4.2.2').includes('0 1 1 2 2 3'), true);
check('哈夫曼图 WPL = 35 与正文一致',
  [read('pwa/img/ds_fig_huffman.svg').includes('35'), nodeHtml('5.5.1').includes('= 35')], [true, true]);
check('基数排序图用笔记里的 8 个数',
  ['930', '063', '589'].every(t => read('pwa/img/ds_fig_radix_sort.svg').includes(t)), true);
check('快排图一趟结果与正文一致',
  read('pwa/img/ds_fig_quicksort_partition.svg').includes('13') &&
  nodeHtml('8.3.2').includes('{27,38,13,49,76,97,65}'), true);

// 行号漂移护栏（静态，配对口径）
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
check('全库可批注行数锁死 1173（配对口径，未新增裸 p / li）', annoLines, 1173);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1330 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_ds_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
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
      url: 'https://x.test/notes.html?subject=ds', virtualConsole: vc,
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
    check('真实渲染 .anno-line 总数 = 1330（已存批注不错位）',
      d.querySelectorAll('.anno-line').length, 1330);
    check('真实渲染配图不少于 25 张', d.querySelectorAll('img.fig-img').length >= 25, true);
    check('真实渲染黄框不少于 93 个', d.querySelectorAll('.key-callout').length >= 93, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_ds_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
