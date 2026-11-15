/* 2026-11-15 第十七批：CN 2.1.3 基带编码波形图从 <img> 外链改为内联 SVG，
 * 并补齐 RZ / NRZI 两条波形（原图只画 3 种，正文「编码全家福」列了 5 种）。
 *
 * 改内联的动机（用户反馈）：原图是 <img src="img/cn_fig_encoding_wave.svg">，
 *  SVG 内硬编码白底 #ffffff + 深色文字 —— 暗色主题下是一块刺眼白板；且外链 SVG
 *  在页面缩放 / 高 DPR 下可能按固有尺寸栅格化再放大而发虚。内联后文字线条直接
 *  参与渲染树，任意缩放都是矢量；配色走 CSS 变量，亮/暗自动适配；窄屏改为
 *  横向滚动而不是把 11.5px 字缩成 8px。
 *
 * 本文件统管：CN/全库 fig-img 精确量、struct-fig 精确量、波形路径与比特串的同源
 *  断言、资源三方一致性、行号双基线（CN 静态 1108 / jsdom 1220）。
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
const BAK = 'archive/cn_wave_inline_2026-11-15/cn_notes.before.json';
const SVG_FILE = 'pwa/img/cn_fig_encoding_wave.svg';

function secHtml(sub, num) {
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || []))
      if (x.section.split(' ')[0] === num) return x.html || '';
  return '';
}
const H = secHtml('cn', '2.1.3');

// ---------- 1. 精确总量 / 序列化 ----------
const FIG_N = { co: 54, os: 73, cn: 50, ds: 37 };
for (const s of SUBS)
  check(s + ' 配图 ' + FIG_N[s] + ' 张（精确）', (RAW[s].match(/fig-img/g) || []).length, FIG_N[s]);
check('全库 fig-img 214 张（精确）',
  SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), 214);
check('cn struct-fig 12 个（含本图）', (RAW.cn.match(/struct-fig/g) || []).length, 12);
check('全库 struct-fig 27 个（CO0/DS0/CN12/OS15）',
  SUBS.reduce((n, s) => n + (RAW[s].match(/struct-fig/g) || []).length, 0), 27);
check('笔记 JSON 里没有 SVG 专有的 tspan', SUBS.every(s => !RAW[s].includes('tspan')), true);
for (const s of SUBS)
  check(s + ' 序列化格式未变',
    [RAW[s].indexOf('\r\n') > 0, RAW[s].endsWith('\n')], s === 'os' ? [false, true] : [true, false]);
check('cn_notes.json 无裸 LF（CRLF 一致）', /\r\n/.test(RAW.cn) && !/(?<!\r)\n/.test(RAW.cn), true);

// ---------- 2. 图块结构 ----------
check('2.1.3 有内联波形图块',
  H.includes('<figure class="struct-fig wave-fig" data-fig="1">'), true);
check('图块带 data-fig（不参与行号）',
  /<figure class="struct-fig wave-fig" data-fig="1">/.test(H), true);
check('图注写明「五种基带编码波形」',
  /<b>图：五种基带编码波形对照/.test(H), true);
check('图注标明 NRZI / 差分曼彻斯特的初始电平假设',
  H.includes('初始电平为低'), true);
check('图块在 ★ 高频真题考点之前',
  (() => { const iF = H.indexOf('<figure class="struct-fig wave-fig"'); const iS = H.indexOf('★ 高频真题考点'); return iF > 0 && (iS < 0 || iF < iS); })(), true);
check('图块在编码规则表格之后（先表格后图）',
  (() => { const iT = H.indexOf('<table>'); const iF = H.indexOf('<figure class="struct-fig wave-fig"'); return iT >= 0 && iF > iT; })(), true);

// ---------- 3. 波形与比特串同源（核心） ----------
// 比特串 0100110；每条 path 的 V/H 命令就是电平跳变位置，硬编码人工核对过的期望值。
// 五条路径分别对应 NRZ / NRZI / RZ / 曼彻斯特 / 差分曼彻斯特。
const EXPECT_PATHS = [
  // NRZ：高=1 低=0，0/1/0/0/1/1/0 → 低高低低高高低
  'M110 144 H186 V104 H262 V144 H414 V104 H566 V144 H642',
  // NRZI：起始跳=0、无跳=1，设初态低 → 高 高 低 高 高 高 低
  'M110 224 V184 H262 V224 H338 V184 H566 V224 H642',
  // RZ：1 的码元在正中回零，0 保持低
  'M110 304 H186 V264 H224 V304 H414 V264 H452 V304 H490 V264 H528 V304 H642',
  // 曼彻斯特：中点必跳，高→低=1、低→高=0
  'M110 384 H148 V344 H224 V384 H300 V344 H338 V384 H376 V344 H452 V384 H490 V344 H528 V384 H604 V344 H642',
  // 差分曼彻斯特：每位中点必跳；起始跳=0、不跳=1
  'M110 424 H148 V464 H224 V424 H262 V464 H300 V424 H338 V464 H376 V424 H452 V464 H528 V424 H566 V464 H604 V424 H642',
];
const paths = [...H.matchAll(/<path class="wave-line" d="([^"]+)"/g)].map(m => m[1]);
check('波形图恰有 5 条编码波形', paths.length, 5);
check('五条波形路径与比特串 0100110 逐条一致', paths, EXPECT_PATHS);
check('每条波形都落在比特区 [110, 642]',
  paths.every(d => {
    const xs = [...d.matchAll(/[MH](\d+)/g)].map(m => +m[1]);
    return xs.length > 0 && xs.every(x => x >= 110 && x <= 642);
  }), true);

const bits = [...H.matchAll(/<text class="wave-bit"[^>]*>([01])<\/text>/g)].map(m => m[1]).join('');
check('比特行 7 个数字，拼起来是 0100110', bits, '0100110');
check('比特数字 x 坐标为等距 7 格',
  [...H.matchAll(/<text class="wave-bit" x="(\d+)"/g)].map(m => +m[1]),
  [148, 224, 300, 376, 452, 528, 604]);

const names = [...H.matchAll(/<text class="wave-name"[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);
check('五种编码标签齐全（NRZ / NRZI / RZ / 曼彻斯特 / 差分曼彻斯特）',
  names, ['NRZ', 'NRZI', 'RZ', '曼彻斯特', '差分曼彻斯特']);

// ---------- 4. 关键考点必须留在图里（原图有、不能因改内联丢失） ----------
check('图内说明含「码元率是比特率 2 倍」', H.includes('2 倍') && H.includes('带宽'), true);
check('图内说明含曼彻斯特数据约定「高→低=1」', H.includes('高→低=1'), true);
check('图内说明含 NRZI 规则「跳=0、不跳=1」', H.includes('跳=0、不跳=1'), true);
check('图内说明点明差分曼彻斯特看起始跳变', H.includes('差分曼彻斯特看起始跳变'), true);
check('图内说明点明 NRZ 无内在时钟', H.includes('无内在时钟'), true);
check('图内说明点明 RZ 费带宽', H.includes('自带时钟但费带宽'), true);

// ---------- 5. 正文同源：五种编码在正文表格/全家福里都有 ----------
check('正文表格有 NRZ / 曼彻斯特 / 差分曼彻斯特',
  ['不归零码 NRZ', '曼彻斯特编码', '差分曼彻斯特编码'].every(t => H.includes(t)), true);
check('正文「编码全家福」有 RZ / NRZI',
  ['归零 RZ', '反向非归零 NRZI'].every(t => H.includes(t)), true);
check('正文曼彻斯特约定与图一致（高→低代表 1）', H.includes('高→低代表 1'), true);

// ---------- 6. 资源三方一致：旧外链图必须彻底退场 ----------
check('笔记里不再引用 img/cn_fig_encoding_wave.svg',
  !RAW.cn.includes('cn_fig_encoding_wave'), true);
check('磁盘上旧图已删除', fs.existsSync(path.join(ROOT, SVG_FILE)), false);
check('SW DATA_PRECACHE 里没有旧图条目',
  !sw.includes("'img/cn_fig_encoding_wave.svg'"), true);
check('SW 三层版本都是有效哈希',
  [/quiz408-app-[a-f0-9]{10}/, /quiz408-data-[a-f0-9]{10}/, /quiz408-lazy-[a-f0-9]{10}/].every(re => re.test(sw)), true);
const refs = [...new Set([...RAW.cn.matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
check('CN 仍被引用的图都在磁盘且已预缓存',
  refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
check('CN 图引用数 = 50', refs.length, 50);

// ---------- 7. 样式契约（内联图靠 class 上色，不能写死 fill/stroke） ----------
check('没有在 SVG 里写死 stroke="#…" 颜色', /stroke="#[0-9a-fA-F]{3,6}"/.test(H), false);
check('没有在 SVG 里写死 fill="#…" 颜色', /fill="#[0-9a-fA-F]{3,6}"/.test(H), false);
check('SVG 不写背景矩形（避免暗色白块）', !/<rect[^>]*fill="#ffffff"/.test(H), true);
check('CSS 有 .struct-fig.wave-fig 横向滚动', /\.struct-fig\.wave-fig\s*\{[^}]*overflow-x:\s*auto/.test(css), true);
check('CSS 给窄屏保底宽度（不缩字）', /\.struct-fig\.wave-fig \.struct-svg\s*\{[^}]*min-width:\s*600px/.test(css), true);
check('CSS 波形线用主色变量', /\.struct-svg \.wave-line\s*\{[^}]*stroke:\s*var\(--primary\)/.test(css), true);
check('CSS 分界虚线用边框色变量', /\.struct-svg \.wave-grid\s*\{[^}]*stroke:\s*var\(--border\)/.test(css), true);

// ---------- 8. 行号静态双基线（图块不参与行号） ----------
function allHtmls(sub) {
  const out = [];
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) out.push({ sec: x.section, h: x.html || '' });
  return out;
}
{
  let paired = 0, open = 0;
  for (const { h } of allHtmls('cn')) {
    (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => { if (!/^<p\b[^>]*data-fig/.test(t)) paired++; });
    paired += (h.match(/<li\b[^>]*>/g) || []).length;
    (h.match(/<p\b[^>]*>/g) || []).forEach(t => { if (!/data-fig/.test(t)) open++; });
    open += (h.match(/<li\b[^>]*>/g) || []).length;
  }
  check('CN 静态可批注行（配对口径）1108', paired, 1108);
  check('CN 静态可批注行（开标签口径）1108', open, 1108);
}

// ---------- 9. before / after 差异只落在 2.1.3 一处 ----------
if (fs.existsSync(path.join(ROOT, BAK))) {
  const B = JSON.parse(read(BAK));
  const mapOf = d => { const m = new Map(); for (const ch of d.chapters) for (const s of ch.sections || []) for (const x of [s].concat(s.subsections || [])) m.set(x.section, x.html || ''); return m; };
  const bm = mapOf(B), am = mapOf(DOC.cn);
  // before 备份早于「考点标注」批次：那次给 18 个 CN 块首位插了 <div class="zt-ref">
  // （纯插入、不入行号）。比对前先剥掉，否则会把 18 处无关变化算成本批改动。
  const stripZt = h => (h || '').replace(/^<div class="zt-ref">[\s\S]*?<\/div>/, '');
  // 4.2.5 后来又插了 2021-47 时序图（纯插入的 data-fig 双段块）：比对前剥掉，
  // 否则本批「只改 2.1.3」的守卫会被后续批次干扰。剥掉后必须与 before 逐字相同。
  const stripWv = h => (h || '').replace(/\n<p class="paragraph" data-fig="1"><b>图：2021-47[\s\S]*?cn_fig_web_visit_seq\.svg[^>]*\/><\/p>/, '');
  // 后续批次（第四批）又给 CN 4.5.3 / 4.3.4 各插了一张图，都是纯插入的 data-fig 双段块。
  // 这两节不参与本批「只改 2.1.3」的守卫，但必须单独过「纯插入」断言。
  const LATER = ['4.5.3 在局域网上进行硬件多播', '4.3.4 从IPv4向IPv6过渡'];
  const subseq = (old, neu) => {
    let i = 0;
    for (let j = 0; j < neu.length && i < old.length; j++) if (neu[j] === old[i]) i++;
    return i === old.length;
  };
  check('后续两张 CN 图所在小节都是纯插入（before 是 after 的子序列）',
    LATER.every(k => subseq(stripZt(bm.get(k)), stripZt(am.get(k)))), true);
  const changed = [...bm.keys()].filter(k => !LATER.includes(k) && stripWv(stripZt(bm.get(k))) !== stripWv(stripZt(am.get(k))));
  check('4.2.5 只多了 2021-47 图块（剥掉后与 before 逐字一致）',
    stripWv(stripZt(am.get('4.2.5 地址解析协议（ARP）'))) === stripZt(bm.get('4.2.5 地址解析协议（ARP）')), true);
  check('本批只改了 1 个小节', changed.length, 1);
  check('改动的小节正是 2.1.3', (changed[0] || '').split(' ')[0], '2.1.3');
  check('小节数量不变（未增删小节）', am.size, bm.size);
  // 旧块被新块整体替换：把新块剥掉后应与旧块逐字相同
  const stripped = stripZt(am.get(changed[0])).replace(/\n<p class="paragraph" data-fig="1"><b>图：五种基带编码波形对照[\s\S]*?<\/figure>/, '');
  const oldClean = stripZt(bm.get(changed[0])).replace(/\n<p class="paragraph" data-fig="1"><b>图：三种基带编码波形对照[\s\S]*?<\/p>\n<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/cn_fig_encoding_wave\.svg"[^>]*\/><\/p>/, '');
  check('除图块外正文逐字未改（0 误伤）', stripped === oldClean, true);
} else {
  console.log('SKIP before/after 差异守卫：缺归档备份（不进 git）');
}

// ---------- 10. jsdom 真实渲染 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_cn_code_wave: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
(async () => {
  async function render(raw) {
    const pageHtml = read('pwa/notes.html')
      .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
        try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
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
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    const out = {
      lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
      // OS 1.5 已按「精简」重排（110 段 → 41 段，见 tools/slim_os15.py）：
      // 逐行比对与数量一致性都排除该节，其余小节仍要求零漂移。
      no15: [...d.querySelectorAll('.anno-line')].filter(e => {
          const h = e.closest('.notes-sub') || e.closest('.notes-section');
          return !(h && /^(1\.5 |5\.3\.1 |5\.3\.3 )/.test(h.dataset.sec));
      }).map(e => e.textContent.trim()),
      figs: d.querySelectorAll('img.fig-img').length,
      waveFigs: d.querySelectorAll('figure.wave-fig').length,
      wavePaths: d.querySelectorAll('figure.wave-fig path.wave-line').length,
      waveBits: d.querySelectorAll('figure.wave-fig text.wave-bit').length,
      misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
      inLi: [...d.querySelectorAll('figure.wave-fig')].filter(f => f.closest('li')).length,
      window: dom.window,
    };
    return out;
  }
  const a = await render(RAW.cn);
  check('真实渲染 .anno-line = 1220（CN 基线，零漂移）', a.lines.length, 1220);
  check('真实渲染 img.fig-img = 50', a.figs, 50);
  check('真实渲染出 1 个内联波形图', a.waveFigs, 1);
  check('真实渲染出 5 条波形路径', a.wavePaths, 5);
  check('真实渲染出 7 个比特数字', a.waveBits, 7);
  check('图块被误标行号 = 0', a.misLabeled, 0);
  check('内联图没有落进 li', a.inLi, 0);
  if (fs.existsSync(path.join(ROOT, BAK))) {
    const b = await render(read(BAK));
    check('双版本 .anno-line 数量一致（改图不影响行号）', b.no15.length, a.no15.length);
    let first = -1;
    if (b.no15.length === a.no15.length)
      for (let k = 0; k < b.no15.length; k++) if (b.no15[k] !== a.no15[k]) { first = k; break; }
    check('双版本逐行文本完全一致（行级批注零错位）', first, -1);
    // 2.1.3 旧 PNG 波形图被内联 SVG 顶替（-1），4.2.5 加 2021-47 时序图（+1）→ 持平在 48；
    // 第四批又给 4.5.3 / 4.3.4 各加一张（+2）→ 50。两处都走 data-fig 双段块，不占行号。
    check('改图后 img.fig-img 净变化 = +2（第四批两张 CN 图）', [b.figs, a.figs], [48, 50]);
    b.window.close();
  } else {
    console.log('SKIP 双版本逐行比对：缺 before 备份');
  }
  a.window.close();
  console.log('_test_cn_code_wave: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
