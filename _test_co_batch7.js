/**
 * _test_co_batch7.js — 第七批：计组(CO)教材高价值知识点补齐（2026-11-17）
 *
 * 四处正文缺口 + 配图（都是真题未考但考查概率大的教材点）：
 *   1) 3.4.2 SSD 三大限制 —— co_fig_ssd_limits.svg（写前擦整块/擦后按序写/擦写次数有限）
 *   2) 5.5.3 中断现场责任分工 —— co_fig_int_save_owner.svg（硬件存断点PSW / OS 存通用寄存器）
 *   3) 3.6.6 两级页表 —— co_fig_two_level_page.svg（页目录号+页表号+偏移，补齐全库缺失概念）
 *   4) 7.3.3 磁盘各阶段 I/O 方式 —— co_fig_disk_io_stages.svg（寻道/找扇区中断、连续读写DMA、结束中断）
 *
 * 硬约束：正文补在 div.key-points（不参与行号、不动黄框）、图块 data-fig 两段零行号漂移、
 *         SVG 新样式（无实心深蓝底白字大色块 + 易错点红色）、示例与正文同源、
 *         SW 预缓存一致、序列化字节可逆、图数基线。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(actual)); }
}

const RAW = read('pwa/data/notes/co_notes.json');
const DOC = JSON.parse(RAW);
const SW = read('pwa/sw.js');

function secHtml(num) {
  for (const ch of DOC.chapters)
    for (const s of ch.sections || [])
      for (const x of [s].concat(s.subsections || []))
        if ((x.section || '').split(' ')[0] === num) return x.html || '';
  return '';
}

// ---------- 1. 四图落位在正确小节 ----------
const LOC = [
  ['3.4.2', 'co_fig_ssd_limits.svg', 'SSD', ['写前先擦整块', '擦后按序写', '擦写次数有限']],
  ['5.5.3', 'co_fig_int_save_owner.svg', '中断现场', ['断点', '状态字', '通用寄存器', '中断隐指令']],
  ['3.6.6', 'co_fig_two_level_page.svg', '两级页表', ['页目录', '页表号', 'PFN', '页内偏移']],
  ['7.3.3', 'co_fig_disk_io_stages.svg', '磁盘', ['寻道', '查找扇区', '连续读写', 'DMA']],
];
for (const [num, img, tag, kws] of LOC) {
  const h = secHtml(num);
  check(`CO ${num} 引用 ${img}`, h.includes('img/' + img), true);
  const i = h.indexOf(img);
  const head = h.slice(Math.max(0, i - 700), i);
  check(`${tag} 图块是 data-fig 两段`, head.includes('data-fig="1"><b>图：') && head.includes('data-fig="1"><img'), true);
  check(`${tag} 图题含关键词「${tag}」`, head.includes(tag), true);
  const star = h.indexOf('★ 高频真题考点与陷阱');
  check(`${tag} 图在 ★ 之前`, i >= 0 && (star < 0 || i < star), true);
  check(`${tag} 图题无全角分号`, head.slice(head.lastIndexOf('data-fig="1"><b>')).includes('；'), false);
}

// ---------- 2. 正文补充概念（div.key-points，非 key-callout） ----------
const BODY_KW = [
  ['3.4.2', ['SSD 的三条硬限制', '必须先擦除该页所在的整个区块', '擦除后区块内的页必须按顺序写入信息', '有限的擦除 / 编程次数']],
  ['5.5.3', ['中断响应时「现场」由谁保存', '中断隐指令', '断点（PC）与程序状态字（PSW）由', '通用寄存器与其他现场信息由']],
  ['3.6.6', ['两级页表：单级页表太大的解决方案', '页目录号 + 页表号', '物理页框号 PFN', '未用表项在页目录中标记为空']],
  ['7.3.3', ['磁盘数据传送：各阶段配合不同 I/O 方式', '传送参数设置（初始化）用程序查询', '寻道与查找扇区用中断', '连续读写（成块数据搬运）才用 DMA', '结束校验再用中断']],
];
for (const [num, kws] of BODY_KW) {
  const h = secHtml(num);
  check(`CO ${num} 有 key-points 正文补充`, h.includes('<div class="key-points">'), true);
  for (const kw of kws) check(`CO ${num} 正文含「${kw}」`, h.includes(kw), true);
}
// 关键：正文补在 key-points，不是 key-callout（不动黄框基线）
for (const [num] of BODY_KW) {
  const h = secHtml(num);
  const kp = h.indexOf('<div class="key-points">');
  const nextCallout = h.indexOf('class=\\"key-callout\\"', kp);
  // key-points 块内部不应新增 key-callout（本批四处原本也无黄框）
  check(`CO ${num} key-points 未嵌套黄框`, kp >= 0 && nextCallout < 0, true);
}

// ---------- 3. SVG 新样式硬约束（禁深蓝大色块 + 易错点红色） ----------
const SVGS = ['co_fig_ssd_limits', 'co_fig_int_save_owner', 'co_fig_two_level_page', 'co_fig_disk_io_stages'];
for (const f of SVGS) {
  const s = read('pwa/img/' + f + '.svg');
  check(`${f} 是合法 SVG`, s.startsWith('<svg') && s.trimEnd().endsWith('</svg>'), true);
  check(`${f} 无 HTML 标签残留`, /<(div|p|span|b|table|tr|td)\b/i.test(s), false);
  check(`${f} 有「易错点」标题`, s.includes('易错点'), true);
  check(`${f} 易错点用红色 #b91c1c`, /fill="#b91c1c"/.test(s), true);
  check(`${f} 易错点正文红色 #dc2626`, /fill="#dc2626"/.test(s), true);
  // 禁止实心深蓝底白字大色块：rect 不得用深蓝填充（深蓝仅允许作 text 文字色）
  check(`${f} rect 无深蓝实心底`, /<rect[^>]*fill="#(1e3a8a|312e81|1e40af|4338ca)"/.test(s), false);
  // 白底
  check(`${f} 白底`, s.includes('fill="#ffffff"'), true);
  // 一句话浅黄条
  check(`${f} 有浅黄一句话条`, s.includes('#fef3c7'), true);
}

// ---------- 4. 图数基线 ----------
check('CO fig-img = 60', (RAW.match(/fig-img/g) || []).length, 60);
const SUBS = ['co', 'os', 'cn', 'ds'];
let total = 0;
for (const s of SUBS) total += (read(`pwa/data/notes/${s}_notes.json`).match(/fig-img/g) || []).length;
check('全库 fig-img = 229', total, 229);
check('CO 黄框 = 74（本批未动）', (RAW.match(/class=\\"key-callout\\"/g) || []).length, 74);

// ---------- 5. SW 预缓存一致 ----------
for (const f of SVGS) {
  check('SW 预缓存含 ' + f, SW.includes('img/' + f + '.svg'), true);
  check('SVG 文件存在 ' + f, fs.existsSync(path.join(ROOT, 'pwa/img', f + '.svg')), true);
}
check('DATA_VER 已重建（253 资源）', SW.includes('quiz408-data-5adb8cc589'), true);

// ---------- 6. 行号快照零漂移（与落盘前基线一致） ----------
function snap(html) {
  let h = html.replace(/<p[^>]*data-fig="1"[^>]*>[\s\S]*?<\/p>/g, '');
  h = h.replace(/<figure[^>]*data-fig="1"[^>]*>[\s\S]*?<\/figure>/g, '');
  return [ (h.match(/<p[\s>]/g) || []).length, (h.match(/<li[\s>]/g) || []).length, (h.match(/；/g) || []).length ];
}
let tot = [0, 0, 0];
for (const ch of DOC.chapters)
  for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) {
      const r = snap(x.html || '');
      tot = [tot[0] + r[0], tot[1] + r[1], tot[2] + r[2]];
    }
check('行号快照 p/li/semi = [700,1110,898]', tot, [700, 1110, 898]);

// ---------- 7. 序列化字节可逆 ----------
const rawBuf = fs.readFileSync(path.join(ROOT, 'pwa/data/notes/co_notes.json'));
const dump = JSON.stringify(JSON.parse(rawBuf), null, 1).replace(/\n/g, '\r\n');
check('CO indent1+CRLF 字节可逆', Buffer.from(dump, 'utf8').equals(rawBuf), true);
check('CO 无尾换行', rawBuf[rawBuf.length - 1] !== 0x0a, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
