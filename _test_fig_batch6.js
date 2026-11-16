/**
 * _test_fig_batch6.js — 第六批配图回归（2026-11-16）
 *
 * 5 张新图（四科，按高价值零图筛选）：
 *   1) DS 6.2.3 十字链表 —— ds_fig_cross_linked_list.svg（有向图，一弧结点挂两链）
 *   2) DS 6.2.4 邻接多重表 —— ds_fig_adj_multi_list.svg（无向图，一边一结点）
 *   3) CO 5.2.1 指令执行流程 —— co_fig_instr_exec_flow.svg（取指—译码—分支—中断检测）
 *   4) CO 7.3.1 程序查询方式 —— co_fig_program_query_io.svg（六步流程 + 两策略 + 计算）
 *   5) CN 4.2.7 ICMP —— cn_fig_icmp.svg（差错5类 vs 询问3类）
 *
 * 硬约束：真实小节落位、图块 data-fig 两段（零行号漂移）、示例与正文同源、
 *        SW 预缓存三方一致、笔记 JSON 序列化格式正确、黄框计数不变。
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

const SUBS = ['co', 'os', 'cn', 'ds'];
const RAW = {}, DOC = {};
for (const s of SUBS) { RAW[s] = read(`pwa/data/notes/${s}_notes.json`); DOC[s] = JSON.parse(RAW[s]); }
const SW = read('pwa/sw.js');

function secHtml(sub, num) {
  for (const ch of DOC[sub].chapters)
    for (const s of ch.sections || [])
      for (const x of [s].concat(s.subsections || []))
        if ((x.section || '').split(' ')[0] === num) return x.html || '';
  return '';
}

// ---------- 1. 五图落位在正确小节 ----------
const LOC = [
  ['ds', '6.2.3', 'ds_fig_cross_linked_list.svg', '十字链表'],
  ['ds', '6.2.4', 'ds_fig_adj_multi_list.svg', '邻接多重表'],
  ['co', '5.2.1', 'co_fig_instr_exec_flow.svg', '指令执行'],
  ['co', '7.3.1', 'co_fig_program_query_io.svg', '程序查询'],
  ['cn', '4.2.7', 'cn_fig_icmp.svg', 'ICMP'],
];
for (const [sub, num, img, tag] of LOC) {
  const h = secHtml(sub, num);
  check(`${sub.toUpperCase()} ${num} 引用 ${img}`, h.includes('img/' + img), true);
  const i = h.indexOf(img);
  const head = h.slice(Math.max(0, i - 500), i);
  check(`${tag} 图块是 data-fig 两段`, head.includes('data-fig="1"><b>图：') && head.includes('data-fig="1"><img'), true);
  check(`${tag} 图题含小节关键词「${tag}」`, head.includes(tag), true);
  const star = h.indexOf('★ 高频真题考点与陷阱');
  check(`${tag} 图在 ★ 之前`, i >= 0 && (star < 0 || i < star), true);
  check(`${tag} 图题无全角分号`, head.slice(head.lastIndexOf('data-fig="1"><b>')).includes('；'), false);
}

// ---------- 2. SVG 内容同源（示例与正文术语一致） ----------
const svgs = {
  ds_fig_cross_linked_list: ['tailvex', 'headvex', 'hlink', 'tlink', 'firstin', 'firstout', '一结点挂两链'],
  ds_fig_adj_multi_list: ['ivex', 'ilink', 'jvex', 'jlink', 'firstedge', '一条边只用一个结点'],
  co_fig_instr_exec_flow: ['PC += 指令长度', '分支指令', '中断/异常检测', '当前指令地址', '下一条指令地址', 'Q373', 'Q379'],
  co_fig_program_query_io: ['数据缓冲寄存器', '状态寄存器', '独占查询', '定时查询', '4B ÷ 2MB/s = 2μs', '5×10⁵', '4%', 'Q584'],
  cn_fig_icmp: ['终点不可达', '源点抑制', '重定向', '超时', '参数问题', '8 / 0', '13 / 14', '17 / 18', '协议号 1', '2012 真题'],
};
for (const [f, kws] of Object.entries(svgs)) {
  const s = read('pwa/img/' + f + '.svg');
  for (const kw of kws) check(`${f} 含「${kw}」`, s.includes(kw), true);
  check(`${f} 是合法 SVG`, s.startsWith('<svg') && s.trimEnd().endsWith('</svg>'), true);
  check(`${f} 无 HTML 标签残留`, /<(div|p|span|b|table|tr|td)\b/i.test(s), false);
}

// ---------- 3. 图数基线（当前精确量） ----------
const FIG_N = { co: 60, os: 76, cn: 51, ds: 39 };
for (const s of SUBS)
  check(`${s.toUpperCase()} fig-img = ${FIG_N[s]}`, (RAW[s].match(/fig-img/g) || []).length, FIG_N[s]);
const total = SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0);
check('全库 fig-img = 226', total, 226);
// 黄框计数未动（图块是 p，不是 key-callout）
const CALL_N = { co: 74, os: 77, cn: 53, ds: 106 };
for (const s of SUBS)
  check(`${s.toUpperCase()} 黄框 = ${CALL_N[s]}（本批未动）`, (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[s]);

// ---------- 4. SW 预缓存三方一致 ----------
for (const [f] of Object.entries(svgs)) {
  check('SW 预缓存含 ' + f, SW.includes('img/' + f), true);
  check('SVG 文件存在 ' + f, fs.existsSync(path.join(ROOT, 'pwa/img', f + '.svg')), true);
}
check('DATA_VER 已重建（250 资源哈希）', SW.includes('quiz408-data-6392a1f65c'), true);

// ---------- 5. 序列化格式正确（字节可逆） ----------
for (const s of ['co', 'cn', 'ds']) {
  const raw = fs.readFileSync(path.join(ROOT, `pwa/data/notes/${s}_notes.json`));
  const dump = JSON.stringify(JSON.parse(raw), null, 1).replace(/\n/g, '\r\n');
  check(`${s.toUpperCase()} indent1+CRLF 字节可逆`, Buffer.from(dump, 'utf8').equals(raw), true);
  check(`${s.toUpperCase()} 无尾换行`, raw[raw.length - 1] !== 0x0a, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
