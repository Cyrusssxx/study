// DS 8.6.1 排序算法「比较次数」明细回归（2026-11-07）
//
// 用户要求：核心指标对比表的比较次数写具体，可能会考；
// 特别点名「二路归并两个有序表合并，最坏 m+n−1 次比较」；内容多就单出一张表放下面。
//
// 本测试锁住：
//   ① 原表「比较次数」列不再是含糊的 O(n log₂n)，而是可算的表达式；
//   ② 下方新增的逐算法明细表存在、8 行齐全、位置在原表与「必背高频眼」之间；
//   ③ 归并 callout 给出 m+n−1 上界、min(m,n) 下界、2m−1 特例；
//   ④ 新增内容不引入 <p>（表格 / h4 / callout 都不参与行号），行级批注体系不受影响。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_ds_sort_metrics.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/notes/ds_notes.json'), 'utf8'));
let h = null;
for (const ch of D.chapters) {
  for (const sec of ch.sections) {
    for (const s2 of sec.subsections || []) {
      if ((s2.section || '').startsWith('8.6.1')) h = s2.html || '';
    }
  }
}

console.log('--- 一、节点与表格结构 ---');
check('找到 8.6.1 内部排序算法的比较', !!h, true);
const coreStart = h.indexOf('<h4>二、核心指标精细对比');
const coreTable = h.slice(coreStart, h.indexOf('</table>', coreStart));
const rows = [...coreTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
check('核心对比表 9 行（1 表头 + 8 算法）', rows.length, 9);
const cmpCell = i => (rows[i].match(/<td>[\s\S]*?<\/td>/g) || [])[1] || '';
const names = rows.slice(1).map(r => (r.match(/<td>([^<]*)<\/td>/) || [])[1]);
check('8 个算法顺序未变', names,
  ['直接插入排序', '折半插入排序', '冒泡排序', '简单选择排序', '快速排序', '堆排序', '2 路归并排序', '基数排序']);

console.log('\n--- 二、比较次数列：给得出具体数 ---');
check('比较次数列不再只写 O(n log₂n) 数量级',
  rows.slice(1).filter((r, i) => /最[好坏]\s*<b>O\(n log/.test(cmpCell(i + 1)) || /最[好坏]\s*O\(n log/.test(cmpCell(i + 1))), []);
check('直接插入：最好 n−1 / 最坏 n(n−1)/2',
  /n−1/.test(cmpCell(1)) && /n\(n−1\)\/2/.test(cmpCell(1)), true);
check('折半插入：Σ⌈log₂(i+1)⌉ ≈ n log₂n 且与初态无关',
  /Σ⌈log₂\(i\+1\)⌉/.test(cmpCell(2)) && /与初态无关/.test(cmpCell(2)), true);
check('冒泡：最好 n−1 / 最坏 n(n−1)/2',
  /n−1/.test(cmpCell(3)) && /n\(n−1\)\/2/.test(cmpCell(3)), true);
check('简单选择：恒为 n(n−1)/2（第 j 趟比 n−j 次）',
  /n\(n−1\)\/2/.test(cmpCell(4)) && /n−j/.test(cmpCell(4)), true);
check('快排：最好 ≈ n log₂n / 最坏 n(n−1)/2',
  /≈ n log₂n/.test(cmpCell(5)) && /n\(n−1\)\/2/.test(cmpCell(5)), true);
check('堆：建堆 ≤ 4n ＋ 取顶调整 ≈ 2n⌊log₂n⌋',
  /≤ 4n/.test(cmpCell(6)) && /2n⌊log₂n⌋/.test(cmpCell(6)), true);
check('2 路归并：两表合并 ≤ m+n−1 / 整排 ≤ n⌈log₂n⌉',
  /m\+n−1/.test(cmpCell(7)) && /n⌈log₂n⌉/.test(cmpCell(7)), true);
check('基数：0 次（不基于比较）', /0 次/.test(cmpCell(8)), true);

console.log('\n--- 三、下方新增的逐算法明细表 ---');
const detailStart = h.indexOf('<h4>二·补');
check('明细表标题存在', detailStart > coreStart, true);
const detailEnd = h.indexOf('</table>', detailStart);
const detailTable = h.slice(detailStart, detailEnd);
const dRows = [...detailTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
check('明细表 9 行（1 表头 + 8 算法）', dRows.length, 9);
check('明细表列头完整（口径 / 最坏情形 / 易错点）',
  /每次 \/ 每趟比较次数/.test(dRows[0]) && /总量（含口径）/.test(dRows[0]) &&
  /最坏情形怎么构造/.test(dRows[0]) && /易错点/.test(dRows[0]), true);
check('明细表位于原表之后、「必背高频眼」之前',
  detailStart > h.indexOf('</table>', coreStart) && detailStart < h.indexOf('★ 必背选择题高频眼'), true);
const dText = detailTable.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('明细表含 8 个算法名',
  ['直接插入', '折半插入', '冒泡', '简单选择', '快速', '堆', '2 路归并', '基数']
    .every(n => dText.includes(n)), true);
check('明细表含每趟比较口径（n−j、⌈log₂(i+1)⌉、2h）',
  /n−j/.test(dText) && /⌈log₂\(i\+1\)⌉/.test(dText) && /2h/.test(dText), true);
check('明细表含快排平均 1.39 n log₂n', /1\.39 n log₂n/.test(dText), true);

console.log('\n--- 四、归并两个有序表：m+n−1 专项 ---');
const call = h.slice(h.indexOf('★ 归并两个有序表'), h.indexOf('★ 必背选择题高频眼'));
check('归并 callout 存在', /★ 归并两个有序表/.test(call), true);
check('给出上界 m+n−1', /最多 m\+n−1 次/.test(call), true);
check('给出下界 min(m,n)', /最少 min\(m,n\) 次/.test(call), true);
check('给出等长特例 2m−1', /2m−1/.test(call), true);
check('解释为什么不是 m+n（最后剩的不比）',
  /而不是 m\+n/.test(call) && /最后剩的那个不用比/.test(call), true);
check('明细表也写明「上界不是每次都给到」', /上界<\/b>不是每次都给到/.test(detailTable), true);

console.log('\n--- 五、行号体系不受影响 ---');
// indexSection 只给 .notes-body li / p 标行号；新内容全是 table / h4 / div.key-callout
const pCount = (h.match(/<p\b/g) || []).length;
check('8.6.1 的 <p> 数量仍为 6（未新增，行级批注不错位）', pCount, 6);
check('新增明细表不使用 <p> 承载正文', /<p\b/.test(detailTable), false);
check('表格仍用 mc-table 类', /<table class="mc-table">/.test(detailTable), true);

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
