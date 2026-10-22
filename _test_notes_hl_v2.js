// 笔记重点标记 v2 回归测试：
//   教材重点（mark/b）→ 荧光笔半高亮，先只对数据结构生效
//   我的批注（hl-四色）→ 底部实线下划线 + 极淡底，与教材重点两套视觉语言
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

console.log('▸ 教材重点：荧光笔半高亮（DS 灰度）');
check('notesContent 按科目加类', /classList\.add\('subj-' \+ SUBJECT\)/.test(html));
check('mark 用半高亮渐变', /\.subj-ds \.notes-body mark\s*\{[^}]*linear-gradient\(transparent 5\d%/.test(css));
check('mark 荧光色为黄', /rgba\(250,\s*204,\s*21,\s*\.62\)/.test(css));
check('换行不断裂', /box-decoration-break:\s*clone/.test(css));
check('作者加粗 b 用红色荧光', /\.subj-ds \.notes-body b[\s\S]{0,220}linear-gradient\(transparent 6\d%,\s*rgba\(226,\s*75,\s*74/.test(css));
check('b 不改变文字颜色（color: inherit）', /\.subj-ds \.notes-body b,[\s\S]{0,160}color:\s*inherit/.test(css));
check('b 字重保持 700（不变细）', /\.subj-ds \.notes-body b,[\s\S]{0,220}font-weight:\s*700/.test(css));
check('b 不再整体染红（无 #a32d2d）', !/#a32d2d/.test(css));
check('只对 ds 生效（灰度）', /\.subj-ds \.notes-body/.test(css) && !/\.subj-os \.notes-body/.test(css));
check('callout 内 b 保留橙色', /\.subj-ds \.notes-body \.key-callout b[\s\S]{0,80}color:\s*#d48806/.test(css));
check('深色模式 mark 降透明度', /\.dark \.subj-ds \.notes-body mark\s*\{[^}]*rgba\(250,\s*204,\s*21,\s*\.4/.test(css));
check('深色模式 b 也不改文字色', /\.dark \.subj-ds \.notes-body b,[\s\S]{0,180}color:\s*inherit/.test(css));

console.log('▸ 我的批注：下划线语言（与教材重点区分）');
for (const [c, hex] of [['yellow', '#d4a017'], ['green', '#639922'], ['blue', '#378add'], ['pink', '#d4537e']]) {
  const re = new RegExp(`\\.note-input \\.hl-${c}[\\s\\S]{0,340}?border-bottom:\\s*2px solid ${hex}`);
  check(`批注 ${c}：2px 下边框 ${hex}`, re.test(css));
}
check('批注底改为极淡（不再是实色 #fff3a3）', !/background:\s*#fff3a3 !important/.test(css));
check('批注黄色底为 16% 淡黄', /rgba\(250,\s*204,\s*21,\s*\.16\) !important/.test(css));
check('批注也有 box-decoration-break', (css.match(/box-decoration-break:\s*clone/g) || []).length >= 2);
check('深色模式批注下边框提亮', /\.dark \.note-input \.hl-yellow[\s\S]{0,120}border-bottom-color:\s*#e0b45c/.test(css));

console.log('▸ 兼容性：旧数据/旧选择器不破');
check('execCommand 内联背景兜底选择器仍在', /\[style\*="background-color:#fff3a3"\]/.test(css));
check('全局 mark 规则保留（其余科目仍可用）', /\nmark \{\s*background:\s*#fff3bf/.test(css));

console.log(`\n结果: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed ? 1 : 0);
