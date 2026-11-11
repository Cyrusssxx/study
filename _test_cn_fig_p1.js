/* 计算机网络第一批配图（CRC / GBN-SR / 信道利用率 / CSMA-CD / 以太网帧 / 交换机自学习 /
 * TCP 四次挥手 / TCP 拥塞窗口）—— 8 张图 + 8 个黄框的契约回归。CN 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) CN 各节末尾也有「★ 高频真题考点与陷阱」，图必须在 ★ 之前；
 * 2) 5.3.3 / 5.3.6 段落里已有内联 <figure class="struct-fig">，新图必须接在内联图之后，
 *    否则会把「四次挥手 / 拥塞控制」的内联示意图和正文说明隔开；
 * 3) 图里的数字必须与正文示例同源：CRC 用 101001 ÷ 1101 → 余 001，
 *    拥塞控制用 cwnd=24 超时 → ssthresh=12，以太网最小帧 64 B / 最大 1518 B。
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
  ['crc',          '3.3.1', '被除数 = 数据左移 r 位'],
  ['gbn_sr',       '3.4.1', 'NAK（否定确认）'],
  ['channel_util', '3.4.1', 'Q149 2020'],
  ['csma_cd',      '3.5.2', '不足的短数据要'],
  ['eth_frame',    '3.6.2', '不足填充'],
  ['switch_learn', '3.8.2', '此后 A↔B 皆单播直达'],
  ['tcp_wave',     '5.3.3', '两次握手不能防止失效的旧连接请求'],
  ['tcp_cwnd',     '5.3.6', 'AIMD 思想'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('CN 配图 >= 14 张（第一批下限，精确总量见 _test_cn_fig_p2）',
  (notesRaw.match(/fig-img/g) || []).length >= 14, true);
check('CN 黄框 >= 13 个（第一批下限）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 13, true);
check('SW 里 CN 图 >= 14 条', (sw.match(/'img\/cn_fig_[^']+'/g) || []).length >= 14, true);
check('笔记 HTML 里不得出现 SVG 专有的 tspan（黄框要用 b）',
  notesRaw.includes('tspan'), false);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/cn_fig_' + name + '.svg';
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

  const svg = read('pwa/img/cn_fig_' + name + '.svg');
  check(name + ' SVG 有 viewBox 与白底',
    svg.includes('viewBox="0 0 680 ') && svg.includes('fill="#ffffff"'), true);
  const svgNoNs = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  check(name + ' SVG 无外链 / 无脚本',
    /<script|https?:\/\/|xlink:href|href="http|<image\b/.test(svgNoNs), false);
  check(name + ' SVG 无 HTML 标签（b/br/p/div/span）',
    /<(?:b|br|p|div|span|strong|i|em)\b/.test(svg), false);
  check(name + ' 无 font-size="0" 占位残留', svg.includes('font-size="0"'), false);
  check(name + ' 加粗用 tspan 而非 b 标签', /<tspan[^>]*font-weight="700"/.test(svg), true);
  check(name + ' SW DATA_PRECACHE 收录', sw.includes("'img/cn_fig_" + name + ".svg'"), true);
  check(name + ' 本地文件存在',
    fs.existsSync(path.join(ROOT, 'pwa/img/cn_fig_' + name + '.svg')), true);
}

// ---- 图与正文示例必须同源 ----
const crcSvg = read('pwa/img/cn_fig_crc.svg');
check('CRC 图用正文的 101001 / 1101',
  [crcSvg.includes('101001'), crcSvg.includes('1101')], [true, true]);
check('CRC 图余数 001 与正文一致',
  [crcSvg.includes('001'), nodeHtml('3.3.1').includes('001')], [true, true]);

const cwndSvg = read('pwa/img/cn_fig_tcp_cwnd.svg');
check('拥塞控制图用正文的 ssthresh=16 → 12',
  [cwndSvg.includes('16'), cwndSvg.includes('12')], [true, true]);
check('拥塞控制图 cwnd=24 超时与正文一致',
  [cwndSvg.includes('24'), nodeHtml('5.3.6').includes('cwnd=24') ||
    nodeHtml('5.3.6').includes('cwnd=24 时')], [true, true]);

const ethSvg = read('pwa/img/cn_fig_eth_frame.svg');
check('以太网帧图 64 / 1518 / 46 与正文一致',
  ['64', '1518', '46'].every(t => ethSvg.includes(t)) &&
  nodeHtml('3.6.2').includes('64~1518'), true);

const csmaSvg = read('pwa/img/cn_fig_csma_cd.svg');
check('CSMA/CD 图 51.2 μs、512 bit、64 B 与正文一致',
  ['51.2', '512', '64'].every(t => csmaSvg.includes(t)) &&
  nodeHtml('3.5.2').includes('51.2'), true);

check('四次挥手图含 2MSL 与 TIME_WAIT',
  ['2MSL', 'TIME_WAIT', 'FIN'].every(t => read('pwa/img/cn_fig_tcp_wave.svg').includes(t)), true);
check('GBN/SR 图含窗口上限 2ⁿ−1',
  read('pwa/img/cn_fig_gbn_sr.svg').includes('2ⁿ − 1'), true);
check('交换机图用正文的 A(端口1) / B(端口3)',
  read('pwa/img/cn_fig_switch_learn.svg').includes('端口 1') &&
  read('pwa/img/cn_fig_switch_learn.svg').includes('端口 3'), true);

// ---- 内联示意图与新图的先后顺序（5.3.3 / 5.3.6 特有） ----
for (const sec of ['5.3.3', '5.3.6']) {
  const h = nodeHtml(sec);
  check(sec + ' 新图在内联 struct-fig 之后',
    h.indexOf('</figure>') < h.indexOf('img/cn_fig_' + (sec === '5.3.3' ? 'tcp_wave' : 'tcp_cwnd')), true);
}

// 行号漂移护栏（静态，配对口径 = 开标签口径 = 1108）
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
check('全库可批注行数锁死 1108（未新增裸 p / li）', annoLines, 1108);
check('图片引用全部落在 pwa/img 内', [...notesRaw.matchAll(/src=\\"(img\/[^\\"]+)\\"/g)]
  .every(m => fs.existsSync(path.join(ROOT, 'pwa') + '/' + m[1])), true);

// ---- 运行时硬护栏：jsdom 真实渲染 .anno-line 仍是 1220 ----
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb，跳过运行时行号校验');
  console.log('_test_cn_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 >= 14 张', d.querySelectorAll('img.fig-img').length >= 14, true);
    check('真实渲染黄框 >= 13 个', d.querySelectorAll('.key-callout').length >= 13, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 11 张（未被覆盖）',
      d.querySelectorAll('figure.struct-fig').length, 11);
    console.log('_test_cn_fig_p1: ' + pass + ' passed, ' + fail + ' failed');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })();
}
