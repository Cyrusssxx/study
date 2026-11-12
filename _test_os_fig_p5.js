/* 操作系统第五批配图（三种多线程模型 / 虚实地址变换 / 最佳适应 55MB 推演 / 成组链接 / 设备分配四表）
 * —— 5 张图 + 5 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文同源：0x03D4→0x354、0x00F1→0x0B1、0x0229→缺页；55MB/15/30/8/6→9MB；
 *    成组链接 201~7999、每组 100、最末组 99、盘块 7900 → 7901~7999 且首号为 0；
 * 2) 图必须在 ★ 真题汇总之前；4.3.2 的图必须紧贴「示意图：」之前（不隔开成组链接正文）；
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
  ['thread_models', '2.1.7', '三种多线程模型'],
  ['va_translate',  '3.2.9', '三个虚拟地址的分析'],
  ['alloc_algo',    '3.1.2', '剩余最大空闲块即9MB'],
  ['group_link',    '4.3.2', '与超级块的衔接'],
  ['dev_alloc',     '5.2.3', '从时间维度上'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图 43 张（38 + 本批 5）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length, 43);
check('OS 黄框 48 个（43 + 本批 5）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 48);
check('SW 里第五批 5 图进预缓存',
  ['thread_models', 'va_translate', 'alloc_algo', 'group_link', 'dev_alloc']
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
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1500, true);
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// ---- 4.3.2 特殊：图要落在「示意图：」之前，成组链接正文与图不被隔开 ----
const g432 = nodeHtml('4.3.2');
check('4.3.2 成组链接图在原有「示意图：」内联 figure 之前',
  g432.indexOf('img/os_fig_group_link.svg') < g432.indexOf('示意图：'), true);
check('4.3.2 原有内联 struct-fig 仍保留', (g432.match(/figure class="struct-fig"/g) || []).length, 1);

// ---- 图与正文同源 ----
const tm = read('pwa/img/os_fig_thread_models.svg');
check('多线程模型图三模型齐全',
  ['多对一', '一对一', '多对多'].every(t => tm.includes(t)), true);
check('多线程模型图与正文结论同源（内核级线程才是分配单位）',
  tm.includes('处理机分配的真正单位') && nodeHtml('2.1.7').includes('内核级线程才是处理机分配的真正单位'), true);
check('多线程模型图点明一阻全阻',
  tm.includes('一阻全阻') && nodeHtml('2.1.7').includes('一阻全阻'), true);
check('多线程模型图给出 m 与 n 的关系',
  tm.includes('m = 1') && tm.includes('m = n') && tm.includes('m &lt; n') &&
  nodeHtml('2.1.7').includes('n个用户级线程映射到m个内核级线程'), true);

const vt = read('pwa/img/os_fig_va_translate.svg');
check('地址变换图三个物理地址与正文一致（0x354 / 0x0B1 / 缺页）',
  vt.includes('0x354') && vt.includes('0x0B1') && vt.includes('缺页中断') &&
  nodeHtml('3.2.9').includes('物理地址 0x354') && nodeHtml('3.2.9').includes('物理地址 0x0b1'), true);
check('地址变换图的位宽与正文一致（14/12/64B、偏移 6 位、VPN 8 位、PPN 6 位）',
  vt.includes('虚拟地址 14 位') && vt.includes('物理地址 12 位') &&
  nodeHtml('3.2.9').includes('虚拟地址 14 位、物理地址 12 位、页面大小 64B'), true);
check('地址变换图点明 Cache 标记是两段拼接、不连续',
  vt.includes('不连续') && nodeHtml('3.2.9').includes('其中低 4 位为 Cache 索引'), true);
check('地址变换图强调缺页返回后重执行当前指令',
  vt.includes('再重执行') && nodeHtml('3.2.9').includes('重新执行引发缺页的指令'), true);
check('正文 0x03d4 的二进制已按 14 位写全',
  nodeHtml('3.2.9').includes('00 0011 1101 0100'), true);

const aa = read('pwa/img/os_fig_alloc_algo.svg');
check('分配算法图用 2010 真题的 55MB / 15 / 30 / 8 / 6 数据',
  aa.includes('55MB') && aa.includes('分配 15MB') && aa.includes('分配 30MB') &&
  aa.includes('分配 8MB') && aa.includes('分配 6MB') &&
  nodeHtml('3.1.2').includes('主存55MB（初始为空）'), true);
check('分配算法图结论 9MB 与正文一致',
  aa.includes('9MB') && nodeHtml('3.1.2').includes('最大空闲分区大小为9MB'), true);
check('分配算法图四算法与正文一致',
  ['首次适应', '邻近适应', '最佳适应', '最坏适应'].every(t => aa.includes(t) && nodeHtml('3.1.2').includes(t)), true);
check('分配算法图点明只有 FF 回收后不必重排',
  aa.includes('不必重排') && nodeHtml('3.1.2').includes('无须对空闲分区链重新排序'), true);
check('分配算法图强调外部碎片',
  aa.includes('外部碎片') && nodeHtml('3.1.2').includes('外部碎片'), true);

const gl = read('pwa/img/os_fig_group_link.svg');
check('成组链接图分组数据与正文一致（201~7999、每组 100、最末 99）',
  gl.includes('201~7999') && gl.includes('每组 100') && gl.includes('99') &&
  nodeHtml('4.3.2').includes('201～7999号盘块') && nodeHtml('4.3.2').includes('7901～7999号（共99个盘块）'), true);
check('成组链接图索引块衔接与正文一致（300→301~400、400→401~500、7900→7901~7999）',
  gl.includes('301, …, 400') && gl.includes('401, …, 500') && gl.includes('7901, …, 7999') &&
  nodeHtml('4.3.2').includes('盘块300的内容是第二组301～400'), true);
check('成组链接图点明首号为 0 表示链结束',
  gl.includes('首号 0') && gl.includes('链结束') && nodeHtml('4.3.2').includes('第一个盘块号记为'), true);
check('成组链接图强调索引块在组末不在组首',
  gl.includes('组末') && nodeHtml('4.3.2').includes('组末'), true);

const da = read('pwa/img/os_fig_dev_alloc.svg');
check('设备分配图四表齐全且寻访顺序正确',
  ['SDT', 'DCT', 'COCT', 'CHCT'].every(t => da.includes(t)) &&
  nodeHtml('5.2.3').includes('SDT→DCT→COCT→CHCT'), true);
check('设备分配图点明三者全成功才能启动 I/O',
  da.includes('三者全部成功') && nodeHtml('5.2.3').includes('三者均分配成功'), true);
check('设备分配图三条等待队列齐全',
  ['设备等待队列', '控制器等待队列', '通道等待队列'].every(t => da.includes(t)), true);
check('设备分配图点明独占设备静态分配避免死锁',
  da.includes('静态分配') && nodeHtml('5.2.3').includes('静态分配'), true);

for (const n of ['thread_models', 'va_translate', 'alloc_algo', 'group_link', 'dev_alloc']) {
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
  console.log('_test_os_fig_p5: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 43 张', d.querySelectorAll('img.fig-img').length, 43);
    check('真实渲染黄框 48 个', d.querySelectorAll('.key-callout').length, 48);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张', d.querySelectorAll('figure.struct-fig').length, 14);
    check('新图在 DOM 里都能找到 src',
      ['thread_models', 'va_translate', 'alloc_algo', 'group_link', 'dev_alloc']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p5: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
