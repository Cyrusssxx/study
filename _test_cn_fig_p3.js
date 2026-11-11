/* 计算机网络第三批配图（数据链路层封装成帧 / IPv4 首部 / IP 分片 /
 * RIP 计数到无穷 / TCP 零窗口与坚持定时器）—— 5 张图 + 5 个黄框的契约回归。
 * CN 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) CN 各节末尾也有「★ 高频真题考点与陷阱」，图必须在 ★ 之前；
 * 2) 图里的数字必须与正文示例同源（首部四个单位、分片 480/60/120、
 *    RIP 15 跳 16 不可达、min(rwnd, cwnd)）；
 * 3) 新增图块与黄框都不能带 data-fig 以外的新裸 p / li，静态可批注行须锁死 1108。
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

const notesRaw = read('pwa/data/notes/cn_notes.json');
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
  ['dll_frame',     '3.1.1', '端到端可靠最终仍由传输层保证'],
  ['ipv4_header',   '4.2.1', '变长可选项使首部最长 60B'],
  ['ip_fragment',   '4.2.1', '总数据仍 480'],
  ['rip_count2inf', '4.4.3', '措施：毒性逆转、水平分割、触发更新'],
  ['tcp_zerowin',   '5.3.5', '不为 0 则死锁打破'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('CN 配图 24 张（19 + 本批 5）',
  (notesRaw.match(/fig-img/g) || []).length, 24);
check('CN 黄框 23 个（18 + 本批 5）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 23);
check('SW 里 CN 图 24 条', (sw.match(/'img\/cn_fig_[^']+'/g) || []).length, 24);
check('笔记 HTML 里不得出现 SVG 专有的 tspan（黄框要用 b）',
  notesRaw.includes('tspan'), false);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/cn_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  if (anchorText) {
    const iAnchor = h.indexOf(anchorText);
    check(sec + ' ' + name + ' 紧跟知识点「' + anchorText + '」',
      iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1600, true);
  }
  // 图块必须整体带 data-fig（否则会被行号器标号）
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// ---- 图与正文同源 ----
const dll = read('pwa/img/cn_fig_dll_frame.svg');
check('封装成帧图三层齐全（网络层 / 链路层 / 物理层）',
  ['网络层', '链路层', '物理层'].every(t => dll.includes(t)), true);
check('封装成帧图强调「封装成帧」与「透明传输」是两个问题',
  dll.includes('封装成帧') && dll.includes('透明传输') &&
  nodeHtml('3.1.1').includes('透明传输'), true);
check('封装成帧图点明 FCS 在帧尾、MTU 限制数据部分',
  dll.includes('FCS') && dll.includes('MTU'), true);

const iph = read('pwa/img/cn_fig_ipv4_header.svg');
check('IPv4 首部图四个单位与正文一致（4 B / 1 B / 8 B / 跳数）',
  iph.includes('单位 4 B') && iph.includes('单位 1 B') && iph.includes('单位 8 B') &&
  nodeHtml('4.2.1').includes('以 4 字节为单位') && nodeHtml('4.2.1').includes('以 8 字节为单位'), true);
check('IPv4 首部图协议号与正文一致（6=TCP 17=UDP 1=ICMP）',
  iph.includes('6=TCP') && iph.includes('17=UDP') && iph.includes('1=ICMP'), true);
check('IPv4 首部图含 20 B 定长与 60 B 上限',
  iph.includes('20 字节') && iph.includes('60 B'), true);

const frag = read('pwa/img/cn_fig_ip_fragment.svg');
check('分片图三片数据量 480 / 480 / 420 与正文一致',
  frag.includes('480 B') && frag.includes('420 B') && nodeHtml('4.2.1').includes('420'), true);
check('分片图偏移 0 / 60 / 120 与正文一致',
  frag.includes('偏移 0') && frag.includes('60') && frag.includes('120') &&
  nodeHtml('4.2.1').includes('偏移 60=480/8'), true);
check('分片图强调「每片都要带 20 B 首部」与「重组只在目的主机」',
  frag.includes('每片') && frag.includes('重组只在目的主机'), true);

const rip = read('pwa/img/cn_fig_rip_count2inf.svg');
check('RIP 图给出 16 = 不可达、15 跳上限',
  rip.includes('16') && rip.includes('15') &&
  nodeHtml('4.4.3').includes('最大 15 跳、16 表示不可达'), true);
check('RIP 图三条补救措施齐全（水平分割 / 毒性逆转 / 触发更新）',
  ['水平分割', '毒性逆转', '触发更新'].every(t => rip.includes(t)), true);
check('RIP 图说明成环机理「互相引用」',
  rip.includes('下一跳') && (rip.includes('互相') || rip.includes('学自')), true);

const zw = read('pwa/img/cn_fig_tcp_zerowin.svg');
check('零窗口图写明发送窗口 = min(rwnd, cwnd)',
  zw.includes('min(rwnd, cwnd)') && nodeHtml('5.3.5').includes('min(rwnd, cwnd)'), true);
check('零窗口图含持续计时器与 1 字节探测',
  zw.includes('持续计时器') && zw.includes('1 字节') &&
  nodeHtml('5.3.5').includes('持续计时器'), true);
check('零窗口图 rwnd 序列与正文一致（400 → 300 → 100 → 0）',
  ['400', '300', '100'].every(t => zw.includes(t)) &&
  nodeHtml('5.3.5').includes('400'), true);

// ---- 所有新图不得含 HTML 标签（SVG 里加粗只能 tspan） ----
for (const n of ['dll_frame', 'ipv4_header', 'ip_fragment', 'rip_count2inf', 'tcp_zerowin']) {
  const s = read('pwa/img/cn_fig_' + n + '.svg');
  check('cn_fig_' + n + ' 无 HTML <b>/<br> 标签',
    !/<(b|br|strong|i)\b/.test(s.replace(/<\?xml[^>]*\?>/g, '')), true);
}

// 行号漂移护栏（静态，配对口径 = 开标签口径 = 1108）
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
check('全库可批注行数锁死 1108（配对口径）', annoLines, 1108);
check('全库可批注行数锁死 1108（开标签口径）', annoOpen, 1108);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1220 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_cn_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
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
      url: 'https://x.test/notes.html?subject=cn', virtualConsole: vc,
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
    check('真实渲染 .anno-line 总数 = 1220（已存批注不错位）',
      d.querySelectorAll('.anno-line').length, 1220);
    check('真实渲染配图 24 张', d.querySelectorAll('img.fig-img').length, 24);
    check('真实渲染黄框 23 个', d.querySelectorAll('.key-callout').length, 23);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 11 张（未被覆盖）',
      d.querySelectorAll('figure.struct-fig').length, 11);
    check('新图在 DOM 里都能找到 src',
      ['dll_frame', 'ipv4_header', 'ip_fragment', 'rip_count2inf', 'tcp_zerowin']
        .every(n => !!d.querySelector('img[src*="cn_fig_' + n + '"]')), true);

    console.log('_test_cn_fig_p3: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
