/* 操作系统第六批配图（Peterson 算法 / 资源分配图化简 / 五种文件逻辑结构 / 磁盘三次格式化）
 * —— 4 张图 + 4 个黄框的契约回归。OS 精确总量由本文件统管。
 *
 * 关键约束：
 * 1) 图里的数字必须与正文同源：10000 条 / 100 组 / 每组 100 / 表 50 + 组内 50 = 100 次 / 顺序 5000 次；
 *    R1 两实例一空闲 → 可化简；R1/R2 各一实例 → 不可化简；
 * 2) 图必须在 ★ 真题汇总之前，且紧跟各自知识点（不隔开正文）；
 * 3) 静态可批注行锁死 3660、jsdom 真实 .anno-line 锁死 3668；
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

const notesRaw = read('pwa/data/notes/os_notes.json');
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
  ['peterson',    '2.3.2', '总有一个进程等待条件不成立而得以进入临界区'],
  ['rag_reduce',  '2.5.4', '化简后仍有边相连的进程即为死锁进程'],
  ['file_logic',  '4.1.3', '存在冲突需处理'],
  ['disk_format', '5.3.2', '核心思想：通过软件标记或硬件重映射'],
];

check('序列化仍是 indent=1 + LF + 尾换行',
  [notesRaw.indexOf('\r\n') < 0, notesRaw.endsWith('\n')], [true, true]);
check('OS 配图不少于 47 张（精确值见 _test_os_fig_p7）',
  (notesRaw.match(/class=\\"fig-img\\"/g) || []).length >= 47, true);
check('OS 黄框不少于 52 个（精确值见 _test_os_fig_p7）',
  (notesRaw.match(/class=\\"key-callout\\"/g) || []).length >= 52, true);
check('SW 里第六批 4 图进预缓存',
  ['peterson', 'rag_reduce', 'file_logic', 'disk_format']
    .every(n => sw.includes("'img/os_fig_" + n + ".svg'")), true);
check('笔记 JSON 不含 <tspan>（黄框只能用 <b>）',
  notesRaw.indexOf('tspan'), -1);

for (const [name, sec, anchorText] of FIGS) {
  const h = nodeHtml(sec);
  const svgName = 'img/os_fig_' + name + '.svg';
  check(sec + ' 引用了 ' + name, h.includes(svgName), true);
  const iFig = h.indexOf(svgName);
  const iStar = h.indexOf('★ 高频真题考点');
  check(sec + ' ' + name + ' 在 ★ 真题汇总之前', iStar < 0 || iFig < iStar, true);
  const iAnchor = h.indexOf(anchorText);
  check(sec + ' ' + name + ' 紧跟知识点「' + anchorText.slice(0, 12) + '」',
    iAnchor >= 0 && iAnchor < iFig && iFig - iAnchor < 1500, true);
  const seg = h.slice(Math.max(0, iFig - 260), iFig + 40);
  check(sec + ' ' + name + ' 的图块带 data-fig="1"', seg.includes('data-fig="1"'), true);
}

// ---- 2.3.2 Peterson：落点必须在「五、硬件实现方法」之前 ----
const pet = nodeHtml('2.3.2');
check('2.3.2 Peterson 图在「五、硬件实现方法」之前',
  pet.indexOf('img/os_fig_peterson.svg') < pet.indexOf('五、硬件实现方法'), true);
check('2.3.2 Peterson 图在软件方法段之后（不在四条准则前）',
  pet.indexOf('四、软件实现方法') < pet.indexOf('img/os_fig_peterson.svg'), true);

const ps = read('pwa/img/os_fig_peterson.svg');
check('Peterson 图的 flag / turn 语义与正文一致',
  ps.includes('flag') && ps.includes('turn') &&
  pet.includes('flag[]解决互斥，turn解决饥饿'), true);
check('Peterson 图的三步进入区与正文代码一致（置 flag → 写 turn → while）',
  ps.includes('flag[0] = true') && ps.includes('turn = 1') && ps.includes('while (flag[1]'),
  true);
check('Peterson 图点明后写 turn 者谦让',
  ps.includes('让给对方') && ps.includes('后写'), true);
check('Peterson 图四条准则逐条对照，且只输让权等待',
  ['空闲让进', '忙则等待', '有限等待', '让权等待'].every(t => ps.includes(t)) &&
  ps.includes('让权等待 ✗') && pet.includes('不满足让权等待'), true);
check('Peterson 图与正文同源的考点年份（2010 / 2018）仍在正文',
  pet.includes('2010、2018'), true);
check('Peterson 图点明 TS / Swap 同样忙等',
  ps.includes('TS') && ps.includes('Swap') && pet.includes('TS/Swap'), true);

// ---- 2.5.4 资源分配图化简 ----
const rag = nodeHtml('2.5.4');
check('2.5.4 化简图在「死锁解除方法」之前',
  rag.indexOf('img/os_fig_rag_reduce.svg') < rag.indexOf('死锁解除方法（2019考）'), true);
check('2.5.4 化简图在化简步骤列表之后',
  rag.indexOf('化简后仍有边相连的进程即为死锁进程') < rag.indexOf('img/os_fig_rag_reduce.svg'),
  true);

const rs = read('pwa/img/os_fig_rag_reduce.svg');
check('化简图点明「空闲实例数 = 总数 − 分配边数」',
  rs.includes('该类资源总数 − 该资源节点的分配边条数') &&
  rag.includes('空闲资源数=该类资源总数−已分配实例数'), true);
check('化简图与正文的死锁定理同源',
  rs.includes('不可完全化简') && rag.includes('当且仅当其资源分配图不可完全化简'), true);
check('化简图点明「无环必不死锁、有环只是可能」',
  rs.includes('无环必不死锁') && rs.includes('可能'), true);
check('化简图点明单实例时才有环⇔死锁',
  rs.includes('只有 1 个实例') && rs.includes('与「死锁」等价'), true);
check('化简图两栏结论分别是可化简 / 死锁',
  rs.includes('可完全化简') && rs.includes('不可化简'), true);
check('化简图给出解除三法（资源剥夺 / 撤销进程 / 进程回退）',
  ['资源剥夺', '撤销进程', '进程回退'].every(t => rs.includes(t) && rag.includes(t)), true);

// ---- 4.1.3 文件逻辑结构 ----
const fl = nodeHtml('4.1.3');
check('4.1.3 逻辑结构图在「八、直接存取…」对比节之前',
  fl.indexOf('img/os_fig_file_logic.svg') < fl.indexOf('八、直接存取与顺序存取'), true);
check('4.1.3 逻辑结构图在四种组织方式对比表之后',
  fl.indexOf('存在冲突需处理') < fl.indexOf('img/os_fig_file_logic.svg'), true);

const fs_ = read('pwa/img/os_fig_file_logic.svg');
check('逻辑结构图五种结构齐全',
  ['顺序文件', '变长顺序文件', '索引文件', '索引顺序文件', '直接文件'].every(t => fs_.includes(t)), true);
check('逻辑结构图的 10000 条 / 100 组与正文同源',
  fs_.includes('10000') && fs_.includes('100 组') && fs_.includes('100 条') &&
  fl.includes('N=10000条记录，分100组、每组100条'), true);
check('逻辑结构图的 50 + 50 = 100 次与正文同源',
  fs_.includes('表 50 + 组内 50') && fs_.includes('100 次') &&
  fl.includes('索引表50次 + 组内50次') && fl.includes('100次'), true);
check('逻辑结构图的顺序查找 5000 次与正文同源',
  fs_.includes('5000') && fl.includes('5000'), true);
check('逻辑结构图点明 m=√N 最优',
  fs_.includes('m=√N') && fl.includes('m = √N'), true);
check('逻辑结构图点明定长可算偏移、变长只能累加',
  fs_.includes('基址 + i×L') && fs_.includes('累加长度') &&
  fl.includes('第i条记录地址 = 基址 + i×L'), true);
check('逻辑结构图点明无结构文件没有「记录」',
  fs_.includes('压根没有「记录」') && fl.includes('没有\"记录\"的概念'), true);

// ---- 5.3.2 磁盘管理 ----
const dk = nodeHtml('5.3.2');
check('5.3.2 磁盘图在 ★ 之前',
  dk.indexOf('img/os_fig_disk_format.svg') < dk.indexOf('★ 高频真题考点'), true);

const ds = read('pwa/img/os_fig_disk_format.svg');
check('磁盘图三阶段齐全且顺序正确',
  (() => {
    const a = ds.indexOf('低级格式化'), b = ds.indexOf('② 分区'), c = ds.indexOf('逻辑格式化');
    return a >= 0 && b > a && c > b;
  })(), true);
check('磁盘图的扇区三段与正文一致（头 / 数据区 / 尾 + CRC）',
  ['头部', '数据区域', '尾部', 'CRC'].every(t => ds.includes(t)) &&
  dk.includes('头部、数据区域和尾部组成') && dk.includes('CRC字段'), true);
check('磁盘图点明簇是 2ⁿ 个扇区、占用空间 ceil 公式',
  ds.includes('2ⁿ 个连续扇区') && ds.includes('ceil(文件大小/簇大小)') &&
  dk.includes('ceil(文件大小/簇大小)×簇大小'), true);
check('磁盘图引导链四段与正文一致（ROM → MBR → 引导扇区 → 内核）',
  ['ROM 自举装入程序', 'MBR（磁盘 0 号扇区）', '引导扇区（活动分区首扇区）'].every(t => ds.includes(t)) &&
  dk.includes('ROM中只保留一个小型自举装入程序'), true);
check('磁盘图点明 MBR 与引导扇区是两个不同对象',
  ds.includes('MBR 管') && ds.includes('引导扇区管') && dk.includes('MBR与引导扇区是两个不同对象'), true);
check('磁盘图点明 0 字节文件也占一整簇',
  ds.includes('0 字节') && dk.includes('即使文件小于一簇（甚至为0字节）'), true);
check('磁盘图点明头尾信息属低级格式化',
  ds.includes('头尾信息由低级格式化建立') &&
  dk.includes('低级格式化阶段创建的'), true);

for (const n of ['peterson', 'rag_reduce', 'file_logic', 'disk_format']) {
  const s = read('pwa/img/os_fig_' + n + '.svg');
  check('os_fig_' + n + ' 无 HTML <b>/<br> 标签',
    !/<(b|br|strong|i)\b/.test(s.replace(/<\?xml[^>]*\?>/g, '')), true);
  check('os_fig_' + n + ' 无外链', !/xlink:href|<script|<image/.test(s), true);
}

// 行号漂移护栏（静态 3660，两口径必须同值）
let annoLines = 0, annoOpen = 0;
for (const c of notes.chapters) {
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
check('全库可批注行数锁死 3660（配对口径）', annoLines, 3660);
check('全库可批注行数锁死 3660（开标签口径）', annoOpen, 3660);

console.log((fail === 0 ? 'PASS' : 'FAIL') + ' ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
