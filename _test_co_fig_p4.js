/* 计组 P4（CPU 时间三要素 / UTF-8 字节结构 / 大小端与对齐 / CPU 结构框图）
 * —— 4 张图 + 4 个黄框的契约回归。CO 精确总量（配图 32 张 / 黄框 52 个）由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文同源：
 *    - 1.3.1 用本节 ★ 里的 2022 真题（1GHz、10000 条、80%×1 + 20%×10 → CPI 2.8 → 28μs）；
 *    - 2.1.5 用本节 UTF-8 表的 3 字节模板，汉字「中」U+4E2D → E4 B8 AD；
 *    - 2.3.4 用正文的 int 0123 4567H @0800H（大端 01/23/45/67，小端 67/45/23/01）与 struct 8B/12B；
 *    - 5.1.2 只画正文列出的 12 个部件，位宽口径抄正文（PC 由地址总线宽度定、IR = 指令字长）。
 * 2) 图块必须落在完整块级标签之间（踩过的坑：锚点取在 <p> 正文内部，解析器提前闭合段落 → 行号漂移）。
 * 3) 静态可批注行锁死 1819（配对/开标签两口径），图块与黄框都不得被标成 anno-line。
 * 4) 笔记 JSON 里黄框只能写 <b>，禁止出现 <tspan>（SVG 专有，HTML 里加粗失效）。
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

const notesRaw = read('pwa/data/notes/co_notes.json');
const notes = JSON.parse(notesRaw);
const sw = read('pwa/sw.js');

function nodeHtml(prefix) {
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if ((x.section || '').indexOf(prefix) === 0) return x.html || '';
      }
    }
  }
  return '';
}

const FIGS = [
  ['perf_metrics', '1.3.1', 'CPU 性能取决于三个相互制约的要素'],
  ['utf8',         '2.1.5', '</table>'],
  ['endian',       '2.3.4', '成员顺序影响占用空间'],
  ['cpu_regs',     '5.1.2', '</ul>'],
];

// ---- 1. 序列化与总量 ----
check('序列化仍是 indent=1 + CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') >= 0, notesRaw.endsWith('}')], [true, true]);
check('计组配图不少于 32 张（精确总量见 _test_fig_p5）',
  (notesRaw.match(/fig-img/g) || []).length >= 32, true);
check('计组黄框不少于 52 个（精确值见 _test_cn_fix_20261112）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 52, true);
check('SW 里本批 4 图全部进预缓存',
  ['perf_metrics', 'utf8', 'endian', 'cpu_regs']
    .every(n => sw.includes("'img/co_fig_" + n + ".svg'")), true);
check('笔记 JSON 不含 <tspan>（黄框只能用 <b>）', notesRaw.indexOf('tspan'), -1);

// ---- 2. 静态可批注行锁死 ----
(function () {
  let pair = 0, open_ = 0;
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        const h = x.html || '';
        for (const t of h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []) {
          if (!/^<p\b[^>]*data-fig/.test(t)) pair++;
        }
        pair += (h.match(/<li\b[^>]*>/g) || []).length;
        for (const t of h.match(/<p\b[^>]*>/g) || []) {
          if (t.indexOf('data-fig') < 0) open_++;
        }
        open_ += (h.match(/<li\b[^>]*>/g) || []).length;
      }
    }
  }
  check('静态可批注行 1819 未漂移（配对口径）', pair, 1819);
  check('静态可批注行 1819 未漂移（开标签口径）', open_, 1819);
})();

// ---- 3. 落位通用约束 ----
for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/co_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★ 高频真题考点');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  const iAnchor = h.indexOf(anchorText);
  check(sec + ' ' + name + ' 紧跟知识点「' + anchorText.slice(0, 14) + '」',
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1400, true);
  const seg = h.slice(Math.max(0, iFig - 200), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
  // 关键回归：图块前一个标签必须是闭合标签，绝不能落在 <p> 正文里
  const iBlock = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图：', iFig);
  const before = h.slice(0, iBlock).replace(/\s+$/, '');
  const lastTag = (before.match(/<[^>]+>$/) || [''])[0];
  check(sec + ' ' + name + ' 图块前是块级闭合标签（不会塞进 <p> 内部）',
    /^<\//.test(lastTag), true);
  // 通用：注入点不在未闭合的 ul / ol / table 内
  const seg2 = h.slice(0, iBlock);
  check(sec + ' ' + name + ' 注入点不在未闭合列表 / 表格内',
    ['ul', 'ol', 'table'].every(t => seg2.split('<' + t).length === seg2.split('</' + t + '>').length), true);
  // 黄框紧随图块
  const iCal = h.indexOf('class="key-callout"', iFig);
  check(sec + ' ' + name + ' 后紧跟本批黄框', iCal > iFig && iCal - iFig < 900, true);
}

// ---- 4. 1.3.1 性能指标 ----
const i131 = nodeHtml('1.3.1');
const sPerf = read('pwa/img/co_fig_perf_metrics.svg');
check('1.3.1 性能图在三要素段之后、MIPS 条目前',
  i131.indexOf('CPU 性能取决于三个相互制约的要素') < i131.indexOf('img/co_fig_perf_metrics.svg') &&
  i131.indexOf('img/co_fig_perf_metrics.svg') < i131.indexOf('5. MIPS'), true);
check('性能图三要素与正文同源（指令条数 / CPI / 主频）',
  ['指令条数', 'CPI', '主频'].every(t => sPerf.indexOf(t) >= 0) &&
  i131.indexOf('指令条数、CPI、主频') >= 0, true);
check('性能图演算数据取自正文 2022 真题（1GHz / 10000 条 / 80%×1 + 20%×10）',
  sPerf.indexOf('1GHz') >= 0 && sPerf.indexOf('10000') >= 0 &&
  sPerf.indexOf('80%') >= 0 && i131.indexOf('1GHz、10000 条、80%×1 周期+20%×10 周期') >= 0, true);
check('性能图算出的 CPI 2.8 与 28μs 与正文一致',
  sPerf.indexOf('0.8×1 + 0.2×10 = 2.8') >= 0 && sPerf.indexOf('28μs') >= 0 &&
  i131.indexOf('CPI=2.8、T=10000×2.8/10⁹=28μs') >= 0, true);
check('性能图 MIPS 公式与正文黄框一致',
  sPerf.indexOf('MIPS = 主频 ÷ (CPI × 10⁶)') >= 0 &&
  i131.indexOf('MIPS = 主频 ÷ (CPI × 10⁶)') >= 0, true);
check('性能图标明主频高 ≠ 更快（CISC / RISC 相互制约）',
  sPerf.indexOf('CISC') >= 0 && sPerf.indexOf('RISC') >= 0 &&
  i131.indexOf('主频高不等于性能一定高') >= 0, true);
check('1.3.1 新增黄框讲单位与平均 CPI 口径',
  i131.indexOf('算题三步') >= 0 && i131.indexOf('按指令频度加权') >= 0, true);

// ---- 5. 2.1.5 字符编码 ----
const i215 = nodeHtml('2.1.5');
const sUtf8 = read('pwa/img/co_fig_utf8.svg');
check('2.1.5 UTF-8 图在编码表之后',
  i215.indexOf('</table>') < i215.indexOf('img/co_fig_utf8.svg'), true);
const sUtf8Flat = sUtf8.replace(/<[^>]+>/g, '');
check('UTF-8 图四种长度与正文表一致',
  ['0xxxxxxx', '110xxxxx', '1110xxxx', '11110xxx'].every(t => sUtf8Flat.indexOf(t) >= 0) &&
  ['0xxxxxxx', '110xxxxx', '1110xxxx', '11110xxx'].every(t => i215.indexOf(t) >= 0), true);
check('UTF-8 图覆盖范围与正文表一致（U+007F / U+FFFF）',
  sUtf8.indexOf('U+007F') >= 0 && sUtf8.indexOf('U+FFFF') >= 0 &&
  i215.indexOf('U+0000~U+007F') >= 0 && i215.indexOf('U+0800~U+FFFF') >= 0, true);
check('UTF-8 图「中」的推演自洽：U+4E2D → E4 B8 AD',
  sUtf8.indexOf('4E2D') >= 0 && sUtf8.indexOf('E4H') >= 0 &&
  sUtf8.indexOf('B8H') >= 0 && sUtf8.indexOf('ADH') >= 0, true);
check('UTF-8 图区分 ASCII 7 位与存储 1 字节（正文易错点①）',
  sUtf8.indexOf('7 位') >= 0 && sUtf8.indexOf('占 1 字节') >= 0 &&
  i215.indexOf('ASCII 是 7 位编码但存储占 1 字节') >= 0, true);
check('UTF-8 图点明 GB2312 内码 2 字节 ≠ UTF-8 汉字 3 字节',
  sUtf8.indexOf('GB2312') >= 0 && sUtf8.indexOf('2 字节') >= 0 &&
  i215.indexOf('GB2312 汉字占 2 字节') >= 0, true);
check('2.1.5 新增黄框说明续字节 10 是标记位',
  i215.indexOf('标记位不是数据位') >= 0 && i215.indexOf('UTF-8 三判') >= 0, true);

// ---- 6. 2.3.4 数据的宽度和存储 ----
const i234 = nodeHtml('2.3.4');
const sEnd = read('pwa/img/co_fig_endian.svg');
check('2.3.4 大小端图在结构体对齐之后、★ 之前',
  i234.indexOf('成员顺序影响占用空间') < i234.indexOf('img/co_fig_endian.svg') &&
  i234.indexOf('img/co_fig_endian.svg') < i234.indexOf('★ 高频真题考点'), true);
check('大小端图与正文同一组数据（0123 4567H @0800H）',
  sEnd.indexOf('0123 4567H') >= 0 && i234.indexOf('int 0123 4567H 存入地址 0800H') >= 0, true);
check('大小端图字节序列与正文逐字节一致',
  sEnd.indexOf('01H') >= 0 && sEnd.indexOf('67H') >= 0 &&
  i234.indexOf('大端为 01H,23H,45H,67H') >= 0 && i234.indexOf('小端为 67H,45H,23H,01H') >= 0, true);
check('大小端图用正文的负数例子（-64 → FFFFFFC0H）',
  sEnd.indexOf('FFFFFFC0H') >= 0 && sEnd.indexOf('C0H') >= 0 &&
  i234.indexOf('-64 → C0 FF FF FF') >= 0, true);
check('对齐图给出 4 的倍数规则与两次访存后果',
  sEnd.indexOf('4 的倍数') >= 0 && sEnd.indexOf('两次访存') >= 0 &&
  i234.indexOf('字地址须为 4 的倍数') >= 0, true);
check('结构体图 8B / 12B 与正文例子一致',
  sEnd.indexOf('= 8B') >= 0 && sEnd.indexOf('= 12B') >= 0 &&
  i234.indexOf('struct A{int a; char b; short c;} 大小 8') >= 0 &&
  i234.indexOf('struct B{char b; int a; short c;} 大小 12') >= 0, true);

// ---- 7. 5.1.2 CPU 基本结构 ----
const i512 = nodeHtml('5.1.2');
const sCpu = read('pwa/img/co_fig_cpu_regs.svg');
check('5.1.2 结构图在部件清单之后、★ 之前',
  i512.indexOf('中断机构：处理异常和外部中断') < i512.indexOf('img/co_fig_cpu_regs.svg') &&
  i512.indexOf('img/co_fig_cpu_regs.svg') < i512.indexOf('★ 高频真题考点'), true);
check('CPU 结构图部件与正文清单一致（PC/IR/ALU/GPRs/FR/MAR/MDR）',
  ['PC', 'IR', 'ALU', 'GPRs', 'FR', 'MAR', 'MDR'].every(t => sCpu.indexOf(t) >= 0), true);
check('CPU 结构图把 IR/MAR/MDR 画成虚线（不可见）',
  sCpu.indexOf('stroke-dasharray') >= 0 && sCpu.indexOf('不可见') >= 0 &&
  i512.indexOf('中断机构：处理异常和外部中断') >= 0, true);
check('CPU 结构图位宽口径抄正文（PC 由地址总线宽度定、IR = 指令字长）',
  sCpu.indexOf('PC 位数由地址总线宽度决定') >= 0 && sCpu.indexOf('IR 位数等于指令字长') >= 0 &&
  i512.indexOf('位数由地址总线宽度决定') >= 0 && i512.indexOf('位数等于指令字长') >= 0, true);
check('CPU 结构图保留正文的 12 个部件去向（控制信号 / 时序 / 中断）',
  sCpu.indexOf('控制单元') >= 0 && sCpu.indexOf('时序信号') >= 0 && sCpu.indexOf('中断机构') >= 0, true);
check('5.1.2 新增黄框讲四条位宽',
  i512.indexOf('位宽记四句') >= 0 && i512.indexOf('存储字长') >= 0, true);

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
