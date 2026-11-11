/* 操作系统第三批配图（三算法逐次帧内容 / Belady 异常 / CLOCK / 分配-置换四组合）
 * —— 4 张图 + 4 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文逐字同源：引用串 7,0,1,2,0,3,0,4,2,3,0,3,2 → 10/9/7 与 7/6/4；
 *    Belady 串 1,2,3,4,1,2,5,1,2,3,4,5 → 9 与 10；
 * 2) 图必须在 ★ 真题汇总之前；
 * 3) 静态可批注行锁死 3660、jsdom 真实 .anno-line 锁死 3668。
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

const notesRaw = read('pwa/data/notes/os_notes.json');
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
  ['belady',       '3.2.4', '典型例子：页面访问序列'],
  ['page_replace', '3.2.4', '手算答题规范：遇到置换算法题'],
  ['clock',        '3.2.4', '淘汰优先级依次为：(0,0)→(0,1)→(1,0)→(1,1)'],
  ['alloc_policy', '3.2.3', '注意：理论上可形成四种组合，但固定＋全局互斥'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图 34 张（30 + 本批 4）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length, 34);
check('OS 黄框 39 个（35 + 本批 4）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 39);
check('SW 里第三批 4 图进预缓存',
  ['page_replace', 'belady', 'clock', 'alloc_policy']
    .every(n => sw.includes("'img/os_fig_" + n + ".svg'")), true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/os_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★ 高频真题考点');   // 正文里 ★ 也作「置换缺页」符号，必须带标题
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  const iAnchor = h.indexOf(anchorText);
  check(sec + ' ' + name + ' 紧跟知识点「' + anchorText + '」',
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 900, true);
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// 3.2.4 顺序：Belady（FIFO 段）→ CLOCK（改进型段）→ 三算法手算表（答题规范后）
{
  const h = nodeHtml('3.2.4');
  const iB = h.indexOf('os_fig_belady'), iC = h.indexOf('os_fig_clock'), iP = h.indexOf('os_fig_page_replace');
  check('3.2.4 三图顺序 = Belady → CLOCK → 手算表', iB > 0 && iB < iC && iC < iP, true);
}

// ---- 图与正文同源 ----
const pr = read('pwa/img/os_fig_page_replace.svg');
check('手算表引用串与正文一致（7,0,1,2,0,3,0,4,2,3,0,3,2）',
  ['7', '2', '3'].every(t => pr.includes('>' + t + '<')) &&
  nodeHtml('3.2.4').includes('引用串7,0,1,2,0,3,0,4,2,3,0,3,2'), true);
check('手算表缺页/置换数与正文一致（10/7、9/6、7/4）',
  pr.includes('缺页 10 / 置换 7') && pr.includes('缺页 9 / 置换 6') && pr.includes('缺页 7 / 置换 4') &&
  nodeHtml('3.2.4').includes('FIFO缺页10次/置换7次') &&
  nodeHtml('3.2.4').includes('LRU缺页9次/置换6次') &&
  nodeHtml('3.2.4').includes('OPT缺页7次/置换4次'), true);
check('手算表点明置换次数 = 缺页 − 帧数', pr.includes('置换次数 = 缺页次数 − 帧数'), true);
check('手算表点明 LRU 与 OPT 相同只是巧合',
  pr.includes('没有必然联系') && nodeHtml('3.2.4').includes('LRU与OPT并无必然联系'), true);

const bl = read('pwa/img/os_fig_belady.svg');
check('Belady 图两条序列的缺页数 9 / 10 与正文一致',
  bl.includes('缺页 9 次') && bl.includes('缺页 10 次') &&
  nodeHtml('3.2.4').includes('分配3帧时缺页9次') &&
  nodeHtml('3.2.4').includes('分配4帧时缺页反而增至10次'), true);
check('Belady 图点明只有 FIFO 会、LRU/OPT 是栈式算法',
  bl.includes('只有 FIFO 会这样') && bl.includes('栈式算法') &&
  nodeHtml('3.2.4').includes('只有FIFO可能出现Belady异常'), true);

const ck = read('pwa/img/os_fig_clock.svg');
check('CLOCK 图四类 (A,M) 组合齐全',
  ['(A=0, M=0)', '(A=0, M=1)', '(A=1, M=0)', '(A=1, M=1)'].every(t => ck.includes(t)), true);
check('CLOCK 图淘汰顺序与正文一致',
  ck.includes('(0,0) → (0,1) → (1,0) → (1,1)') &&
  nodeHtml('3.2.4').includes('淘汰优先级依次为：(0,0)→(0,1)→(1,0)→(1,1)'), true);
check('CLOCK 图强调少一次磁盘写回', ck.includes('少一次磁盘写回') || ck.includes('少写回'), true);

const ap = read('pwa/img/os_fig_alloc_policy.svg');
check('四组合图四种组合齐全',
  ['固定 + 局部', '固定 + 全局', '可变 + 局部', '可变 + 全局'].every(t => ap.includes(t)), true);
check('四组合图点明固定+全局不可行',
  ap.includes('理论上不可行') && nodeHtml('3.2.3').includes('理论上不可行'), true);
check('四组合图给出工作集 ⊆ 驻留集',
  ap.includes('工作集 ⊆ 驻留集') && nodeHtml('3.2.3').includes('驻留集'), true);
check('四组合图最小页框数 2/3/6 与正文一致',
  ap.includes('2 帧') && ap.includes('3 帧') && ap.includes('6 个页面') &&
  nodeHtml('3.2.3').includes('最小为2个页框'), true);

for (const n of ['page_replace', 'belady', 'clock', 'alloc_policy']) {
  const s = read('pwa/img/os_fig_' + n + '.svg');
  check('os_fig_' + n + ' 无 HTML <b>/<br> 标签',
    !/<(b|br|strong|i)\b/.test(s.replace(/<\?xml[^>]*\?>/g, '')), true);
}

// 行号漂移护栏（静态 3660）
let annoLines = 0, annoOpen = 0;
for (const c of notes.chapters) {
  for (const s of c.sections || []) {
    for (const x of [s].concat(s.subsections || [])) {
      const h = x.html || '';
      (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => {
        if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++;
      });
      annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
      (h.match(/<p\b[^>]*>/g) || []).forEach(t => {
        if (!/data-fig/.test(t)) annoOpen++;
      });
      annoOpen += (h.match(/<li\b[^>]*>/g) || []).length;
    }
  }
}
check('全库可批注行数锁死 3660（配对口径）', annoLines, 3660);
check('全库可批注行数锁死 3660（开标签口径）', annoOpen, 3660);

let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_os_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
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
      url: 'https://x.test/notes.html?subject=os', virtualConsole: vc,
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
    check('真实渲染 .anno-line 总数 = 3668（已存批注不错位）',
      d.querySelectorAll('.anno-line').length, 3668);
    check('真实渲染配图 34 张', d.querySelectorAll('img.fig-img').length, 34);
    check('真实渲染黄框 39 个', d.querySelectorAll('.key-callout').length, 39);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张', d.querySelectorAll('figure.struct-fig').length, 14);
    check('新图在 DOM 里都能找到 src',
      ['page_replace', 'belady', 'clock', 'alloc_policy']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
