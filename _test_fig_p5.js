/* 2026-11-12 第五批（跨四科）：4 张自绘图 + 8 个重点黄框。
 * OS 4.2.2 目录项分解 / CN 2.1.2 奈氏与香农 / CO 4.3.1 x86 相对转移 / DS 6.1.1 图的术语；
 * 另给 OS 2.3.4、CN 6.3.1、CO 5.7.1、DS 3.1.1 各补 1 个判据黄框。
 * 总量只锁下限（精确量已归 _test_fig_p6.js）：fig-img ≥141（co33/os52/cn30/ds26）、黄框 ≥242（55/59/33/95）。
 * 行号双基线：CO 1819/1971、OS 3660/3668、CN 1108/1220、DS 1173(配对)/1175(开标签)/1330，本批零漂移。
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
  os: 'os_fig_fcb_inode', cn: 'cn_fig_nyquist_shannon',
  co: 'co_fig_x86_asm', ds: 'ds_fig_graph_terms'
};

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
}

// ---------- 2. 落位 ----------
const LANDING = [
  ['os', '4.2.2', 'os_fig_fcb_inode'], ['cn', '2.1.2', 'cn_fig_nyquist_shannon'],
  ['co', '4.3.1', 'co_fig_x86_asm'], ['ds', '6.1.1', 'ds_fig_graph_terms']
];
for (const [sub, num, name] of LANDING) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 含本批图', h.includes('img/' + name + '.svg'), true);
  check(sub + ':' + num + ' 图块带 data-fig=1',
    /<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/[a-z0-9_]+\.svg"/.test(h), true);
  if (h.includes('<h4>★ 高频真题考点与陷阱</h4>')) {
    check(sub + ':' + num + ' 图在 ★ 之前',
      h.indexOf('img/' + name + '.svg') < h.indexOf('<h4>★ 高频真题考点与陷阱</h4>'), true);
  }
  const i = h.indexOf('img/' + name + '.svg');
  const figStart = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图：', i);
  check(sub + ':' + num + ' 图块前一标签是闭合标签（没落在正文里）',
    figStart >= 0 && h.slice(0, figStart).trimEnd().endsWith('>'), true);
}
check('DS 6.1.1 图在「易错点」段之后（全节术语总览收尾）',
  secHtml('ds', '6.1.1').indexOf('ds_fig_graph_terms.svg') > secHtml('ds', '6.1.1').indexOf('易错点：'), true);
check('CO 5.7.1 黄框紧跟「易错点」段之后',
  secHtml('co', '5.7.1').indexOf('只按两个维度判') > secHtml('co', '5.7.1').indexOf('易错点：'), true);

// ---------- 3. 图与正文同源 ----------
const SAME = [
  ['os', '4.2.2', 'os_fig_fcb_inode', ['64B', '16', '640', '20次', '1/4', 'inode区']],
  ['cn', '2.1.2', 'cn_fig_nyquist_shannon', ['4000Hz', '32kb/s', '8000b/s', '28000', '1.2Mb/s', 'QAM-64']],
  ['co', '4.3.1', 'co_fig_x86_asm', ['804846cH', '804846eH', '804847bH', '0dH', 'lea', '16位']],
  ['ds', '6.1.1', 'ds_fig_graph_terms', ['{1,2,3}', 'n(n-1)/2', '2|E|', '生成树', '强连通', 'n-1']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}

// ---------- 4. 八个黄框 ----------
const CALLOUTS = [
  ['os', '4.2.2', '一句话判据'], ['os', '2.3.4', 'P/V 必须成对且夹紧'],
  ['cn', '2.1.2', '先看题目给什么'], ['cn', '6.3.1', '两条 TCP 连接别混'],
  ['co', '4.3.1', '相对转移只认'], ['co', '5.7.1', '只按两个维度判'],
  ['ds', '6.1.1', '图不可以是空图'], ['ds', '3.1.1', '合法性判断只抓一条'],
];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
for (const [sub, num, kw] of CALLOUTS) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 有黄框且含判据「' + kw + '」',
    h.includes('key-callout') && h.includes(kw), true);
  if (h.includes('<h4>★ 高频真题考点与陷阱</h4>'))
    check(sub + ':' + num + ' 黄框在 ★ 之前', h.indexOf(kw) < h.indexOf('<h4>★ 高频真题考点与陷阱</h4>'), true);
}
// 本批新增黄框：结构合法、加粗充足、位置安全、不整段复刻正文
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
const FIG_N = { co: 33, os: 52, cn: 30, ds: 26 };
const CALL_N = { co: 55, os: 59, cn: 33, ds: 95 };
for (const sub of SUBS) {
  check(sub + ' 配图 ≥ ' + FIG_N[sub] + ' 张（P5 下限）', (RAW[sub].match(/fig-img/g) || []).length >= FIG_N[sub], true);
  check(sub + ' 黄框 ≥ ' + CALL_N[sub] + ' 个（P5 下限）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length >= CALL_N[sub], true);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]);
  check(sub + ' 图引用全部有磁盘文件且进了 SW',
    refs.length >= FIG_N[sub] &&
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img ≥141 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0) >= 141, true);
check('全库黄框 ≥242 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0) >= 242, true);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 已由构建脚本刷新（不等于上一批值）',
  sw.includes('quiz408-data-') && !sw.includes('quiz408-data-c1cd4da923') &&
  !sw.includes('quiz408-data-7125a7ac45'), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑，仓库里没有就跳过） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p5_2026-11-12/';
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
check('四科 before 备份都参与了纯插入校验', guardDone, 4);
check('变化的小节全是纯插入（0 删除 / 0 改写；后续批次会追加新小节）',
  changed >= 8 && guardBad === 0, true);

// ---------- 8. jsdom 真实渲染（四科逐行零漂移） ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p5: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    const JSDOM_BASE = { co: 1971, os: 3668, cn: 1220, ds: 1330 };
    for (const sub of SUBS) {
      const pageHtml = read('pwa/notes.html')
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
          try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
        }).replace(/<link\b[^>]*>/gi, '');
      const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
      const raw = RAW[sub];
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
      check(sub + ' 真实渲染 .anno-line = ' + JSDOM_BASE[sub],
        d.querySelectorAll('.anno-line').length, JSDOM_BASE[sub]);
      check(sub + ' 真实渲染配图 ≥ ' + FIG_N[sub] + ' 张', d.querySelectorAll('img.fig-img').length >= FIG_N[sub], true);
      check(sub + ' 真实渲染黄框 ≥ ' + CALL_N[sub] + ' 个', d.querySelectorAll('.key-callout').length >= CALL_N[sub], true);
      check(sub + ' 图块被误标行号 = 0',
        [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
      check(sub + ' 全库黄框没有一个落在 li/p 内部',
        [...d.querySelectorAll('.key-callout')].filter(el => el.closest('li,p')).length, 0);
      const newCalls = [...d.querySelectorAll('.key-callout')]
        .filter(el => NEW_KEYS.some(k => el.textContent.includes(k)));
      check(sub + ' 本批黄框在 DOM 里都定位到了',
        newCalls.length === 2 && newCalls.every(el => !el.closest('li,p')), true);
      const figs = d.querySelectorAll('img.fig-img');
      if (figs.length) {
        figs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        const lb = d.querySelector('#figLightbox');
        check(sub + ' 配图仍可点击放大', !!lb && lb.classList.contains('show'), true);
      }
      dom.window.close();
    }
    console.log('_test_fig_p5: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
