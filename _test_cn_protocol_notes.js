// CN 笔记协议过程类考点：内容细化 + 自绘配图 + 序号分行 + 行号不漂移 回归（2026-11-09）
//
// 用户反馈：4.2.6 DHCP 的 DORA 四步挤在一个 <li> 里、只有第①步给了 0.0.0.0/255.255.255.255；
// 4.2.5 ARP 同理；CN 全库原本只有 1 张图。本测试锁住修复结果。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_cn_protocol_notes.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const RAW = fs.readFileSync(path.join(ROOT, 'pwa/data/notes/cn_notes.json'));
const DOC = JSON.parse(RAW.toString('utf8'));
const SW = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');

function cell(prefix) {
  for (const ch of DOC.chapters)
    for (const sec of ch.sections)
      for (const s2 of sec.subsections || [])
        if (s2.section.startsWith(prefix)) return s2;
  return null;
}
const htmlOf = p => (cell(p) || {}).html || '';

console.log('--- 一、序列化格式 ---');
check('cn_notes.json 为 indent1 + CRLF + 无尾换行',
  [RAW.includes(Buffer.from('\r\n')), RAW[RAW.length - 1], (RAW.toString('utf8').match(/\n/g) || []).length === (RAW.toString('utf8').match(/\r\n/g) || []).length],
  [true, 0x7d, true]);

const FIGS = ['cn_fig_dhcp_dora.svg', 'cn_fig_arp_resolve.svg', 'cn_fig_nat_napt.svg',
  'cn_fig_dns_query.svg', 'cn_fig_ip_mac_hop.svg'];

console.log('\n--- 二、5 张自绘 SVG 与 SW 登记 ---');
for (const f of FIGS) {
  const p = path.join(ROOT, 'pwa/img', f);
  const ok = fs.existsSync(p);
  let xml = false, hasB = false;
  if (ok) {
    const s = fs.readFileSync(p, 'utf8');
    // 轻量 XML 结构检查：根标签闭合、无 HTML 标签混入
    xml = s.trimStart().startsWith('<svg') && s.trimEnd().endsWith('</svg>') && /<svg[\s\S]*<\/svg>/.test(s);
    hasB = /<b>|<\/b>|<div|<span|<br/.test(s);
  }
  check(`${f} 存在且为完整 SVG、无 HTML 标签混入`, [ok, xml, hasB], [true, true, false]);
  check(`${f} 已进 DATA_PRECACHE`, SW.includes(`'img/${f}'`), true);
}
let refs = [];
for (const ch of DOC.chapters)
  for (const sec of ch.sections)
    for (const c of [sec].concat(sec.subsections || []))
      for (const m of (c.html || '').matchAll(/<img class="fig-img" src="img\/([^"]+)"/g)) refs.push(m[1]);
check('CN 配图引用 >= 6（协议篇下限，精确总量见 _test_cn_fig_p1）', refs.length >= 6, true);
for (const f of FIGS) check(`引用 ${f}`, refs.includes(f), true);

console.log('\n--- 三、DHCP 四步地址逐条补全（用户点名） ---');
const dhcp = htmlOf('4.2.6');
const doraRows = [...dhcp.matchAll(/<tr><td>[①②③④][\s\S]*?<\/tr>/g)].map(m => m[0]);
check('DORA 对照表有 4 行（序号分行）', doraRows.length, 4);
check('① Discover 给出 0.0.0.0:68 → 255.255.255.255:67',
  /0\.0\.0\.0:68 → 255\.255\.255\.255:67/.test(doraRows[0] || ''), true);
check('② Offer 给出服务器 IP:67 → 255.255.255.255:68',
  /服务器 IP:67 → 255\.255\.255\.255:68/.test(doraRows[1] || ''), true);
check('③ Request 给出 0.0.0.0:68 → 255.255.255.255:67',
  /0\.0\.0\.0:68 → 255\.255\.255\.255:67/.test(doraRows[2] || ''), true);
check('④ ACK 给出服务器 IP:67 → 255.255.255.255:68',
  /服务器 IP:67 → 255\.255\.255\.255:68/.test(doraRows[3] || ''), true);
check('四行都标注广播/单播', doraRows.every(r => /广播|单播/.test(r)), true);
check('原 li 不再把 ①②③④ 挤成一段长文', /① <b>DHCP Discover/.test(dhcp), false);
check('li 里改为指向下方对照表', /四步的[\s\S]{0,80}源\/目的 IP/.test(dhcp), true);
check('补租期 T1/T2 与 Relay 细节',
  ['T1 = 租期 50%', 'T2 = 租期 87.5%', 'giaddr', 'NAK', 'yiaddr'].every(k => dhcp.includes(k)), true);
check('补三句话归纳', /★ 三句话记牢/.test(dhcp), true);

console.log('\n--- 四、ARP 获取 MAC 过程细化 ---');
const arp = htmlOf('4.2.5');
const arpRows = [...arp.matchAll(/<tr><td>[①②③④][\s\S]*?<\/tr>/g)].map(m => m[0]);
check('ARP 四步对照表有 4 行（序号分行）', arpRows.length, 4);
check('② 请求帧目的 MAC 为全 F', /FF-FF-FF-FF-FF-FF/.test(arpRows[1] || ''), true);
check('③ 应答为单播', /单播/.test(arpRows[2] || ''), true);
check('补同网段 / 跨网段对比表', /同网段 vs 跨网段/.test(arp) && /默认网关（路由器入接口）/.test(arp), true);
check('明确 ARP 报文直接封装在以太网帧', /直接封装在以太网帧/.test(arp), true);

console.log('\n--- 五、同类关键考点补充 ---');
check('NAT 补出/回方向转换表', /NAPT 转换表：出方向与回方向逐条对照/.test(htmlOf('4.2.3')) && /202\.1\.1\.1:50001/.test(htmlOf('4.2.3')), true);
check('DNS 补完整报文序列表', /一次完整解析的报文序列/.test(htmlOf('6.2.3')) && /用户 1 条、本地 3 条/.test(htmlOf('6.2.3')), true);
check('转发节点补 IP 不变 / MAC 逐跳图', /IP 首部不变、MAC 帧首部逐跳改变/.test(htmlOf('4.2.4')), true);

console.log('\n--- 六、图块落位与行号约束 ---');
for (const [p, f] of [['4.2.6', 'cn_fig_dhcp_dora.svg'], ['4.2.5', 'cn_fig_arp_resolve.svg'],
  ['4.2.3', 'cn_fig_nat_napt.svg'], ['6.2.3', 'cn_fig_dns_query.svg']]) {
  const h = htmlOf(p);
  const i = h.indexOf('src="img/' + f + '"');
  const cap = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图', i);
  const before = h.slice(0, cap);
  check(`${p} 图块带 data-fig 且紧跟表格（不是节末插图集）`,
    [cap > 0, /<table[\s\S]*<\/table>\s*$/.test(before.slice(-4000))], [true, true]);
}
// HTML 字符串层面的 li / 非图块 p 数量：与改动前一致才不会让行级批注错位
function sig(h) {
  return [ (h.match(/<li\b/g) || []).length,
           (h.match(/<p\b[^>]*>/g) || []).filter(t => !t.includes('data-fig')).length ];
}
const EXPECT = { '4.2.6': [10, 1], '4.2.5': [5, 1], '4.2.3': [5, 1], '6.2.3': [4, 3], '4.2.4': [17, 0] };
for (const [p, want] of Object.entries(EXPECT)) check(`${p} li/正文 p 数量不变`, sig(htmlOf(p)), want);

console.log('\n--- 七、运行时：行号总数不漂移（jsdom） ---');
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP  缺少 jsdom / fake-indexeddb');
} else {
  (async () => {
    const NOTES = RAW.toString('utf8');
    let page = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8')
      .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
        try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
      }).replace(/<link\b[^>]*>/gi, '');
    const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
    const dom = new JSDOM(page, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'https://x.test/notes.html?subject=cn', virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
        w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(NOTES) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    const lines = d.querySelectorAll('.anno-line');
    check('渲染后行号总数 = 1220（与改动前一致，已存批注不错位）', lines.length, 1220);
    check('图块被误标行号 = 0', [...lines].filter(e => e.hasAttribute('data-fig') || e.closest('[data-fig]')).length, 0);
    check('协议篇 5 张新图都渲染出来（>= 6，精确总量见 _test_cn_fig_p1）',
      d.querySelectorAll('img.fig-img').length >= 6, true);
    const sec = [...d.querySelectorAll('.notes-section')].find(s => s.dataset.sec === '4.2 IPv4');
    check('4.2 节表格数 ≥ 5（新增对照表生效）', sec ? sec.querySelectorAll('table').length >= 5 : false, true);
    for (const q of ['giaddr', 'DHCP Request', 'DHCP Relay', 'FF-FF-FF-FF-FF-FF']) {
      dom.window.doNoteSearch(q);
      const n = (d.getElementById('notesSearchResults').innerHTML.match(/notes-sr-item/g) || []).length;
      check(`搜「${q}」能命中（表格内容入索引）`, n > 0, true);
    }
    dom.window.close();
    console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? '有失败' : '全部通过'}`);
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('FATAL', e); process.exit(1); });
  return;
}
console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? '有失败' : '全部通过'}`);
process.exit(fail ? 1 : 0);
