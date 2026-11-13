/* 2026-11-13 第十三批（继续 CO / OS / CN 三科）：5 张自绘图 + 2 个判据黄框，全部落在零图小节。
 * 图：CN 4.1.1 异构网络互连分层屏蔽 · CN 1.2.2 协议水平/服务垂直/SAP · CN 3.8.3 共享式以太网带宽 1/N ·
 *     CO 6.1.3 总线带宽乘法链 · CO 4.2.1 相对转移以取指后的 PC 为基准。
 * 判据框：CN 4.1.1 IP 首部三把尺子 · CN 1.2.2 服务的三组分类。
 * 锁精确总量：fig-img 182（co43/os65/cn43/ds31）、黄框 310（74/77/53/106）。
 * 行号双基线（本批零漂移）：CO 1819 / OS 3660 / CN 1108 / DS 1173·1175；jsdom 1971 / 3668 / 1220 / 1330。
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
const SUBS = ['co', 'os', 'cn', 'ds'];
const RAW = {}, DOC = {};
for (const s of SUBS) {
  RAW[s] = read('pwa/data/notes/' + s + '_notes.json');
  DOC[s] = JSON.parse(RAW[s]);
}
const sw = read('pwa/sw.js');
const css = read('pwa/css/style.css');
const flat = s => s.replace(/\s+/g, '').replace(/[−–—]/g, '-')
  .replace(/[₁₂₃]/g, c => ({ '₁': '1', '₂': '2', '₃': '3' }[c]));
function secHtml(sub, num) {
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || []))
      if (x.section.split(' ')[0] === num) return x.html || '';
  return '';
}
function allHtmls(sub) {
  const a = [];
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) a.push({ key: x.section.split(' ')[0], h: x.html || '' });
  return a;
}
const SVGS = {
  cn: ['cn_fig_hetero', 'cn_fig_proto_svc', 'cn_fig_shared_eth'],
  co: ['co_fig_bus_bw', 'co_fig_pc_rel'],
};
const ALL_SVGS = [].concat(...Object.values(SVGS));
const STAR = '<h4>★ 高频真题考点与陷阱</h4>';

// ---------- 1. 五张 SVG 结构 ----------
for (const name of ALL_SVGS) {
  const p = 'pwa/img/' + name + '.svg';
  check(name + ' 文件存在', fs.existsSync(path.join(ROOT, p)), true);
  const s = read(p);
  check(name + ' 白底 + 680 宽 viewBox', s.includes('<rect x="0" y="0"') && /viewBox="0 0 680 \d+"/.test(s), true);
  check(name + ' 无 HTML 标签 / 完整收尾',
    ['<b>', '</b>', '<br', '<i>', '</i>', 'font-size="0"', '<g stroke'].every(t => !s.includes(t)) &&
    s.trim().startsWith('<svg') && s.trim().endsWith('</svg>'), true);
  check(name + ' 进了 SW 预缓存', sw.includes("'img/" + name + ".svg'"), true);
  check(name + ' text 标签成对', (s.match(/<text\b/g) || []).length, (s.match(/<\/text>/g) || []).length);
  check(name + ' 没有元素画到 680 之外', [...s.matchAll(/ x="(\d+)"/g)].every(m => +m[1] <= 650), true);
  check(name + ' 没有 stroke 挂在 <g> 上（避免文字发虚）', !/<g[^>]*stroke/.test(s), true);
}

// ---------- 2. 落位：紧跟知识点、不落进 <p>/<li> ----------
const LANDING = [
  ['cn', '4.1.1', 'cn_fig_hetero'],
  ['cn', '1.2.2', 'cn_fig_proto_svc'],
  ['cn', '3.8.3', 'cn_fig_shared_eth'],
  ['co', '6.1.3', 'co_fig_bus_bw'],
  ['co', '4.2.1', 'co_fig_pc_rel'],
];
for (const [sub, num, name] of LANDING) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 含本批图', h.includes('img/' + name + '.svg'), true);
  check(sub + ':' + num + ' 图块带 data-fig=1',
    /<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/[a-z0-9_]+\.svg"/.test(h), true);
  if (h.includes(STAR)) {
    check(sub + ':' + num + ' 图在 ★ 之前', h.indexOf('img/' + name + '.svg') < h.indexOf(STAR), true);
  }
  const i = h.indexOf('img/' + name + '.svg');
  const figStart = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图：', i);
  check(sub + ':' + num + ' 图块前一个标签是闭合标签（没落在正文里）',
    figStart >= 0 && /<\/(p|ul|ol|table|div|figure|h4)>$/.test(h.slice(0, figStart).trimEnd()), true);
}
// 具体位置口径
check('CN 4.1.1 图在网际设备表之后、★ 之前',
  secHtml('cn', '4.1.1').indexOf('cn_fig_hetero.svg') > secHtml('cn', '4.1.1').indexOf('网关') &&
  secHtml('cn', '4.1.1').indexOf('cn_fig_hetero.svg') < secHtml('cn', '4.1.1').indexOf(STAR), true);
check('CN 1.2.2 图紧跟 SDU/PCI/PDU 段之后（不是整节末尾）',
  secHtml('cn', '1.2.2').indexOf('cn_fig_proto_svc.svg') > secHtml('cn', '1.2.2').indexOf('SDU') &&
  secHtml('cn', '1.2.2').indexOf('cn_fig_proto_svc.svg') < secHtml('cn', '1.2.2').indexOf(STAR), true);
check('CN 1.2.2 图落在「水平说协议」黄框之前',
  secHtml('cn', '1.2.2').indexOf('cn_fig_proto_svc.svg') < secHtml('cn', '1.2.2').indexOf('水平说协议、垂直说服务'), true);
check('CN 3.8.3 图在共享式/交换式对比表之后、★ 之前',
  secHtml('cn', '3.8.3').indexOf('cn_fig_shared_eth.svg') > secHtml('cn', '3.8.3').indexOf('安全性') &&
  secHtml('cn', '3.8.3').indexOf('cn_fig_shared_eth.svg') < secHtml('cn', '3.8.3').indexOf(STAR), true);
check('CO 6.1.3 图在总线复用/寻址能力之后、★ 之前',
  secHtml('co', '6.1.3').indexOf('co_fig_bus_bw.svg') > secHtml('co', '6.1.3').indexOf('总线复用') &&
  secHtml('co', '6.1.3').indexOf('co_fig_bus_bw.svg') < secHtml('co', '6.1.3').indexOf(STAR), true);
check('CO 4.2.1 图在数据寻址段之后、★ 之前',
  secHtml('co', '4.2.1').indexOf('co_fig_pc_rel.svg') > secHtml('co', '4.2.1').indexOf('寻址特征字段') &&
  secHtml('co', '4.2.1').indexOf('co_fig_pc_rel.svg') < secHtml('co', '4.2.1').indexOf(STAR), true);

// ---------- 3. 图与正文同源（术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['cn', '4.1.1', 'cn_fig_hetero', ['异构', '分组转发', '网关', '路由器', '网桥', '集线器', '中继器', '协议转换']],
  ['cn', '1.2.2', 'cn_fig_proto_svc', ['协议', '服务', '接口', 'SAP', '用户接口', '端口号', '协议字段', '类型字段', '语法', '语义', '同步']],
  ['cn', '3.8.3', 'cn_fig_shared_eth', ['集线器', '共享', '冲突域', '广播域', '半双工', 'CSMA/CD', '全双工', '物理层', '数据链路层']],
  ['co', '6.1.3', 'co_fig_bus_bw', ['总线宽度', '总线时钟频率', '总线工作频率', '总线带宽', '总线复用', '11MHz', '16位', '总线复用']],
  ['co', '4.2.1', 'co_fig_pc_rel', ['指令寻址', '数据寻址', '顺序寻址', '跳跃寻址', '相对转移', '绝对转移', '程序计数器', '形式地址', '寻址特征']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
const cnHe = flat(read('pwa/img/cn_fig_hetero.svg'));
check('CN 异构互连图把「IP over everything / everything over IP」两句话都写上',
  cnHe.includes('IPovereverything') && cnHe.includes('everythingoverIP'), true);
check('CN 异构互连图点明只有网关做协议转换',
  cnHe.includes('只有网关做协议转换'), true);
check('CN 异构互连图把四类设备按层排（物理/链路/网络/应用）',
  cnHe.includes('物理层') && cnHe.includes('数据链路层') && cnHe.includes('网络层') && cnHe.includes('应用层及以上'), true);
const cnPv = flat(read('pwa/img/cn_fig_proto_svc.svg'));
check('CN 协议服务图写明服务单向、只能逐层调用',
  cnPv.includes('服务只能逐层调用，不能跨层'), true);
check('CN 协议服务图把 SAP 与四层对应关系列全',
  cnPv.includes('应用层＝用户接口') && cnPv.includes('传输层＝端口号') &&
  cnPv.includes('网络层＝协议字段') && cnPv.includes('数据链路层＝类型字段'), true);
check('CN 协议服务图三要素各给一个认词',
  cnPv.includes('语法') && cnPv.includes('格式/编码') && cnPv.includes('含义/要做什么') && cnPv.includes('顺序/先后'), true);
const cnSe = flat(read('pwa/img/cn_fig_shared_eth.svg'));
check('CN 共享式以太网图给出 1/N 与 100÷N 的算式',
  cnSe.includes('总带宽÷N＝100÷N'), true);
check('CN 共享式以太网图算出 4 台 25、8 台 12.5',
  cnSe.includes('25') && cnSe.includes('12.5Mb/s'), true);
check('CN 共享式以太网图点明集线器两个域都不切、交换机只切冲突域',
  cnSe.includes('集线器两个域都不切') && cnSe.includes('切冲突域'), true);
const coBw = flat(read('pwa/img/co_fig_bus_bw.svg'));
check('CO 总线带宽图给出完整算例 16÷8×(11M×2)=44MB/s',
  coBw.includes('16÷8×(11MHz×2)＝2B×22M＝44MB/s'), true);
check('CO 总线带宽图点明加地址线对带宽没帮助',
  coBw.includes('加宽地址线只扩大寻址空间'), true);
check('CO 总线带宽图区分「时钟频率」与「工作频率」两个输入',
  coBw.includes('总线时钟频率') && coBw.includes('总线工作频率'), true);
const coPc = flat(read('pwa/img/co_fig_pc_rel.svg'));
check('CO 相对转移图算出目标 1008+(-8)=1000',
  coPc.includes('1008＋(-8)＝1000') || coPc.includes('1008+(-8)=1000'), true);
check('CO 相对转移图写明取指后 PC 已指向下一条',
  coPc.includes('PC已指向下一条') || coPc.includes('已指向下一条'), true);
check('CO 相对转移图区分绝对转移给地址、相对转移给位移量',
  coPc.includes('绝对转移') && coPc.includes('相对转移') && coPc.includes('位移量'), true);

// ---------- 4. 两个纯判据黄框 ----------
const CALLOUTS = [
  ['cn', '4.1.1', '三把尺子别拿错'],
  ['cn', '1.2.2', '三组分类各问一个问题'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 0, os: 0, cn: 2, ds: 0 };
for (const [sub, num, kw] of CALLOUTS) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 有黄框且含判据「' + kw + '」',
    h.includes('key-callout') && h.includes(kw), true);
  if (h.includes(STAR))
    check(sub + ':' + num + ' 黄框在 ★ 之前', h.indexOf(kw) < h.indexOf(STAR), true);
}
let newBodies = [], posBad = 0, copyBad = 0, dupBad = 0;
const heads = new Set();
for (const sub of SUBS) for (const { h } of allHtmls(sub)) {
  const re = /<div class="key-callout">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(h))) {
    const body = m[1], text = flat(body);
    const before = h.slice(0, m.index).replace(/\s+$/, '');
    if (!(before === '' || before.endsWith('>'))) posBad++;
    const head = text.slice(0, 24);
    if (heads.has(head)) dupBad++; else heads.add(head);
    if (NEW_KEYS.some(k => body.includes(k))) {
      newBodies.push(body);
      const paras = [...h.matchAll(/<p(?![^>]*data-fig)[^>]*>([\s\S]*?)<\/p>/g)].map(x => flat(x[1]));
      if (text.length > 40 && paras.some(p => p === text)) copyBad++;
    }
  }
}
check('本批 2 个黄框都定位到了', newBodies.length, 2);
check('本批 2 个黄框结构合法（无内嵌块级、无 tspan）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 2 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 2 个黄框都不是空壳（正文 > 80 字）',
  newBodies.every(b => flat(b).length > 80), true);
check('全库黄框位置安全：没有一个落在未闭合正文内部', posBad, 0);
check('全库黄框互不重复（前 24 字判重）', dupBad, 0);
check('本批黄框没有整段复刻正文 <p>', copyBad, 0);
const cssRules = [...css.matchAll(/\.key-callout[^{]*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
check('CSS .key-callout 无绝对定位 / z-index / 负外边距遮挡',
  !/position:\s*(absolute|fixed)|z-index|margin[^;]*:\s*-\d/.test(cssRules), true);
check('笔记 JSON 里没有 SVG 专有的 tspan', SUBS.every(s => !RAW[s].includes('tspan')), true);

// ---------- 5. 行号双基线（图块与黄框都不参与行号） ----------
const LINE_BASE = { co: [1819, 1819], os: [3660, 3660], cn: [1108, 1108], ds: [1173, 1175] };
for (const sub of SUBS) {
  let paired = 0, open = 0;
  for (const { h } of allHtmls(sub)) {
    (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => { if (!/^<p\b[^>]*data-fig/.test(t)) paired++; });
    paired += (h.match(/<li\b[^>]*>/g) || []).length;
    (h.match(/<p\b[^>]*>/g) || []).forEach(t => { if (!/data-fig/.test(t)) open++; });
    open += (h.match(/<li\b[^>]*>/g) || []).length;
  }
  check(sub + ' 静态可批注行（配对口径）' + LINE_BASE[sub][0], paired, LINE_BASE[sub][0]);
  check(sub + ' 静态可批注行（开标签口径）' + LINE_BASE[sub][1], open, LINE_BASE[sub][1]);
}

// ---------- 6. 精确总量 / 三方一致 / 序列化 ----------
const FIG_N = { co: 43, os: 65, cn: 43, ds: 31 };
const CALL_N = { co: 74, os: 77, cn: 53, ds: 106 };
for (const sub of SUBS) {
  check(sub + ' 配图 >= ' + FIG_N[sub] + ' 张（P13 下限，后续批次会继续加）',
    (RAW[sub].match(/fig-img/g) || []).length, n => n >= FIG_N[sub]);
  check(sub + ' 黄框 ' + CALL_N[sub] + ' 个（P13 精确总量）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img >= 182 张（P13 下限）', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), n => n >= 182);
check('全库黄框 310 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), 310);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 非空且已刷新为本批哈希',
  /quiz408-data-[a-f0-9]{10}/.test(sw), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p13_2026-11-13/';
let guardDone = 0, guardBad = 0, changed = 0, changedKeys = [];
for (const sub of SUBS) {
  const bp = BAK_DIR + sub + '_notes.before.json';
  if (!fs.existsSync(path.join(ROOT, bp))) continue;
  const before = JSON.parse(read(bp));
  const B = new Map(), A = new Map();
  for (const ch of before.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) B.set(x.section.split(' ')[0], x.html || '');
  for (const { key, h } of allHtmls(sub)) A.set(key, h);
  for (const [k, old] of B) {
    const neu = A.get(k) || '';
    if (old !== neu) { changed++; changedKeys.push(k); if (!subseq(old, neu)) guardBad++; }
  }
  guardDone++;
}
if (guardDone === 2) {
  check('CN/CO 两科 before 备份都参与了纯插入校验', guardDone, 2);
  check('变化的 5 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 >= 5（P13 下限，后续批次继续改）', changed, n => n >= 5);
  check('P13 改的五个小节都在变化清单里',
    ['4.1.1', '1.2.2', '3.8.3', '6.1.3', '4.2.1'].every(k => changedKeys.includes(k)), true);
} else {
  console.log('SKIP 纯插入守卫：缺少 CN/CO before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p13: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    async function render(sub, raw) {
      const pageHtml = read('pwa/notes.html')
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
          try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
        }).replace(/<link\b[^>]*>/gi, '');
      const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
      const dom = new JSDOM(pageHtml, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://x.test/notes.html?subject=' + sub, virtualConsole: vc,
        beforeParse(w) {
          w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
          w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
          w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
          w.Element.prototype.scrollIntoView = function () { };
          w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
        }
      });
      await new Promise(r => setTimeout(r, 4000));
      const d = dom.window.document;
      const out = {
        window: dom.window, document: d,
        lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
        figs: d.querySelectorAll('img.fig-img').length,
        calls: d.querySelectorAll('.key-callout').length,
        lightbox: null,
        misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
        newCalls: [...d.querySelectorAll('.key-callout')].filter(el => NEW_KEYS.some(k => el.textContent.includes(k))).length,
        badCalls: [...d.querySelectorAll('.key-callout')]
          .filter(el => NEW_KEYS.some(k => el.textContent.includes(k)) && el.closest('li,p')).length,
        badFigs: [...d.querySelectorAll('img.fig-img')]
          .filter(img => /cn_fig_hetero|cn_fig_proto_svc|cn_fig_shared_eth|co_fig_bus_bw|co_fig_pc_rel/.test(img.getAttribute('src') || '') && img.closest('li')).length,
      };
      const firstFig = d.querySelector('img.fig-img');
      if (firstFig) {
        firstFig.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        const lb = d.querySelector('#figLightbox');
        out.lightbox = !!lb && lb.classList.contains('show');
      }
      return out;
    }
    const JSDOM_BASE = { co: 1971, os: 3668, cn: 1220, ds: 1330 };
    for (const sub of SUBS) {
      const a = await render(sub, RAW[sub]);
      check(sub + ' 真实渲染 .anno-line = ' + JSDOM_BASE[sub], a.lines.length, JSDOM_BASE[sub]);
      check(sub + ' 真实渲染配图 >= ' + FIG_N[sub] + ' 张', a.figs, n => n >= FIG_N[sub]);
      check(sub + ' 真实渲染黄框 >= ' + CALL_N[sub] + ' 个', a.calls, n => n >= CALL_N[sub]);
      check(sub + ' 图块被误标行号 = 0', a.misLabeled, 0);
      check(sub + ' 全库黄框没有一个落在 li/p 内部',
        [...a.document.querySelectorAll('.key-callout')].filter(el => el.closest('li,p')).length, 0);
      check(sub + ' 本批黄框在 DOM 里都定位到了且不嵌 li/p',
        [a.newCalls, a.badCalls], [NEW_BY_SUB[sub], 0]);
      check(sub + ' 本批新图没有一张落进 li', a.badFigs, 0);
      check(sub + ' 配图仍可点击放大', a.lightbox, true);
      const bp = BAK_DIR + sub + '_notes.before.json';
      if (fs.existsSync(path.join(ROOT, bp))) {
        const b = await render(sub, read(bp));
        check(sub + ' 双版本 .anno-line 数量一致', b.lines.length, a.lines.length);
        let first = -1;
        if (b.lines.length === a.lines.length)
          for (let i = 0; i < b.lines.length; i++) if (b.lines[i] !== a.lines[i]) { first = i; break; }
        check(sub + ' 双版本逐行文本完全一致（黄框零覆盖 / 批注零错位）', first, -1);
        b.window.close();
      } else {
        console.log('SKIP ' + sub + ' 双版本逐行比对：缺 before 备份');
      }
      a.window.close();
    }
    console.log('_test_fig_p13: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
