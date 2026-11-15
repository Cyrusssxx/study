/* 题目「📖 知识点」跳转映射回归（2026-11-16）
 *
 * 背景：讲义重排后题库里残留了 8 道旧小节名，收藏练习点「📖」时
 *   CN「6.4.2 简单邮件传送协议SMTP」按编号前缀模糊匹配跳到了
 *   「6.4.2 电子邮件格式与MIME」；OS「5.2.x 中断处理流程」跳到「5.2 设备独立性软件」。
 *   8 道里 6 道是收藏题，所以用户感觉「主要是收藏题有问题」。
 * 修复：① 题库真源改成讲义真实节名；② notes.html 加 GOTO_ALIASES 兼容旧链接
 *   （与 SEC_ALIASES 批注迁移解耦）；③ 目标节优先渲染前先归一；④ 全文渲染后清 _bgCache。
 * 硬指标：全库 2452 题的 goto 目标 100% 精确命中讲义节名。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
    const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}
const SUBS = ['co', 'os', 'cn', 'ds'];
const notes = {}, banks = {};
for (const s of SUBS) {
    const nd = JSON.parse(read('pwa/data/notes/' + s + '_notes.json'));
    const names = [];
    for (const ch of nd.chapters || []) {
        for (const sec of ch.sections || []) {
            if (sec.section) names.push(sec.section);
            for (const sub of sec.subsections || []) if (sub.section) names.push(sub.section);
        }
    }
    notes[s] = new Set(names);
    banks[s] = JSON.parse(read('pwa/data/' + s + '.json')).questions || [];
}
const notesHtml = read('pwa/notes.html');
const quizHtml = read('pwa/quiz.html');

// ---------- 1. 题库 → 讲义节名 100% 精确命中 ----------
for (const s of SUBS) {
    const qs = banks[s];
    const miss = qs.filter(q => !notes[s].has(q.subsection || q.section || ''));
    check(s.toUpperCase() + ' 全部题目 goto 精确命中讲义节名（' + qs.length + ' 题）', miss.length, 0);
    if (miss.length) console.log('   e.g. ' + miss.slice(0, 3).map(q => q.id + ':' + (q.subsection || q.section)).join(', '));
}
const allQ = SUBS.reduce((a, s) => a.concat(banks[s]), []);
check('全库题目精确 2452 题', allQ.length, 2452);
// kp_analysis 只有收藏题才有，用它当「收藏题」的仓库内代理，无需外部备份文件
const favLike = allQ.filter(q => q.kp_analysis);
check('收藏代理题（有考点分析）数量 > 1300', favLike.length > 1300, true);
check('收藏代理题 goto 全部精确命中',
    favLike.filter(q => !notes[q.id.split('_')[0]].has(q.subsection || q.section || '')).length, 0);
check('题库里不再残留三个旧小节名',
    ['6.4.2 简单邮件传送协议SMTP', '6.4.3 邮局协议POP3和IMAP', '5.2.x 中断处理流程']
        .some(x => allQ.some(q => (q.subsection || '') === x)), false);
check('CN 邮件 7 题统一落到 6.4.3 SMTP和POP3',
    banks.cn.filter(q => q.subsection === '6.4.3 SMTP和POP3').length, 7);
check('OS 2010 中断题已归位 1.3.3',
    (() => { const q = banks.os.find(x => x.id === 'os_0652'); return q && q.chapter + '|' + q.section + '|' + q.subsection; })(),
    '第1章 计算机系统概述|1.3 操作系统的运行环境|1.3.3 中断和异常的概念');
check('quiz.html 的 📖 链接仍取 subsection || section',
    quizHtml.includes('encodeURIComponent(q.subsection || q.section)'), true);

// ---------- 2. notes.html 兼容层 ----------
const aliasStart = notesHtml.indexOf('        const GOTO_ALIASES = {');
const aliasEnd = notesHtml.indexOf('        // 章节名含 / 等字符', aliasStart);
check('能截出 GOTO_ALIASES + resolveSecName 片段', aliasStart > 0 && aliasEnd > aliasStart, true);
const aliasSnippet = aliasStart > 0 && aliasEnd > aliasStart ? notesHtml.slice(aliasStart, aliasEnd) : '';
check('GOTO_ALIASES 三条旧名映射齐全',
    ['6.4.2 简单邮件传送协议SMTP', '6.4.3 邮局协议POP3和IMAP', '5.2.x 中断处理流程']
        .every(x => aliasSnippet.includes('"' + x + '"')), true);
check('三条目标名都是讲义真实节名',
    ['cn:6.4.3 SMTP和POP3', 'cn:6.4.3 SMTP和POP3', 'os:1.3.3 中断和异常的概念']
        .every(x => notes[x.split(':')[0]].has(x.split(':')[1])), true);
check('resolveSecName 优先 GOTO_ALIASES，再回落 SEC_ALIASES',
    /return GOTO_ALIASES\[name\] \|\| SEC_ALIASES\[name\] \|\| name;/.test(aliasSnippet), true);
const migStart = notesHtml.indexOf('        function migrateAnno(item) {');
const migEnd = notesHtml.indexOf('        function resolveAnnoLine(item) {', migStart);
const migFn = migStart > 0 && migEnd > migStart ? notesHtml.slice(migStart, migEnd) : '';
check('批注迁移走 SEC_ALIAS 行号表，与 GOTO_ALIASES 完全解耦',
    /\.map\(migrateAnno\)/.test(notesHtml) &&
    migFn.includes('SEC_ALIAS[SUBJECT]') && !migFn.includes('GOTO_ALIASES'), true);
check('resolveSectionEl 与 jumpTo 都走 resolveSecName',
    (notesHtml.match(/const mapped = resolveSecName\(name\);/g) || []).length, 2);
check('不再有直接取 SEC_ALIASES 的 mapped 赋值',
    notesHtml.includes('const mapped = SEC_ALIASES[name] || name;'), false);
check('目标节优先渲染前先归一 GOTO',
    notesHtml.indexOf('GOTO = resolveSecName(GOTO);') > notesHtml.indexOf('if (name) GOTO = name;') &&
    notesHtml.indexOf('GOTO = resolveSecName(GOTO);') < notesHtml.indexOf('const findSecIdx = name =>'), true);
check('全文渲染完成后清残缺行索引缓存',
    /function finishNotes\(\) \{[\s\S]{0,240}_bgCache = null;/.test(notesHtml), true);

// ---------- 3. jsdom 真实执行解析函数 ----------
function braceSlice(src, startMark) {
    const start = src.indexOf(startMark);
    if (start < 0) return '';
    let depth = 0, seen = false;
    for (let i = start; i < src.length; i++) {
        if (src[i] === '{') { depth++; seen = true; }
        else if (src[i] === '}') { depth--; if (seen && depth === 0) return src.slice(start, i + 1); }
    }
    return '';
}
const resolveFn = braceSlice(notesHtml, '        function resolveSectionEl(name) {');
check('能截出 resolveSectionEl 函数体', resolveFn.length > 200, true);
const dom = new JSDOM(`<div class="notes-content">
  <section class="notes-section" data-sec="6.4 电子邮件">
    <div class="notes-sub" data-sec="6.4.2 电子邮件格式与MIME"></div>
    <div class="notes-sub" data-sec="6.4.3 SMTP和POP3"></div>
  </section>
  <section class="notes-section" data-sec="1.3 操作系统的运行环境">
    <div class="notes-sub" data-sec="1.3.3 中断和异常的概念"></div>
  </section>
  <section class="notes-section" data-sec="5.2 设备独立性软件"></section>
</div>`, { url: 'https://x.test/notes.html?subject=cn', runScripts: 'dangerously' });
const w = dom.window;
// outside-only 下 eval 作用域里没有 window 标识符，直接把函数作为返回值带出来
const api = w.eval('var SEC_ALIASES = {};\n' + aliasSnippet + '\n' + resolveFn +
    '\n[resolveSectionEl, resolveSecName]');
const hit = n => { const el = api[0](n); return el ? el.dataset.sec : '(无)'; };
check('旧名 SMTP 归一到 6.4.3 SMTP和POP3', hit('6.4.2 简单邮件传送协议SMTP'), '6.4.3 SMTP和POP3');
check('旧名 POP3/IMAP 归一到 6.4.3 SMTP和POP3', hit('6.4.3 邮局协议POP3和IMAP'), '6.4.3 SMTP和POP3');
check('占位编号 5.2.x 归一到 1.3.3 中断和异常的概念', hit('5.2.x 中断处理流程'), '1.3.3 中断和异常的概念');
check('新题库名直接精确命中', hit('6.4.3 SMTP和POP3'), '6.4.3 SMTP和POP3');
check('普通节名不受影响', hit('5.2 设备独立性软件'), '5.2 设备独立性软件');
check('resolveSecName 对未知名保持原样', api[1]('9.9 不存在的节'), '9.9 不存在的节');

console.log((fail ? 'RED' : 'GREEN') + ' _test_kp_goto: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
