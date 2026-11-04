// 笔记重点标记回归测试（全科目生效版）：
//   教材重点（mark）→ 荧光笔半高亮；b/strong 只负责字重（2026-11-03 用户要求「加粗≠高亮」）
//   我的批注（hl-* 与 note-hl-*）→ 底部实线下划线 + 极淡底
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}

const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');

console.log('▸ 教材重点：荧光笔半高亮（四科全生效）');
check('notesContent 按科目加类', /classList\.add\('subj-' \+ SUBJECT\)/.test(html));
check('已无 .subj-ds 灰度限定', !/\.subj-ds/.test(css));
check('mark 用半高亮渐变', /\.notes-body mark\s*\{[^}]*linear-gradient\(transparent 5\d%/.test(css));
check('mark 荧光色为黄', /rgba\(250,\s*204,\s*21,\s*\.6/.test(css));
check('换行不断裂', /\.notes-body mark[\s\S]{0,200}box-decoration-break:\s*clone/.test(css));
// 2026-11-03 用户要求「加粗≠高亮」：b/strong 只负责字重，必须去掉荧光底与红下边线
check('加粗不带荧光底（加粗≠高亮）', /\.notes-body b,[\s\S]{0,220}background:\s*none/.test(css));
check('加粗无下边线（加粗≠高亮）', /\.notes-body b,[\s\S]{0,320}border-bottom:\s*none/.test(css));
check('b 不改变文字颜色（color: inherit）', /\.notes-body b,[\s\S]{0,160}color:\s*inherit/.test(css));
check('b 字重保持 700（不变细）', /\.notes-body b,[\s\S]{0,220}font-weight:\s*700/.test(css));
check('b 不再整体染红（无 #a32d2d）', !/#a32d2d/.test(css));
check('旧的 b 染色规则已删除', !/\.notes-body b\s*\{\s*color:\s*var\(--primary-dark\)/.test(css));
check('callout 内 b 保留橙色', /\.notes-body \.key-callout b,[\s\S]{0,120}color:\s*#d48806/.test(css));
check('深色模式 mark 降亮度（橙色半透明，非亮黄）', /\.dark \.notes-body mark\s*\{[^}]*rgba\(251,\s*146,\s*60,\s*\.38/.test(css));
check('深色模式 b 也不改文字色', /\.dark \.notes-body b,[\s\S]{0,200}color:\s*inherit/.test(css));

console.log('▸ 我的批注：下划线语言（与教材重点区分）');
for (const [c, hex] of [['yellow', '#ca8a04'], ['green', '#16a34a'], ['blue', '#2563eb'], ['pink', '#db2777']]) {
  const re = new RegExp(`\\.note-input \\.hl-${c}[\\s\\S]{0,340}?border-bottom:\\s*2px solid ${hex}`);
  check(`批注 ${c}：2px 下边框 ${hex}`, re.test(css));
}
check('批注底改为极淡（不再是实色 #fff3a3）', !/background:\s*#fff3a3 !important/.test(css));
check('批注黄色底为 22% 琥珀', /rgba\(234,\s*179,\s*8,\s*\.22\) !important/.test(css));
check('深色模式批注下边框提亮', /\.dark \.note-input \.hl-yellow[\s\S]{0,120}border-bottom-color:\s*#facc15/.test(css));

console.log('▸ 行级批注（.note-hl-*，笔记正文里的选区高亮）');
for (const [c, hex] of [['yellow', '#ca8a04'], ['green', '#16a34a'], ['blue', '#2563eb'], ['pink', '#db2777']]) {
  const re = new RegExp('\\.note-hl-' + c + '\\s*\\{[^}]*border-bottom:\\s*2px solid ' + hex);
  check('行级批注 ' + c + '：2px 下边框 ' + hex, re.test(css));
}
check('行级批注不再是实色平涂', !/\.note-hl-yellow\s*\{\s*background:\s*#fff3a3/.test(css));
check('行级批注换行不断裂', /\.note-hl\s*\{[^}]*box-decoration-break:\s*clone/.test(css));
check('深色模式行级批注边框提亮', /\.dark \.note-hl-yellow[^}]*border-bottom-color:\s*#facc15/.test(css));

console.log('▸ 兼容性：旧数据/旧选择器不破');
check('execCommand 内联背景兜底选择器仍在', /\[style\*="background-color:#fff3a3"\]/.test(css));
check('全局 mark 规则保留', /\nmark \{\s*background:\s*#fff3bf/.test(css));
check('取色圆点与新色一致', /\.hl-dot-yellow\s*\{\s*background:\s*rgba\(234,\s*179,\s*8/.test(css));

console.log(`\n结果: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed ? 1 : 0);
