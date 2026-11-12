/* 2026-11-12 第九批（跨四科）：4 张自绘图 + 8 个纯判据黄框（合计 12 个框）。
 * CO 3.5.7 分离/多级 Cache · OS 2.3.4 信号量取值 · CN 4.2.2 子网划分与 CIDR · DS 7.3.1 BST 删除；
 * 另给 CO 3.6.4、CO 5.6、CO 6.2、OS 2.1.5、OS 1.2.2、CN 4.2.7、CN 4.4.2、CN 3.5.1 各补 1 个判据黄框。
 * 锁精确总量：fig-img 157（co37/os56/cn34/ds30）、黄框 280（66/68/43/103）。
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
  co: 'co_fig_cache_multi', os: 'os_fig_sem_state',
  cn: 'cn_fig_subnet', ds: 'ds_fig_bst_delete'
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
  ['co', '3.5.7', 'co_fig_cache_multi'], ['os', '2.3.4', 'os_fig_sem_state'],
  ['cn', '4.2.2', 'cn_fig_subnet'], ['ds', '7.3.1', 'ds_fig_bst_delete']
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
check('CO 3.5.7 图在「易错点」段之后（该小节无 ★，追加在末尾）',
  secHtml('co', '3.5.7').indexOf('co_fig_cache_multi.svg') > secHtml('co', '3.5.7').indexOf('多级 Cache 的脏块逐级写回'), true);
check('OS 2.3.4 图在「PV 用法总结」之后、★ 之前',
  secHtml('os', '2.3.4').indexOf('os_fig_sem_state.svg') > secHtml('os', '2.3.4').indexOf('中间不得插入无关代码'), true);
check('CN 4.2.2 图在 VLSM 判据框之后、★ 之前',
  secHtml('cn', '4.2.2').indexOf('cn_fig_subnet.svg') > secHtml('cn', '4.2.2').indexOf('从最大的子网先划'), true);
check('DS 7.3.1 图在「易错点」框之后、★ 之前',
  secHtml('ds', '7.3.1').indexOf('ds_fig_bst_delete.svg') > secHtml('ds', '7.3.1').indexOf('不是删除原结点'), true);
// 纯框位置
check('CO 3.6.4 黄框在该小节末尾（段落收尾，无 ★）',
  secHtml('co', '3.6.4').indexOf('两次查表是段页式的唯一硬伤') > secHtml('co', '3.6.4').indexOf('代价是开销'), true);
check('CO 5.6 / CO 6.2 是纯 ★ 小节，黄框追加在其列表之后',
  secHtml('co', '5.6').indexOf('先分清并行类型再套公式') > secHtml('co', '5.6').indexOf('Q467 2023') &&
  secHtml('co', '6.2').indexOf('同步看时钟、异步看握手') > secHtml('co', '6.2').indexOf('Q517'), true);
check('OS 2.1.5 黄框在 Block/Wakeup 段之后、★ 之前',
  secHtml('os', '2.1.5').indexOf('创建的第一步、撤销的最后一步都是 PCB') > secHtml('os', '2.1.5').indexOf('都有相应唤醒路径'), true);
check('OS 1.2.2 黄框在分时对比段之后、★ 之前',
  secHtml('os', '1.2.2').indexOf('单道与多道只差一句话') > secHtml('os', '1.2.2').indexOf('“作业自行完成”'), true);
check('CN 4.2.7 黄框在 ICMP 报文列表之后、★ 之前',
  secHtml('cn', '4.2.7').indexOf('五类差错报文背数字') > secHtml('cn', '4.2.7').indexOf('tracert 用递增 TTL'), true);

// ---------- 3. 图与正文同源（数字/术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['co', '3.5.7', 'co_fig_cache_multi', ['写分配', '回写', 'L1', 'L2', '取指']],
  ['os', '2.3.4', 'os_fig_sem_state', ['等待队列', 'block', 'wakeup', '就绪态', '临界区']],
  ['cn', '4.2.2', 'cn_fig_subnet', ['202.118.1', '/26', '62', 'CIDR', '255.255.255.192']],
  ['ds', '7.3.1', 'ds_fig_bst_delete', ['中序后继', '55', '60', 'Q455']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
const coFig = flat(read('pwa/img/co_fig_cache_multi.svg'));
check('CO Cache 图三态齐全（L1 指令 / L1 数据 / L2 统一 → 主存）',
  ['L1指令Cache', 'L1数据Cache', 'L2Cache（统一）', '主存'].every(t => coFig.includes(t)), true);
check('CO Cache 图写回路径写成逐级（L1 → L2 → 主存），未写成 L1 直写主存',
  coFig.includes('L1→L2→主存') && coFig.includes('不是每级都写主存'), true);
const osFig = flat(read('pwa/img/os_fig_sem_state.svg'));
check('OS 信号量图四个取值齐全（1 / 0 / -1 / -2）',
  ['无人（资源1个空闲）', '资源刚用完', '1个在阻塞', '2个在阻塞'].every(t => osFig.includes(t)), true);
check('OS 信号量图重申 |S| = 等待进程数',
  osFig.includes('|S|=等待队列中的进程数'), true);
const cnFig = flat(read('pwa/img/cn_fig_subnet.svg'));
check('CN 子网图四个子网地址与正文一致（.0 / .64 / .128 / .192）',
  ['.0', '.64', '.128', '.192'].every(t => cnFig.includes(t)), true);
check('CN 子网图广播地址 = 下一子网 − 1（.63 / .127 / .191 / .255）',
  ['.63', '.127', '.191', '.255'].every(t => cnFig.includes(t)), true);
check('CN 子网图位段写法 24 网络 + 2 子网 + 6 主机',
  cnFig.includes('原网络号24位') && cnFig.includes('主机6位') && cnFig.includes('+2'), true);
const dsFig = flat(read('pwa/img/ds_fig_bst_delete.svg'));
check('DS BST 图删除前后中序序列都写对了',
  dsFig.includes('中序：(20,30,40,50,55,60,70,80)') &&
  dsFig.includes('中序：(20,30,40,55,60,70,80)'), true);
check('DS BST 图点明「55 只有右孩子 60 → 由 60 顶替」',
  dsFig.includes('55只有右孩子60→由60顶替'), true);

// ---------- 4. 十二个黄框 ----------
const CALLOUTS = [
  ['co', '3.5.7', '分离与分级是两个考点'],
  ['co', '3.6.4', '两次查表是段页式的唯一硬伤'],
  ['co', '5.6', '先分清并行类型再套公式'],
  ['co', '6.2', '同步看时钟、异步看握手'],
  ['os', '2.3.4', 'S 的符号就是判据'],
  ['os', '2.1.5', '创建的第一步、撤销的最后一步都是 PCB'],
  ['os', '1.2.2', '单道与多道只差一句话'],
  ['cn', '4.2.2', '子网划分就是借位'],
  ['cn', '4.2.7', '五类差错报文背数字'],
  ['cn', '4.4.2', '域内域外先分区'],
  ['cn', '3.5.1', '四类划分按「分什么」认'],
  ['ds', '7.3.1', '删除只有一条正确姿势'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 4, os: 3, cn: 4, ds: 1 };
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
check('本批 12 个黄框都定位到了', newBodies.length, 12);
check('本批 12 个黄框结构合法（无内嵌块级、无 tspan、无 svg 标签）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 12 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 12 个黄框都不是空壳（正文 > 80 字）',
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
// P10 起总量继续增长，本批改为下限（P9 当时精确值 37/56/34/30 与 66/68/43/103）
const FIG_N = { co: 37, os: 56, cn: 34, ds: 30 };
const CALL_N = { co: 66, os: 68, cn: 43, ds: 103 };
for (const sub of SUBS) {
  check(sub + ' 配图 ≥ ' + FIG_N[sub] + ' 张（P9 下限）',
    (RAW[sub].match(/fig-img/g) || []).length, v => v >= FIG_N[sub]);
  check(sub + ' 黄框 ≥ ' + CALL_N[sub] + ' 个（P9 下限）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, v => v >= CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img ≥ 157 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), v => v >= 157);
check('全库黄框 ≥ 280 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), v => v >= 280);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于 P8 值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-c33514692d'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p9_2026-11-12/';
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
  check('变化的 12 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 ≥ 12（后续批次会追加更多的纯插入）', changed, v => v >= 12);
} else {
  console.log('SKIP 纯插入守卫：缺少四科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p9: ' + pass + ' passed, ' + fail + ' failed');
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
          .filter(img => /co_fig_cache_multi|os_fig_sem_state|cn_fig_subnet|ds_fig_bst_delete/.test(img.getAttribute('src') || '') && img.closest('li')).length,
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
    console.log('_test_fig_p9: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
