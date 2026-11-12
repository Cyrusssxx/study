/* 2026-11-12 计网第四批：4 图（分层封装效率/路由转发/冲突域广播域/HTTP RTT）+ 6 黄框。
 * 另含「黄框覆盖守卫」：黄框不得塞进 <p>、不得复刻已有正文、不得改变行级批注行号、
 * 不得用绝对定位视觉遮挡、不得互相重复 —— 全库四科通用扫描。
 * 基线：CN 静态 1108 / jsdom .anno-line 1220；本批零漂移。
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

const cnRaw = read('pwa/data/notes/cn_notes.json');
const cn = JSON.parse(cnRaw);
const sw = read('pwa/sw.js');
const css = read('pwa/css/style.css');
const subjects = ['cn', 'os', 'co', 'ds'];

function secHtml(doc, num) {
  for (const ch of doc.chapters) {
    for (const s of ch.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if (x.section.split(' ')[0] === num) return x.html || '';
      }
    }
  }
  return '';
}
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

// ---------- 1. 四张 SVG ----------
const SVGS = ['cn_fig_encap_eff', 'cn_fig_route_fwd', 'cn_fig_domain', 'cn_fig_http_rtt'];
for (const name of SVGS) {
  const p = 'pwa/img/' + name + '.svg';
  check(name + ' 文件存在', fs.existsSync(path.join(ROOT, p)), true);
  const s = read(p);
  check(name + ' 白底 + viewBox', s.includes('<rect x="0" y="0"') && /viewBox="0 0 680 \d+"/.test(s), true);
  check(name + ' 无 HTML 标签 / 无 g 级 stroke 继承',
    ['<b>', '</b>', '<i>', '</i>', 'font-size="0"', '<g stroke'].every(t => !s.includes(t)), true);
  check(name + ' 是完整 SVG（以 </svg> 收尾）',
    s.trim().startsWith('<svg') && s.trim().endsWith('</svg>'), true);
}

// ---------- 2. 图落位 ----------
const LANDING = [
  ['1.2.3', 'cn_fig_encap_eff'],
  ['4.1.2', 'cn_fig_route_fwd'],
  ['4.7.1', 'cn_fig_domain'],
  ['6.5.2', 'cn_fig_http_rtt'],
];
for (const [num, name] of LANDING) {
  const h = secHtml(cn, num);
  check(num + ' 含自己的图 ' + name, h.includes('img/' + name + '.svg'), true);
  check(num + ' 图块带 data-fig=1',
    /<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/[a-z0-9_]+\.svg"/.test(h), true);
  if (h.includes('<h4>★ 高频真题考点与陷阱</h4>')) {
    check(num + ' 图在 ★ 之前', h.indexOf('img/' + name + '.svg') < h.indexOf('<h4>★ 高频真题考点与陷阱</h4>'), true);
  }
}
const h123 = secHtml(cn, '1.2.3');
check('1.2.3 新图插在已有内联 figure 之后（不覆盖旧图）',
  h123.indexOf('cn_fig_encap_eff.svg') > h123.indexOf('</figure>'), true);
check('1.2.3 三次握手/层次对照内联 figure 仍在',
  h123.includes('struct-fig') && h123.indexOf('</figure>') > 0, true);
// 6.5.2 的「教材补充」是历史未闭合 <ul>：图块必须插在它之前、已闭合的 RTT 例子 <p> 之后。
// 否则浏览器会把 <div class="key-callout"> 收进未闭合 <li>，令该行 textContent 被追加。
const h652pos = secHtml(cn, '6.5.2');
check('6.5.2 图块紧跟 RTT 例子段、且排在未闭合「教材补充」ul 之前',
  h652pos.indexOf('非持久连接取含 3 张图的页面') < h652pos.indexOf('cn_fig_http_rtt.svg') &&
  h652pos.indexOf('cn_fig_http_rtt.svg') < h652pos.indexOf('HTTP 的报文结构（教材补充'), true);

// ---------- 3. 图与正文同源 ----------
const h412 = secHtml(cn, '4.1.2'), h471 = secHtml(cn, '4.7.1'), h652 = secHtml(cn, '6.5.2');
check('封装图 400/500=80% 与 ★ 里的 2017 Q51 同源',
  read('pwa/img/cn_fig_encap_eff.svg').includes('80%') && h123.includes('400/500 = 80%') && h123.includes('2017 真题 Q51'), true);
check('路由图三列 / 最长前缀匹配 / 存储转发均来自 4.1.2 正文',
  ['目的网络地址', '最长前缀匹配', '存储转发'].every(t =>
    read('pwa/img/cn_fig_route_fwd.svg').includes(t) && h412.includes(t)), true);
check('域图 Q411 / 广播帧地址来自 4.7.1 ★',
  ['Q411', '255.255.255.255'].every(t =>
    read('pwa/img/cn_fig_domain.svg').includes(t) && h471.includes(t)), true);
check('RTT 图 8 RTT / 16 RTT / 304 来自 6.5.2 正文与 ★',
  read('pwa/img/cn_fig_http_rtt.svg').includes('= 8 RTT') &&
  read('pwa/img/cn_fig_http_rtt.svg').includes('16 RTT') && h652.includes('2+3×2=8 RTT') && h652.includes('16RTT'), true);

// ---------- 4. 六个黄框的判据内容 ----------
const CALLOUTS = [
  ['1.2.3', '效率题只数两样'],
  ['4.1.2', '两副面孔分开答'],
  ['4.7.1', '数广播域只数路由器接口'],
  ['6.5.2', '算 RTT 先数对象'],
  ['6.4.3', 'SMTP 是'],
  ['4.2.2', '判地址按三步'],
];
for (const [num, kw] of CALLOUTS) {
  const h = secHtml(cn, num);
  check(num + ' 有黄框且含判据「' + kw + '」', h.includes('key-callout') && h.includes(kw), true);
  if (h.includes('<h4>★ 高频真题考点与陷阱</h4>')) {
    check(num + ' 黄框在 ★ 之前', h.indexOf(kw) < h.indexOf('<h4>★ 高频真题考点与陷阱</h4>'), true);
  }
}

// ---------- 5. 黄框覆盖守卫（全库四科通用） ----------
const NEW_KEYS = CALLOUTS.map(c => c[1]);
let allCallouts = [], newBodies = [], structBad = 0, posBad = 0, dupBad = 0, copyBad = 0, bBad = 0;
for (const sub of subjects) {
  const doc = JSON.parse(read('pwa/data/notes/' + sub + '_notes.json'));
  // 必须在「解析后的 html 字符串」里查位置：JSON 源文件里的 \n 是转义序列，
  // 直接对 raw 取前缀会以一个字面 \n 结尾，导致闭合标签判据误判。
  const htmls = [];
  for (const ch of doc.chapters) {
    for (const s of ch.sections || []) {
      for (const x of [s].concat(s.subsections || [])) htmls.push(x.html || '');
    }
  }
  for (const html of htmls) {
    const re = /<div class="key-callout">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(html))) {
      const body = m[1], text = strip(body);
      allCallouts.push({ sub, text, body });
      if (NEW_KEYS.some(k => body.includes(k))) newBodies.push(body);
      if (/<(p|ul|ol|li|table|div|figure)\b/.test(body) || body.includes('tspan')) structBad++;
      if ((body.match(/<b>/g) || []).length < 2) bBad++;
      if (text.length > 40) {
        const plainParas = [...html.matchAll(/<p(?![^>]*data-fig)[^>]*>([\s\S]*?)<\/p>/g)].map(x => strip(x[1]));
        if (plainParas.some(p => p === text)) copyBad++;
      }
      // 危险信号是「前缀以裸正文结尾」＝黄框被塞进未闭合的 <p> 内部。
      // 前缀为空（小节开头）或以标签 > 结尾（含 <h4>、</table> 等）都是合法的文档流位置。
      const before = html.slice(0, m.index).replace(/\s+$/, '');
      if (!(before === '' || before.endsWith('>'))) posBad++;
    }
  }
}
check('本批 6 个黄框都定位到了', newBodies.length, 6);
check('本批 6 个黄框结构合法（无内嵌 p/ul/table/div、无 tspan）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('本批 6 个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('本批 6 个黄框都不是空壳（正文 > 80 字）',
  newBodies.every(b => strip(b).length > 80), true);
check('全库历史上「加粗不足 2 处」的黄框不再增长（≤104）', bBad <= 104, true);
check('全库内嵌块级容器的历史黄框不超过 1 个（OS 4.2.6 已登记）', structBad <= 1, true);
check('全库黄框没有整段复刻正文 <p>', copyBad, 0);
check('全库黄框位置安全：没有一个落在未闭合的 <p> 正文内部', posBad, 0);
// 重复检测：前 24 个字不重复
const heads = new Set();
for (const c of allCallouts) {
  const h = c.text.slice(0, 24);
  if (heads.has(h)) dupBad++; else heads.add(h);
}
check('全库黄框互不重复（前 24 字判重）', dupBad, 0);
// CSS：黄框是普通文档流块，不会绝对定位盖住正文
const cssRules = [...css.matchAll(/\.key-callout[^{]*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
check('CSS 里 .key-callout 没有绝对定位 / z-index / 负外边距遮挡',
  !/position:\s*(absolute|fixed)|z-index|margin[^;]*:\s*-\d/.test(cssRules), true);

// ---------- 6. 行号双基线（黄框与图块都不参与行号） ----------
let annoLines = 0, annoOpen = 0;
for (const c of cn.chapters) {
  for (const s of c.sections || []) {
    for (const x of [s].concat(s.subsections || [])) {
      const h = x.html || '';
      (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => {
        if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++;
      });
      annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
      (h.match(/<p\b[^>]*>/g) || []).forEach(t => { if (!/data-fig/.test(t)) annoOpen++; });
      annoOpen += (h.match(/<li\b[^>]*>/g) || []).length;
    }
  }
}
check('CN 静态可批注行 1108（配对口径，零漂移）', annoLines, 1108);
check('CN 静态可批注行 1108（开标签口径，零漂移）', annoOpen, 1108);

// ---------- 7. 总量 / 三方一致 / 序列化 ----------
check('CN 序列化仍是 CRLF + 无尾换行',
  [cnRaw.indexOf('\r\n') > 0, cnRaw.endsWith('\n')], [true, false]);
check('CN 配图 29 张（P4 精确总量）', (cnRaw.match(/fig-img/g) || []).length, 29);
check('CN 黄框 31 个（P4 精确总量）', (cnRaw.match(/class=\\"key-callout\\"/g) || []).length, 31);
check('全库 fig-img 137 张（cn29 + os51 + co32 + ds25）',
  subjects.reduce((n, s) => n + (read('pwa/data/notes/' + s + '_notes.json').match(/fig-img/g) || []).length, 0), 137);
check('全库黄框 raw 计数 234 个（cn31 + os57 + co53 + ds93）',
  subjects.reduce((n, s) => n + (read('pwa/data/notes/' + s + '_notes.json').match(/class=\\"key-callout\\"/g) || []).length, 0), 234);
check('全库黄框可解析条目 ≥233（OS 有 1 个历史内嵌 div 会截断）', allCallouts.length >= 233, true);
check('内联 struct-fig 仍 11 张（CN）', (cnRaw.match(/struct-fig/g) || []).length, 11);
const refs = [...cnRaw.matchAll(/img\/(cn_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]);
check('CN 图引用 29 处且全部有磁盘文件',
  refs.length === 29 && refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r))), true);
check('CN 图引用全部进了 SW 预缓存',
  refs.every(r => sw.includes("'img/" + r.slice(4) + "'")), true);
check('SW 里 CN 图 29 条', (sw.match(/'img\/cn_fig_[^']+'/g) || []).length, 29);
check('笔记 JSON 里没有 SVG 专有的 tspan',
  subjects.every(s => !read('pwa/data/notes/' + s + '_notes.json').includes('tspan')), true);

// ---------- 8. jsdom 真实渲染 + 点击放大 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_cn_fig_p4: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
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
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(cnRaw) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    check('真实渲染 .anno-line 总数 = 1220（黄框零覆盖，批注不错位）',
      d.querySelectorAll('.anno-line').length, 1220);
    check('真实渲染配图 29 张', d.querySelectorAll('img.fig-img').length, 29);
    check('真实渲染黄框 31 个', d.querySelectorAll('.key-callout').length, 31);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
    // 结构性防复发：黄框/图块一旦被塞进未闭合的 <li>，行数不变但那行文本会被追加，
    // 静态计数看不出来，只有 DOM 归属 + 逐行文本比对能发现。
    const newCalls = [...d.querySelectorAll('.key-callout')]
      .filter(el => NEW_KEYS.some(k => el.textContent.includes(k)));
    check('本批 6 个黄框在真实 DOM 里都不在 <li>/<p> 内部',
      newCalls.length === 6 && newCalls.every(el => !el.closest('li,p')), true);
    const newFigs = [...d.querySelectorAll('img.fig-img')]
      .filter(img => SVGS.some(n => (img.getAttribute('src') || '').includes(n)));
    check('本批 4 个图块在真实 DOM 里都不在 <li> 内部',
      newFigs.length === 4 && newFigs.every(img => !img.closest('li')), true);
    check('全库黄框被塞进 <li>/<p> 的数量为 0',
      [...d.querySelectorAll('.key-callout')].filter(el => el.closest('li,p')).length, 0);
    const figs = d.querySelectorAll('img.fig-img');
    if (figs.length) {
      figs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      const lb = d.querySelector('#figLightbox');
      check('新增图仍可点击放大（lightbox.show）', !!lb && lb.classList.contains('show'), true);
    }
    console.log('_test_cn_fig_p4: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
