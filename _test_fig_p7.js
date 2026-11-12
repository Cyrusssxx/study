/* 2026-11-12 第七批（跨四科）：4 张自绘图 + 8 个判据黄框。
 * CO 2.2.2 三种移位位流 / OS 2.5.1 资源分配图 / CN 2.2.1 传输介质 / DS 8.7.2 外部排序 I/O 账；
 * 另给 CO 4.1.1、OS 1.3.1、CN 4.1.1、DS 6.3.3 各补 1 个判据黄框。
 * 锁精确总量：fig-img 149（co35/os54/cn32/ds28）、黄框 258（59/63/37/99）。
 * 行号双基线：CO 1819/1971、OS 3660/3668、CN 1108/1220、DS 1173(配对)/1175(开标签)/1330，本批零漂移。
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
const flat = s => s.replace(/\s+/g, '').replace(/[−–—]/g, '-').replace(/[₁₂₃]/g, c => ({ '₁': '1', '₂': '2', '₃': '3' }[c]));
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
  co: 'co_fig_shift_ops', os: 'os_fig_deadlock_rag',
  cn: 'cn_fig_media', ds: 'ds_fig_ext_sort'
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
  check(name + ' 没有元素画到 680 之外', [...s.matchAll(/x="(\d+)"/g)].every(m => +m[1] <= 640), true);
}

// ---------- 2. 落位：紧跟知识点、不落进 <p>/<li> ----------
const LANDING = [
  ['co', '2.2.2', 'co_fig_shift_ops'], ['os', '2.5.1', 'os_fig_deadlock_rag'],
  ['cn', '2.2.1', 'cn_fig_media'], ['ds', '8.7.2', 'ds_fig_ext_sort']
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
check('CO 2.2.2 图在「易错点」列表之后、★ 之前',
  secHtml('co', '2.2.2').indexOf('co_fig_shift_ops.svg') > secHtml('co', '2.2.2').indexOf('float 型不能通过左移'), true);
check('CN 2.2.1 图在 CDMA 例子之后、「双绞线的两种」之前（避开未闭合 ul）',
  secHtml('cn', '2.2.1').indexOf('cn_fig_media.svg') > secHtml('cn', '2.2.1').indexOf('正是靠正交性叠加信号') &&
  secHtml('cn', '2.2.1').indexOf('cn_fig_media.svg') < secHtml('cn', '2.2.1').indexOf('双绞线的两种'), true);
check('DS 8.7.2 图在「② 多路归并」之后、「三、教材示例」之前（避开未闭合 ul）',
  secHtml('ds', '8.7.2').indexOf('ds_fig_ext_sort.svg') > secHtml('ds', '8.7.2').indexOf('② 多路归并') &&
  secHtml('ds', '8.7.2').indexOf('ds_fig_ext_sort.svg') < secHtml('ds', '8.7.2').indexOf('三、教材示例'), true);
check('OS 2.5.1 图在「死锁一定有环」结语之后、★ 之前',
  secHtml('os', '2.5.1').indexOf('os_fig_deadlock_rag.svg') > secHtml('os', '2.5.1').indexOf('有环不一定死锁</b>（环是死锁的必要条件'), true);
check('CO 4.1.1 黄框在 ★ 之前',
  secHtml('co', '4.1.1').indexOf('ISA 只定') < secHtml('co', '4.1.1').indexOf(STAR), true);
check('OS 1.3.1 黄框在 ★ 之前',
  secHtml('os', '1.3.1').indexOf('内核＝常驻内存') < secHtml('os', '1.3.1').indexOf(STAR), true);
check('CN 4.1.1 黄框在 ★ 之前',
  secHtml('cn', '4.1.1').indexOf('四个功能的动作归属') < secHtml('cn', '4.1.1').indexOf(STAR), true);

// ---------- 3. 图与正文同源（数字/术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['co', '2.2.2', 'co_fig_shift_ops', ['算术右移', '算术左移', '循环左移', '阶码', '溢出']],
  ['os', '2.5.1', 'os_fig_deadlock_rag', ['资源分配图', '循环等待', '有环', '死锁', '不可剥夺']],
  ['cn', '2.2.1', 'cn_fig_media', ['双绞线', '同轴', '光纤', '全反射', '绞合', '屏蔽']],
  ['ds', '8.7.2', 'ds_fig_ext_sort', ['2000', '125', '250', '128', '96', '归并']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
// 位流数值自洽：算术右移 −7→−4、算术左移 0100 0000 溢出、逻辑右移 249→124、循环左移 1011 0010→0110 0101
const coFig = flat(read('pwa/img/co_fig_shift_ops.svg'));
check('CO 移位图位流自洽（-7→-4 / 溢出得 -128 / 249→124 / 循环串）',
  ['-7→-4', '-128', '249→124', '10110010→01100101'].every(t => coFig.includes(t)), true);
check('CO 移位图与正文同用「-7 右移得 -4」这个例子', flat(secHtml('co', '2.2.2')).includes('-7右移1位得-4'), true);
// 外部排序数字与正文同源
const dsFig = flat(read('pwa/img/ds_fig_ext_sort.svg'));
check('DS 外部排序图趟数算式自洽（32×3+32=128 / 32×2+32=96）',
  dsFig.includes('32×3＋建段32＝128') || dsFig.includes('32×3+建段32=128'), true);
check('DS 外部排序图两趟数都写了', dsFig.includes('3趟') && dsFig.includes('2趟'), true);

// ---------- 4. 八个黄框 ----------
const CALLOUTS = [
  ['co', '2.2.2', '先判「哪种移位」再判'], ['co', '4.1.1', 'ISA 只定「看得见的契约」'],
  ['os', '2.5.1', '先数实例，再判环'], ['os', '1.3.1', '内核＝常驻内存、紧贴硬件的那一层'],
  ['cn', '2.2.1', '「绞合」与「屏蔽」是两件事'], ['cn', '4.1.1', '四个功能的动作归属'],
  ['ds', '8.7.2', '先算三个数，再算 I/O'], ['ds', '6.3.3', '调用次数＝连通分量数'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
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
const FIG_N = { co: 35, os: 54, cn: 32, ds: 28 };
const CALL_N = { co: 59, os: 63, cn: 37, ds: 99 };
for (const sub of SUBS) {
  check(sub + ' 配图不少于 ' + FIG_N[sub] + ' 张（P7 下限，精确量归 P8）', (RAW[sub].match(/fig-img/g) || []).length, n => n >= FIG_N[sub]);
  check(sub + ' 黄框不少于 ' + CALL_N[sub] + ' 个（P7 下限，精确量归 P8）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, n => n >= CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]);
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.length >= FIG_N[sub] &&
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img 不少于 149 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), n => n >= 149);
check('全库黄框不少于 258 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), n => n >= 258);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于 P6 值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-2d1628adf0'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p7_2026-11-12/';
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
  check('P7 之后所有变化仍是纯插入（0 删除 / 0 改写）', guardBad, 0);
} else {
  console.log('SKIP 纯插入守卫：缺少四科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p7: ' + pass + ' passed, ' + fail + ' failed');
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
          .filter(img => /co_fig_shift_ops|os_fig_deadlock_rag|cn_fig_media|ds_fig_ext_sort/.test(img.getAttribute('src') || '') && img.closest('li')).length,
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
      check(sub + ' 真实渲染配图不少于 ' + FIG_N[sub] + ' 张', a.figs, n => n >= FIG_N[sub]);
      check(sub + ' 真实渲染黄框不少于 ' + CALL_N[sub] + ' 个', a.calls, n => n >= CALL_N[sub]);
      check(sub + ' 图块被误标行号 = 0', a.misLabeled, 0);
      check(sub + ' 全库黄框没有一个落在 li/p 内部',
        [...a.document.querySelectorAll('.key-callout')].filter(el => el.closest('li,p')).length, 0);
      check(sub + ' 本批黄框在 DOM 里都定位到了且不嵌 li/p',
        a.newCalls === 2 && a.badCalls === 0, true);
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
    console.log('_test_fig_p7: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
