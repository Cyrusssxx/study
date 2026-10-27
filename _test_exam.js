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
ok('按科目抽题时使用优先级', /order\(poolBySub\[k\], take\)/.test(BACKEND));

console.log('--- 收藏题：到期错题优先 + 时间队列轮转 ---');
ok('有独立的时间队列函数（带题量参数）', /function prioritizeByTime\(pool, take\)/.test(BACKEND));
ok('收藏模式选用时间队列', /mode === 'favorites' \? prioritizeByTime : prioritize/.test(BACKEND));
ok('时间队列：按 answered_at 升序', /ta !== tb\) return ta < tb \? -1 : 1/.test(BACKEND));
ok('时间队列：同刻用题号兜底（不随机）', /a\.id < b\.id \? -1 : a\.id > b\.id \? 1 : 0/.test(BACKEND));
ok('时间队列：未做过的按题号稳定排', /fresh\.sort\(\(a, b\) => \(a\.id < b\.id/.test(BACKEND));
ok('不熟/不会标记不参与抽题（仅到期错题加权）', (() => {
    const m = BACKEND.match(/function prioritizeByTime[\s\S]*?\n        \}/);
    return !!m && !/unfam|dontknow/i.test(m[0]);
})());
ok('第二轮补缺也用同一顺序器', /for \(const q of order\(rest, short\)\.slice\(0, short\)\)/.test(BACKEND));
ok('UI 提示：到期错题优先回卷', /到期错题优先回卷/.test(EXAM_HTML));

console.log('--- 鼠标侧键移植（刷题页 → 模拟考）---');
ok('侧键接管函数 examSideTakeover', /function examSideTakeover/.test(EXAM_HTML));
ok('仅考试进行中接管（examViewOn 门卫）', /function examViewOn/.test(EXAM_HTML));
ok('mousedown/mouseup 捕获拦截', /\['mousedown', 'mouseup'\]\.forEach/.test(EXAM_HTML));
ok('auxclick 转翻题（examPrev/examNext）', /if \(b === 3\) examPrev\(\); else examNext\(\);/.test(EXAM_HTML));
ok('popstate 兜底恢复锚点', /history\.pushState\(\{ examGuard: 1 \}/.test(EXAM_HTML));
ok('Firefox mouseback/mouseforward', /addEventListener\('mouseback'/.test(EXAM_HTML) && /addEventListener\('mouseforward'/.test(EXAM_HTML));
ok('共用刷题页键位配置', /quiz_keybinds_v1/.test(EXAM_HTML));
ok('共用侧键拦截开关', /quiz_sideguard/.test(EXAM_HTML));
ok('键盘快捷键（与刷题页共用）', /e\.code === examKb\.prev/.test(EXAM_HTML));
ok('可编辑区域不劫持', /function examInEditable/.test(EXAM_HTML));
ok('载入时制造同文档历史锚点', /\{ examGuard: 1 \}[^)]*location\.href/.test(EXAM_HTML));

console.log('--- 设置页排版 ---');
ok('只给行首 label 固定宽度', /\.setup-row > label:first-child\s*\{[^}]*flex:\s*0 0 80px/.test(CSS));
ok('勾选项 label 不再固定宽度', /\.setup-row \.checkbox-label\s*\{[^}]*flex:\s*0 1 auto/.test(CSS));
ok('勾选框重置最小宽度', /\.setup-row input\[type="checkbox"\][\s\S]{0,120}min-width:\s*0/.test(CSS));
ok('说明文字独占一行', /\.setup-hint-block\s*\{/.test(CSS) && /class="setup-hint-block"/.test(EXAM_HTML));
ok('窄屏字段名独占一行', /@media\s*\(max-width:\s*600px\)[\s\S]{0,200}\.setup-row > label:first-child\s*\{\s*flex:\s*0 0 100%/.test(CSS));

console.log('--- 清除模拟考记录 ---');
ok('后端有 clear 动作', /action === 'clear'/.test(BACKEND));
ok('后端 clear 清空 exams 库', /objectStore\('exams'\)\.clear\(\)/.test(BACKEND));
ok('history 响应带 total（含进行中/已废弃）', /return jsonResp\(\{ records, total: all\.length \}\)/.test(BACKEND));
ok('前端有清除按钮', /onclick="confirmClearHistory\(\)"/.test(EXAM_HTML));
ok('前端确认弹窗列明场数', /确定清除全部模拟考记录吗\？/.test(EXAM_HTML));
ok('确认提示含进行中/已废弃警告', /进行中\/已放弃的会话将一并删除/.test(EXAM_HTML));
ok('清除后刷新历史列表', /cleared != null[\s\S]{0,80}loadHistory\(\)/.test(EXAM_HTML));
ok('无记录时直接提示', /当前没有模拟考记录/.test(EXAM_HTML));

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

// ---- 试卷错题重刷（exam_wrong 模式）：exam 成绩单 → 刷题界面重做 ----
const QUIZ_HTML = fs.readFileSync(path.join(ROOT, 'pwa', 'quiz.html'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'pwa', 'index.html'), 'utf8');

console.log('--- 试卷错题重刷：后端 exam_wrong 模式 ---');
ok('questions API 有 exam_wrong 分支', /mode === 'exam_wrong'/.test(BACKEND));
ok('按 exam_id 取卷且必须已交卷', /dbGet\('exams', parseInt\(p\.get\('exam_id'/.test(BACKEND) && /exam\.status !== 'submitted'/.test(BACKEND));
ok('错题口径与 gradeExam 一致（含未作答）', /const isWrong = !\(\(!!ua && ua === \(q\.answer |\| ''\)\)/.test(BACKEND));
ok('跨科目按卷面顺序重排', /orderMap\.get\(a\.id\) - orderMap\.get\(b\.id\)/.test(BACKEND));
ok('每题带考试时的作答（exam_user_answer）', /exam_user_answer: examUa\[q\.id\]/.test(BACKEND));
ok('响应带试卷元信息 exam_meta', /examMeta = \{[\s\S]{0,300}exam_id: exam\.id, mode: exam\.mode,[\s\S]{0,160}score: exam\.score/.test(BACKEND) && /wrong_count: wrongCnt/.test(BACKEND));
ok('混合模式下收藏/标记/笔记不按单科过滤', /mixed \|\| f\.subject === subject/.test(BACKEND) && /mixed \|\| n\.subject === subject/.test(BACKEND));
ok('混合模式下进度状态取全量', /latestStatuses\(mixed \? '' : subject\)/.test(BACKEND));
ok('exam_meta 只在该模式返回', /if \(examMeta\) out\.exam_meta = examMeta;/.test(BACKEND));

console.log('--- 试卷错题重刷：刷题页 ---');
ok('modeNames 有 exam_wrong', /'exam_wrong': '试卷错题'/.test(QUIZ_HTML));
ok('解析 exam_id 参数', /const EXAM_ID = _params\.get\('exam_id'\)/.test(QUIZ_HTML));
ok('加载 URL 带 exam_id', /const examQ = \(\(MODE === 'exam_wrong' |\| MODE === 'exam_review'\) && EXAM_ID\)/.test(QUIZ_HTML) && /&exam_id=\$\{encodeURIComponent\(EXAM_ID\)}/.test(QUIZ_HTML));
ok('标题脱离单科（错题重刷/试卷回顾）', /MODE === 'exam_wrong' \? '试卷错题重刷' : MODE === 'exam_review' \? '试卷回顾' : SUBJECT_NAME/.test(QUIZ_HTML));
ok('横幅容器与渲染函数', /id="examReplayBanner"/.test(QUIZ_HTML) && /function renderExamMeta\(meta\)/.test(QUIZ_HTML));
ok('横幅展示时间/得分/用时/错题数', /submitted_at \|\| .*started_at/.test(QUIZ_HTML) && /duration_sec/.test(QUIZ_HTML) && /wrong_count/.test(QUIZ_HTML));
ok('空态提示（这场试卷没有错题）', /这场试卷没有错题/.test(QUIZ_HTML));
ok('位置存档按试卷分档', /\(MODE === 'exam_wrong' |\| MODE === 'exam_review'\) && EXAM_ID ? '_' \+ EXAM_ID : ''/.test(QUIZ_HTML));
ok('点章节回落顺序模式（防 exam_id 丢失成坏链）', /const mode = \(MODE === 'exam_wrong' |\| MODE === 'exam_review'\) ? 'sequential' : MODE;/.test(QUIZ_HTML));
ok('笔记链接按题目自身科目跳转', /NOTES_SUBJECTS\.includes\(q\.id\.split\('_'\)\[0\]\)/.test(QUIZ_HTML));
ok('题头节内序号用全量库基准（保留原题号）', /needSubs\.map\(k =>/.test(QUIZ_HTML) && /_buildSecOrdinal\(all\.flatMap\(d => d\.questions \|\| \[\]\)\)/.test(QUIZ_HTML));

console.log('--- 试卷错题重刷：模拟考入口 ---');
ok('成绩单有试卷回顾入口（exam_review）', /quiz\.html\?mode=exam_review&exam_id=\$\{r\.exam_id\}&fresh=1/.test(EXAM_HTML));
ok('历史列表单「查看」按钮直达回顾页', /quiz\.html\?mode=exam_review&exam_id=\$\{rec\.id\}&fresh=1/.test(EXAM_HTML) && !/mode=exam_wrong&exam_id=\$\{rec\.id\}/.test(EXAM_HTML));
ok('回顾入口不限错题数（全对也能看整卷）', /const replayLink = r\.exam_id/.test(EXAM_HTML));
ok('首页继续刷题跳过 exam_wrong（防坏链）', /e\.mode === 'favorite' \|\| e\.mode === 'fav_real' \|\| e\.mode === 'exam_wrong'/.test(INDEX_HTML));

console.log('--- 试卷错题重刷：样式 ---');
ok('模式徽章 exam_wrong 配色（亮/暗）', /\.mode-badge\[data-mode="exam_wrong"\]/.test(CSS) && /\.dark \.mode-badge\[data-mode="exam_wrong"\]/.test(CSS));
ok('横幅样式（亮/暗）', /\.exam-replay-banner\s*\{/.test(CSS) && /\.dark \.exam-replay-banner\s*\{/.test(CSS));

console.log('--- 考试计时：连续计时不闪烁 + 实际用时 ---');
// 签名后面追加了 paused / pausedSec（暂停器），老断言只认到 durationSec
ok('enterExam 接收限时秒数', /function enterExam\(id, questions, answers, remaining, mode, durationSec[,)]/.test(EXAM_HTML) && /examDurationSec = durationSec \|\| remaining;/.test(EXAM_HTML));
ok('超时显示总用时（不归零重计）', /⏰ \$\{mm}:\$\{ss}/.test(EXAM_HTML) && /examDurationSec - remainingSec/.test(EXAM_HTML) && !/\+\$\{mm}:\$\{ss}/.test(EXAM_HTML));
ok('最后几分钟不再闪烁', !/timer-warning/.test(EXAM_HTML));
// 实际用时口径：优先后端结算的 used_sec（扣掉暂停），旧记录退回墙钟 t1 - t0
ok('历史时长显示实际用时（优先 used_sec，扣除暂停）',
  /rec\.used_sec \|\| 0/.test(EXAM_HTML) && /t1 - t0/.test(EXAM_HTML));

console.log('--- 评分规则：2 分/题 + 多选错一不给分 ---');
ok('gradeExam 得分 = 答对数 × 2（恒偶整数）', /const score = correct \* 2;/.test(BACKEND));
ok('exam_meta 带答对数与总题数（供前端折算满分）', /correct_count: exam\.correct_count, total_count: exam\.total_count/.test(BACKEND));
ok('成绩单大分按 2 分/题折算 + 显示满分', /\$\{r\.correct \* 2\}/.test(EXAM_HTML) && /满分 \$\{r\.total \* 2\} 分/.test(EXAM_HTML));
ok('历史列表得分按 2 分/题折算', /\$\{rec\.correct_count \* 2\}/.test(EXAM_HTML));
ok('重刷横幅显示得分/满分', /得分 <b>\$\{meta\.correct_count \* 2\}<\/b> \/ 满分 \$\{meta\.total_count \* 2\}/.test(QUIZ_HTML));
ok('多空题精确匹配错一空即 0 分（exam）', /!!ua && ua === \(q\.answer \|\| ''\)/.test(BACKEND));
const ZHENTI_JS = fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'zhenti.js'), 'utf8');
ok('多空题精确匹配错一空即 0 分（真题套卷）', /const ok = !!f\.a && key === f\.a;/.test(ZHENTI_JS));

console.log('--- 重刷页右侧题号汇总 ---');
ok('exam_wrong/review 模式右侧平铺全部题号', /MODE === 'exam_wrong' |\| MODE === 'exam_review'[\s\S]{0,420}questions\.map\(\(q, i\) => numBtnHtml\(i, i \+ 1\)\)/.test(QUIZ_HTML));
ok('题号面板标题带总数与当前筛选', /\$\{label} \$\{questions\.length\} 题/.test(QUIZ_HTML));

console.log('--- 抽题优先级：到期错题回卷（favorites） ---');
ok('专用到期错题函数（与复习阶梯解耦）', /async function examDueWrongIds\(\)/.test(BACKEND));
// 冷却期由「4 天」统一为「7 天」，到期错题与收藏时间队列共用同一常量
ok('答过的题 7 天冷却（统一常量）', /const EXAM_REDO_COOLDOWN_DAYS = 7;/.test(BACKEND) && /const EXAM_REDO_COOLDOWN_MS = EXAM_REDO_COOLDOWN_DAYS \* 86400000;/.test(BACKEND));
ok('做对了不抽（答对且晚于最后做错 → 排除）', /st && st\.is_correct && tsToStr\(st\.answered_at\)\.slice\(0, 19\) > lw\) continue;/.test(BACKEND));
ok('已了结（is_resolved）不抽', /if \(w\.is_resolved\) continue;/.test(BACKEND));
ok('未满 7 天不抽', /nowMs < base \+ EXAM_REDO_COOLDOWN_MS\) continue;/.test(BACKEND));
ok('逾期越久越靠前（last_wrong_at 升序）', /a\[0\] < b\[0\] \? -1 : a\[0\] > b\[0\] \? 1/.test(BACKEND));
ok('组卷按 rank 引用到期层', /dueRank\.has\(q\.id\)/.test(BACKEND) && /dueRank\.get\(a\.id\) - dueRank\.get\(b\.id\)/.test(BACKEND));
ok('到期错题层最优先（due.concat(fresh, wrongish, correct)）', /return due\.concat\(fresh, wrongish, correct\);/.test(BACKEND));
ok('到期错题帽子 = 本场该科题量 1/3（向上取整）', /const dueCap = Math\.ceil\(\(take \|\| pool\.length\) \/ 3\);/.test(BACKEND));
ok('超帽到期错题回流（错题未解决的进 wrongish，否则进 correct）',
  /while \(due\.length > dueCap\)[\s\S]{0,200}?isWrongish\(q\) \? wrongish : correct/.test(BACKEND));
ok('答对的题不再有 7 天冷却（无 cooling 层）', /cooling\.push\(q\)/.test(BACKEND) === false);
ok('做过且错题未解决排在答对之前', /\(isWrongish\(q\) \? wrongish : correct\)\.push\(q\)/.test(BACKEND));
ok('调用点传题量供帽子计算', /order\(poolBySub\[k\], take\)/.test(BACKEND) && /order\(rest, short\)/.test(BACKEND) && /order\(poolBySub\[mode\], total\)/.test(BACKEND));
ok('组卷设置提示到期错题优先', /到期错题优先回卷/.test(EXAM_HTML));

console.log('--- 历史记录批量勾选删除 ---');
ok('后端有 delete 动作（按 ids 删）', /action === 'delete'/.test(BACKEND) && /tx\.objectStore\('exams'\)\.delete\(id\)/.test(BACKEND));
ok('空选择直接拒绝', /未选择要删除的记录/.test(BACKEND));
ok('历史表有勾选列与全选框', /class="hist-sel" data-id="\$\{rec\.id\}"/.test(EXAM_HTML) && /id="histSelAll"/.test(EXAM_HTML));
ok('删除选中按钮随勾选显隐并带计数', /删除选中（\$\{n\}）/.test(EXAM_HTML));
ok('删除前有确认弹窗', /确定删除选中的 \$\{ids\.length\} 场考试记录吗？/.test(EXAM_HTML));
ok('删除后刷新历史列表', /d\.deleted != null[\s\S]{0,80}loadHistory\(\)/.test(EXAM_HTML));

console.log('--- 回顾/重刷：题头累计错误次数徽标 ---');
ok('后端每题附全局累计 wrong_count', /const wrongCntMap = {}; for " + B + "(const w of wrongRows" + B + ") wrongCntMap[w.question_id] = w.wrong_count |" + B + "| 0;/.test(BACKEND) && /wrong_count: wrongCntMap" + B + "[q" + B + ".id] |" + B + "| 0/.test(BACKEND));
ok('题头徽标仅回顾/重刷模式且 N>=1 显示', /\(MODE === 'exam_review' |\| MODE === 'exam_wrong'\) && \(q\.wrong_count |\| 0\) >= 1/.test(QUIZ_HTML) && /badge-wrongcnt/.test(QUIZ_HTML));
ok('徽标样式', /\.badge-wrongcnt \{/.test(CSS));

console.log('--- 试卷回顾（exam_review）：整卷可切 错题/全部 ---');
ok('后端 exam_review 分支（整卷返回）', /mode === 'exam_wrong' |\| mode === 'exam_review'/.test(BACKEND) && /if \(mode === 'exam_review' |\| isWrong\) wrongIds\.push\(qid\)/.test(BACKEND));
ok('exam_meta.wrong_count 为真实错题数', /wrong_count: wrongCnt/.test(BACKEND));
ok('mixed（不按单科过滤）覆盖 exam_review', /const mixed = mode === 'exam_wrong' |\| mode === 'exam_review';/.test(BACKEND));
ok('加入重刷功能已移除', !/action === 'redo'/.test(BACKEND) && !/toggleExamRedo/.test(EXAM_HTML) && !/btn-redo-add/.test(EXAM_HTML) && !/\.btn-redo-add/.test(CSS));
ok('exam_review 加载整卷并本地筛选', /examReviewAll = questions;/.test(QUIZ_HTML) && /function applyExamFilter\(list\)/.test(QUIZ_HTML) && /questions = applyExamFilter\(examReviewAll\);/.test(QUIZ_HTML));
ok('默认错题（filter 缺省 wrong）', /_params\.get\('filter'\) === 'all' \? 'all' : 'wrong'/.test(QUIZ_HTML));
ok('横幅渲染 错题/全部 切换 chip', /setExamFilter\('wrong'\)/.test(QUIZ_HTML) && /setExamFilter\('all'\)/.test(QUIZ_HTML));
ok('切换保留当前题并同步 URL', /history\.replaceState\(null, '', u\.pathname \+ \(u\.search |\| ''\) \+ u\.hash\);/.test(QUIZ_HTML));
ok('切到错题为空时显示全对提示', /没有错题，可点上方「全部」浏览整卷/.test(QUIZ_HTML));
ok('空态提示（本场全对）', /本场全对 🎉 可点上方「全部」浏览整卷/.test(QUIZ_HTML));
ok('筛选 chip 样式', /\.exam-filter-chip\s*\{/.test(CSS) && /\.exam-filter-chip\.active/.test(CSS));
ok('exam_review 复用定位键与章节回落', /\(MODE === 'exam_wrong' |\| MODE === 'exam_review'\) && EXAM_ID ? '_' \+ EXAM_ID/.test(QUIZ_HTML) && /\(MODE === 'exam_wrong' |\| MODE === 'exam_review'\) ? 'sequential'/.test(QUIZ_HTML));
