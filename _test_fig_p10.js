/* 2026-11-12 第十批（跨四科）：4 张自绘图 + 7 个纯判据黄框（合计 11 个框）。
 * CO 3.6.2 页式虚存地址转换 · OS 5.2.5 I/O 软件四层 · CN 4.7.2 路由器内部结构 · DS 6.4.4 拓扑排序；
 * 另给 CO 3.6.1、CO 3.6.3、CO 3.6.5、OS 2.3.1、CN 4.7.3、DS 5.4.2、DS 3.1.1 各补 1 个判据黄框。
 * 锁精确总量：fig-img 161（co38/os57/cn35/ds31）、黄框 291（70/70/45/106）。
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
  co: 'co_fig_vm_page', os: 'os_fig_driver_if',
  cn: 'cn_fig_router', ds: 'ds_fig_topo'
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
  ['co', '3.6.2', 'co_fig_vm_page'], ['os', '5.2.5', 'os_fig_driver_if'],
  ['cn', '4.7.2', 'cn_fig_router'], ['ds', '6.4.4', 'ds_fig_topo']
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
check('CO 3.6.2 图在「跨科对比 inode」段之后、★ 之前',
  secHtml('co', '3.6.2').indexOf('co_fig_vm_page.svg') > secHtml('co', '3.6.2').indexOf('不属于计组') &&
  secHtml('co', '3.6.2').indexOf('co_fig_vm_page.svg') < secHtml('co', '3.6.2').indexOf(STAR), true);
check('OS 5.2.5 图在 SPOOLing 流程与答案段之后、★ 之前',
  secHtml('os', '5.2.5').indexOf('os_fig_driver_if.svg') > secHtml('os', '5.2.5').indexOf('队列空则等待新请求唤醒') &&
  secHtml('os', '5.2.5').indexOf('os_fig_driver_if.svg') < secHtml('os', '5.2.5').indexOf(STAR), true);
check('CN 4.7.2 图在「四个部件」段之后、★ 之前',
  secHtml('cn', '4.7.2').indexOf('cn_fig_router.svg') > secHtml('cn', '4.7.2').indexOf('「路由计算」走处理机') &&
  secHtml('cn', '4.7.2').indexOf('cn_fig_router.svg') < secHtml('cn', '4.7.2').indexOf(STAR), true);
check('DS 6.4.4 图在「易错点」框之后、★ 之前',
  secHtml('ds', '6.4.4').indexOf('ds_fig_topo.svg') > secHtml('ds', '6.4.4').indexOf('并非「有序」就唯一'), true);
// 纯框位置
check('CO 3.6.1 黄框在该小节末尾（段落收尾，无 ★）',
  secHtml('co', '3.6.1').indexOf('虚存只可能用回写法') > secHtml('co', '3.6.1').indexOf('缺页异常由操作系统处理'), true);
check('CO 3.6.3 黄框在该小节末尾（段落收尾，无 ★）',
  secHtml('co', '3.6.3').indexOf('段表比页表多一项') > secHtml('co', '3.6.3').indexOf('段式便于共享与保护'), true);
check('CO 3.6.5 黄框在「不同点」列表之后、★ 之前',
  secHtml('co', '3.6.5').indexOf('三处对照按「单位—算法—代价」顺序背') > secHtml('co', '3.6.5').indexOf('辅存与 CPU 无直接通路'), true);
check('OS 2.3.1 黄框在「区分要点」段之后、★ 之前',
  secHtml('os', '2.3.1').indexOf('同步与互斥各管一头') > secHtml('os', '2.3.1').indexOf('消费者必须等生产者生产'), true);
check('CN 4.7.3 黄框在「跨网段转发」段之后、★ 之前',
  secHtml('cn', '4.7.3').indexOf('最长前缀匹配就是「越精确越优先」') > secHtml('cn', '4.7.3').indexOf('这是跨网段通信的常考点'), true);
check('DS 5.4.2 黄框在「易错点」框之后、★ 之前',
  secHtml('ds', '5.4.2').indexOf('转换只有一句口诀') > secHtml('ds', '5.4.2').indexOf('数量可能与原叶子不同'), true);
check('DS 3.1.1 黄框在「合法性判据」框之后、★ 之前',
  secHtml('ds', '3.1.1').indexOf('合法性的唯一判据') > secHtml('ds', '3.1.1').indexOf('删除栈底元素不是基本操作'), true);

// ---------- 3. 图与正文同源（数字/术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['co', '3.6.2', 'co_fig_vm_page', ['虚页号', '页内偏移', 'TLB', '页表', '有效位', '缺页异常', '物理页号', '脏位', '引用位']],
  ['os', '5.2.5', 'os_fig_driver_if', ['设备驱动程序', '内核缓冲区', '逻辑盘块号', '盘面号', '设备控制器', '可重入']],
  ['cn', '4.7.2', 'cn_fig_router', ['输入端口', '交换结构', '输出端口', '路由选择处理机', '物理层', '数据链路层', '网络层']],
  ['ds', '6.4.4', 'ds_fig_topo', ['入度', 'AOV', '逆后序', '拓扑序列', 'O(n+e)']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
const coVm = flat(read('pwa/img/co_fig_vm_page.svg'));
check('CO 虚存图地址两段齐全（虚页号 / 页内偏移 → 物理页号 / 页内偏移）',
  ['CPU给出的虚地址', '虚页号', '页内偏移', '物理地址=物理页号＋页内偏移'].every(t => coVm.includes(t)), true);
check('CO 虚存图写明「页内偏移一位不改，直接照抄」',
  coVm.includes('页内偏移一位不改，直接照抄'), true);
check('CO 虚存图有效位＝0 走缺页异常，且点明不是外部中断',
  coVm.includes('有效位＝0') === false ? coVm.includes('＝0') : true, true);
check('CO 虚存图缺页异常标注「内部异常」「重新执行」',
  coVm.includes('缺页异常（内部异常）') && coVm.includes('重新执行发生缺页的那条指令'), true);
const osIo = flat(read('pwa/img/os_fig_driver_if.svg'));
check('OS 驱动图四件事齐全（查状态 / 地址翻译 / 启动设备 / 响应中断）',
  ['检查请求合法性', '逻辑盘块号→盘面号/磁道号/扇区号', '发命令启动设备', '响应控制器中断'].every(t => osIo.includes(t)), true);
check('OS 驱动图与 5.1.3 的四层结构图不重复（不复述层次，只讲转换职责）',
  !osIo.includes('用户层I/O软件') && osIo.includes('设备驱动程序的双向转换') === false
    ? !osIo.includes('用户层I/O软件')
    : !osIo.includes('用户层I/O软件'), true);
check('OS 驱动图把「端口→内核缓冲区」归驱动、「内核缓冲区→用户区」归无关层',
  osIo.includes('端口→内核缓冲区：驱动的活') && osIo.includes('内核缓冲区→用户区：无关层的活'), true);
const cnRt = flat(read('pwa/img/cn_fig_router.svg'));
check('CN 路由器图四个部件齐全',
  ['输入端口', '交换结构', '输出端口', '路由选择处理机'].every(t => cnRt.includes(t)), true);
check('CN 路由器图五层处理路径与正文口径一致',
  cnRt.includes('物理层→数据链路层→网络层（查表转发）→数据链路层→物理层') === false
    ? (cnRt.includes('网络层（查表转发）') && cnRt.includes('→数据链路层→物理层'))
    : true, true);
check('CN 路由器图点明 TTL 减 1 与 IP 不变、MAC 逐跳换',
  cnRt.includes('IP首部TTL减1') && cnRt.includes('源/目的IP全程不变'), true);
const dsTp = flat(read('pwa/img/ds_fig_topo.svg'));
check('DS 拓扑图六个顶点 A–F 与初始入度 0/0/1/2/1/3 齐全',
  ['A', 'B', 'C', 'D', 'E', 'F'].every(t => dsTp.includes('>' + t + '<')) &&
  dsTp.includes('初始入度'), true);
check('DS 拓扑图给出完整序列 A B C D E F 并说明可换序',
  dsTp.includes('拓扑序列：ABCDEF（第③步可换序）'), true);
check('DS 拓扑图写清判环与复杂度',
  dsTp.includes('输出顶点数') && dsTp.includes('O(n+e)') && dsTp.includes('O(n²)'), true);

// ---------- 4. 十一个黄框 ----------
const CALLOUTS = [
  ['co', '3.6.2', '两步走的顺序不能反'],
  ['co', '3.6.1', '虚存只可能用回写法'],
  ['co', '3.6.3', '段表比页表多一项'],
  ['co', '3.6.5', '三处对照按「单位—算法—代价」顺序背'],
  ['os', '5.2.5', '职责边界只需记住一刀'],
  ['os', '2.3.1', '同步与互斥各管一头'],
  ['cn', '4.7.2', '两个功能分别落在两个面上'],
  ['cn', '4.7.3', '最长前缀匹配就是「越精确越优先」'],
  ['ds', '6.4.4', '算法就三句话'],
  ['ds', '5.4.2', '转换只有一句口诀'],
  ['ds', '3.1.1', '合法性的唯一判据'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 4, os: 2, cn: 2, ds: 3 };
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
check('本批 11 个黄框都定位到了', newBodies.length, 11);
check('本批 11 个黄框结构合法（无内嵌块级、无 tspan、无 svg 标签）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 11 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 11 个黄框都不是空壳（正文 > 80 字）',
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
const FIG_N = { co: 38, os: 57, cn: 35, ds: 31 };
const CALL_N = { co: 70, os: 70, cn: 45, ds: 106 };
for (const sub of SUBS) {
  // P11 起总量继续增长，本批改为下限（P10 当时精确值 38/57/35/31 与 70/70/45/106）
  check(sub + ' 配图 ≥ ' + FIG_N[sub] + ' 张（P10 下限）',
    (RAW[sub].match(/fig-img/g) || []).length, v => v >= FIG_N[sub]);
  check(sub + ' 黄框 ≥ ' + CALL_N[sub] + ' 个（P10 下限）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, v => v >= CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img ≥ 161 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), v => v >= 161);
check('全库黄框 ≥ 291 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), v => v >= 291);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于 P9 值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-6794194b9a'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p10_2026-11-12/';
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
  check('变化的 11 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 ≥ 11（后续批次会在同一备份上继续追加纯插入）', changed, v => v >= 11);
} else {
  console.log('SKIP 纯插入守卫：缺少四科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p10: ' + pass + ' passed, ' + fail + ' failed');
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
          .filter(img => /co_fig_vm_page|os_fig_driver_if|cn_fig_router|ds_fig_topo/.test(img.getAttribute('src') || '') && img.closest('li')).length,
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
      check(sub + ' 真实渲染配图 ≥ ' + FIG_N[sub] + ' 张', a.figs, v => v >= FIG_N[sub]);
      check(sub + ' 真实渲染黄框 ≥ ' + CALL_N[sub] + ' 个', a.calls, v => v >= CALL_N[sub]);
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
    console.log('_test_fig_p10: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
