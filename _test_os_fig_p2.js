/* 操作系统第二批配图（调度指标公式 / FCFS-SJF 甘特图 / SRTN-RR / 多级反馈队列）
 * —— 4 张图 + 4 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文例题逐字同源（8.0/8.4/8.8/9.0、2/1/0.5/0.2、
 *    13.5 → 6、P1/P2/P3 到达 0/1/2、19/3 与 22/3、时间片 1/2/4）；
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
  ['sched_metric', '2.2.3', '注意：不存在一种调度算法能同时满足所有目标'],
  ['sched_gantt',  '2.2.5', '验证SJF更优'],
  ['srtn_rr',      '2.2.5', '平均周转＝(13+8+1)/3=22/3≈7.33'],
  ['mlfq',         '2.2.5', '缺点：算法最复杂，实现开销大'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图 30 张（26 + 本批 4）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length, 30);
check('OS 黄框 35 个（31 + 本批 4）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 35);
check('SW 里第二批 4 图进预缓存',
  ['sched_metric', 'sched_gantt', 'srtn_rr', 'mlfq']
    .every(n => sw.includes("'img/os_fig_" + n + ".svg'")), true);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/os_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  const iAnchor = h.indexOf(anchorText);
  check(sec + ' ' + name + ' 紧跟知识点「' + anchorText + '」',
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 900, true);
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// 2.2.5 三图顺序：SJF 甘特图 → SRTN/RR → 多级反馈队列
{
  const h = nodeHtml('2.2.5');
  const i1 = h.indexOf('os_fig_sched_gantt'), i2 = h.indexOf('os_fig_srtn_rr'), i3 = h.indexOf('os_fig_mlfq');
  check('2.2.5 三图顺序 = SJF → SRTN/RR → MLFQ', i1 > 0 && i1 < i2 && i2 < i3, true);
}

// ---- 图与正文同源 ----
const met = read('pwa/img/os_fig_sched_metric.svg');
check('指标图三个公式齐全', ['周转时间 = 完成时间 − 到达时间', '等待时间 = 周转时间 − 运行时间',
  '响应时间 = 首次开始运行 − 到达'].every(t => met.includes(t)), true);
check('指标图强调带权周转 ≥ 1', met.includes('一定 ≥ 1'), true);
check('指标图与正文定义一致（等待 = 周转 − 运行）',
  met.includes('（= 周转 − 运行）') &&
  nodeHtml('2.2.3').includes('等待时间＝周转时间－实际运行时间'), true);

const gan = read('pwa/img/os_fig_sched_gantt.svg');
check('甘特图四个作业运行时间与正文一致（2 / 1 / 0.5 / 0.2）',
  ['J1（2）', 'J2（1）', 'J3', 'J4'].every(t => gan.includes(t)) &&
  nodeHtml('2.2.5').includes('运行时间依次为2、1、0.5、0.2'), true);
check('甘特图带权周转 13.5 / 6 与正文一致',
  gan.includes('13.5') && gan.includes('>6<') &&
  nodeHtml('2.2.5').includes('13.5') && nodeHtml('2.2.5').includes('3.525'), true);
check('甘特图平均值 1.575 / 1.175 与正文一致',
  gan.includes('1.575') && gan.includes('1.175') &&
  nodeHtml('2.2.5').includes('1.575') && nodeHtml('2.2.5').includes('1.175'), true);
check('甘特图黄框点明 SJF 最优的前提是同时到达',
  nodeHtml('2.2.5').includes('所有作业<b>同时到达</b>') &&
  nodeHtml('2.2.5').includes('SJF「最优」有前提'), true);

const sr = read('pwa/img/os_fig_srtn_rr.svg');
check('SRTN/RR 图进程参数与正文一致（到达 0/1/2、运行 8/4/1）',
  sr.includes('8/4/1') && nodeHtml('2.2.5').includes('运行时间分别为8、4、1'), true);
check('SRTN/RR 图平均周转 19/3 与 22/3 与正文一致',
  sr.includes('19/3') && sr.includes('22/3') &&
  nodeHtml('2.2.5').includes('19/3') && nodeHtml('2.2.5').includes('22/3'), true);
check('SRTN/RR 图完成时刻与正文一致（P1=13 / P2=6,9 / P3=3）',
  sr.includes('P1 = 13') && sr.includes('P2 = 6') && sr.includes('P2 = 9'), true);
check('SRTN/RR 图与黄框强调时间片两个极端',
  nodeHtml('2.2.5').includes('退化成 FCFS') && nodeHtml('2.2.5').includes('上下文切换开销') &&
  sr.includes('每跑 1 个单位'), true);

const ml = read('pwa/img/os_fig_mlfq.svg');
check('MLFQ 图三级时间片 1/2/4 与正文一致',
  ml.includes('时间片 1') && ml.includes('时间片 2') && ml.includes('时间片 4') &&
  nodeHtml('2.2.5').includes('第i+1级时间片是第i级的2倍'), true);
check('MLFQ 图强调新进程进第 1 级且立即抢占',
  ml.includes('新进程一律先放这里') && ml.includes('立即抢占') &&
  nodeHtml('2.2.5').includes('新进程创建后首先放入'), true);
check('MLFQ 图说明不饿死长作业的原因', ml.includes('不饿死') && ml.includes('不会被饿死'), true);

for (const n of ['sched_metric', 'sched_gantt', 'srtn_rr', 'mlfq']) {
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
  console.log('_test_os_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 30 张', d.querySelectorAll('img.fig-img').length, 30);
    check('真实渲染黄框 35 个', d.querySelectorAll('.key-callout').length, 35);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 14 张', d.querySelectorAll('figure.struct-fig').length, 14);
    check('新图在 DOM 里都能找到 src',
      ['sched_metric', 'sched_gantt', 'srtn_rr', 'mlfq']
        .every(n => !!d.querySelector('img[src*="os_fig_' + n + '"]')), true);

    console.log('_test_os_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
