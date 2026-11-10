// 笔记重点标记回归测试（全科目生效版）：
//   教材重点（mark）→ 荧光笔半高亮；b/strong 只负责字重（2026-11-03 用户要求「加粗≠高亮」）
//   我的批注（hl-* 与 note-hl-*）→ 底部实线下划线 + 极淡底
//   2026-11-09：黄色由琥珀/暗金改为浅黄（rgba(250,204,21,.18) + #eab308），深色边框 #fde047
//   2026-11-10：绿/蓝/粉同步调浅（用户反馈「高亮太深、下划线也太深」，黄色保持）——
//     下边线由 600 档 #16a34a/#2563eb/#db2777 降到 400 档 #4ade80/#60a5fa/#f472b6，
//     底色由 16~18% 降到 13~14% 并换同档浅色；另补 .line-anno-text 的内联色兜底
//   2026-11-10 二轮：「下划线存在感太强，可以多变淡」+「绿蓝粉再变淡」——
//     下划线四色（含黄）统一降到 300 档 #fcd34d/#86efac/#93c5fd/#f9a8d4；
//     绿/蓝/粉底色降到 10%/9%/9%，黄底 .18 维持
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}

const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
// 只看亮色规则：注释里记着历史色值、.dark 规则深色主题刻意保留原样，
// 直接对整份 css 做「旧色不存在」断言会误伤这两处。
const lightCss = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\.dark[^{}]*\{[^{}]*\}/g, '');
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

// 亮色四色调色板：下划线一律 300 档（10-10 二轮，含黄）
const LIGHT_HL = [['yellow', '#fcd34d'], ['green', '#86efac'], ['blue', '#93c5fd'], ['pink', '#f9a8d4']];
console.log('▸ 我的批注：下划线语言（与教材重点区分）');
for (const [c, hex] of LIGHT_HL) {
  // 选择器列表变长了（补了 .line-anno-text 的内联兜底），匹配窗口从 340 放宽到 800
  const re = new RegExp(`\\.note-input \\.hl-${c}[\\s\\S]{0,800}?border-bottom:\\s*2px solid ${hex}`);
  check(`批注 ${c}：2px 下边框 ${hex}`, re.test(css));
}
check('批注底改为极淡（不再是实色 #fff3a3）', !/background:\s*#fff3a3 !important/.test(css));
check('批注黄色底改为浅黄 18%（不再用 22% 琥珀）',
  /rgba\(250,\s*204,\s*21,\s*\.18\) !important/.test(css) &&
  !/rgba\(234,\s*179,\s*8,\s*\.22\) !important/.test(css), true);
check('深色模式批注下边框提亮', /\.dark \.note-input \.hl-yellow[\s\S]{0,120}border-bottom-color:\s*#fde047/.test(css));

console.log('▸ 行级批注（.note-hl-*，笔记正文里的选区高亮）');
for (const [c, hex] of LIGHT_HL) {
  const re = new RegExp('\\.note-hl-' + c + '\\s*\\{[^}]*border-bottom:\\s*2px solid ' + hex);
  check('行级批注 ' + c + '：2px 下边框 ' + hex, re.test(css));
}
check('行级批注不再是实色平涂', !/\.note-hl-yellow\s*\{\s*background:\s*#fff3a3/.test(css));
check('行级批注换行不断裂', /\.note-hl\s*\{[^}]*box-decoration-break:\s*clone/.test(css));
check('深色模式行级批注边框提亮', /\.dark \.note-hl-yellow[^}]*border-bottom-color:\s*#fde047/.test(css));

console.log('▸ 亮色四色统一调浅（下划线 300 档，绿蓝粉底 9~10%）');
check('亮色：行级批注黄底为浅黄 18%',
  /\.note-hl-yellow\s*\{[^}]*rgba\(250,\s*204,\s*21,\s*\.18\)/.test(css), true);
check('亮色：两处黄色下边线降到 300 档 #fcd34d',
  (css.match(/border-bottom:\s*2px solid #fcd34d/g) || []).length >= 2, true);
check('深色：两处黄色边框都是浅黄 #fde047',
  (css.match(/border-bottom-color:\s*#fde047/g) || []).length >= 2, true);
check('绿/蓝/粉下边线降到 300 档（400 档也嫌重）',
  /\.note-hl-green\s+\{[^}]*#86efac/.test(css) &&
  /\.note-hl-blue\s+\{[^}]*#93c5fd/.test(css) &&
  /\.note-hl-pink\s+\{[^}]*#f9a8d4/.test(css) &&
  !/#16a34a|#2563eb|#db2777|#4ade80|#60a5fa|#f472b6|#eab308/.test(lightCss), true);
check('绿/蓝/粉底色再降到 10%/9%/9%（编辑态 + 行级批注两处同步）',
  /rgba\(74,\s*222,\s*128,\s*\.10\) !important/.test(css) &&
  /rgba\(96,\s*165,\s*250,\s*\.09\) !important/.test(css) &&
  /rgba\(244,\s*114,\s*182,\s*\.09\) !important/.test(css) &&
  /\.note-hl-green\s+\{[^}]*rgba\(74,\s*222,\s*128,\s*\.10\)/.test(css) &&
  /\.note-hl-blue\s+\{[^}]*rgba\(96,\s*165,\s*250,\s*\.09\)/.test(css) &&
  /\.note-hl-pink\s+\{[^}]*rgba\(244,\s*114,\s*182,\s*\.09\)/.test(css) &&
  !/rgba\(74,\s*222,\s*128,\s*\.14/.test(lightCss) &&
  !/rgba\(96,\s*165,\s*250,\s*\.13/.test(lightCss) &&
  !/rgba\(244,\s*114,\s*182,\s*\.13/.test(lightCss) &&
  !/rgba\(34,\s*197,\s*94,\s*\.18\) !important/.test(lightCss) &&
  !/rgba\(59,\s*130,\s*246,\s*\.16\) !important/.test(lightCss) &&
  !/rgba\(236,\s*72,\s*153,\s*\.16\) !important/.test(lightCss), true);
check('取色圆点同步换成新色（圆点=实际刷上去的下边线色）',
  /\.hl-dot-yellow\s*\{[^}]*#fcd34d/.test(css) &&
  /\.hl-dot-green\s*\{[^}]*#86efac/.test(css) &&
  /\.hl-dot-blue\s*\{[^}]*#93c5fd/.test(css) &&
  /\.hl-dot-pink\s*\{[^}]*#f9a8d4/.test(css), true);
check('教材重点 mark 的橙色荧光未受影响',
  /\.notes-body mark\s*\{[^}]*rgba\(249,\s*115,\s*22,\s*\.34\)/.test(css), true);
check('全局搜索 mark 的浅黄底未受影响', /\nmark \{\s*background:\s*#fff3bf/.test(css), true);

console.log('▸ 兼容性：旧数据/旧选择器不破');
check('execCommand 内联背景兜底选择器仍在', /\[style\*="background-color:#fff3a3"\]/.test(css));
check('保存回显（.line-anno-text）也有同款内联兜底，编辑态/回显一致',
  (css.match(/\.line-anno-text \[style\*="background/g) || []).length === 12, true);
check('全局 mark 规则保留', /\nmark \{\s*background:\s*#fff3bf/.test(css));
check('取色圆点与新浅黄一致',
  /\.hl-dot-yellow\s*\{\s*background:\s*rgba\(250,\s*204,\s*21/.test(css), true);

console.log(`\n结果: ${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed ? 1 : 0);
