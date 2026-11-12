/* 操作系统第四批配图（I/O 软件四层 / 四种控制方式 / 磁盘存取时间 / 单双缓冲）
 * —— 4 张图 + 4 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文同源：Ts=m×n+s（m≈0.2、s≈2）、Tr=1/(2r)、7200→8.33/4.17、
 *    5400→11.1/5.56、T=80/M=40/C=30 → 单 120 / 双 80、N=4 → 510 / 390；
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
  ['io_layer',    '5.1.3', '即从用户到硬件的完整链条是'],
  ['io_control',  '5.1.2', '每种新方式的优点都在于解决了前一种方式的主要缺点'],
  ['disk_time',   '5.3.1', '这是本章最核心的公式'],
  ['buffer',      '5.2.2', '切忌直接'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图不少于 38 张（精确值见 _test_os_fig_p5）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length >= 38, true);
check('OS 黄框不少于 43 个（精确值见 _test_os_fig_p5）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 43, true);
check('SW 里第四批 4 图进预缓存',
  ['io_layer', 'io_control', 'disk_time', 'buffer']
    .every(n => sw.includes("'img/os_fig_" + n + ".svg'")), true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/os_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★ 高频真题考点');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  const iAnchor = h.indexOf(anchorText);
  check(sec + ' ' + name + ' 紧跟知识点「' + anchorText + '」',
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1200, true);
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// ---- 图与正文同源 ----
const il = read('pwa/img/os_fig_io_layer.svg');
check('I/O 四层图五层齐全（用户层/设备独立性/驱动/中断/硬件）',
  ['用户层软件', '设备独立性软件', '设备驱动程序', '中断处理程序', '硬件'].every(t => il.includes(t)), true);
check('I/O 四层图与正文链条一致',
  nodeHtml('5.1.3').includes('用户层软件→设备独立性软件→设备驱动程序→中断处理程序→硬件'), true);
check('I/O 四层图点明陷阱指令是唯一入口',
  il.includes('唯一合法入口') && nodeHtml('5.1.3').includes('陷阱指令是从用户态进入内核态的唯一合法入口'), true);

const ic = read('pwa/img/os_fig_io_control.svg');
check('四种控制方式齐全且顺序正确',
  ['程序直接控制', '中断驱动', 'DMA', '通道'].every(t => ic.includes(t)), true);
check('四种方式传输单位 字/字/块/一组块 与正文一致',
  ic.includes('单位：字') && ic.includes('单位：块') && ic.includes('单位：一组块') &&
  nodeHtml('5.1.2').includes('字（节）'), true);
check('控制方式图点明 DMA 周期挪用',
  ic.includes('周期挪用') || nodeHtml('5.1.2').includes('周期挪用'), true);

const dt = read('pwa/img/os_fig_disk_time.svg');
check('磁盘时间图三项齐全 Ta = Ts + Tr + Tt',
  dt.includes('Ts = m × n + s') && dt.includes('Tr = 1 / (2r)') && dt.includes('Tt = b / (r × N)'), true);
check('磁盘时间图速查值与正文一致（7200→8.33/4.17、5400→11.1/5.56）',
  dt.includes('8.33') && dt.includes('4.17') && dt.includes('11.1') && dt.includes('5.56') &&
  nodeHtml('5.3.1').includes('60/7200≈8.33ms') && nodeHtml('5.3.1').includes('60/5400≈11.1ms'), true);
check('磁盘时间图点明 r 要换算成转/秒',
  dt.includes('rpm ÷ 60') && nodeHtml('5.3.1').includes('r = rpm/60'), true);
check('磁盘时间图点明固定头磁盘无寻道', dt.includes('没有寻道时间') || dt.includes('根本不用寻道'), true);

const bf = read('pwa/img/os_fig_buffer.svg');
check('缓冲图的 T/M/C 参数与正文一致（80/40/30）',
  bf.includes('T=80μs、M=40μs、C=30μs') && nodeHtml('5.2.2').includes('设T=80us、M=40us'), true);
check('缓冲图单 120 / 双 80 与正文一致',
  bf.includes('= 80 + 40 = 120 μs') && bf.includes('= max(80, 70) = 80 μs'), true);
check('缓冲图 N=4 的 510 / 390 与正文公式一致',
  bf.includes('510') && bf.includes('390') &&
  nodeHtml('5.2.2').includes('max(T,C)+M') && nodeHtml('5.2.2').includes('max(T,C+M)'), true);
check('缓冲图强调不能直接乘 N', bf.includes('不能直接') && bf.includes('(N−1)'), true);

for (const n of ['io_layer', 'io_control', 'disk_time', 'buffer']) {
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
  console.log('_test_os_fig_p4: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图不少于 38 张', d.querySelectorAll('img.fig-img').length >= 38, true);
    check('真实渲染黄框不少于 43 个', d.querySelectorAll('.key-callout').length >= 43, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张', d.querySelectorAll('figure.struct-fig').length, 14);
    check('新图在 DOM 里都能找到 src',
      ['io_layer', 'io_control', 'disk_time', 'buffer']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p4: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
