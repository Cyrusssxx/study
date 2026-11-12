/* 2026-11-12 第八批（跨四科）：4 张自绘图 + 10 个判据黄框。
 * CO 3.5.1 局部性 / OS 5.1.1 设备控制器与端口编址 / CN 4.4.4 OSPF / DS 3.1.3 链栈与共享栈；
 * 另给 CO 2.1.1、CO 3.4.2、OS 5.1.4、CN 1.2.2、DS 4.2.1、DS 6.2.3 各补 1 个判据黄框。
 * 锁精确总量：fig-img 153（co36/os55/cn33/ds29）、黄框 268（62/65/39/102）。
 * 行号双基线：CO 1819 / OS 3660 / CN 1108 / DS 1173(配对)·1175(开标签)，本批零漂移。
 * 保留「jsdom 双版本逐行文本比对」：有 before 备份时跑，能查出「数量不变但批注错位」的黄框覆盖。
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
  co: 'co_fig_locality', os: 'os_fig_dev_ctrl',
  cn: 'cn_fig_ospf', ds: 'ds_fig_linkstack'
};
const STAR = '<h4>★ 高频真题考点与陷阱</h4>';

// ---------- 1. 四张 SVG 结构 ----------
for (const [sub, name] of Object.entries(SVGS)) {
  const p = 'pwa/img/' + name + '.svg';
  check(name + ' 文件存在', fs.existsSync(path.join(ROOT, p)), true);
  const s = read(p);
  check(name + ' 白底 + 680 宽 viewBox', s.includes('<rect x="0" y="0"') && /viewBox="0 0 680 \d+"/.test(s), true);
  check(name + ' 无 HTML 标签 / 无 g 级 stroke 继承 / 完整收尾',
    ['<b>', '</b>', '<br', '<i>', '</i>', 'font-size="0"', '<g stroke'].every(t => !s.includes(t)) &&
    s.trim().startsWith('<svg') && s.trim().endsWith('</svg>'), true);
  check(name + ' 进了 SW 预缓存', sw.includes("'img/" + name + ".svg'"), true);
  check(name + ' text 标签成对', (s.match(/<text\b/g) || []).length, (s.match(/<\/text>/g) || []).length);
  check(name + ' 没有元素画到 680 之外', [...s.matchAll(/ x="(\d+)"/g)].every(m => +m[1] <= 640), true);
}

// ---------- 2. 落位：紧跟知识点、不落进 <p>/<li> ----------
const LANDING = [
  ['co', '3.5.1', 'co_fig_locality'], ['os', '5.1.1', 'os_fig_dev_ctrl'],
  ['cn', '4.4.4', 'cn_fig_ospf'], ['ds', '3.1.3', 'ds_fig_linkstack']
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
check('CO 3.5.1 图在「经典考点」列表之后、★ 之前',
  secHtml('co', '3.5.1').indexOf('co_fig_locality.svg') > secHtml('co', '3.5.1').indexOf('循环体指令反复执行 → 时间局部性好'), true);
check('OS 5.1.1 图在两种编址对比表之后、★ 之前',
  secHtml('os', '5.1.1').indexOf('os_fig_dev_ctrl.svg') > secHtml('os', '5.1.1').indexOf('占用内存地址空间，可用内存减少'), true);
check('CN 4.4.4 图在「OSPF 报文其它特性」之后、★ 之前',
  secHtml('cn', '4.4.4').indexOf('cn_fig_ospf.svg') > secHtml('cn', '4.4.4').indexOf('序号越大状态越新'), true);
check('DS 3.1.3 图在「易错点」段之后',
  secHtml('ds', '3.1.3').indexOf('ds_fig_linkstack.svg') > secHtml('ds', '3.1.3').indexOf('判空判满条件也随之改变'), true);
// 纯框位置：CN 1.2.2 必须插在「服务的三种分类」列表之前（该列表尾部 ul 未闭合，不能插在 ★ 前）
check('CN 1.2.2 黄框在 PDU 段之后、「服务的三种分类」列表之前',
  secHtml('cn', '1.2.2').indexOf('水平说协议') > secHtml('cn', '1.2.2').indexOf('成为网络层 PDU（IP 分组/数据报）。</p>') &&
  secHtml('cn', '1.2.2').indexOf('水平说协议') < secHtml('cn', '1.2.2').indexOf('<ul><li>服务的三种分类'), true);
check('CO 2.1.1 黄框在 ★ 之前',
  secHtml('co', '2.1.1').indexOf('先拆成整数与小数两半再动手') < secHtml('co', '2.1.1').indexOf(STAR), true);
check('OS 5.1.4 黄框在该小节末尾',
  secHtml('os', '5.1.4').indexOf('看「调用是否原地等结果」') > secHtml('os', '5.1.4').indexOf('同步强调'), true);

// ---------- 3. 图与正文同源（数字/术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['co', '3.5.1', 'co_fig_locality', ['8192', '时间局部性', '空间局部性', '命中率', 'Q232']],
  ['os', '5.1.1', 'os_fig_dev_ctrl', ['11408', '数据线', '地址线', '控制线', 'I/O 逻辑', '独立编址', '统一编址']],
  ['cn', '4.4.4', 'cn_fig_ospf', ['LSA', 'LSDB', 'Dijkstra', '89', 'Hello', 'area 0']],
  ['ds', '3.1.3', 'ds_fig_linkstack', ['Lhead', 'top0', 'top1', 'MaxSize', 'O(1)']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
// 图内算式自洽
const coFig = flat(read('pwa/img/co_fig_locality.svg'));
check('CO 局部性图三个关键量都在（8192 / 先升后降 / 峰值）',
  ['8192', '先升后降', '峰值'].every(t => coFig.includes(t)), true);
check('CO 局部性图与正文同用「按列每次跨 8192 字节」这个例子',
  flat(secHtml('co', '3.5.1')).includes('如8192字节'), true);
const osFig = flat(read('pwa/img/os_fig_dev_ctrl.svg'));
check('OS 控制器图三部分齐全（与 CPU 接口 / I/O 逻辑 / 与设备接口）',
  ['与CPU的接口', 'I/O逻辑', '与设备的接口'].every(t => osFig.includes(t)), true);
check('OS 控制器图与正文同用「读第 11408 个扇区」', flat(secHtml('os', '5.1.1')).includes('第11408个扇区'), true);
const cnFig = flat(read('pwa/img/cn_fig_ospf.svg'));
check('CN OSPF 图四步齐全（泛洪 LSA / 建 LSDB / Dijkstra / 填路由表）',
  ['泛洪LSA', 'LSDB', 'Dijkstra', '填路由表'].every(t => cnFig.includes(t)), true);
check('CN OSPF 图写明协议号 89 并对比 RIP 承载在 UDP',
  cnFig.includes('协议号89') && cnFig.includes('UDP520') && cnFig.includes('TCP/UDP'), true);
const dsFig = flat(read('pwa/img/ds_fig_linkstack.svg'));
check('DS 链栈图满条件与正文一致（top1 - top0 == 1）',
  dsFig.includes('top1-top0==1') && flat(secHtml('ds', '3.1.3')).includes('top1-top0==1'), true);
check('DS 链栈图共享栈初值一致（top0 = -1 / top1 = MaxSize）',
  dsFig.includes('top0=-1') && dsFig.includes('top1=MaxSize'), true);

// ---------- 4. 十个黄框 ----------
const CALLOUTS = [
  ['co', '3.5.1', '判局部性只看两句话'],
  ['co', '2.1.1', '先拆成整数与小数两半再动手'],
  ['co', '3.4.2', '页读块擦'],
  ['os', '5.1.1', '三问定设备属性'],
  ['os', '5.1.4', '看「调用是否原地等结果」'],
  ['cn', '4.4.4', '泛洪的是「链路状态」不是路由表'],
  ['cn', '1.2.2', '水平说协议、垂直说服务'],
  ['ds', '3.1.3', '「栈顶」只能是那一个能插入删除的端'],
  ['ds', '4.2.1', '朴素匹配只动 j'],
  ['ds', '6.2.3', '求度是 O(该顶点的度)'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 3, os: 2, cn: 2, ds: 3 };
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
check('本批 10 个黄框都定位到了', newBodies.length, 10);
check('本批 10 个黄框结构合法（无内嵌块级、无 tspan、无 svg 标签）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 10 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 10 个黄框都不是空壳（正文 > 80 字）',
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
const FIG_N = { co: 36, os: 55, cn: 33, ds: 29 };
const CALL_N = { co: 62, os: 65, cn: 39, ds: 102 };
for (const sub of SUBS) {
  check(sub + ' 配图 ' + FIG_N[sub] + ' 张（P8 精确总量）', (RAW[sub].match(/fig-img/g) || []).length, FIG_N[sub]);
  check(sub + ' 黄框 ' + CALL_N[sub] + ' 个（P8 精确总量）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img 153 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), 153);
check('全库黄框 268 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), 268);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于 P7 值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-869d3d87e1'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p8_2026-11-12/';
let guardDone = 0, guardBad = 0, changed = 0;
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
    if (old !== neu) { changed++; if (!subseq(old, neu)) guardBad++; }
  }
  guardDone++;
}
if (guardDone === 4) {
  check('四科 before 备份都参与了纯插入校验', guardDone, 4);
  check('变化的 10 个小节全是纯插入（0 删除 / 0 改写）', [changed, guardBad], [10, 0]);
} else {
  console.log('SKIP 纯插入守卫：缺少四科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p8: ' + pass + ' passed, ' + fail + ' failed');
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
        lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
        figs: d.querySelectorAll('img.fig-img').length,
        calls: d.querySelectorAll('.key-callout').length,
        misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
        badCalls: [...d.querySelectorAll('.key-callout')]
          .filter(el => NEW_KEYS.some(k => el.textContent.includes(k)) && el.closest('li,p')).length,
        badFigs: [...d.querySelectorAll('img.fig-img')]
          .filter(img => /co_fig_locality|os_fig_dev_ctrl|cn_fig_ospf|ds_fig_linkstack/.test(img.getAttribute('src') || '') && img.closest('li')).length,
        newCalls: [...d.querySelectorAll('.key-callout')]
          .filter(el => NEW_KEYS.some(k => el.textContent.includes(k))).length,
        lightbox: null, window: dom.window, document: d
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
      check(sub + ' 真实渲染配图 ' + FIG_N[sub] + ' 张', a.figs, FIG_N[sub]);
      check(sub + ' 真实渲染黄框 ' + CALL_N[sub] + ' 个', a.calls, CALL_N[sub]);
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
    console.log('_test_fig_p8: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
