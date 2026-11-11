/* 数据结构第二批配图（第 7 章查找 / 第 8 章排序，原本两章零图）
 * 8 张图 + 8 个黄框的契约回归。DS 精确总量由本文件统管。
 *
 * 关键约束：DS 7/8 章每小节末尾是「★ 高频真题考点与陷阱」整章汇总，
 * 图必须插在目标知识点段落之后、★ 之前 —— 追加到小节末尾会落到错误知识点后面。
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
  ['bsearch_tree',  '7.2.2', 'mid 向下取整时'],
  ['avl_rotate',    '7.3.2', '结果 7 为根、3 和 15 为左右孩子'],
  ['rbtree',        '7.3.3', '最长路径 ≤ 2 × 最短路径'],
  ['btree_split',   '7.4.1', '根分裂则树高 +1'],
  ['hash_collision','7.5.3', '拉链法查到空链表即失败'],
  ['shell_sort',    '8.2.3', '49 与 49* 可能交换先后'],
  ['heap_sort',     '8.4.2', '49 下沉与 76 换'],
  ['loser_tree',    '8.7.3', '放心增大归并路数减少 I/O'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('DS 配图 >= 17 张（第二批下限，精确总量见 _test_ds_fig_p3）',
  (notesRaw.match(/fig-img/g) || []).length >= 17, true);
check('DS 黄框 >= 85 个（第二批下限）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 85, true);
check('SW 里 DS 图 >= 17 条', (sw.match(/'img\/ds_fig_[^']+'/g) || []).length >= 17, true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/ds_fig_' + name + '.svg';
  check(sec + ' 含图 ' + name, h.includes(svgName), true);

  const iAnchor = h.indexOf(anchorText);
  const iFig = h.indexOf(svgName);
  check(sec + ' 图紧跟「' + anchorText + '」', iAnchor >= 0 && iFig > iAnchor, true);

  // 图必须在 ★ 真题汇总之前
  const iStar = h.indexOf('★');
  check(sec + ' 图在「★ 高频真题考点」之前', iStar < 0 || iFig < iStar, true);

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
  check(name + ' 加粗用 tspan 而非 b 标签', /<tspan[^>]*font-weight="700"/.test(svg), true);
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
check('全库可批注行数锁死 1173（配对口径，未新增裸 p / li）', annoLines, 1173);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1330 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_ds_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 >= 17 张', d.querySelectorAll('img.fig-img').length >= 17, true);
    check('真实渲染黄框 >= 85 个', d.querySelectorAll('.key-callout').length >= 85, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    console.log('_test_ds_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
