// 每日一题（js/daily.js）回归：
//   1) 一天从四门（ds/os/cn/co）收藏里各抽 1 题；同一天重复调用结果不变（幂等）
//   2) 抽过的题记入 daily_seen；跨天重抽时优先抽「没抽过」的（收藏 5 题 → 连续多天不重复）
//   3) 上一天的结果归档进 daily_history（保留每天抽的题，可回看）
//   4) 渲染：首页 #dailySection 出卡片（四门科目名 + 跳转链接）；历史弹层能打开并含历史日期
//   5) 某门无收藏题时不报错，该门留空
// 用法：NODE_PATH=<workspace>/node_modules node _test_daily_pick.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
    console.log('跳过：需要 jsdom 与 fake-indexeddb（NODE_PATH=<workspace>/node_modules）');
    process.exit(0);
}

const ROOT = __dirname;
const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'backend.js'), 'utf8');
const DAILY = fs.readFileSync(path.join(ROOT, 'pwa', 'js', 'daily.js'), 'utf8');

// 四门各 5 题
const SUBS = ['ds', 'os', 'cn', 'co'];
const SUBJ_ORDER_ALL = SUBS;
const FIX = {};
for (const s of SUBS) {
    FIX[s] = {
        subject: s,
        title: s,
        questions: Array.from({ length: 5 }, (_, i) => ({
            id: `${s}_000${i + 1}`, number: i + 1,
            content: `${s} 第${i + 1}题 题干内容`,
            options: { A: '甲', B: '乙' }, answer: 'A',
            chapter: `第${i + 1}章`, section: `${i + 1}.1 小节`
        }))
    };
}

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body><div id="dailySection"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://x.test/index.html',
    beforeParse(w) {
        w.indexedDB = new IDBFactory();
        w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { };
    }
});
const w = dom.window;
w.fetch = async (u) => {
    const m = String(u).match(/data\/(\w+)\.json/);
    const obj = (m && FIX[m[1]]) ? FIX[m[1]] : { questions: [], chapters: [] };
    return { ok: true, status: 200, json: async () => obj };
};

w.eval('(function(){' + BACKEND + '\n;globalThis.api = api; globalThis.SUBJECTS = SUBJECTS;})()');
w.eval('(function(){' + DAILY + '})()');

(async () => {
    const post = (url) => w.api(url, { method: 'POST' }).then(r => r.json());
    const seenOf = () => JSON.parse(w.localStorage.getItem('daily_seen_v1') || '{}');
    const histOf = () => JSON.parse(w.localStorage.getItem('daily_history_v1') || '[]');
    const todayOf = () => JSON.parse(w.localStorage.getItem('daily_pick_v1') || 'null');

    console.log('--- 准备收藏：四门各 5 题 ---');
    for (const s of SUBS) {
        for (let i = 1; i <= 5; i++) await post('/api/favorite/' + `${s}_000${i}`);
    }
    // cn 故意只收藏 2 题，验证“题少也能抽”；co 收藏 0 题，验证“无收藏不报错”
    for (let i = 3; i <= 5; i++) await post('/api/favorite/cn_000' + i);   // 取消收藏（toggle）
    for (let i = 1; i <= 5; i++) await post('/api/favorite/co_000' + i);    // 取消收藏（toggle，清空 co）

    console.log('\n--- 首日抽题 ---');
    const d1 = await w.DailyPick.rollToday();
    check('返回今日日期格式', /^\d{4}-\d{2}-\d{2}$/.test(d1.date), true);
    check('四门都抽到题（ds/os/cn）', ['ds', 'os', 'cn'].every(s => ((d1.picks || {})[s] || []).length > 0), true);
    check('无收藏的 co 留空', 'co' in (d1.picks || {}), false);
    check('结果写入 localStorage', !!todayOf(), true);
    const d1b = await w.DailyPick.rollToday();
    check('同一天重复调用结果不变（幂等）', d1b.picks, d1.picks);
    check('每门各 1 题（数组结构）', ['ds','os','cn'].every(s => (d1.picks[s] || []).length === 1), true);

    console.log('\n--- 渲染 ---');
    w.DailyPick.renderDaily(d1);
    const html = w.document.getElementById('dailySection').innerHTML;
    check('渲染出每日一题卡片', /class="daily-card"/.test(html), true);
    check('含科目名 数据结构', /数据结构/.test(html), true);
    check('内嵌作答：含选项单选', /name="dq-ds-0"/.test(html), true);
    check('内嵌作答：含提交按钮', /submitDaily\('ds',0\)/.test(html), true);
    check('无收藏门显示暂无收藏题', /暂无收藏题/.test(html), true);
    const qTexts = [...w.document.querySelectorAll('.daily-q')].map(e => e.textContent).join('');
    check('题干摘要已去标签（无尖括号）', /[<>]/.test(qTexts), false);

    console.log('\n--- 跨天重抽 + 去重（cn 收藏 2 题：两天不重复） ---');
    const firstCn = d1.picks.cn[0].id;
    // 手动把今日结果改成“昨天”，模拟跨天
    const y = todayOf();
    y.date = '2020-01-01';
    w.localStorage.setItem('daily_pick_v1', JSON.stringify(y));
    const d2 = await w.DailyPick.rollToday();
    check('跨天后日期刷新', d2.date !== '2020-01-01', true);
    check('cn 第 2 天抽到不同题', d2.picks.cn[0].id !== firstCn, true);
    check('上一天结果归档进历史', histOf().some(h => h.date === '2020-01-01'), true);
    check('历史里保留了当天抽的题', ((histOf()[0].picks || {}).cn || [])[0].id, firstCn);
    check('归档为完整数据（含选项，可页内补做）', !!(histOf()[0].picks.cn[0].options && Object.keys(histOf()[0].picks.cn[0].options).length), true);

    console.log('\n--- 连续多天不重复（ds 收藏 5 题） ---');
    const ids = [d2.picks.ds[0].id];
    for (let k = 0; k < 4; k++) {
        const cur = todayOf();
        cur.date = `2021-01-0${k + 1}`;
        w.localStorage.setItem('daily_pick_v1', JSON.stringify(cur));
        const dn = await w.DailyPick.rollToday();
        ids.push(dn.picks.ds[0].id);
    }
    check('ds 前 4 天（未抽过的）互不相同', new Set(ids.slice(0, 4)).size, 4);
    check('一轮抽完后仍能出题（取最久未抽）', !!ids[4], true);
    // pickOne 纯函数：全部抽过时取最久未抽的那题
    const favs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const seen = { a: '2020-01-01', b: '2020-05-01', c: '2020-03-01' };
    check('全部抽过时取最久未抽的题', w.DailyPick.pickOne(favs, seen).id, 'a');
    check('seen 记录已积累', Object.keys(seenOf().ds || {}).length >= 5, true);

    console.log('\n--- 历史记录弹层（日期形式 + 颜色 + 页内补做） ---');
    w.showDailyHistory();
    const ov = w.document.getElementById('dailyHistOverlay');
    check('弹层已创建', !!ov, true);
    check('弹层可见', ov && ov.hidden === false, true);
    check('日期列表：含多个日期块', w.document.querySelectorAll('.daily-cal-day').length >= 5, true);
    check('弹层含历史日期', /2020-01-01/.test(ov.innerHTML), true);
    check('弹层含今日标记', /今天/.test(ov.innerHTML), true);
    check('今日行带完成度色点', !!ov.querySelector('.daily-cal-day.today .dc-dot'), true);
    check('列表含完成度统计（N/N 已做）', /\d\/\d 已做/.test(ov.innerHTML), true);

    // 点 2020-01-01 进入当天详情，页内补做
    w.openDailyDay('2020-01-01');
    check('详情含返回按钮', !!w.document.querySelector('#dailyHistOverlay .daily-hist-back'), true);
    const histInput = w.document.querySelector('#dailyHistOverlay input[name="dq-ds-0"]');
    check('详情含可作答选项（完整数据）', !!histInput, true);
    check('详情含未抽科目的提示', /当天未抽到该科目的题/.test(ov.innerHTML), true);
    if (histInput) {
        histInput.checked = true;
        await w.submitHist('2020-01-01', 'ds', 0);
        check('历史补做后原地显示判分结果', /daily-result/.test(ov.innerHTML), true);
        const dayAfter = histOf().find(h => h.date === '2020-01-01');
        check('补做状态写回当天记录', !!(dayAfter && dayAfter.picks.ds[0].answered), true);
    }
    w.backDailyHist();
    check('返回日期列表', !!w.document.querySelector('#dailyHistOverlay .daily-cal-day'), true);
    check('补做后完成度即时更新（1/3 已做）', /1\/3 已做/.test(ov.innerHTML), true);
    w.closeDailyHistory();
    check('关闭后隐藏', w.document.getElementById('dailyHistOverlay').hidden, true);
    check('关闭后视图重置回日期列表', (() => { w.showDailyHistory(); return !!w.document.querySelector('#dailyHistOverlay .daily-cal-day'); })(), true);
    w.closeDailyHistory();

    console.log('\n--- 布局：独立页居中 + 一题一列（样式静态检查） ---');
    const CSS = fs.readFileSync(path.join(ROOT, 'pwa', 'css', 'style.css'), 'utf8');
    check('独立页整体限宽居中（.daily-page 780px）', /\.daily-page\s*\{[^}]*max-width:\s*780px/.test(CSS), true);
    check('一题一列（.daily-grid 纵向排列）', /\.daily-grid\s*\{[^}]*flex-direction:\s*column/.test(CSS), true);
    check('日期块完成度色点（绿/橙/灰）', /\.daily-cal-day\.cal-full \.dc-dot/.test(CSS) && /\.daily-cal-day\.cal-part \.dc-dot/.test(CSS), true);
    check('科目徽章淡底描边', /\.daily-subject\s*\{[^}]*border:/.test(CSS), true);
    check('真题卷字体变量（Times + 宋体）', /--font-q:\s*"Times New Roman"/.test(CSS), true);
    check('每日一题题干/选项应用真题字体', /\.daily-q\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS) && /\.daily-opt-text\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS), true);
    check('刷题页题干/选项/解析应用真题字体', /\.question-content\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS) && /\.option-text\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS) && /\.explanation-body\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS), true);
    check('题干内代码块保持等宽', /\.question-content pre, \.question-content code[\s\S]*?font-family:\s*Consolas/.test(CSS), true);

    console.log('\n--- 知识点跳转（同刷题页，新窗口定位笔记） ---');
    const kp = w.DailyPick.itemHtml('ds', { id: 'x3', content: '题干内容', options: { A: '甲' }, answer: 'A', chapter: '第1章', section: '1.1 节' }, { idx: 0 });
    check('渲染知识点跳转链接（notes.html 定位小节）', /notes\.html\?subject=ds&goto=/.test(kp), true);
    check('链接带题干模糊定位参数 q=', /&q=/.test(kp), true);
    check('新窗口打开', /target="_blank"/.test(kp), true);
    const noSec = w.DailyPick.itemHtml('ds', { id: 'x4', content: '无小节', options: { A: '甲' }, answer: 'A', chapter: '第1章' }, { idx: 0 });
    check('无小节时章节为纯文本（无死链）', /daily-kp/.test(noSec), false);

    console.log('\n--- 内嵌作答（不跳页） ---');
    const radio = w.document.querySelector('input[name="dq-ds-0"]');
    check('选项可点选', !!radio, true);
    radio.checked = true;
    await w.submitDaily('ds', 0);
    const html2 = w.document.getElementById('dailySection').innerHTML;
    check('提交后原地显示判题结果', /daily-result/.test(html2), true);
    check('未跳页仍在同一卡片内', /class="daily-card"/.test(html2), true);
    check('作答状态已记录到本地', !!(todayOf().picks.ds && todayOf().picks.ds[0].answered), true);
    w.redoDaily('ds', 0);
    check('重新作答可清空状态', todayOf().picks.ds[0].answered === null, true);

    console.log('\n--- 笔记：每日一题默认不展开 ---');
    const fake = { id: 'x1', content: '笔记题', options: { A: '甲', B: '乙' }, answer: 'A', note: '这是笔记', chapter: '', section: '' };
    const nh = w.DailyPick.itemHtml('ds', fake, { idx: 0 });
    check('渲染出笔记折叠', /daily-note/.test(nh), true);
    check('笔记默认不展开（无 open）', /<details class="daily-fold daily-note">/.test(nh), true);
    const noNote = w.DailyPick.itemHtml('ds', { id: 'x2', content: '无笔记', options: { A: '甲' }, answer: 'A' }, { idx: 0 });
    check('无笔记时不显示笔记折叠', /daily-note/.test(noNote), false);

    console.log('\n--- 抽题优先「没做过」的收藏题 ---');
    await w.api('/api/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: 'ds_0001', answer: 'A' })
    });
    w.localStorage.removeItem('daily_pick_v1');
    const dn = await w.DailyPick.rollToday();
    check('避开已作答的题', dn.picks.ds[0].id !== 'ds_0001', true);

    console.log('\n--- 加量：再来 4 道 ---');
    // 恢复四门收藏（前面测试把 co 清空了、cn 减到 2 题 → 各再 toggle 一次恢复）
    for (let i = 3; i <= 5; i++) await post('/api/favorite/cn_000' + i);
    for (let i = 1; i <= 5; i++) await post('/api/favorite/co_000' + i);
    w.localStorage.removeItem('daily_pick_v1');
    w.localStorage.removeItem('daily_seen_v1');
    const before = await w.DailyPick.rollToday();
    check('加量前四门各 1 题', SUBS.every(s => (before.picks[s] || []).length === 1), true);
    const r = await w.DailyPick.addBatch();
    check('加量：四门各加 1 题', r.added, 4);
    const after = todayOf();
    check('加量后每门 2 题', SUBS.every(s => (after.picks[s] || []).length === 2), true);
    check('加量题与当天已抽不重复', SUBS.every(s => {
        const ids = after.picks[s].map(p => p.id);
        return new Set(ids).size === ids.length;
    }), true);
    check('加量题带完整作答数据（含选项）', SUBS.every(s => Object.keys(after.picks[s][1].options || {}).length > 0), true);

    // 渲染：8 个作答块 + 加量徽标 + 加量按钮
    w.DailyPick.renderDaily(after);
    const htmlAdd = w.document.getElementById('dailySection').innerHTML;
    check('渲染 8 个题目卡', (htmlAdd.match(/class="daily-item"/g) || []).length, 8);
    check('含加量按钮「再来 4 道」', /addBatchDaily\(\)/.test(htmlAdd), true);
    check('加量题带「加量」徽标', /加量/.test(htmlAdd), true);
    check('加量题选项索引唯一（dq-ds-1）', /name="dq-ds-1"/.test(htmlAdd), true);
    check('底部显示总题数', /共 8 题/.test(htmlAdd), true);

    // 加量题可独立作答（不影响第 1 题）
    const r2 = w.document.querySelector('input[name="dq-ds-1"]');
    r2.checked = true;
    await w.submitDaily('ds', 1);
    const t2 = todayOf();
    check('加量题可独立作答并记录', !!t2.picks.ds[1].answered, true);
    check('第 1 题状态不受影响', t2.picks.ds[0].answered, null);

    // 某门收藏抽完 → 加量跳过该门（ds 收藏 5 题，抽 2 次后仍可加）
    const r3 = await w.DailyPick.addBatch();
    check('可继续加量（每门 3 题）', (todayOf().picks.ds || []).length, 3);

    console.log(`\nPASS ${pass} / FAIL ${fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
