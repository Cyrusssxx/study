// 内存泄漏防回归：静态检查「会钉住整个页面」的几类写法
//
// 背景：用户反馈「在刷题界面点击知识点时内存持续增长」。
// 根因是知识点链接用了 target="_blank" 但缺 rel="noopener" ——
// 新窗口会通过 window.opener 反向持有原页面，浏览器因此无法回收整份 document
// （含 2452 题的题库缓存与索引）。每点一次就钉住一份，内存线性增长。
//
// 本测试守住 5 类高风险写法，避免以后又被加回来。
//
// 用法：node _test_mem_leak_guards.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const HTML_FILES = fs.readdirSync(path.join(ROOT, 'pwa'))
  .filter(f => f.endsWith('.html'))
  .map(f => 'pwa/' + f);

console.log('--- 一、target="_blank" 必须带 rel="noopener" ---');
const offenders = [];
for (const f of HTML_FILES) {
  const src = read(f);
  // 逐个 <a ...> 标签检查
  for (const m of src.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    if (!/target=["']_blank["']/.test(tag)) continue;
    if (!/rel=["'][^"']*noopener/.test(tag)) offenders.push(f + ' → ' + tag.slice(0, 110));
  }
}
check('没有裸 target="_blank" 的链接', offenders, []);
check('quiz 的知识点链接已加 rel', /chapter-badge-link[\s\S]{0,400}?rel="noopener noreferrer"/.test(read('pwa/quiz.html')), true);
check('notes 的相关题目链接已加 rel', /notes-prac-link[\s\S]{0,400}?rel="noopener noreferrer"/.test(read('pwa/notes.html')), true);

console.log('\n--- 二、动态创建的 blob URL 必须释放 ---');
const QUIZ = read('pwa/quiz.html');
check('compressImage 成功路径 revoke', /URL\.revokeObjectURL\(img\.src\);\s*\n\s*resolve/.test(QUIZ), true);
check('compressImage 失败路径也 revoke', /img\.onerror = \(\) => \{\s*\n\s*URL\.revokeObjectURL\(img\.src\)/.test(QUIZ), true);

console.log('\n--- 三、常驻容器的事件监听不能重复绑定 ---');
// 章节树每次切题都会重渲染 innerHTML，若每次 addEventListener 会线性累积
check('章节树监听有 navBound 守卫', /tree\.dataset\.navBound/.test(QUIZ), true);
check('守卫在 addEventListener 之前 return', /if \(!tree \|\| tree\.dataset\.navBound\) return;/.test(QUIZ), true);

console.log('\n--- 四、灯箱单例 ---');
const LB = read('pwa/js/lightbox.js');
check('build() 有单例守卫', /function build\(\) \{\s*\n\s*if \(box\) return box;/.test(LB), true);
check('键盘监听只在模块级绑一次（不在 open 里）',
  (LB.match(/document\.addEventListener\('keydown'/g) || []).length, 1);
check('window mousemove 只在 build 内绑（不随 open 累积）',
  (LB.match(/window\.addEventListener\('mousemove'/g) || []).length, 1);

console.log('\n--- 五、轻提示单例 ---');
check('showTip 复用同一节点', /if \(!el\) \{[\s\S]{0,200}?document\.body\.appendChild\(el\)/.test(QUIZ), true);

console.log('\n--- 六、全局监听只在初始化绑一次 ---');
// 这些监听若写在 renderQuestion 里，每切一题就多一条
for (const [name, re] of [
  ['keydown', /document\.addEventListener\('keydown'/g],
  ['popstate', /window\.addEventListener\('popstate'/g],
  ['pagehide', /window\.addEventListener\('pagehide'/g],
]) {
  const n = (QUIZ.match(re) || []).length;
  check(`${name} 绑定次数 ≤ 2（初始化 + 侧键区）`, n <= 2, true);
}

console.log('\n--- 七、定时器必须有对应清理 ---');
const TIMER_FILES = ['pwa/exam.html', 'pwa/js/common.js'];
for (const f of TIMER_FILES) {
  const src = read(f);
  const hasSet = /setInterval\(/.test(src);
  const hasClear = /clearInterval\(/.test(src);
  check(`${f} 用 setInterval 就必须有 clearInterval`, !hasSet || hasClear, true);
}

console.log('\n--- 八、IntersectionObserver 必须能释放 ---');
const DAKA = read('pwa/daka.html');
check('daka 的观察器重绑前先 disconnect', /if \(_dakaWarmObs\) _dakaWarmObs\.disconnect\(\)/.test(DAKA), true);
const ALGO = read('pwa/algo.html');
check('algo 的滚动监听只建一次（setupScrollSpy 单次调用）',
  (ALGO.match(/setupScrollSpy\(\);/g) || []).length, 1);

console.log('\n--- 九、全局脚本的初始化只跑一次 ---');
const BG = read('pwa/js/background.js');
check('background.js 整体包在 IIFE 里', /^\(function \(\) \{/m.test(BG) && /\}\)\(\);\s*$/.test(BG.trim()), true);
check('MutationObserver 在 init() 内（不随渲染重复建）',
  /function init\(\)[\s\S]{0,4000}?new MutationObserver/.test(BG), true);
check('init() 只有一处调用', (BG.match(/\binit\(\);|\bdocument\.addEventListener\('DOMContentLoaded', init\)/g) || []).length, 2);

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
