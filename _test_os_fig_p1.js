/* 操作系统第一批配图（生产者-消费者 / 读者-写者 / 哲学家进餐 /
 * 前趋图 PV / 银行家算法安全性检查）—— 5 张图 + 5 个黄框的契约回归。
 * OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) OS 各节末尾也有「★ 高频真题考点与陷阱」，图必须在 ★ 之前；
 * 2) 图里的数字必须与正文示例同源（0 1 0 / 7 4 3 / (3,3,2) / seat=4 / count 0→1）；
 * 3) 新增块一律 data-fig 或 div，静态可批注行锁死 3660、jsdom 真实 .anno-line 锁死 3668。
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

// [图名, 小节前缀, 图前必须出现的知识点锚点]
const FIGS = [
  ['pc_buffer',   '2.3.5', '口诀：<b>互斥夹紧、资源先行'],
  ['rw_count',    '2.3.5', '读者-写者问题的关键技巧'],
  ['philosopher', '2.3.5', '三种防死锁方案'],
  ['precedence',  '2.4',   '五、前趋图 → PV 操作'],
  ['banker',      '2.5.3', '安全序列(P1,P3,P4,P2,P0)'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图不少于 26 张（精确值见 _test_os_fig_p2）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length >= 26, true);
check('OS 黄框不少于 31 个（精确值见 _test_os_fig_p2）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 31, true);
check('SW 里 OS 自绘图 5 条进预缓存',
  ['pc_buffer', 'rw_count', 'philosopher', 'precedence', 'banker']
    .every(n => sw.includes("'img/os_fig_" + n + ".svg'")), true);
check('笔记 HTML 里不得出现 SVG 专有的 tspan（黄框要用 b）',
  notesRaw.includes('tspan'), false);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/os_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  if (anchorText) {
    const iAnchor = h.indexOf(anchorText);
    check(sec + ' ' + name + ' 紧跟知识点「' + anchorText + '」',
      iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 2200, true);
  }
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// 三张同步图必须按正文顺序排（生产者 → 读者写者 → 哲学家）
{
  const h = nodeHtml('2.3.5');
  const i1 = h.indexOf('os_fig_pc_buffer'), i2 = h.indexOf('os_fig_rw_count'), i3 = h.indexOf('os_fig_philosopher');
  check('2.3.5 三图顺序 = 生产者 → 读者写者 → 哲学家', i1 > 0 && i1 < i2 && i2 < i3, true);
  check('哲学家图在三种防死锁方案之后',
    h.indexOf('三种防死锁方案') < i3, true);
}

// ---- 图与正文同源 ----
const pc = read('pwa/img/os_fig_pc_buffer.svg');
check('生产者-消费者图信号量初值与正文一致（empty=n / full=0 / mutex=1）',
  pc.includes('empty=n') && pc.includes('full=0') && pc.includes('mutex=1') &&
  nodeHtml('2.3.5').includes('mutex=1（互斥访问缓冲区）、empty=n'), true);
check('生产者-消费者图强调 mutex 初值不是 n',
  pc.includes('不是 n') && pc.includes('容量 n 时 mutex 的初值永远是 1'), true);
check('生产者-消费者图讲清先 P(mutex) 的死锁链条',
  pc.includes('死锁') && pc.includes('P(mutex) → P(empty)'), true);

const rw = read('pwa/img/os_fig_rw_count.svg');
check('读者-写者图 count 序列 0→1 / 1→0 与正文一致',
  rw.includes('0→1') && rw.includes('1→0') &&
  nodeHtml('2.3.5').includes('if(count==0) P(rw)') &&
  nodeHtml('2.3.5').includes('count--; if(count==0) V(rw)'), true);
check('读者-写者图点明写者饥饿与 w 门卫',
  rw.includes('饥饿') && rw.includes('门卫'), true);

const ph = read('pwa/img/os_fig_philosopher.svg');
check('哲学家图 seat 初值 4 = n−1 与正文一致',
  ph.includes('seat = 4') && ph.includes('n−1') &&
  nodeHtml('2.3.5').includes('设信号量room=4'), true);
check('哲学家图三种破法与正文一一对应',
  ['限流', '定序', '原子化'].every(t => ph.includes(t)) &&
  ['限制最多4名哲学家', '按编号规定拿筷顺序', '仅当左右两根筷子都空闲'].every(
    t => nodeHtml('2.3.5').includes(t)), true);
check('哲学家图强调破坏的是「循环等待」而非互斥/不可剥夺',
  ph.includes('破坏循环等待条件') && ph.includes('不是破坏互斥') &&
  ph.includes('不可剥夺'), true);

const pr = read('pwa/img/os_fig_precedence.svg');
check('前趋图四边 A/B/C/D 齐全', ['a', 'b', 'c', 'd'].every(t => pr.includes('>' + t + '<')), true);
check('前趋图强调尾 V 头 P 与初值 0',
  pr.includes('初值一律 0') && pr.includes('V(a)') && pr.includes('P(c)'), true);
check('前趋图说明多前驱要多个 P',
  pr.includes('S4 两个前驱'), true);

const bk = read('pwa/img/os_fig_banker.svg');
check('银行家图 T0 三张表数据与正文一致',
  ['7 5 3', '0 1 0', '7 4 3', '3 3 2'].every(t => bk.includes(t)) &&
  nodeHtml('2.5.3').includes('P0(7,5,3)') && nodeHtml('2.5.3').includes('(3,3,2)'), true);
check('银行家图 Work 递推链与正文一致（5,3,2 → 7,4,3 → 7,4,5 → 10,4,7 → 10,5,7）',
  ['5 3 2', '7 4 3', '7 4 5', '10 4 7', '10 5 7'].every(t => bk.includes(t)), true);
check('银行家图安全序列与正文一致',
  bk.includes('P1 → P3 → P4 → P2 → P0'), true);
check('银行家图点明 Available 不能由 Max 列和反推',
  bk.includes('不能由 Max 列和反推') || bk.includes('用 Max 列和反推是错的'), true);
check('银行家图四步请求判定齐全',
  ['合法性', '可用性', '试探分配', '安全性检查'].every(t => bk.includes(t)), true);

// ---- 新图不得含 HTML 标签 ----
for (const n of ['pc_buffer', 'rw_count', 'philosopher', 'precedence', 'banker']) {
  const s = read('pwa/img/os_fig_' + n + '.svg');
  check('os_fig_' + n + ' 无 HTML <b>/<br> 标签',
    !/<(b|br|strong|i)\b/.test(s.replace(/<\?xml[^>]*\?>/g, '')), true);
}

// 行号漂移护栏（静态，配对口径 = 开标签口径 = 3660）
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
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 3668 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_os_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图不少于 26 张', d.querySelectorAll('img.fig-img').length >= 26, true);
    check('真实渲染黄框不少于 31 个', d.querySelectorAll('.key-callout').length >= 31, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张（未被覆盖）',
      d.querySelectorAll('figure.struct-fig').length, 14);
    check('新图在 DOM 里都能找到 src',
      ['pc_buffer', 'rw_count', 'philosopher', 'precedence', 'banker']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
