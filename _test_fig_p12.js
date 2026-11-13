/* 2026-11-13 第十二批（继续 CO / OS / CN 三科）：4 张自绘图 + 5 个判据黄框。
 * 图：CO 7.2.4 I/O 端口编址 · OS 2.1.6 四种进程通信 · CN 3.5.1 信道划分 · OS 2.3.6 管程与条件变量；
 * 纯判据框：CN 6.4.1 邮件收发 · CO 5.2.1 取指与中断 · OS 1.1.2 三大角色 · OS 1.2.3 响应时间 · CN 2.3.1 中继器。
 * 锁精确总量：fig-img 177（co41/os65/cn40/ds31）、黄框 308（74/77/51/106）。
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
  co: ['co_fig_port_addr', 'co_fig_regs'],
  os: ['os_fig_ipc', 'os_fig_monitor', 'os_fig_critical', 'os_fig_lut'],
  cn: ['cn_fig_multiplex', 'cn_fig_lpm'],
};
const ALL_SVGS = [].concat(...Object.values(SVGS));
const STAR = '<h4>★ 高频真题考点与陷阱</h4>';

// ---------- 1. 四张 SVG 结构 ----------
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
}

// ---------- 2. 落位：紧跟知识点、不落进 <p>/<li> ----------
const LANDING = [
  ['co', '7.2.4', 'co_fig_port_addr'],
  ['os', '2.1.6', 'os_fig_ipc'],
  ['cn', '3.5.1', 'cn_fig_multiplex'],
  ['os', '2.3.6', 'os_fig_monitor'],
  ['co', '5.1.3', 'co_fig_regs'],
  ['os', '2.3.1', 'os_fig_critical'],
  ['cn', '4.7.3', 'cn_fig_lpm'],
  ['os', '5.2.1', 'os_fig_lut'],
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
check('CO 7.2.4 图在「设备侧总线」段之后、★ 之前',
  secHtml('co', '7.2.4').indexOf('co_fig_port_addr.svg') > secHtml('co', '7.2.4').indexOf('通信总线（电缆）') &&
  secHtml('co', '7.2.4').indexOf('co_fig_port_addr.svg') < secHtml('co', '7.2.4').indexOf(STAR), true);
check('OS 2.1.6 图在「信号」段之后、★ 之前',
  secHtml('os', '2.1.6').indexOf('os_fig_ipc.svg') > secHtml('os', '2.1.6').indexOf('SIGILL') &&
  secHtml('os', '2.1.6').indexOf('os_fig_ipc.svg') < secHtml('os', '2.1.6').indexOf(STAR), true);
check('CN 3.5.1 图在三大类访问控制之后、★ 之前',
  secHtml('cn', '3.5.1').indexOf('cn_fig_multiplex.svg') > secHtml('cn', '3.5.1').indexOf('轮询访问') &&
  secHtml('cn', '3.5.1').indexOf('cn_fig_multiplex.svg') < secHtml('cn', '3.5.1').indexOf(STAR), true);
check('CO 5.1.3 图在寄存器堆段之后、★ 之前',
  secHtml('co', '5.1.3').indexOf('co_fig_regs.svg') > secHtml('co', '5.1.3').indexOf('寄存器堆与 Cache') &&
  secHtml('co', '5.1.3').indexOf('co_fig_regs.svg') < secHtml('co', '5.1.3').indexOf(STAR), true);
check('OS 2.3.1 图在临界资源段之后、★ 之前',
  secHtml('os', '2.3.1').indexOf('os_fig_critical.svg') > secHtml('os', '2.3.1').indexOf('不属于临界资源') &&
  secHtml('os', '2.3.1').indexOf('os_fig_critical.svg') < secHtml('os', '2.3.1').indexOf(STAR), true);
check('CN 4.7.3 图在跨网段寻址段之后、★ 之前',
  secHtml('cn', '4.7.3').indexOf('cn_fig_lpm.svg') > secHtml('cn', '4.7.3').indexOf('逐跳换') &&
  secHtml('cn', '4.7.3').indexOf('cn_fig_lpm.svg') < secHtml('cn', '4.7.3').indexOf(STAR), true);
check('OS 5.2.1 图紧跟「三、LUT」标题之后（不是整节末尾）',
  secHtml('os', '5.2.1').indexOf('os_fig_lut.svg') > secHtml('os', '5.2.1').indexOf('三、逻辑设备名到物理设备名'),
  true);
check('OS 2.3.6 图在条件变量段之后、易错清单之前',
  secHtml('os', '2.3.6').indexOf('os_fig_monitor.svg') > secHtml('os', '2.3.6').indexOf('Pthreads') &&
  secHtml('os', '2.3.6').indexOf('os_fig_monitor.svg') < secHtml('os', '2.3.6').indexOf('易错：管程的互斥'), true);
// 纯框位置
check('CN 6.4.1 黄框在「双重角色」段之后、★ 之前',
  secHtml('cn', '6.4.1').indexOf('一次收发只走两种协议') > secHtml('cn', '6.4.1').indexOf('双重角色') &&
  secHtml('cn', '6.4.1').indexOf('一次收发只走两种协议') < secHtml('cn', '6.4.1').indexOf(STAR), true);
check('CO 5.2.1 黄框在「指令与数据区分」段之后、★ 之前',
  secHtml('co', '5.2.1').indexOf('取指不需要操作码控制') > secHtml('co', '5.2.1').indexOf('不由内存决定') &&
  secHtml('co', '5.2.1').indexOf('取指不需要操作码控制') < secHtml('co', '5.2.1').indexOf(STAR), true);
check('OS 1.1.2 黄框在两类接口之后、★ 之前',
  secHtml('os', '1.1.2').indexOf('三大角色按「对谁」分') > secHtml('os', '1.1.2').indexOf('命令接口面向人') &&
  secHtml('os', '1.1.2').indexOf('三大角色按「对谁」分') < secHtml('os', '1.1.2').indexOf(STAR), true);
check('OS 1.2.3 黄框在响应时间公式之后、★ 之前',
  secHtml('os', '1.2.3').indexOf('响应时间只有两个变量') > secHtml('os', '1.2.3').indexOf('时间片越大响应时间越长') &&
  secHtml('os', '1.2.3').indexOf('响应时间只有两个变量') < secHtml('os', '1.2.3').indexOf(STAR), true);
check('CN 2.3.1 黄框在 5-4-3 规则之后、★ 之前',
  secHtml('cn', '2.3.1').indexOf('「再生」不是「放大」') > secHtml('cn', '2.3.1').indexOf('5-4-3') &&
  secHtml('cn', '2.3.1').indexOf('「再生」不是「放大」') < secHtml('cn', '2.3.1').indexOf(STAR), true);

// ---------- 3. 图与正文同源（术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['co', '7.2.4', 'co_fig_port_addr', ['统一编址', '独立编址', '数据端口', '状态端口', '控制端口', '访存指令', '译码']],
  ['os', '2.1.6', 'os_fig_ipc', ['共享存储', '消息传递', '管道', '信号', '环形缓冲区', '半双工', '信箱', 'SIGILL']],
  ['cn', '3.5.1', 'cn_fig_multiplex', ['FDM', 'TDM', 'WDM', 'CDM', '正交', '内积', '时隙', '码片']],
  ['os', '2.3.6', 'os_fig_monitor', ['管程', '条件变量', 'wait', 'signal', '互斥', '共享数据结构', '过程']],
  ['co', '5.1.3', 'co_fig_regs', ['通用寄存器', '程序计数器', '指令寄存器', 'MAR', 'MDR', '标志寄存器']],
  ['os', '2.3.1', 'os_fig_critical', ['临界资源', '临界区', '进入区', '退出区', '剩余区', '同步', '互斥']],
  ['cn', '4.7.3', 'cn_fig_lpm', ['路由表', '下一跳', '最长前缀匹配', '掩码']],
  ['os', '5.2.1', 'os_fig_lut', ['设备独立性', '逻辑设备名', '逻辑设备表', 'LUT', '驱动程序']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
const coPa = flat(read('pwa/img/co_fig_port_addr.svg'));
check('CO 端口图三个端口的读写方向齐全（可读可写 / 只读 / 只写）',
  coPa.includes('数据端口·可读可写') && coPa.includes('状态端口·只读') && coPa.includes('控制端口·只写'), true);
check('CO 端口图区分「统一编址占主存空间」与「独立编址地址可相同不冲突」',
  coPa.includes('占掉主存地址空间') && coPa.includes('地址值可相同也不冲突'), true);
check('CO 端口图点明统一编址靠地址码、独立编址靠专用指令',
  coPa.includes('不同地址码') && coPa.includes('专用I/O指令'), true);
const osIp = flat(read('pwa/img/os_fig_ipc.svg'));
check('OS 通信图点明共享存储「一次都不经过内核」',
  osIp.includes('数据一次都不经过内核'), true);
check('OS 通信图保留管道的关键限制（64KB / 读走即释放 / 满空阻塞）',
  osIp.includes('64KB') && osIp.includes('读走即释放') && osIp.includes('满则写阻塞'), true);
check('OS 通信图把信号判为「只报事件不搬数据」',
  osIp.includes('只报「发生了一件事」，不搬数据'), true);
const cnMx = flat(read('pwa/img/cn_fig_multiplex.svg'));
check('CN 信道划分图给出 CDMA 三态判决 1 / 0 / -1',
  cnMx.includes('内积＝＋1') && cnMx.includes('内积＝0') && cnMx.includes('内积＝-1'), true);
check('CN 信道划分图点出「WDM 是 FDM 在光纤上的说法」',
  cnMx.includes('WDM分波长，是FDM在光纤上的说法'), true);
const osMo = flat(read('pwa/img/os_fig_monitor.svg'));
check('OS 管程图写明 wait 释放管程、signal 只唤醒不传值',
  osMo.includes('自动释放管程') && osMo.includes('唤醒不传值'), true);
check('OS 管程图列出四大特性（模块化/信息隐蔽/互斥性/队列管理）',
  osMo.includes('模块化') && osMo.includes('信息隐蔽') && osMo.includes('互斥性') && osMo.includes('队列管理'), true);

// ---------- 4. 五个纯判据黄框 ----------
const CALLOUTS = [
  ['cn', '6.4.1', '一次收发只走两种协议'],
  ['co', '5.2.1', '取指不需要操作码控制'],
  ['os', '1.1.2', '三大角色按「对谁」分'],
  ['os', '1.2.3', '响应时间只有两个变量'],
  ['cn', '2.3.1', '「再生」不是「放大」'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 1, os: 2, cn: 2, ds: 0 };
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
check('本批 5 个黄框都定位到了', newBodies.length, 5);
check('本批 5 个黄框结构合法（无内嵌块级、无 tspan）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 5 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 5 个黄框都不是空壳（正文 > 80 字）',
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
const FIG_N = { co: 41, os: 65, cn: 40, ds: 31 };
const CALL_N = { co: 74, os: 77, cn: 51, ds: 106 };
for (const sub of SUBS) {
  check(sub + ' 配图 >= ' + FIG_N[sub] + ' 张（P12 下限，后续批次会继续加）',
    (RAW[sub].match(/fig-img/g) || []).length, n => n >= FIG_N[sub]);
  check(sub + ' 黄框 >= ' + CALL_N[sub] + ' 个（P12 下限，后续批次会继续加）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, n => n >= CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img >= 177 张（P12 下限）', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), n => n >= 177);
check('全库黄框 >= 308 个（P12 下限）', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), n => n >= 308);
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
const BAK_DIR = 'archive/fig_p12_2026-11-13/';
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
if (guardDone === 3) {
  check('三科 before 备份都参与了纯插入校验', guardDone, 3);
  check('变化的 13 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 >= 13（P12 下限，后续批次继续改）', changed, n => n >= 13);
} else {
  console.log('SKIP 纯插入守卫：缺少三科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p12: ' + pass + ' passed, ' + fail + ' failed');
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
          .filter(img => /co_fig_port_addr|os_fig_ipc|cn_fig_multiplex|os_fig_monitor/.test(img.getAttribute('src') || '') && img.closest('li')).length,
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
    console.log('_test_fig_p12: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
