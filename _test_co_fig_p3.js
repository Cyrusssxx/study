/* 计组 P3（16 位扩展操作码 / 中断处理全流程 / 屏蔽字嵌套时序 / 三类流水线冒险）
 * —— 4 张图 + 4 个黄框的契约回归。CO 精确总量（配图 28 张 / 黄框 48 个）由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文同源：15+15+15+16 = 61 条；屏蔽字 1111 / 0111 / 0110 / 0100；
 *    阻塞拍数 0（转发）/ 1（load-use）/ 3（控制冒险、不转发硬等）；
 * 2) 图块必须落在**完整块级标签之间**——踩过的坑：锚点取在 <p> 正文内部，
 *    <div class="key-callout"> 被塞进 <p>，解析器提前闭合段落 → 行号少算且段落被打散；
 * 3) 静态可批注行锁死 1819，图块不得被标成 anno-line；
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
  ['instr_format',    '4.1.2', '教材例（16 位'],
  ['int_flow',        '7.3.2', '单重中断不支持嵌套'],
  ['int_mask',        '7.3.2', '</table>'],
  ['pipeline_hazard', '5.6.4', 'Cache 缺失、中断或异常也会阻塞流水线'],
];

// ---- 1. 序列化与总量 ----
check('序列化仍是 indent=1 + CRLF + 无尾换行',
  [notesRaw.indexOf('\r\n') >= 0, notesRaw.endsWith('}')], [true, true]);
check('计组配图 28 张（P3 精确总量）',
  (notesRaw.match(/fig-img/g) || []).length, 28);
check('计组黄框 48 个（P3 精确总量）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 48);
check('SW 里本批 4 图全部进预缓存',
  ['instr_format', 'int_flow', 'int_mask', 'pipeline_hazard']
    .every(n => sw.includes("'img/co_fig_" + n + ".svg'")), true);
check('笔记 JSON 不含 <tspan>（黄框只能用 <b>）',
  notesRaw.indexOf('tspan'), -1);

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
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1200, true);
  const seg = h.slice(Math.max(0, iFig - 200), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
  // 关键回归：图块前一个标签必须是闭合标签，绝不能落在 <p> 正文里
  const iBlock = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图：', iFig);
  const before = h.slice(0, iBlock).replace(/\s+$/, '');
  const lastTag = (before.match(/<[^>]+>$/) || [''])[0];
  check(sec + ' ' + name + ' 图块前是块级闭合标签（不会塞进 <p> 内部）',
    /^<\//.test(lastTag), true);
}

// ---- 4. 4.1.2 扩展操作码 ----
const i412 = nodeHtml('4.1.2');
const sInstr = read('pwa/img/co_fig_instr_format.svg');
check('4.1.2 扩展操作码图在「易错点」段之前',
  i412.indexOf('img/co_fig_instr_format.svg') < i412.indexOf('易错点：①一地址 3 次访存'), true);
check('扩展操作码图的 61 条与正文同源',
  sInstr.indexOf('61 条') >= 0 && i412.indexOf('15 条三地址 + 15 条二地址') >= 0 &&
  i412.indexOf('16 条零地址 = 61 条') >= 0, true);
check('扩展操作码图四级编码都画了（三/二/一/零地址）',
  ['三地址', '二地址', '一地址', '零地址'].every(t => sInstr.indexOf(t) >= 0), true);
check('扩展操作码图用 1111 作扩展标志',
  sInstr.indexOf('1111') >= 0 && i412.indexOf('短操作码不能成为长操作码的前缀') >= 0, true);
check('扩展操作码图点明前缀冲突的后果',
  sInstr.indexOf('成为长操作码的') >= 0 && sInstr.indexOf('前缀') >= 0 &&
  sInstr.indexOf('无法判断') >= 0, true);
check('扩展操作码图给出 15/15/15/16 的逐级分配',
  sInstr.indexOf('15 条') >= 0 && sInstr.indexOf('16 条') >= 0, true);

// ---- 5. 7.3.2 中断处理全流程 ----
const i732 = nodeHtml('7.3.2');
check('7.3.2 流程图在「多重中断和中断屏蔽技术」段之前',
  i732.indexOf('img/co_fig_int_flow.svg') < i732.indexOf('<p>多重中断和中断屏蔽技术'), true);
check('7.3.2 流程图在九步处理过程之后',
  i732.indexOf('单重中断不支持嵌套') < i732.indexOf('img/co_fig_int_flow.svg'), true);

const sFlow = read('pwa/img/co_fig_int_flow.svg');
check('流程图硬件三步与正文隐指令一致',
  sFlow.indexOf('关中断') >= 0 && sFlow.indexOf('保存断点') >= 0 &&
  sFlow.indexOf('引出服务程序') >= 0 && i732.indexOf('中断隐指令只有三步') >= 0, true);
check('流程图点明通用寄存器现场由软件保存',
  sFlow.indexOf('软件') >= 0 && sFlow.indexOf('硬件') >= 0 &&
  i732.indexOf('通用寄存器现场由中断服务程序开头用软件保存') >= 0, true);
check('流程图三种断点指向不同地址',
  sFlow.indexOf('当前指令地址') >= 0 && sFlow.indexOf('下一条指令地址') >= 0 &&
  i732.indexOf('断点为当前指令地址') >= 0, true);
check('流程图含中断向量与两种识别方法',
  sFlow.indexOf('中断向量表') >= 0 && sFlow.indexOf('硬件向量法') >= 0 &&
  sFlow.indexOf('软件查询法') >= 0 && i732.indexOf('硬件向量法和软件查询法') >= 0, true);
check('流程图强调只在指令执行结束时采样 I/O 请求',
  sFlow.indexOf('每条指令执行结束时') >= 0 &&
  i732.indexOf('CPU 仅在每条指令执行结束时统一采样中断请求信号') >= 0, true);
check('流程图含中断返回（IRET）环节',
  sFlow.indexOf('IRET') >= 0 && i732.indexOf('中断返回指令') >= 0, true);

// ---- 6. 7.3.2 屏蔽字与嵌套时序 ----
check('7.3.2 屏蔽字图在表 7.1 之后、「评价」之前',
  i732.indexOf('</table>') < i732.indexOf('img/co_fig_int_mask.svg') &&
  i732.indexOf('img/co_fig_int_mask.svg') < i732.indexOf('评价：程序中断方式'), true);

const sMask = read('pwa/img/co_fig_int_mask.svg');
check('屏蔽字图四个屏蔽字与正文表 7.1 完全一致',
  ['1111', '0100', '0110', '0111'].every(t => sMask.indexOf(t) >= 0) &&
  i732.indexOf('0111') >= 0 && i732.indexOf('0110') >= 0, true);
check('屏蔽字图与正文的处理优先级 A>D>C>B 同源',
  sMask.indexOf('A&gt;D&gt;C&gt;B') >= 0 && i732.indexOf('要求处理优先级调整为') >= 0, true);
check('屏蔽字图给出「比我高就置 1」的算法',
  sMask.indexOf('比我高') >= 0 && sMask.indexOf('置 1') >= 0, true);
check('屏蔽字图区分响应优先级与处理优先级',
  sMask.indexOf('响应优先级') >= 0 && sMask.indexOf('处理优先级') >= 0 &&
  sMask.indexOf('改不了') >= 0 && sMask.indexOf('动态调整') >= 0, true);
check('屏蔽字图点明单重中断省去开/关中断两步',
  sMask.indexOf('省去开中断与关中断两步') >= 0 &&
  i732.indexOf('单重中断不支持嵌套，省略 ⑤ 和 ⑦') >= 0, true);
check('屏蔽字图点明屏蔽字由软件在进入服务程序时加载',
  sMask.indexOf('软件在进入服务程序时加载') >= 0 &&
  i732.indexOf('中断屏蔽字通常在进入中断服务程序时由软件加载') >= 0, true);

// ---- 7. 5.6.4 三类流水线冒险 ----
const i564 = nodeHtml('5.6.4');
check('5.6.4 三类冒险图在 ★ 之前',
  i564.indexOf('img/co_fig_pipeline_hazard.svg') < i564.indexOf('★ 高频真题考点'), true);
check('5.6.4 三类冒险图在三类都讲完之后',
  i564.indexOf('Cache 缺失、中断或异常也会阻塞流水线') <
  i564.indexOf('img/co_fig_pipeline_hazard.svg'), true);

const sHz = read('pwa/img/co_fig_pipeline_hazard.svg');
check('三类冒险图三类齐全',
  ['结构冒险', '数据冒险', '控制冒险'].every(t => sHz.indexOf(t) >= 0), true);
check('三类冒险图阻塞拍数与正文「记数字」一致',
  sHz.indexOf('0 拍') >= 0 && sHz.indexOf('1 拍') >= 0 && sHz.indexOf('3 拍') >= 0 &&
  i564.indexOf('记数字') >= 0 && i564.indexOf('｜load-use') >= 0, true);
check('三类冒险图点明 load-use 要停 1 拍',
  sHz.indexOf('load-use') >= 0 && sHz.indexOf('阻塞') >= 0 &&
  i564.indexOf('load-use：阻塞 1 拍 + 转发') >= 0, true);
check('三类冒险图结构冒险的对策是指令/数据 Cache 分离',
  sHz.indexOf('Cache') >= 0 && sHz.indexOf('分离') >= 0 &&
  i564.indexOf('指令 Cache 与数据 Cache 分离') >= 0, true);
check('三类冒险图控制冒险 C = 3 与正文同源',
  sHz.indexOf('C = 3') >= 0 && i564.indexOf('C=3') >= 0, true);
check('三类冒险图点明按序流水线只考虑 RAW',
  sHz.indexOf('RAW') >= 0 && i564.indexOf('只考虑 RAW') >= 0, true);

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
