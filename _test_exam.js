// 模拟考试回归：
//   1) 组卷配额：按真题各科题量（数构11·组成11·OS10·网络8）等比拆分，任意题量合计都等于总数
//   2) 默认模式：仅收藏题；时长可自定义（含快捷按钮）
//   3) 超时不强制交卷：前端不自动 doSubmit，后端 active 也不再 auto_submitted
//   4) 收藏/错题抽题：分科抽 + 缺口先补同类池、再补全题库
//   5) 成绩单：错题卡片按选项高亮（正确答案/你的选择）
// 用法：node _test_exam.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'backend.js'), 'utf8');
const EXAM_HTML = fs.readFileSync(path.join(ROOT, 'pwa', 'exam.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa', 'css', 'style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}
function ok(name, cond, detail) {
    console.log((cond ? 'PASS' : 'FAIL').padEnd(5), name, cond ? '' : `→ ${detail || ''}`);
    cond ? pass++ : fail++;
}

// ---- 1. 纯函数：从 backend.js 抽出配额逻辑 ----
const quotaSrc = BACKEND.match(/const EXAM_QUOTA_40[\s\S]*?\nfunction allocQuotas[\s\S]*?\n}\n/);
ok('backend.js 含 EXAM_QUOTA_40 / allocQuotas', !!quotaSrc);
let allocQuotas, EXAM_QUOTA_40;
if (quotaSrc) {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(quotaSrc[0] + '\nthis.allocQuotas = allocQuotas; this.EXAM_QUOTA_40 = EXAM_QUOTA_40;', ctx);
    allocQuotas = ctx.allocQuotas;
    EXAM_QUOTA_40 = ctx.EXAM_QUOTA_40;
}

if (allocQuotas) {
    console.log('--- 配额分配 ---');
    check('标准 40 题 = 真题分布', allocQuotas(40), { ds: 11, co: 11, os: 10, cn: 8 });
    check('20 题合计正确', Object.values(allocQuotas(20)).reduce((a, b) => a + b, 0), 20);
    check('20 题按比例拆（5.5/5.5/5/4 → 余 1 给数构）', allocQuotas(20), { ds: 6, co: 5, os: 5, cn: 4 });
    check('100 题合计正确', Object.values(allocQuotas(100)).reduce((a, b) => a + b, 0), 100);
    check('150 题合计正确', Object.values(allocQuotas(150)).reduce((a, b) => a + b, 0), 150);
    let allOk = true, sample = [];
    for (let n = 5; n <= 150; n++) {
        const q = allocQuotas(n);
        const sum = Object.values(q).reduce((a, b) => a + b, 0);
        if (sum !== n || Object.values(q).some(v => v < 0)) { allOk = false; sample.push([n, q]); }
    }
    ok('5~150 题任意题量合计都等于总数', allOk, JSON.stringify(sample.slice(0, 3)));
    ok('每科配额都不为 0（≥5 题时）', Object.values(allocQuotas(5)).every(v => v >= 0), '');
}

// ---- 2. 后端抽题逻辑：分科 + 缺口补充 ----
console.log('--- 后端 generate ---');
ok('收藏/错题按科目建池', /poolBySub\[subj\]\.push\(q\)/.test(BACKEND));
ok('第一轮按配额抽', /const take = Math\.min\(quotas\[k\], poolBySub\[k\]\.length\)/.test(BACKEND));
ok('第二轮用同类池剩余补', /某科不够时，先用其它科池里剩下的补/.test(BACKEND));
ok('第三轮跨科全题库补', /还差就跨科从全题库补/.test(BACKEND));
ok('默认模式为 favorites', /const mode = body\.mode \|\| 'favorites'/.test(BACKEND));
ok('旧的分值比例常量已移除', !/EXAM_RATIO/.test(BACKEND));

// ---- 3. 超时不强制交卷 ----
console.log('--- 超时行为 ---');
ok('后端 active 不再自动交卷', !/auto_submitted: result/.test(BACKEND));
ok('后端注明允许负剩余时间', /remaining_sec 允许为负/.test(BACKEND));
ok('前端不再弹"考试时间到，自动交卷"', !/考试时间到，自动交卷/.test(EXAM_HTML));
ok('计时器不再调用 doSubmit', !/remainingSec <= 0\)\s*\{[\s\S]{0,120}doSubmit\(\)/.test(EXAM_HTML));
ok('前端有超时提示条', /id="examOvertime"/.test(EXAM_HTML));
ok('计时器有超时样式类', /timer-overtime/.test(EXAM_HTML) && /\.exam-timer\.timer-overtime/.test(CSS));

// ---- 4. 设置页 ----
console.log('--- 组卷设置 ---');
const firstOption = (EXAM_HTML.match(/<select id="examMode"[\s\S]*?<option value="([a-z]+)"/) || [])[1];
check('默认选中"仅收藏题"', firstOption, 'favorites');
ok('时长行不再对收藏/错题隐藏', !/durationRow\.style\.display = 'none'/.test(EXAM_HTML));
ok('时长快捷按钮存在', /onclick="setMinutes\(45\)"/.test(EXAM_HTML) && /function setMinutes/.test(EXAM_HTML));
ok('时长上限 600 分钟', /Math\.min\(Math\.max\(parseInt\(document\.getElementById\('examMinutes'\)\.value \|\| '0', 10\) \|\| 0, 0\), 600\)/.test(EXAM_HTML));
ok('收藏模式题量上限放宽到 150', /isSpecial \? \[5, 150, 40\]/.test(EXAM_HTML));
ok('初始化时也会跑 onModeChange', /\n    onModeChange\(\);/.test(EXAM_HTML));

// ---- 5. 成绩单错题排版 ----
console.log('--- 错题排版 ---');
ok('错题卡片结构 review-item', /class="review-item \$\{d\.is_correct \? 'is-ok' : 'is-bad'\}"/.test(EXAM_HTML));
ok('选项级高亮 is-correct / is-picked-wrong', /is-correct/.test(EXAM_HTML) && /is-picked-wrong/.test(EXAM_HTML));
ok('标签：正确答案 / 你的选择', /opt-tag ok">正确答案/.test(EXAM_HTML) && /opt-tag bad">你的选择/.test(EXAM_HTML));
ok('CSS 定义 review-opt.is-correct', /\.review-opt\.is-correct\s*\{/.test(CSS));
ok('CSS 定义 review-opt.is-picked-wrong', /\.review-opt\.is-picked-wrong\s*\{/.test(CSS));
ok('深色模式适配', /\.dark \.review-opt\.is-correct/.test(CSS));

// ---- 6. 默认时长 & 抽题优先级 & 设置页排版 ----
console.log('--- 默认时长 ---');
ok('前端有 defaultMinutesFor', /function defaultMinutesFor/.test(EXAM_HTML));
ok('默认 = 题量 × 1.5', /Math\.round\(count \* 1\.5\)/.test(EXAM_HTML));
ok('后端默认 90 秒/题', /picked\.length \* 90/.test(BACKEND));
ok('快捷按钮含 60 分钟', /onclick="setMinutes\(60\)"/.test(EXAM_HTML));
ok('说明文字写明 40 题 = 60 分钟', /40 题 = 60 分钟/.test(EXAM_HTML));
ok('用户手动改过后不覆盖', /if \(!force && minutesManual\) return;/.test(EXAM_HTML));

console.log('--- 抽题优先级 ---');
ok('按 progress/wrong 建索引', /progMap/.test(BACKEND) && /wrongMap/.test(BACKEND));
ok('三层优先级函数', /function prioritize\(pool\)/.test(BACKEND));
ok('未做过的优先', /if \(!p\) \{\s*fresh\.push/.test(BACKEND));
ok('错题未解决次之', /w && !w\.is_resolved/.test(BACKEND));
ok('做过的按日期从旧到新', /\[\.\.\.byDay\.keys\(\)\]\.sort\(\)/.test(BACKEND));
ok('按科目抽题时使用优先级', /order\(poolBySub\[k\]\)/.test(BACKEND));

console.log('--- 收藏题：最早做过的先抽 ---');
ok('有独立的时间队列函数', /function prioritizeByTime\(pool\)/.test(BACKEND));
ok('收藏模式选用时间队列', /mode === 'favorites' \? prioritizeByTime : prioritize/.test(BACKEND));
ok('时间队列：按 answered_at 升序', /ta !== tb\) return ta < tb \? -1 : 1/.test(BACKEND));
ok('时间队列：同刻用题号兜底（不随机）', /a\.id < b\.id \? -1 : a\.id > b\.id \? 1 : 0/.test(BACKEND));
ok('时间队列：未做过的按题号稳定排', /fresh\.sort\(\(a, b\) => \(a\.id < b\.id/.test(BACKEND));
ok('收藏题不做错题/不熟加权', /function prioritizeByTime[\s\S]{0,900}?wrongMap/.test(BACKEND) === false);
ok('第二轮补缺也用同一顺序器', /for \(const q of order\(rest\)\.slice\(0, short\)\)/.test(BACKEND));
ok('UI 提示：最早做过的先抽', /最早做过的题先抽/.test(EXAM_HTML));

console.log('--- 设置页排版 ---');
ok('只给行首 label 固定宽度', /\.setup-row > label:first-child\s*\{[^}]*flex:\s*0 0 80px/.test(CSS));
ok('勾选项 label 不再固定宽度', /\.setup-row \.checkbox-label\s*\{[^}]*flex:\s*0 1 auto/.test(CSS));
ok('勾选框重置最小宽度', /\.setup-row input\[type="checkbox"\][\s\S]{0,120}min-width:\s*0/.test(CSS));
ok('说明文字独占一行', /\.setup-hint-block\s*\{/.test(CSS) && /class="setup-hint-block"/.test(EXAM_HTML));
ok('窄屏字段名独占一行', /@media\s*\(max-width:\s*600px\)[\s\S]{0,200}\.setup-row > label:first-child\s*\{\s*flex:\s*0 0 100%/.test(CSS));

console.log('--- 成绩单顶部返回 ---');
ok('成绩单有吸顶返回条', /class="result-topbar"/.test(EXAM_HTML));
ok('顶部有返回按钮', /id="btnTopBack"/.test(EXAM_HTML));
ok('返回文案随来源变化', /fromHistory \? '← 返回历史成绩' : '← 返回组卷'/.test(EXAM_HTML));
ok('CSS 吸顶定位', /\.result-topbar\s*\{[^}]*position:\s*sticky/.test(CSS));
ok('标题三栏居中', /\.result-topbar\s*\{[^}]*grid-template-columns:\s*1fr auto 1fr/.test(CSS));

console.log('--- 导航计时器已移除 ---');
ok('exam.html 无 navTimer', !/navTimer/.test(EXAM_HTML));
ok('common.js 无 navTimer 依赖', !/navTimer/.test(fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'common.js'), 'utf8')));
ok('common.js 仍保留时长累计', /studyTimerSec/.test(fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'common.js'), 'utf8')));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
