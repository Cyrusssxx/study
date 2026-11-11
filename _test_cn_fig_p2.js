/* 计算机网络第二批配图（曼彻斯特编码波形 / 时延四分量 / 隐藏终端与 RTS-CTS /
 * PPP 帧与字节填充 / TCP 快重传）—— 5 张图 + 5 个黄框的契约回归。CN 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) CN 各节末尾也有「★ 高频真题考点与陷阱」，图必须在 ★ 之前；
 * 2) 图里的数字/约定必须与正文示例同源（曼彻斯特「高→低=1」、PPP 的 7D 5E 转义、
 *    快重传「1 正常 + 3 冗余」）；
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
  ['delay_4',       '1.1.6', '瓶颈原理'],
  ['encoding_wave', '2.1.3', '也需 2 倍带宽'],
  ['csma_ca',       '3.6.3', '实际很少用'],
  ['ppp_frame',     '3.7.2', '7D 5E 等转义规则'],
  ['tcp_fastretx',  '5.3.4', '同时也被用于拥塞控制'],
];

check('序列化仍是 CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('CN 配图 >= 19 张（第二批下限，精确总量见 _test_cn_fig_p3）',
  (notesRaw.match(/fig-img/g) || []).length >= 19, true);
check('CN 黄框 >= 18 个（第二批下限）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 18, true);
check('SW 里 CN 图 >= 19 条', (sw.match(/'img\/cn_fig_[^']+'/g) || []).length >= 19, true);
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
      iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1400, true);
  }
  // 图块必须整体带 data-fig（否则会被行号器标号）
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// ---- 图与正文同源 ----
const enc = read('pwa/img/cn_fig_encoding_wave.svg');
check('编码波形图用正文约定「高→低 = 1、低→高 = 0」',
  enc.includes('高→低') && enc.includes('低→高') &&
  nodeHtml('2.1.3').includes('高→低代表 1'), true);
check('编码波形图画的比特串与标题一致（0100110）',
  enc.includes('0 1 0 0 1 1 0'), true);
check('编码波形图明确「码元率是比特率 2 倍」',
  enc.includes('2 倍') && enc.includes('带宽'), true);

const dly = read('pwa/img/cn_fig_delay_4.svg');
check('时延图四分量齐全（发送/传播/处理/排队）',
  ['发送', '传播', '处理', '排队'].every(t => dly.includes(t)), true);
check('时延图给出时延带宽积 = 5000 bit',
  dly.includes('5000 bit') && dly.includes('传播时延 × 带宽'), true);
check('时延图不含「带宽能缩短传播时延」的错误说法',
  dly.includes('提高带宽不能缩短传播时延'), true);

const ca = read('pwa/img/cn_fig_csma_ca.svg');
check('CSMA/CA 图含隐藏终端 + RTS/CTS + DCF',
  ['隐藏终端', 'RTS', 'CTS'].every(t => ca.includes(t)) &&
  nodeHtml('3.6.3').includes('隐藏终端'), true);
check('CSMA/CA 图点明「无线无法边发边听」',
  ca.includes('边发边听') || ca.includes('听不到'), true);

const ppp = read('pwa/img/cn_fig_ppp_frame.svg');
check('PPP 图转义规则与正文一致（7D 5E / 7D 5D）',
  ppp.includes('7D 5E') && ppp.includes('7D 5D') &&
  nodeHtml('3.7.2').includes('7D 5E'), true);
check('PPP 图三阶段顺序 LCP → 认证 → NCP',
  ppp.indexOf('① LCP') < ppp.indexOf('② 认证') &&
  ppp.indexOf('② 认证') < ppp.indexOf('③ NCP'), true);
check('PPP 图字段含固定值 FF / 03',
  ppp.includes('FF') && ppp.includes('03'), true);

const fr = read('pwa/img/cn_fig_tcp_fastretx.svg');
check('快重传图给出 3 个冗余 ACK 与最终 ACK 6',
  fr.includes('冗余 3') && fr.includes('ACK 6'), true);
check('快重传图强调「一共 4 个确认」',
  fr.includes('4 个对 1 号段的确认'), true);
check('快重传图例子与正文一致（发 1~5、2 号丢失）',
  fr.includes('2 —— 丢失') && nodeHtml('5.3.4').includes('2 号丢失'), true);

// ---- 所有新图不得含 HTML 标签（SVG 里加粗只能 tspan） ----
for (const n of ['encoding_wave', 'delay_4', 'csma_ca', 'ppp_frame', 'tcp_fastretx']) {
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
  console.log('_test_cn_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染配图 >= 19 张', d.querySelectorAll('img.fig-img').length >= 19, true);
    check('真实渲染黄框 >= 18 个', d.querySelectorAll('.key-callout').length >= 18, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('.anno-line')]
        .filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('内联 struct-fig 仍是 11 张（未被覆盖）',
      d.querySelectorAll('figure.struct-fig').length, 11);
    check('新图在 DOM 里都能找到 src',
      ['encoding_wave', 'delay_4', 'csma_ca', 'ppp_frame', 'tcp_fastretx']
        .every(n => !!d.querySelector('img[src*="cn_fig_' + n + '"]')), true);

    console.log('_test_cn_fig_p2: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
