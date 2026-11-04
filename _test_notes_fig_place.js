// 笔记配图落位回归（2026-11-04）
//
// 用户报障：OS 4.2.6 里「图4.11 隐式链接」「图4.12 FAT」被追加到了小节最末尾
// （落在「九、索引分配」之后），而没有跟在「八、链接分配」讲完的位置。
//
// 约定：
//   · 一般小节：配图放**小节末尾**（前面是「★ 高频真题考点与陷阱」）是既定规范；
//   · 但 4.2.6 这种 html 内含多个编号小节（六/七/八/九）的，配图必须落在
//     它所属的那个编号小节内，而不是整个 html 的末尾。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_notes_fig_place.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const NOTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/notes/os_notes.json'), 'utf8'));

function findHtml(prefix) {
  for (const ch of NOTES.chapters) {
    for (const sec of ch.sections) {
      if ((sec.section || '').startsWith(prefix)) return { label: sec.section, html: sec.html || '' };
      for (const s2 of sec.subsections || []) {
        if ((s2.section || '').startsWith(prefix)) return { label: s2.section, html: s2.html || '' };
      }
    }
  }
  return null;
}

console.log('--- 一、4.2.6 的两张图必须落在「八、链接分配」段内 ---');
const node = findHtml('4.2.6');
check('找到 4.2.6', !!node, true);
if (node) {
  const h = node.html;
  const i8 = h.indexOf('<h4>八、链接分配');
  const i9 = h.indexOf('<h4>九、索引分配');
  const p11 = h.indexOf('os_fig_4_11_link.png');
  const p12 = h.indexOf('os_fig_4_12_fat.png');
  check('「八、」与「九、」都存在', i8 > -1 && i9 > i8, true);
  check('图4.11 在 八→九 之间', p11 > i8 && p11 < i9, true);
  check('图4.12 在 八→九 之间', p12 > i8 && p12 < i9, true);
  check('图4.11 在图4.12 之前（顺序不乱）', p11 < p12, true);
  // 反例保护：不能又跑回 html 末尾（末尾是「★ 高频真题考点与陷阱」）
  const lastH4 = h.lastIndexOf('<h4>');
  check('两张图都不在 html 末尾的「★」段之后', p11 < lastH4 && p12 < lastH4, true);
}

console.log('\n--- 二、全库体检：配图必须挂在某段正文/标题之后（不能出现在 html 开头） ---');
// 注意：**图在小节末尾是既定规范**（前面通常是「★ 高频真题考点与陷阱」），
// 所以不能把"图后面没有标签"当异常。这里只挡一种明显错误：图出现在任何内容之前。
const bad = [];
for (const ch of NOTES.chapters) {
  const cells = [];
  for (const sec of ch.sections) {
    cells.push([sec.section, sec.html || '']);
    for (const s2 of sec.subsections || []) cells.push([s2.section, s2.html || '']);
  }
  for (const [label, html] of cells) {
    for (const m of html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
      const before = html.slice(0, m.index);
      if (!/<(p|h[3-6]|li|td|div)[\s>]/.test(before)) bad.push(label + ':' + m[1].split('/').pop());
    }
  }
}
check('每张配图都位于正文/标题之后（不孤立在开头）', bad, []);

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
