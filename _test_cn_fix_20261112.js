/* 2026-11-12 内容订正批次的契约回归：
 * 1) 计网 5.3.3 三次握手内联图归位（原来串到「四次挥手」标题后面）；
 * 2) 5.3.2 补 TCP 首部图，并订正 MTU 的含糊表述；
 * 3) 5.4.1 补 MSS ≠ MTU 两个定义 + 2018 统考题 47 完整推演；
 * 4) 5.3.3 补 TCP 四种计时器对比表（重传/持续/保活/时间等待，不许与保活混）；
 * 5) OS 4.2.6 补 inode ≈ 多级页表 类比表，CO 3.6.2 补跨科指针；
 * 6) 讲义 fig-img 点击放大（common.js 全局委托 + style.css 光标）；
 * 7) 模拟考「猜对了」toast 文案改回「垫底层」语义。
 * 行号基线：CN 静态 1108 / jsdom 1220，OS 3668，CO 1971 —— 本批零漂移。
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
const osRaw = read('pwa/data/notes/os_notes.json');
const coRaw = read('pwa/data/notes/co_notes.json');
const cn = JSON.parse(cnRaw), osd = JSON.parse(osRaw), co = JSON.parse(coRaw);
const sw = read('pwa/sw.js');
const common = read('pwa/js/common.js');
const css = read('pwa/css/style.css');
const quiz = read('pwa/quiz.html');
const zt2018 = JSON.parse(read('pwa/data/zt/zt_2018.json'));

function nodeHtml(doc, prefix) {
  for (const ch of doc.chapters) {
    for (const se of ch.sections || []) {
      for (const x of [se].concat(se.subsections || [])) {
        if ((x.section || '').split(' ')[0] === prefix) return x.html || '';
      }
    }
  }
  return '';
}
const h532 = nodeHtml(cn, '5.3.2');
const h533 = nodeHtml(cn, '5.3.3');
const h541 = nodeHtml(cn, '5.4.1');
const h426 = nodeHtml(osd, '4.2.6');
const h362 = nodeHtml(co, '3.6.2');

// ---------- 1. 三次握手图归位 ----------
const iFigStruct = h533.indexOf('<figure class="struct-fig">');
const iWaveH4 = h533.indexOf('<h4>四次挥手</h4>');
const iHandH4 = h533.indexOf('<h4>三次握手</h4>');
const iWave = h533.indexOf('cn_fig_tcp_wave.svg');
const iLabel = h533.indexOf('示意图：');
check('三次握手内联图仍在 5.3.3 内', iFigStruct >= 0, true);
check('三次握手图在「三次握手」标题之后', iFigStruct > iHandH4, true);
check('三次握手图已移到「四次挥手」标题之前', iFigStruct < iWaveH4, true);
check('四次挥手图仍留在「四次挥手」标题之后', iWave > iWaveH4, true);
check('「示意图：」标签现在指向后面的四次挥手图',
  iLabel > iWaveH4 && iLabel < iWave, true);
check('内联图内容确实是三次握手（SYN-SENT / SYN-RCVD）',
  /SYN-SENT/.test(h533.slice(iFigStruct, h533.indexOf('</figure>', iFigStruct))) &&
  /SYN-RCVD/.test(h533.slice(iFigStruct, h533.indexOf('</figure>', iFigStruct))), true);
check('5.3.3 没有重复出现两张三次握手结构图',
  (h533.match(/<figure class="struct-fig">/g) || []).length, 1);

// ---------- 2. TCP 首部图与 MTU 表述 ----------
const iHeader = h532.indexOf('cn_fig_tcp_header.svg');
check('5.3.2 引用了 TCP 首部图', iHeader >= 0, true);
check('TCP 首部图紧跟首部字段表之后（在结构说明段之前）',
  iHeader > h532.indexOf('</table>') && iHeader < h532.indexOf('<p>报文段结构：'), true);
check('TCP 首部图在 ★ 之前', iHeader < h532.indexOf('★ 高频真题考点'), true);
check('图块前一个标签是块级闭合标签（不会塞进 <p> 内部）',
  /<\/(p|table|ul|ol|div)>\s*<p class="paragraph" data-fig="1"><b>图：TCP 首部/.test(h532), true);
check('SVG 文件存在且是合法 XML（无 HTML 标签）', (() => {
  const s = read('pwa/img/cn_fig_tcp_header.svg');
  return s.includes('<svg') && !/<(b|i|br|div|span)\b/.test(s) &&
    s.includes('MSS ≤ MTU − 20 B − 20 B') && s.includes('1460');
})(), true);
check('5.3.2 不再用「与 MSS 类似」这种含糊口径', h532.includes('与 MSS 类似'), false);
check('5.3.2 明确写出 MTU 含 IP 首部与 TCP 首部',
  h532.includes('含 IP 首部与 TCP 首部'), true);
check('5.3.2 那个长 <p> 的全角分号数量不变（fmtNotes 不拆出新行）',
  (h532.split('报文段结构：')[1].split('——别混淆')[0].match(/；/g) || []).length, 1);

// ---------- 3. MSS ≠ MTU 定义 + 2018 题 47 ----------
check('MSS 定义：TCP 数据部分最大长度、不含首部',
  h541.includes('TCP 报文段的<b>数据字段</b>最大长度') && h541.includes('<b>不含 TCP 首部</b>'), true);
check('MTU 定义：链路层帧数据上限、含 TCP 首部',
  h541.includes('<b>链路层</b>（帧）') && h541.includes('<b>含 IP 首部 + TCP 首部</b>'), true);
check('关系式与以太网典型值',
  h541.includes('MSS ≤ MTU − 20 B（IP 首部）− 20 B（TCP 首部）') &&
  h541.includes('MTU=1500 B') && h541.includes('1460 B'), true);
check('536 的完整链条补到 576 B（不再把 556 当 MTU）',
  h541.includes('576B 的 IP 数据报') && h541.includes('536 与 556 都不是 MTU'), true);
for (const t of ['MTU=1500 B', 'MTU=800 B', '776 B', '97×8', '⌈1480/776⌉ = 2', '776+20=796', '784+20=804', '776/8 = 97', '192.168.1.208']) {
  check('5.4.1 含 2018 题 47 关键字符串 ' + t, h541.includes(t), true);
}
check('明确点出「776 绝不是 MSS」「题目里没有 MSS」',
  h541.includes('<b>776 绝不是 MSS</b>') && h541.includes('这道题里有 MSS 吗'), true);
const zt47 = (zt2018.items || []).find(x => x.i === 47);
const ztAn = zt47 ? zt47.an : '';
check('2018 题 47 原题确实给了 MTU=800 / 1500 B 的分组',
  /MTU=800/.test(zt47.q) && /总长度为 1500 B/.test(zt47.q), true);
check('笔记推演与原题答案解析一致（776 / 2 / 97）',
  /776/.test(ztAn) && /97/.test(ztAn) && /1500/.test(ztAn), true);

// ---------- 4. 四种计时器 ----------
const timers = [
  ['重传计时器', '确认超时'],
  ['持续计时器', '零窗口探测'],
  ['保活计时器', '连接空闲'],
  ['时间等待计时器', 'TIME_WAIT 2MSL'],
];
for (const [name, phrase] of timers) {
  check('四计时器表含 ' + name, h533.includes('<b>' + name + '</b>'), true);
  check('黄框对口含 ' + phrase, h533.includes(name.slice(0, 2) + '计时器 = ' + phrase) || h533.includes(phrase), true);
}
check('黄框明确写「别与保活混」并区分保活与时间等待',
  h533.includes('别与保活混') && h533.includes('<b>不等于时间等待计时器</b>') &&
  h533.includes('保活计时器解决的是'), true);
check('持续计时器注明「不是保活」', h533.includes('不是保活：'), true);
check('保活计时器沿用正文的 75 s / 10 次',
  h533.includes('75 s') && h533.includes('连续 10 次无响应'), true);
check('时间等待计时器只在主动关闭方', h533.includes('<b>主动关闭方</b>') && h533.includes('<b>2MSL</b>'), true);

// ---------- 5. OS 类比表 + CO 指针 ----------
check('inode 类比表在 OS 4.2.6 且位于 ★ 之前',
  h426.includes('跨章类比：inode 索引 ≈ 多级页表') &&
  h426.indexOf('跨章类比') < h426.indexOf('★ 高频真题考点'), true);
for (const t of ['虚拟页号 VPN', '文件的逻辑块号', '物理页帧号 PFN', '簇号', '页表项 PTE（4B）', '地址项（4B）',
                 '页表（本身占一个物理页）', '索引块（本身占一个簇）', '页目录基址寄存器', 'inode 的起始地址',
                 '多级页表遍历', '多级间接索引', 'TLB 缓存页表项', 'inode 缓存 / 目录项缓存']) {
  check('类比表含 ' + t, h426.includes(t), true);
}
check('一句话总结四组等价关系',
  ['地址项 = PTE', '索引块 = 页表', '数据簇 = 物理页帧', '多级间接 = 多级页表'].every(t => h426.includes(t)), true);
check('CO 3.6.2 有跨科指针并说明 inode 不属于计组',
  h362.includes('跨科对比（在 OS 笔记里）') && h362.includes('不属于计组'), true);

// ---------- 6. 点击放大 ----------
check('common.js 对 img.fig-img 加了全局点击委托',
  common.includes("closest('img.fig-img')") && common.includes('openImageLightbox(fig.src)'), true);
check('style.css 给 fig-img 加了 zoom-in 光标',
  /img\.fig-img\s*\{[^}]*cursor:\s*zoom-in/.test(css), true);
check('notes.html 已引入带缩放能力的 lightbox.js',
  read('pwa/notes.html').includes('js/lightbox.js'), true);
check('common.js 的委托在 capture 阶段（先于笔记页其它 handler）',
  /document\.addEventListener\('click', e => \{[\s\S]*?img\.fig-img[\s\S]*?\}, true\);/.test(common), true);

// ---------- 7. 模拟考「猜对了」文案 ----------
check('toast 不再承诺「下次模拟考会抽到」', quiz.includes('下次模拟考会抽到'), false);
check('toast 改为垫底层语义', quiz.includes('已放回抽题池垫底层 · 前面三层抽完才轮到'), true);
check('按钮 title 说明垫底层的实际优先级', quiz.includes('前面三层抽完才轮到'), true);

// ---------- 8. 总量 / 三方一致 / 序列化 ----------
check('CN 序列化仍是 CRLF + 无尾换行',
  [cnRaw.indexOf('\r\n') > 0, cnRaw.endsWith('\n')], [true, false]);
check('CN 配图不少于 25 张（精确值见 _test_cn_fig_p4）',
  (cnRaw.match(/fig-img/g) || []).length >= 25, true);
check('CN 黄框不少于 25 个（精确值见 _test_cn_fig_p4）',
  (cnRaw.match(/class=\\"key-callout\\"/g) || []).length >= 25, true);
check('SW 里 CN 图不少于 25 条', (sw.match(/'img\/cn_fig_[^']+'/g) || []).length >= 25, true);
check('全库 fig-img 不少于 133 张（精确值见 _test_cn_fig_p4）',
  ['cn', 'os', 'co', 'ds'].reduce((n, s) => n + (read('pwa/data/notes/' + s + '_notes.json').match(/fig-img/g) || []).length, 0) >= 133, true);
// 旧批次精确量一律降为下限，最新精确量统归 _test_fig_p5
check('计组黄框不少于 53 个', (coRaw.match(/class=\\"key-callout\\"/g) || []).length >= 53, true);
check('计组配图不少于 32 张', (coRaw.match(/fig-img/g) || []).length >= 32, true);
check('OS 黄框不少于 57 个', (osRaw.match(/class=\\"key-callout\\"/g) || []).length >= 57, true);
check('OS 配图不少于 51 张', (osRaw.match(/fig-img/g) || []).length >= 51, true);
// 2.1.3 有一张教材截图 cn_fig_2_3.png，其余 24 张是自绘 svg —— 合计 25 个 fig-img
const refs = [...cnRaw.matchAll(/img\/(cn_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]);
check('CN 图引用不少于 25 处且全部有磁盘文件',
  refs.length >= 25 && refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r))), true);
check('CN 图引用全部进了 SW 预缓存',
  refs.every(r => sw.includes("'img/" + r.slice(4) + "'")), true);
check('笔记 HTML 里不出现 SVG 专有的 tspan（黄框只用 b）',
  [cnRaw, osRaw, coRaw].every(s => !s.includes('tspan')), true);

// ---------- 9. 静态行号（CN 1108） ----------
// 与 _test_cn_fig_p2.js 完全相同的双口径算法（不要自行改写，否则基线口径不一致）
let annoLines = 0, annoOpen = 0;
for (const c of cn.chapters) {
  for (const s of c.sections || []) {
    for (const x of [s].concat(s.subsections || [])) {
      const h = x.html || '';
      (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => {
        if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++;
      });
      annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
      (h.match(/<p\b[^>]*>/g) || []).forEach(t => {
        if (!/data-fig/.test(t)) annoOpen++;
      });
      annoOpen += (h.match(/<li\b[^>]*>/g) || []).length;
    }
  }
}
check('CN 静态可批注行锁死 1108（配对口径）', annoLines, 1108);
check('CN 静态可批注行锁死 1108（开标签口径）', annoOpen, 1108);

// ---------- 10. jsdom 真实渲染 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_cn_fix_20261112: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染 .anno-line 总数 = 1220', d.querySelectorAll('.anno-line').length, 1220);
    check('真实渲染配图不少于 25 张', d.querySelectorAll('img.fig-img').length >= 25, true);
    check('真实渲染黄框不少于 25 个', d.querySelectorAll('.key-callout').length >= 25, true);
    check('图块被误标行号 = 0',
      [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
    // 真实点击行为（不是只查字符串）：点第一张讲义图，必须打开带缩放的 lightbox
    const figImgs = d.querySelectorAll('img.fig-img');
    if (figImgs.length) {
      figImgs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      const lb = d.querySelector('#figLightbox');
      check('点击 fig-img 真的打开 lightbox（.show）',
        !!lb && lb.classList.contains('show'), true);
      check('lightbox 载入的是被点击的讲义图',
        !!lb && /cn_fig_/.test((lb.querySelector('img') || {}).getAttribute
          ? (lb.querySelector('img').getAttribute('src') || '') : ''), true);
    }
    console.log('_test_cn_fix_20261112: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
}
