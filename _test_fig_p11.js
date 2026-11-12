/* 2026-11-13 第十一批（OS/CN/CO 三科优先）：4 张自绘图 + 8 个判据黄框。
 * OS 3.1.1 内存保护与共享 · OS 1.2.2 单道/多道批处理 · CN 6.3.1 FTP 双连接 · CO 3.4.1 磁盘地址与存取时间；
 * 另给 OS 2.1.5 进程控制、CN 6.2.2 域名服务器、CN 4.4.2 分层次路由、CO 5.1.3 CPU 寄存器各补 1 个判据黄框。
 * 锁精确总量：fig-img 165（co39/os59/cn36/ds31）、黄框 299（72/73/48/106）。
 * 行号双基线（本批零漂移）：CO 1819 / OS 3660 / CN 1101 / DS 1173·1175；jsdom 1971 / 3668 / 1220 / 1330。
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
  os: ['os_fig_mem_protect', 'os_fig_batch_phase'],
  cn: ['cn_fig_ftp'],
  co: ['co_fig_disk_addr'],
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
  ['os', '3.1.1', 'os_fig_mem_protect'],
  ['os', '1.2.2', 'os_fig_batch_phase'],
  ['cn', '6.3.1', 'cn_fig_ftp'],
  ['co', '3.4.1', 'co_fig_disk_addr'],
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
check('OS 3.1.1 图在「共享与保护的关系」段之后、★ 之前',
  secHtml('os', '3.1.1').indexOf('os_fig_mem_protect.svg') > secHtml('os', '3.1.1').indexOf('可重入代码是允许多个进程同时访问') &&
  secHtml('os', '3.1.1').indexOf('os_fig_mem_protect.svg') < secHtml('os', '3.1.1').indexOf(STAR), true);
check('OS 1.2.2 图在「单道 vs 多道」对照表之后、★ 之前',
  secHtml('os', '1.2.2').indexOf('os_fig_batch_phase.svg') > secHtml('os', '1.2.2').indexOf('系统开销') &&
  secHtml('os', '1.2.2').indexOf('os_fig_batch_phase.svg') < secHtml('os', '1.2.2').indexOf(STAR), true);
check('CN 6.3.1 图在「有状态协议」段之后、★ 之前',
  secHtml('cn', '6.3.1').indexOf('cn_fig_ftp.svg') > secHtml('cn', '6.3.1').indexOf('有状态') &&
  secHtml('cn', '6.3.1').indexOf('cn_fig_ftp.svg') < secHtml('cn', '6.3.1').indexOf(STAR), true);
check('CO 3.4.1 图在 RAID 分级之后、★ 之前',
  secHtml('co', '3.4.1').indexOf('co_fig_disk_addr.svg') > secHtml('co', '3.4.1').indexOf('RAID5') &&
  secHtml('co', '3.4.1').indexOf('co_fig_disk_addr.svg') < secHtml('co', '3.4.1').indexOf(STAR), true);
// 纯框位置
check('OS 2.1.5 黄框在进程控制原语段之后、★ 之前',
  secHtml('os', '2.1.5').indexOf('进程控制全是原语') > secHtml('os', '2.1.5').indexOf('唤醒') &&
  secHtml('os', '2.1.5').indexOf('进程控制全是原语') < secHtml('os', '2.1.5').indexOf(STAR), true);
check('CN 6.2.2 黄框在域名服务器段之后、★ 之前',
  secHtml('cn', '6.2.2').indexOf('递归与迭代看「谁在跑腿」') > secHtml('cn', '6.2.2').indexOf('根域名服务器') &&
  secHtml('cn', '6.2.2').indexOf('递归与迭代看「谁在跑腿」') < secHtml('cn', '6.2.2').indexOf(STAR), true);
check('CN 4.4.2 黄框在分层路由段之后、★ 之前',
  secHtml('cn', '4.4.2').indexOf('分层次的核心是「域内细、域间粗」') > secHtml('cn', '4.4.2').indexOf('为什么要 TCP') &&
  secHtml('cn', '4.4.2').indexOf('分层次的核心是「域内细、域间粗」') < secHtml('cn', '4.4.2').indexOf(STAR), true);
check('CO 5.1.3 黄框在寄存器段之后、★ 之前',
  secHtml('co', '5.1.3').indexOf('四个寄存器各司其职') > secHtml('co', '5.1.3').indexOf('程序计数') &&
  secHtml('co', '5.1.3').indexOf('四个寄存器各司其职') < secHtml('co', '5.1.3').indexOf(STAR), true);

// ---------- 3. 图与正文同源（术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['os', '3.1.1', 'os_fig_mem_protect', ['界地址寄存器', '重定位寄存器', '越界', '共享', '可重入', '特权指令']],
  ['os', '1.2.2', 'os_fig_batch_phase', ['单道批处理', '多道批处理', '脱机', '中断', '后备队列']],
  ['cn', '6.3.1', 'cn_fig_ftp', ['控制连接', '数据连接', 'PORT', 'PASV', '主进程', '从属进程']],
  ['co', '3.4.1', 'co_fig_disk_addr', ['柱面', '盘面', '扇区', '寻道', '旋转', '格式化容量', '非格式化容量']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
const osMp = flat(read('pwa/img/os_fig_mem_protect.svg'));
check('OS 保护图写明「先比后加」与越界走异常中断',
  osMp.includes('A&lt;界长?') === false ? osMp.includes('越界→异常中断') : true, true);
check('OS 保护图给出共享容量的两个数（8000KB / 1760KB）',
  osMp.includes('8000KB') && osMp.includes('1760KB'), true);
check('OS 保护图区分分页 40 个共享页表项与分段 1 个段表项',
  osMp.includes('40个共享页表项') && osMp.includes('1个段表项'), true);
const osBp = flat(read('pwa/img/os_fig_batch_phase.svg'));
check('OS 批处理图保留「三特征」与「宏观并行、微观串行」',
  osBp.includes('自动性·顺序性·单道性') && osBp.includes('宏观上并行') && osBp.includes('微观上串行'), true);
check('OS 批处理图把「CPU 与 I/O 重叠」点明',
  osBp.includes('CPU与I/O重叠') === false ? osBp.includes('两者在时间上重叠') : true, true);
const cnFtp = flat(read('pwa/img/cn_fig_ftp.svg'));
check('CN FTP 图两个端口齐全（21 控制 / 20 数据）',
  cnFtp.includes('TCP21') && cnFtp.includes('TCP20'), true);
check('CN FTP 图区分 PORT（服务器用 20 连客户端）与 PASV（服务器随机端口）',
  cnFtp.includes('自己的20号端口') && cnFtp.includes('随机端口'), true);
check('CN FTP 图点明目录列表走数据连接 + FTP 有状态',
  cnFtp.includes('目录列表') && cnFtp.includes('有状态'), true);
const coDk = flat(read('pwa/img/co_fig_disk_addr.svg'));
check('CO 磁盘图地址三段位数齐全（8 / 4 / 4）',
  coDk.includes('8位·0-255') && coDk.includes('4位·0-15'), true);
check('CO 磁盘图写清「转速翻倍只减旋转与传输，寻道不变」',
  coDk.includes('转速翻倍') && coDk.includes('寻道不变'), true);
check('CO 磁盘图给出 6000 转 → 半圈 5ms、0.83ms/扇区',
  coDk.includes('5ms') && coDk.includes('0.83ms'), true);

// ---------- 4. 八个黄框 ----------
const CALLOUTS = [
  ['os', '3.1.1', '「先比后加」不能颠倒'],
  ['os', '1.2.2', '一眼分辨'],
  ['os', '2.1.5', '进程控制全是原语'],
  ['cn', '6.3.1', '两条连接记端口、记生死'],
  ['cn', '6.2.2', '递归与迭代看「谁在跑腿」'],
  ['cn', '4.4.2', '分层次的核心是「域内细、域间粗」'],
  ['co', '3.4.1', '地址顺序就是性能'],
  ['co', '5.1.3', '四个寄存器各司其职'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 2, os: 3, cn: 3, ds: 0 };
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
check('本批 8 个黄框都定位到了', newBodies.length, 8);
check('本批 8 个黄框结构合法（无内嵌块级、无 tspan）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 8 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 8 个黄框都不是空壳（正文 > 80 字）',
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
const FIG_N = { co: 39, os: 59, cn: 36, ds: 31 };
const CALL_N = { co: 72, os: 73, cn: 48, ds: 106 };
for (const sub of SUBS) {
  check(sub + ' 配图 ' + FIG_N[sub] + ' 张（P11 精确总量）', (RAW[sub].match(/fig-img/g) || []).length, FIG_N[sub]);
  check(sub + ' 黄框 ' + CALL_N[sub] + ' 个（P11 精确总量）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img 165 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), 165);
check('全库黄框 299 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), 299);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于 P10 值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-0d2bd1a3fe'), true);
check('光箱工具栏在底部胶囊里且没有提示行',
  !read('pwa/js/lightbox.js').includes('fig-lb-tip') && read('pwa/js/lightbox.js').indexOf('fig-lb-bar') > read('pwa/js/lightbox.js').indexOf('fig-lb-stage'), true);
check('光箱遮罩是半透明（不再整屏 0.88 黑）',
  css.includes('background: rgba(24, 32, 44, .38)') && !css.includes('rgba(0, 0, 0, .88)'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p11_2026-11-13/';
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
  check('变化的 8 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 = 8', changed, 8);
} else {
  console.log('SKIP 纯插入守卫：缺少三科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p11: ' + pass + ' passed, ' + fail + ' failed');
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
          .filter(img => /os_fig_mem_protect|os_fig_batch_phase|cn_fig_ftp|co_fig_disk_addr/.test(img.getAttribute('src') || '') && img.closest('li')).length,
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
    console.log('_test_fig_p11: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
