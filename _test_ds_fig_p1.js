/* 数据结构第一批配图（链表 / 栈 / 循环队列 / 二叉树性质 / 遍历 / 线索 / 图存储 / MST / 关键路径）
 * 9 张图 + 9 个黄框的契约回归。DS 精确总量由本文件统管。
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

const FIGS = [
  ['linked_list_ops', '2.3.2', '删带头结点循环单链表首元'],
  ['stack_top',       '3.1.2', '可能互为倒序'],
  ['circular_queue',  '3.2.2', '牺牲 1 单元）'],
  ['bintree_props',   '5.2.1', '满二叉树一定是完全二叉树'],
  ['traversal',       '5.3.1', '根的孩子只有 e'],
  ['thread_tree',     '5.3.2', '后序叶结点的右线索指向双亲'],
  ['graph_storage',   '6.2.2', '基于邻接矩阵的序列唯一'],
  ['mst',             '6.4.1', 'Kruskal 第 2 次选边'],
  ['topo_critical',   '6.4.5', '时间余量 = vl'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('DS 配图 9 张（本批精确总量）', (notesRaw.match(/fig-img/g) || []).length, 9);
check('DS 黄框 77 个（68 原有 + 9 新增）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 77);
check('SW 里 DS 图 9 条', (sw.match(/'img\/ds_fig_[^']+'/g) || []).length, 9);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/ds_fig_' + name + '.svg';
  check(sec + ' 含图 ' + name, h.includes(svgName), true);
  const iAnchor = h.indexOf(anchorText);
  const iFig = h.indexOf(svgName);
  check(sec + ' 配图紧跟「' + anchorText + '」之后', iAnchor >= 0 && iFig > iAnchor, true);
  const figBlock = h.slice(Math.max(0, iFig - 240), iFig + 280);
  check(sec + ' 图块两处 data-fig',
    (figBlock.match(/data-fig="1"/g) || []).length >= 2, true);
  check(sec + ' 有黄框且带加粗',
    /class="key-callout">[\s\S]*?<b>/.test(h), true);

  // 注入点不在未闭合列表内
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
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/ds_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/ds_fig_' + name + '.svg')), true);
}

// 行号漂移护栏（静态）
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
check('全库可批注行数锁死 1173（未新增裸 p / li）', annoLines, 1173);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1330 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_ds_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 9 张', d.querySelectorAll('img.fig-img').length, 9);
    check('真实渲染黄框 77 个', d.querySelectorAll('.key-callout').length, 77);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_ds_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
