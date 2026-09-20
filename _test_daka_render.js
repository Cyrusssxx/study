// 打卡表 renderCard 回归：ds_daka.json 已下线题目/答案文字，只渲染教材原图
// 运行：node _test_daka_render.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'pwa', 'daka.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa', 'data', 'ds_daka.json'), 'utf8'));
const codeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa', 'data', 'ds_code.json'), 'utf8'));
const extraData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pwa', 'data', 'ds_code_extra.json'), 'utf8'));
const figDir = path.join(__dirname, 'pwa', 'data', 'daka_figs');

// 用大括号配平截取 renderCard（非贪婪正则会截断在函数体内第一个 4 空格右括号上）
function extractFn(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('未找到函数 ' + name);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error('函数 ' + name + ' 大括号未配平');
}

// 数据已删文字字段，fmtContent/fmtAnswer 用空实现即可验证“无文字”路径
const fmt = s => (s || '');

let fail = 0;
function assert(cond, msg) {
    if (!cond) { console.log('✗ ' + msg); fail++; }
}

console.log('题目总数', data.questions.length);

// 1. 数据侧：文字字段已全部下线
assert(data.questions.every(q => !('content' in q) && !('answer' in q)), 'ds_daka.json 已无 content/answer 字段');

// 2. 渲染侧：每题都有题目图与解答图，且 img src 全部指向真实存在的文件
let missing = [];
for (const q of data.questions) {
    for (const name of (q.figs || {}).content || []) {
        if (!fs.existsSync(path.join(figDir, name))) missing.push(q.id + '/' + name);
    }
    for (const name of (q.figs || {}).answer || []) {
        if (!fs.existsSync(path.join(figDir, name))) missing.push(q.id + '/' + name);
    }
    assert((q.figs || {}).content && q.figs.content.length, q.id + ' 缺题目图');
    assert((q.figs || {}).answer && q.figs.answer.length, q.id + ' 缺解答图');
}
assert(missing.length === 0, '图片文件缺失 ' + missing.slice(0, 5).join(', '));

// 3. 逐题跑真实 renderCard（返回模板字符串），确认卡片非空、图标签正确、无占位兜底
// 只取函数体：整段声明喂给 new Function 会变成“函数声明语句”，返回值恒为 undefined
const full = extractFn(html, 'renderCard');
const body = full.slice(full.indexOf('{') + 1, full.lastIndexOf('}')).replace(/\bconst /g, 'var ');
// renderCard 依赖 codeBySource（source→ds_code 讲义映射）与 solHtml（讲义渲染），从页面与数据构建
// 另外依赖 dakaAnsfigOpen（「📷 解答原图」独立展开状态 Set，仅真题卡片用）
const esc = s2 => String(s2 == null ? '' : s2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dakaAnsfigOpen = new Set();
const codeBySource = new Map();
for (const c of codeData.questions) if (c.source) codeBySource.set(c.source, c);
for (const c of extraData.questions) if (c.source) codeBySource.set(c.source, c);
const solFull = extractFn(html, 'solHtml');
const solBody = solFull.slice(solFull.indexOf('{') + 1, solFull.lastIndexOf('}')).replace(/\bconst /g, 'var ');
// 页面里 solHtml(q) 依赖全局 esc；new Function 无法闭包捕获 → 包一层：esc 作为注入参数，对外暴露单参 q
const solHtmlImpl = new Function('esc', 'q', solBody);
const solHtml = q2 => solHtmlImpl(esc, q2);
const buildCard = new Function('fmtContent', 'fmtAnswer', 'dakaProgress', 'q', 'badgeClass', 'codeBySource', 'solHtml', 'esc', 'dakaAnsfigOpen', body);

let placeholderHits = 0, labelHits = 0, imgCount = 0;
let lectureHits = 0;
for (const q of data.questions) {
    const card = buildCard(fmt, fmt, { [q.id]: null }, q, p => 'badge', codeBySource, solHtml, esc, dakaAnsfigOpen);
    assert(/<div class="daka-card/.test(card), q.id + ' 未生成卡片');
    assert(/题目教材原图/.test(card), q.id + ' 缺题目原图标签');
    assert(/解答教材原图/.test(card), q.id + ' 缺解答原图标签');
    assert(/<img src="data\/daka_figs\//.test(card), q.id + ' 未引用 daka_figs 图片');
    labelHits++;
    imgCount += (card.match(/<img /g) || []).length;
    if (/题目见教材原图|解答见教材原图|解答见教材/.test(card)) placeholderHits++;
    assert(!/fmtContent|fmtAnswer/.test(card), q.id + ' 渲染出函数名（未求值）');
    // 算法题讲义映射：命中 ds_code 的题答案区升级为完整讲义
    if (codeBySource.has(q.source)) {
        lectureHits++;
        assert(/考点分析 · 易错点 · 讲义解法/.test(card), q.id + ' 映射题缺讲义折叠标题');
        assert(/<div class="sol-item">/.test(card), q.id + ' 映射题缺解法条目 sol-item');
        assert(/<pre class="code-block">/.test(card), q.id + ' 映射题缺代码块');
        assert(/sol-cx|复杂度/.test(card), q.id + ' 映射题缺复杂度');
        assert(/daka-analysis/.test(card), q.id + ' 映射题缺考点分析区');
    }
}
assert(placeholderHits === 0, '仍有 ' + placeholderHits + ' 题落入占位兜底（应有图有标签）');
assert(labelHits === data.questions.length, '渲染题数不符');
assert(lectureHits > 0, '没有任何题命中代码题讲义映射');

// 3b. 映射覆盖核对：ds_code + ds_code_extra 中能对应到打卡表的题应全部命中
const codeSources = codeData.questions.map(c => c.source).filter(s => s && s.indexOf('王道书') === 0)
    .concat(extraData.questions.map(c => c.source).filter(s => s && s.indexOf('王道书') === 0));
let mappedInDaka = 0;
for (const s of codeSources) if (data.questions.some(q => q.source === s)) mappedInDaka++;
assert(mappedInDaka === lectureHits, '打卡表命中的讲义数应等于可映射数（' + mappedInDaka + ' ≠ ' + lectureHits + '）');
console.log('代码题讲义映射命中', lectureHits, '题（ds_code+ds_code_extra 与打卡表逐字匹配）');

// 4. 向后兼容：若数据重新带回文字字段，文字应排在图前且不报占位
const legacy = { id: 'legacy_1', priority: 0, priority_label: '必做', module: 'm', kaodian: 'k', source: 's',
    content: '旧版文字题目', answer: '旧版文字答案', figs: { content: ['x.jpg'], answer: ['y.jpg'] } };
const legacyCard = buildCard(s => s, s => s, {}, legacy, p => 'badge', codeBySource, solHtml, esc, dakaAnsfigOpen);
assert(legacyCard.indexOf('旧版文字题目') < legacyCard.indexOf('题目教材原图'), '旧数据下文字应排在图前');
assert(legacyCard.indexOf('旧版文字答案') < legacyCard.indexOf('解答教材原图'), '旧数据下答案文字应排在图前');

console.log('图片引用总数', imgCount, '｜占位兜底触发', placeholderHits);
if (fail) { console.log('\n失败 ' + fail + ' 项'); process.exit(1); }
console.log('\n✅ 打卡表渲染回归全部通过');
