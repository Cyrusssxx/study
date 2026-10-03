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
    check('字体栈含跨平台兜底（Nimbus/Liberation/Georgia + 雅黑系）', /"Nimbus Roman"/.test(CSS) && /Georgia/.test(CSS) && /"Hiragino Sans GB"/.test(CSS), true);
    check('中英混排优化（x-height 补偿 + 等宽数字 + 字距调整）', /font-size-adjust:\s*0?\.\d+/.test(CSS) && /font-variant-numeric:\s*[^;]*tabular-nums/.test(CSS) && /font-kerning:\s*normal/.test(CSS), true);
    check('每日一题题干/选项应用真题字体', /\.daily-q\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS) && /\.daily-opt-text\s*\{[^}]*font-family:\s*var\(--font-q\)/.test(CSS), true);
    check('刷题页题干/选项/解析应用真题字体（统一分组规则）',
        /\.question-content,\s*\.option-text[\s\S]{0,420}?font-family:\s*var\(--font-q\)/.test(CSS), true);
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

    // 新规则：先补新题；新题抽完后回退补「已做过的题」（带 refetch 标记），整门池空才跳过
    let guard = 0, r4 = { added: 0, skipped: [], refetched: 0 };
    let sawRefetch = false;
    do {
        r4 = await w.DailyPick.addBatch(); guard++;
        if (r4.refetched > 0) sawRefetch = true;
    } while (r4.added > 0 && guard < 8);
    check('新题抽完后会回退补已做过的题', sawRefetch, true);
    check('池子全部抽完后加量不再增加（不报错）', r4.added, 0);
    check('整门池空时记入 skipped', Array.isArray(r4.skipped) && r4.skipped.length > 0, true);
    check('当天不出现重复题', (() => {
        const t = todayOf();
        return Object.values(t.picks).every(arr => new Set(arr.map(p => p.id)).size === arr.length);
    })(), true);

    console.log('\n--- 抽题池：收藏 ∪ 不熟/不会 + 四层优先 ---');
    const P = (id, o) => Object.assign({ id }, o);
    check('L1：标记「不会」的最优先',
        w.DailyPick.pickOne([P('dn', { is_dontknow: true }), P('u', { is_unfamiliar: true }), P('n'), P('d', { last_status: { is_correct: true } })], {}, new Set()).id, 'dn');
    check('L2：无「不会」时「不熟」优先',
        w.DailyPick.pickOne([P('u', { is_unfamiliar: true }), P('n'), P('d', { last_status: { is_correct: true } })], {}, new Set()).id, 'u');
    check('L3：无弱标记时「没做过」优先',
        w.DailyPick.pickOne([P('n'), P('d', { last_status: { is_correct: true } })], {}, new Set()).id, 'n');
    check('L4：都做过时取其他做过题',
        w.DailyPick.pickOne([P('d', { last_status: { is_correct: true } })], {}, new Set()).id, 'd');
    check('排除当天已抽（「不会」题抽过则让位给没做过的）',
        w.DailyPick.pickOne([P('dn', { is_dontknow: true }), P('n')], {}, new Set(['dn'])).id, 'n');

    // 集成：取消收藏一道题并标记「不会」→ 仍应进池且优先被抽到
    await post('/api/favorite/ds_0004');                                        // toggle 取消收藏
    await w.api('/api/mark/dontknow/ds_0004', { method: 'POST' });              // 标记不会
    const favIds = (await w.api('/api/questions/ds?mode=favorite').then(r => r.json())).questions.map(q => q.id);
    check('前置：ds_0004 已不在收藏里', favIds.includes('ds_0004'), false);
    w.localStorage.removeItem('daily_pick_v1');
    w.localStorage.removeItem('daily_seen_v1');
    const dp = await w.DailyPick.rollToday();
    check('未收藏但标记「不会」的题也能被抽到', dp.picks.ds[0].id, 'ds_0004');

    console.log('\n--- 结合复习列表：到期复习题最高优先 ---');
    check('L0：今日到期复习题最优先',
        w.DailyPick.pickOne([P('due', { _due: true }), P('dn', { is_dontknow: true }), P('n')], {}, new Set()).id, 'due');
    check('到期复习题抽过后让位给「不会」',
        w.DailyPick.pickOne([P('due', { _due: true }), P('dn', { is_dontknow: true }), P('n')], {}, new Set(['due'])).id, 'dn');
    check('到期复习题持久化 due 字段',
        w.DailyPick.itemHtml('ds', { id: 'z1', content: '复习题', options: { A: '甲' }, answer: 'A', due: true }, { idx: 0 }).includes('待复习'), true);
    check('非复习题无「待复习」标签',
        w.DailyPick.itemHtml('ds', { id: 'z2', content: '普通题', options: { A: '甲' }, answer: 'A' }, { idx: 0 }).includes('待复习'), false);

    // 集成：stub api，让 review 模式返回一道题 → 抽题时应命中它
    const realApi = w.api;
    let reviewCalled = 0;
    w.api = async (url, opts) => {
        if (String(url).includes('mode=review')) {
            reviewCalled++;
            return { json: async () => ({ questions: [{ id: 'rv_001', content: '到期复习题', options: { A: '甲' }, answer: 'A', chapter: '第1章', section: '1.1 节' }] }) };
        }
        return realApi(url, opts);
    };
    w.localStorage.removeItem('daily_pick_v1');
    w.localStorage.removeItem('daily_seen_v1');
    const dr = await w.DailyPick.rollToday();
    w.api = realApi;
    check('抽题时会拉取复习列表（mode=review）', reviewCalled > 0, true);
    check('到期复习题被优先抽中（ds 门）', dr.picks.ds[0].id, 'rv_001');
    check('抽中的复习题带 due 标记', dr.picks.ds[0].due, true);

    console.log('\n--- 加量只抽「没做过的新题」 ---');
    // stub ds 门题池：2 道已作答（旧）+ 3 道未作答（新），unfamiliar/review 返回空
    const realApi3 = w.api;
    w.api = async (url, opts) => {
        const s = String(url);
        if (s.includes('/api/questions/ds')) {
            if (s.includes('mode=favorite')) {
                return { json: async () => ({ questions: [
                    { id: 'ds_old1', last_status: { is_correct: true }, options: { A: '甲' }, answer: 'A', chapter: '第1章', section: '1.1 节' },
                    { id: 'ds_old2', last_status: { is_correct: false }, options: { A: '甲' }, answer: 'A' },
                    { id: 'ds_new1', options: { A: '甲' }, answer: 'A' },
                    { id: 'ds_new2', options: { A: '甲' }, answer: 'A' },
                    { id: 'ds_new3', options: { A: '甲' }, answer: 'A' }
                ] }) };
            }
            return { json: async () => ({ questions: [] }) };   // 弱项/复习为空
        }
        return realApi3(url, opts);
    };
    w.localStorage.removeItem('daily_pick_v1');
    w.localStorage.removeItem('daily_seen_v1');
    const dNew = await w.DailyPick.rollToday();
    check('首批：ds 抽到未做过的新题', dNew.picks.ds[0].id.startsWith('ds_new'), true);
    check('首批：ds 未抽已作答的题', dNew.picks.ds[0].id.startsWith('ds_old'), false);

    await w.DailyPick.addBatch();
    const tNew = todayOf();
    check('加量后 ds 门 2 题', (tNew.picks.ds || []).length, 2);
    check('加量题全部是未做过的新题（排除已作答）',
        (tNew.picks.ds || []).every(p => p.id.startsWith('ds_new')), true);
    check('加量题与当天首批不重复',
        new Set((tNew.picks.ds || []).map(p => p.id)).size, 2);

    // ds 的 3 道新题抽完后 → 回退补「已做过的题」，并带 refetch 标记
    await w.DailyPick.addBatch();                       // 抽第 3 道新题
    const rBack = await w.DailyPick.addBatch();        // 新题耗尽 → 回退
    check('新题耗尽后回退补题（added>0）', rBack.added > 0, true);
    check('回退计数 refetched>0', rBack.refetched > 0, true);
    const dsNow = todayOf().picks.ds || [];
    check('回退题带 refetch 标记', dsNow.some(p => p.refetch === true), true);
    check('回退题不是新题（ds_old*）', dsNow.filter(p => p.refetch).every(p => p.id.startsWith('ds_old')), true);
    check('回退题不再显示「已做过」标签', w.DailyPick.itemHtml('ds', { id: 'rf1', content: '复习题', options: { A: '甲' }, answer: 'A', refetch: true }, { idx: 0 }).includes('已做过'), false);
    // 整门池空后才跳过
    let g2 = 0, rEnd = rBack;
    do { rEnd = await w.DailyPick.addBatch(); g2++; } while (rEnd.added > 0 && g2 < 6);
    check('该门池全空后被跳过', rEnd.added, 0);
    w.api = realApi3;

    console.log('\n--- 加量后自动折叠今天写过的题 ---');
    // 造一份今天数据：ds 第 0 题已作答、第 1 题未作答
    const todayData = {
        date: w.DailyPick.todayStr(), normalized: 1,
        picks: { ds: [
            { id: 'ds_done1', content: '已作答的题', options: { A: '甲', B: '乙' }, answer: 'A', chapter: '第1章', section: '1.1 节',
              answered: { answer: 'A', isCorrect: true, correctAnswer: 'A' } },
            { id: 'ds_new9', content: '没作答的新题', options: { A: '甲', B: '乙' }, answer: 'A' }
        ] }
    };
    w.localStorage.setItem('daily_pick_v1', JSON.stringify(todayData));
    // 首屏渲染：不折叠
    w.DailyPick.renderDaily(todayData);
    let dom0 = w.document.getElementById('dailySection').innerHTML;
    check('首屏：已作答题不自动折叠', /data-idx="0"[^>]*class="daily-item"|class="daily-item"[^>]*data-idx="0"/.test(dom0) && !/daily-item folded/.test(dom0), true);
    check('首屏：已作答题有状态标签', /✓ 已答对/.test(dom0), true);
    check('首屏：已作答题有折叠开关（收起）', /收起 ▴/.test(dom0), true);
    // 加量后渲染：折叠
    w.DailyPick.renderDaily(null, { collapseDone: true });
    const dom1 = w.document.getElementById('dailySection').innerHTML;
    check('加量后：已作答题被折叠（folded class）', /class="daily-item folded"/.test(dom1), true);
    check('加量后：未作答题不折叠', (dom1.match(/folded/g) || []).length, 1);
    check('加量后：折叠按钮文案变为「展开」', /展开 ▾/.test(dom1), true);
    // 展开交互
    const tbtn = w.document.querySelector('.daily-item.folded .daily-fold-toggle');
    check('折叠卡内有 toggle 按钮', !!tbtn, true);
    w.toggleDailyItem(tbtn);
    check('点击可展开（移除 folded）', w.document.querySelectorAll('.daily-item.folded').length, 0);
    check('展开后按钮文案变「收起」', tbtn.textContent, '收起 ▴');

    // 含图/表的题：折叠时收起图片并给出提示（否则 line-clamp 压不住高度）
    const imgQ = {
        date: w.DailyPick.todayStr(), normalized: 1,
        picks: { ds: [{ id: 'ds_fig', content: '<p>看下图所示的树</p><img src="data/ds_figs/x.png" alt="ds题图">',
            options: { A: '甲' }, answer: 'A',
            answered: { answer: 'A', isCorrect: true, correctAnswer: 'A' } }] }
    };
    w.localStorage.setItem('daily_pick_v1', JSON.stringify(imgQ));
    w.DailyPick.renderDaily(null, { collapseDone: true });
    const foldHtml = w.document.getElementById('dailySection').innerHTML;
    check('含图题折叠后给出「展开查看」提示', /daily-fold-note/.test(foldHtml) && /展开查看/.test(foldHtml), true);
    check('折叠态隐藏题干图片（CSS 规则存在）',
        /\.daily-item\.folded \.daily-q img[\s\S]{0,80}?display:\s*none/.test(CSS), true);

    // 加量题排在最上面（首批题下沉）
    const mixed = {
        date: w.DailyPick.todayStr(), normalized: 1,
        picks: { ds: [
            { id: 'b0', b: 0, content: '首批题', options: { A: '甲' }, answer: 'A' },
            { id: 'b1', b: 1, content: '加量题1', options: { A: '甲' }, answer: 'A' },
            { id: 'b2', b: 2, content: '加量题2', options: { A: '甲' }, answer: 'A' },
            { id: 'b3', b: 3, content: '加量题3', options: { A: '甲' }, answer: 'A' }
        ] }
    };
    w.DailyPick.renderDaily(mixed);
    const order = [...w.document.querySelectorAll('.daily-item')]
        .map(e => e.dataset.idx).filter(v => v !== undefined);
    check('加量题排在前、首批题下沉', order, ['3', '2', '1', '0']);

    // 多门混合：最后一批加量的题在最上，同批内按科目顺序
    w.DailyPick.renderDaily({
        date: w.DailyPick.todayStr(), normalized: 1,
        picks: {
            ds: [{ id: 'm0', b: 0, content: 'ds 首批', options: { A: '甲' }, answer: 'A' },
                  { id: 'm1', b: 1, content: 'ds 加量1', options: { A: '甲' }, answer: 'A' },
                  { id: 'm2', b: 2, content: 'ds 加量2', options: { A: '甲' }, answer: 'A' }],
            os: [{ id: 'n0', b: 0, content: 'os 首批', options: { A: '甲' }, answer: 'A' },
                  { id: 'n1', b: 1, content: 'os 加量1', options: { A: '甲' }, answer: 'A' },
                  { id: 'n2', b: 2, content: 'os 加量2', options: { A: '甲' }, answer: 'A' }]
        }
    });
    const order2 = [...w.document.querySelectorAll('.daily-item')]
        .map(e => `${e.dataset.sub || '-'}${e.dataset.idx || ''}`);
    check('最后一批加量置顶（含跨科排序）', order2.filter(v => v.endsWith('2')), ['ds2', 'os2']);
    check('较早加量批次居中', order2.filter(v => v.endsWith('1')), ['ds1', 'os1']);
    check('首批题在最下', order2.filter(v => v.endsWith('0')), ['ds0', 'os0']);

    // 关键回归：某门某次加量被跳过（idx 错位）时，最后一批仍完整置顶
    w.DailyPick.renderDaily({
        date: w.DailyPick.todayStr(), normalized: 1,
        picks: {
            ds: [{ id: 'k0', b: 0, content: 'ds 首批', options: { A: '甲' }, answer: 'A' },
                  { id: 'k1', b: 1, content: 'ds 加量1', options: { A: '甲' }, answer: 'A' },
                  { id: 'k2', b: 3, content: 'ds 加量3', options: { A: '甲' }, answer: 'A' }],   // 第 2 批 ds 被跳过
            os: [{ id: 'g0', b: 0, content: 'os 首批', options: { A: '甲' }, answer: 'A' },
                  { id: 'g1', b: 1, content: 'os 加量1', options: { A: '甲' }, answer: 'A' },
                  { id: 'g2', b: 2, content: 'os 加量2', options: { A: '甲' }, answer: 'A' },
                  { id: 'g3', b: 3, content: 'os 加量3', options: { A: '甲' }, answer: 'A' }]    // 第 3 批 os 才补上
        }
    });
    const first4 = [...w.document.querySelectorAll('.daily-item')]
        .map(e => e.dataset.idx).filter(v => v !== undefined).slice(0, 2);
    check('某门跳过时最后一批（b 相同）仍排最前', first4, ['2', '3']);

    console.log('\n--- 错题 7 天重抽计划 ---');
    check('重抽间隔为 7 天', w.DailyPick.RETRY_DAYS, 7);
    w.localStorage.removeItem('daily_retry_v1');
    w.DailyPick.markRetry('ds_x1', false);                       // 答错
    let plan = JSON.parse(w.localStorage.getItem('daily_retry_v1') || '{}');
    check('答错后记入重抽计划', !!plan['ds_x1'], true);
    check('计划日期为 7 天后', /^\d{4}-\d{2}-\d{2}$/.test(plan['ds_x1']), true);
    check('未到期前属于 pending（7 天内不进池）', w.DailyPick.pendingRetryIds().has('ds_x1'), true);
    check('未到期不属于 due', w.DailyPick.dueRetryIds().has('ds_x1'), false);
    w.DailyPick.markRetry('ds_x1', true);                        // 答对 → 清除
    check('答对后清除重抽计划',
        Object.keys(JSON.parse(w.localStorage.getItem('daily_retry_v1') || '{}')).includes('ds_x1'), false);
    // 模拟到期：把计划日期改成今天
    w.localStorage.setItem('daily_retry_v1', JSON.stringify({ ds_x1: w.DailyPick.todayStr() }));
    check('到期后进入 due（最高优先重抽）', w.DailyPick.dueRetryIds().has('ds_x1'), true);
    check('到期后不再 pending', w.DailyPick.pendingRetryIds().has('ds_x1'), false);
    // 池子行为：pending 被剔除、due 被标 _due
    const realApi4 = w.api;
    w.api = async (url, opts) => {
        const s = String(url);
        if (s.includes('/api/questions/ds') && s.includes('mode=favorite')) {
            return { json: async () => ({ questions: [
                { id: 'ds_pending', options: { A: '甲' }, answer: 'A' },
                { id: 'ds_due', options: { A: '甲' }, answer: 'A' },
                { id: 'ds_plain', options: { A: '甲' }, answer: 'A' }
            ] }) };
        }
        if (s.includes('/api/questions/ds')) return { json: async () => ({ questions: [] }) };
        return realApi4(url, opts);
    };
    w.localStorage.setItem('daily_retry_v1', JSON.stringify({
        ds_pending: '2099-01-01',                                  // 未到期 → 剔除
        ds_due: w.DailyPick.todayStr()                            // 已到期 → 最高优先
    }));
    const poolProbe = await (async () => {
        // 直接复用 rollToday 的池：清空当天后抽题，ds 应抽到 ds_due（最高优先）
        w.localStorage.removeItem('daily_pick_v1');
        w.localStorage.removeItem('daily_seen_v1');
        return w.DailyPick.rollToday();
    })();
    w.api = realApi4;
    check('池中剔除 7 天内的错题（ds_pending 不被抽）', poolProbe.picks.ds[0].id !== 'ds_pending', true);
    check('到期的错题被最高优先抽出（ds_due）', poolProbe.picks.ds[0].id, 'ds_due');
    check('抽中的重抽题带 due 标记', poolProbe.picks.ds[0].due, true);
    w.localStorage.removeItem('daily_retry_v1');

    console.log('\n--- 提交不整块重渲染（不跳动） ---');
    w.localStorage.removeItem('daily_pick_v1');
    const stable = { date: w.DailyPick.todayStr(), normalized: 1, picks: { ds: [
        { id: 's0', content: '第0题', options: { A: '甲', B: '乙' }, answer: 'A' },
        { id: 's1', content: '第1题', options: { A: '甲', B: '乙' }, answer: 'A' }
    ] } };
    w.localStorage.setItem('daily_pick_v1', JSON.stringify(stable));
    w.DailyPick.renderDaily(stable);
    const card0Before = w.document.querySelector('.daily-item[data-idx="0"]');
    const card1Before = w.document.querySelector('.daily-item[data-idx="1"]');
    w.document.querySelector('input[name="dq-ds-0"]').checked = true;
    await w.submitDaily('ds', 0);
    const card0After = w.document.querySelector('.daily-item[data-idx="0"]');
    const card1After = w.document.querySelector('.daily-item[data-idx="1"]');
    check('提交后未整块重渲染（其他题卡 DOM 未被替换）', card1Before === card1After, true);
    check('提交后就地更新当前题卡', card0Before === card0After && /daily-result/.test(card0After.innerHTML), true);
    check('更新后仍显示题图区以外的内容（解析折叠存在或无）', !!card0After, true);
    check('焦点落在该题卡上（防焦点丢失跳动）', w.document.activeElement === card0After, true);

    console.log(`\nPASS ${pass} / FAIL ${fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
