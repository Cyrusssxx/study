/* 操作系统第七批配图（第 1 章：双模式 / 中断异常返回点 / 系统调用四步 / 两类 VMM）
 * —— 4 张图 + 4 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图必须与正文同源：0=内核态 / 1=用户态、IRET、返回第 i 条 vs 第 i+1 条、
 *    传参→Trap→服务例程→返回用户态、ESXi/Xen 与 Workstation/VirtualBox，全部照抄正文；
 * 2) 图必须在 ★ 真题汇总之前，且紧跟各自知识点（不隔开正文）；
 * 3) 静态可批注行锁死 3660、jsdom 真实 .anno-line 锁死 3668；
 * 4) 笔记 JSON 里黄框只能写 <b>，禁止出现 <tspan>（SVG 专有，HTML 里加粗失效）。
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

// ---- 1. 文件 / 引用 / SW 三方一致 ----
const FIGS = [
  ['dual_mode', '1.3.2'],
  ['int_type', '1.3.3'],
  ['syscall', '1.3.4'],
  ['vm', '1.6.1'],
];
for (const [n, sec] of FIGS) {
  const p = 'pwa/img/os_fig_' + n + '.svg';
  check('os_fig_' + n + ' 存在', fs.existsSync(path.join(ROOT, p)), true);
  const s = read(p);
  check('os_fig_' + n + ' 是 <svg 开头且带白底',
    s.trim().startsWith('<svg') && /fill="#ffffff"/.test(s), true);
  check('os_fig_' + n + ' 无 HTML 标签（b/br/strong/i）',
    !/<(b|br|strong|i)\b/.test(s), true);
  check('os_fig_' + n + ' 无外链与脚本', !/xlink:href|<script|<image/.test(s), true);
  const h = nodeHtml(sec);
  check(sec + ' 章节内引用 os_fig_' + n, h.indexOf('img/os_fig_' + n + '.svg') >= 0, true);
  check('os_fig_' + n + ' 已进 SW 预缓存',
    sw.indexOf("'img/os_fig_" + n + ".svg'") >= 0, true);
}

// ---- 2. 位置：紧跟知识点、在 ★ 之前、注入点是块级闭合标签之后 ----
const h132 = nodeHtml('1.3.2');
const h133 = nodeHtml('1.3.3');
const h134 = nodeHtml('1.3.4');
const h161 = nodeHtml('1.6.1');

check('1.3.2 图在 ★ 之前',
  h132.indexOf('os_fig_dual_mode.svg') < h132.indexOf('★ 高频真题考点'), true);
check('1.3.2 图在“内核态/用户态比较表”之后',
  h132.indexOf('</table>') < h132.indexOf('os_fig_dual_mode.svg'), true);
check('1.3.3 图在“返回第 i+1 条”段落之后',
  h133.indexOf('对于中断，则在处理完成后返回第i+1条指令继续执行') >= 0 &&
  h133.indexOf('对于中断，则在处理完成后返回第i+1条指令继续执行') < h133.indexOf('os_fig_int_type.svg'), true);
check('1.3.3 图在“中断处理的标准流程”之前',
  h133.indexOf('os_fig_int_type.svg') < h133.indexOf('中断处理的标准流程可概括为'), true);
check('1.3.4 图在四阶段 ol 之后、★ 之前',
  h134.indexOf('正确的执行顺序为') >= 0 &&
  h134.indexOf('正确的执行顺序为') < h134.indexOf('os_fig_syscall.svg') &&
  h134.indexOf('os_fig_syscall.svg') < h134.indexOf('★ 高频真题考点'), true);
check('1.6.1 图在两类 VMM 比较表之后、★ 之前',
  h161.indexOf('比较项') >= 0 &&
  h161.lastIndexOf('</table>', h161.indexOf('os_fig_vm.svg')) >= 0 &&
  h161.indexOf('os_fig_vm.svg') < h161.indexOf('★ 高频真题考点'), true);

// 通用护栏：图块起点前一个标签必须是块级闭合标签（否则 <div> 会把 <p> 提前闭合）
for (const [n, sec] of FIGS) {
  const h = nodeHtml(sec);
  const i = h.indexOf('img/os_fig_' + n + '.svg');
  const capStart = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>', i);
  const prev = h.slice(0, capStart).trimEnd();
  check(sec + ' 图块前一标签是块级闭合标签（不会塞进 <p>/<ol> 内部）',
    !/<\/?(p|ol|ul|table|div|li|h4)$/.test(prev) &&
    /<\/(p|table|ul|ol|div)>$/.test(prev), true);
}

// ---- 3. 同源：图里的数字/结论必须能在正文里找到 ----
const sDual = read('pwa/img/os_fig_dual_mode.svg');
check('双模式图写了 0=内核态 / 1=用户态，与正文一致',
  sDual.indexOf('0 = 内核态') >= 0 && sDual.indexOf('1 = 用户态') >= 0 &&
  h132.indexOf('0表示内核态，1表示用户态') >= 0, true);
check('双模式图区分 IRET 返回与硬件置位',
  sDual.indexOf('IRET') >= 0 && sDual.indexOf('硬件自动保存断点') >= 0 &&
  h132.indexOf('IRET') >= 0 && h132.indexOf('硬件自动从用户态切换至内核态') >= 0, true);
check('双模式图点明访管指令是非特权指令',
  sDual.indexOf('访管指令（Trap）是非特权指令') >= 0 &&
  h132.indexOf('访管指令（Trap指令、陷入指令）是非特权指令') >= 0, true);
check('双模式图点明硬闯特权指令 → 非法指令异常',
  sDual.indexOf('非法指令异常') >= 0 && h132.indexOf('硬件将产生非法指令异常') >= 0, true);

const sInt = read('pwa/img/os_fig_int_type.svg');
check('返回点图的三条返回路径齐全',
  ['第 i 条', 'i + 1', '不返回'].every(t => sInt.indexOf(t) >= 0), true);
check('返回点图与正文的 i / i+1 表述同源',
  h133.indexOf('返回第i条指令重新执行') >= 0 && h133.indexOf('返回第i+1条指令') >= 0, true);
check('返回点图点明终止不可恢复，与正文一致',
  sInt.indexOf('终止') >= 0 && h133.indexOf('不可恢复的致命错误') >= 0, true);
check('返回点图点明软/硬件中断归属',
  sInt.indexOf('故障、自陷 = 软件中断') >= 0 &&
  h133.indexOf('故障、自陷）属于软件中断') >= 0, true);
check('返回点图点明异常一律不可屏蔽',
  sInt.indexOf('异常一律不可屏蔽') >= 0 && h133.indexOf('不可被屏蔽') >= 0, true);

const sSys = read('pwa/img/os_fig_syscall.svg');
check('系统调用图四阶段与正文顺序一致',
  ['① 传参', '② Trap', '③ 查表', '④ IRET'].every(t => sSys.indexOf(t) >= 0) &&
  h134.indexOf('传参→执行陷入指令→执行服务程序→返回用户态') >= 0, true);
check('系统调用图写出硬件/OS 分工，与正文一致',
  sSys.indexOf('硬件（中断隐指令）') >= 0 && sSys.indexOf('OS（内核软件）') >= 0 &&
  h134.indexOf('保存断点和PSW、将CPU模式改为内核态由硬件完成') >= 0, true);
check('系统调用图五类功能齐全',
  ['设备管理', '文件管理', '进程控制', '进程通信', '内存管理'].every(t => sSys.indexOf(t) >= 0) &&
  ['设备管理', '文件管理', '进程控制', '进程通信', '内存管理'].every(t => h134.indexOf(t) >= 0), true);
check('系统调用图保留“非特权指令、用户态执行”这一易错点',
  sSys.indexOf('它是非特权指令') >= 0 && h134.indexOf('陷入指令') >= 0, true);

const sVm = read('pwa/img/os_fig_vm.svg');
check('VMM 图四个产品名与正文一致',
  ['VMware ESXi', 'Xen', 'VMware Workstation', 'VirtualBox'].every(t => sVm.indexOf(t) >= 0) &&
  ['VMware ESXi、Xen', 'VMware Workstation', 'VirtualBox'].every(t => h161.indexOf(t) >= 0), true);
check('VMM 图点明第一类是唯一最高特权级，与正文一致',
  sVm.indexOf('系统中唯一处于最高特权级的软件') >= 0 &&
  h161.indexOf('唯一处于最高特权级') >= 0, true);
check('VMM 图点明第二类 VMM 是用户态进程',
  sVm.indexOf('用户态进程') >= 0 && h161.indexOf('本质上是一个用户态进程') >= 0, true);
check('VMM 图点明客户 OS 处于虚拟内核态',
  sVm.indexOf('虚拟内核态') >= 0 && h161.indexOf('虚拟内核态') >= 0, true);
check('VMM 图点明 VMM 代码量小于完整操作系统',
  sVm.indexOf('代码量') >= 0 && h161.indexOf('代码量通常小于一个完整操作系统') >= 0, true);

// ---- 4. 黄框：一章原本 0 个，这一批补 4 个，且只能写 <b> ----
check('第 1 章四节各有一个黄框',
  [h132, h133, h134, h161].every(h => (h.match(/class="key-callout"/g) || []).length === 1), true);
check('双模式黄框给出三条切换口径',
  h132.indexOf('唯一途径') >= 0 && h132.indexOf('特权指令') >= 0, true);
check('返回点黄框给出“故障回 i / 自陷外中断回 i+1 / 终止不回”口诀',
  h133.indexOf('故障回 i') >= 0 && h133.indexOf('终止不回') >= 0, true);
check('系统调用黄框给出硬件与 OS 的分工',
  h134.indexOf('硬件（中断隐指令）负责保存断点 PC 与 PSW') >= 0 &&
  h134.indexOf('按系统调用号查表') >= 0, true);
check('VMM 黄框给出三条判据',
  h161.indexOf('一定高于') >= 0 && h161.indexOf('VM exit') >= 0 &&
  h161.indexOf('不会</b>直接执行') >= 0, true);
check('笔记 JSON 里没有 SVG 专有的 <tspan>', notesRaw.indexOf('<tspan') < 0, true);
check('黄框内没有塞列表（全库无一先例）',
  (notesRaw.match(/<div class="key-callout">[^<]*(<(?![\/]?b>)[a-z]+)/g) || []).length, 0);

// ---- 5. 总量：旧批次降为下限，最新精确值见 _test_fig_p5 ----
check('OS 配图不少于 51 张',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length >= 51, true);
check('OS 黄框不少于 56 个（精确值见 _test_cn_fix_20261112）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 56, true);
let allFig = 0;
for (const sub of ['co', 'os', 'cn', 'ds']) {
  allFig += (read('pwa/data/notes/' + sub + '_notes.json').match(/class=\\"fig-img\\"/g) || []).length;
}
check('全库 fig-img 不少于 132 张（精确值见 _test_cn_fix_20261112）', allFig >= 132, true);

// 行号漂移护栏（静态 3660，两口径必须同值）
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

// ---- 6. jsdom 真实渲染 ----
let JSDOM, VirtualConsole, IDBFactory, IDBKeyRange;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_os_fig_p7: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图不少于 51 张', d.querySelectorAll('img.fig-img').length >= 51, true);
    check('真实渲染黄框不少于 56 个', d.querySelectorAll('.key-callout').length >= 56, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张', d.querySelectorAll('figure.struct-fig').length, 14);
    check('四张新图在 DOM 里都能找到 src',
      ['dual_mode', 'int_type', 'syscall', 'vm']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p7: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
