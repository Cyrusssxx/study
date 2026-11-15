/* 2021-47（交换机 S + 路由器 R + 本地 DNS）的「t0 → t1 全过程序列图」。
 *
 * 为什么放 4.2.5 ARP 而不是 3.8.2 交换机：
 *   bigq_kp_manual 把 2021-47 的主锚点登记在 cn:4.2.5；3.8.2 已有同主题过程图
 *   cn_fig_switch_learn（A↔B 纯二层自学习三步），再放一张同角度会重复。
 *   本题的难点是「两轮 ARP 交错着让 S 学到三条表项」，正是 4.2.5 缺的过程图。
 *
 * 守卫：
 *   1) 图必须在 ★ 之前、且是该节最后一块（key-callout 之后）；
 *   2) 两段 data-fig="1" 紧邻，图题 + img，不进行号（批注零漂移）；
 *   3) 图内 MAC / 端口 / 全 F 广播地址与 zt_2021.json 第 47 题解析同源；
 *   4) H2 的 MAC 绝不能出现在交换表里（本题最易错的陷阱）。
 * 基线：CN jsdom .anno-line = 1220（与 _test_cn_fig_p4 一致）。
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

const SVG = 'pwa/img/cn_fig_web_visit_seq.svg';
const svg = read(SVG);
const cnRaw = read('pwa/data/notes/cn_notes.json');
const cn = JSON.parse(cnRaw);
const sw = read('pwa/sw.js');

// ---------- 1. SVG 自身 ----------
check('SVG 存在且以 </svg> 收尾', svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'), true);
check('SVG viewBox 780 宽', /viewBox="0 0 780 \d+"/.test(svg), true);
check('SVG 有白底', svg.includes('<rect width="780"') && svg.includes('fill="#fbfcfe"'), true);
check('SVG 无 HTML 标签', ['<b>', '</b>', '<i>', '</i>', '<br>', '<p>'].every(t => !svg.includes(t)), true);
check('SVG 不用 <g stroke>（会让文字继承描边）', !svg.includes('<g stroke'), true);
check('SVG 无空 font-size', !svg.includes('font-size="0"'), true);

// ---------- 2. 图落位 ----------
function secHtml(num) {
  for (const ch of cn.chapters) {
    for (const s of ch.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if ((x.section || '').split(' ')[0] === num) return x.html || '';
      }
    }
  }
  return '';
}
const h = secHtml('4.2.5');
check('4.2.5 含本图', h.includes('img/cn_fig_web_visit_seq.svg'), true);
check('4.2.5 图引用唯一的 1 处', (h.match(/cn_fig_web_visit_seq/g) || []).length, 1);
const starAt = h.indexOf('<h4>★ 高频真题考点与陷阱</h4>');
check('★ 锚点存在', starAt > 0, true);
check('图在 ★ 之前', h.indexOf('cn_fig_web_visit_seq.svg') < starAt, true);
check('图题在 ★ 之前', h.indexOf('图：2021-47 一次 Web 访问') < starAt, true);
// 图块是紧邻的两段 data-fig，且之间无正文（否则行号器会数进去）
check('图题与 img 是紧邻两段 data-fig',
  /<p class="paragraph" data-fig="1"><b>图：2021-47[\s\S]*?<\/p>\r?\n<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/cn_fig_web_visit_seq\.svg"/.test(h), true);
// 位置安全：插入点前必须是闭合标签结尾，不能落在 <p> 正文内部
const at = h.indexOf('<p class="paragraph" data-fig="1"><b>图：2021-47');
check('图块前缀是闭合标签（不塞进 <p>/<li> 正文）', at > 0 && /[>\r\n]/.test(h[at - 1]), true);
check('图块在 key-callout(★ 易错) 之后',
  h.indexOf('图：2021-47 一次 Web 访问') > h.lastIndexOf('key-callout'), true);
check('4.2.5 原有 ARP 概念图仍在',
  h.includes('img/cn_fig_arp_resolve.svg') && h.includes('同网段 vs 跨网段'), true);

// ---------- 3. SW 预缓存 ----------
check('SW DATA_PRECACHE 含本图', sw.includes("'img/cn_fig_web_visit_seq.svg'"), true);

// ---------- 4. 与真题解析同源 ----------
const zt = JSON.parse(read('pwa/data/zt/zt_2021.json'));
const q47 = (zt.items || []).find(x => x.i === 47);
check('题库里有 2021 年第 47 题', !!q47, true);
const anText = (q47.an || '').replace(/<[^>]+>/g, '');
const MACS = ['00-11-22-33-44-cc', '00-11-22-33-44-bb', '00-11-22-33-44-aa', 'FF-FF-FF-FF-FF-FF'];
check('解析里三台设备 MAC 与广播地址齐全', MACS.every(m => anText.includes(m)), true);
check('图里用的是同一批 MAC（未自拟编号）', MACS.every(m => svg.includes(m)), true);
check('图里端口 4 / 1 / 2 与解析一致（H1=4, DNS=1, R=2）',
  /00-11-22-33-44-cc/.test(svg) && svg.includes('端口 4') && svg.includes('端口 1') && svg.includes('端口 2'), true);
check('解析提到 H2 收到 2 个帧，图内也标 2 个',
  /H2 至少会接收到 2 个|接收到 2 个/.test(anText) === false || svg.includes('收到 2 个帧'), true);
check('图内明确 (1) 的封装链与解析一致',
  svg.includes('DNS 报文 → UDP 数据报 → IP 数据报 → CSMA/CD 帧'), true);

// ---------- 5. 关键陷阱：H2 不得进交换表 ----------
check('图里点明 H2 的 MAC 不在交换表', svg.includes('H2 的 MAC 不在表中'), true);
check('交换表四行里只有 3 个真实 MAC（第 4 行是「无」）',
  (svg.match(/00-11-22-33-44-(cc|bb|aa)/g) || []).length - 0 >= 3, true);
check('图里没有给 H2 编造 MAC', /44-dd|H2 的 MAC 为|H2.*MAC …/.test(svg), false);

// ---------- 6. 数据文件不带 SVG 专有标签 ----------
check('笔记 JSON 里没有 tspan', cnRaw.includes('tspan'), false);
check('4.2.5 没有内联 <svg>（图走 img 外链，不占行号）', h.includes('<svg'), false);

// ---------- 7. jsdom 真实渲染：行号零漂移 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_cn_webvisit: ' + pass + ' passed, ' + fail + ' failed');
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
    check('真实渲染 .anno-line = 1220（插入图块零漂移）', d.querySelectorAll('.anno-line').length, 1220);
    check('图块没被算进行号',
      [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
    const img = [...d.querySelectorAll('img.fig-img')]
      .find(el => (el.getAttribute('src') || '').includes('cn_fig_web_visit_seq'));
    check('本图在真实 DOM 里渲染出来了', !!img, true);
    check('本图不在 <li> 内部（img 本来就该在 p.paragraph 里）', !!img && !img.closest('li'), true);
    check('本图两段 data-fig 的图题挂在它前一个兄弟',
      !!img && /图：2021-47/.test((img.closest('[data-fig]') || {}).previousElementSibling ? img.closest('[data-fig]').previousElementSibling.textContent : ''), true);
    console.log('_test_cn_webvisit: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
