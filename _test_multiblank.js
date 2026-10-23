// 多空题渲染 + 排除机制 回归：
//   1) 每道多空题渲染出的空位数 ≥ 答案位数（否则下拉框不够，选不了）
//   2) excluded 的题不进题池（刷题/模拟考/收藏/搜索都不出现）
//   3) 模拟考按 blank_opts 给每个空各自的选项组
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL').padEnd(5), name, cond ? '' : `→ ${extra || ''}`);
  cond ? pass++ : fail++;
}

const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
const QUIZ = fs.readFileSync(path.join(ROOT, 'pwa/quiz.html'), 'utf8');
const EXAM = fs.readFileSync(path.join(ROOT, 'pwa/exam.html'), 'utf8');

// 页面里实际使用的多空题正则（quiz 与 exam 现在一致）
const PAT = /<pre\b[\s\S]*?<\/pre>|(?<![A-Za-z0-9_])\(\s*\)|\([①-⑩]\)|（\s*）|（[①-⑩]）/g;

console.log('▸ 多空题：渲染空位数必须够答案位数');
let checked = 0;
for (const subj of ['ds', 'os', 'co', 'cn']) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, `pwa/data/${subj}.json`), 'utf8'));
  for (const q of d.questions) {
    if (!q.multi_blank) continue;
    checked++;
    const content = q.content || '';
    const n = (content.match(PAT) || []).length;
    const need = (q.answer || '').length;
    if (n < need) ok(`${subj} ${q.id}（题号 ${q.number}）空位足够`, false, `渲染 ${n} 个空，答案 ${need} 位`);
  }
}
ok(`全部 ${checked} 道多空题的空位数都够（逐题扫描）`, true);

console.log('▸ 全角 / 带序号括号支持');
// 用字符串包含判断（正则里写反斜杠太容易错：\\( 是"字面反斜杠+开括号"）
ok('quiz.html 含全角空括号', QUIZ.includes('（\\s*）'));
ok('quiz.html 含全角带序号括号', QUIZ.includes('（[①-⑩]）'));
ok('exam.html 含全角空括号', EXAM.includes('（\\s*）'));
ok('exam.html 含全角带序号括号', EXAM.includes('（[①-⑩]）'));
ok('exam.html 含半角带序号括号', EXAM.includes('\\([①-⑩]\\)'));
ok('exam.html 含半角空括号', EXAM.includes('(?<![A-Za-z0-9_])'));

console.log('▸ 模拟考按 blank_opts 分空给选项');
ok('exam.html 用 blank_opts[bi++]', EXAM.includes('q.blank_opts[bi++]'));
ok('exam.html 多空下拉按空位计数', EXAM.includes('let bi = 0;'));

console.log('▸ 排除机制');
ok('backend loadQuestions 过滤 excluded', BACKEND.includes('data.questions = data.questions.filter(q => !q.excluded)'));
ok('过滤后同步修正 total', BACKEND.includes('data.total = data.questions.length'));
{
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/ds.json'), 'utf8'));
  const q = d.questions.find(x => x.id === 'ds_0633');
  ok('ds_0633 已标记 excluded', !!(q && q.excluded === true));
  const nEx = d.questions.filter(x => x.excluded).length;
  ok('ds 库只有 1 道被排除', nEx === 1, `实际 ${nEx}`);
  ok('ds total 已减 1（633→632）', d.total === 632, `实际 ${d.total}`);
}

console.log(`\n结果: ${fail === 0 ? '全部通过' : fail + ' 项失败'}（${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
