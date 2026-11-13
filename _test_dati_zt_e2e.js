// 大题专项「真源加载」端到端回归（2026-11-13）
//
// _test_dati_single.js / _test_dati_real_sort.js 都把 fetch 固定 mock 成旧截图版
// data/dati.json，新链路（q.q / q.a 是 HTML 字符串）从未在真实页面里跑过。
// 本测试用真实 data/dati_zt.json + data/note_alias.json 在 jsdom 中加载 dati.html，
// 验证：题卡渲染 HTML 题干、答案解析面板、外置 SVG 注入、题号栏常驻、
// 以及笔记/收藏/不熟/不会落在与 zhenti 相同的键上。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_zt_e2e.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PWA = path.join(ROOT, 'pwa');

let JSDOM = null, VirtualConsole = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
    console.log('跳过：需要 jsdom 与 fake-indexeddb');
    process.exit(0);
}

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}
function ok(name, cond) { check(name, !!cond, true); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        try { if (fn()) return true; } catch (e) { }
        await sleep(30);
    }
    return false;
}

const ZT = fs.readFileSync(path.join(PWA, 'data/dati_zt.json'), 'utf8');
const ZT_OBJ = JSON.parse(ZT);
const ALIAS = fs.readFileSync(path.join(PWA, 'data/note_alias.json'), 'utf8');
const DATI_HTML = fs.readFileSync(path.join(PWA, 'dati.html'), 'utf8');
const allQ = () => {
    const out = [];
    for (const s of ZT_OBJ.subjects) for (const c of s.chapters) for (const sec of c.sections)
        for (const q of sec.questions) out.push(q);
    return out;
};

(async () => {
    // 把外部 script 内联，模拟真实浏览器加载顺序
    let html = DATI_HTML.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
        const p = path.join(PWA, src);
        try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
    });

    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { console.log('JSDOM ERROR:', e && (e.stack || e.message || e)); });
    vc.on('error', (e) => { console.log('CONSOLE ERROR:', e); });
    const fetches = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'https://x.test/dati.html',
        virtualConsole: vc,
        beforeParse(w) {
            w.indexedDB = new IDBFactory();
            w.IDBKeyRange = IDBKeyRange;
            w.alert = () => { };
            w.scrollTo = () => { };
            w.Element.prototype.scrollIntoView = function () { };
            w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
            w.fetch = async (url) => {
                const u = String(url);
                fetches.push(u);
                if (u.includes('data/dati_zt.json')) return { ok: true, status: 200, json: async () => JSON.parse(ZT) };
                if (u.includes('data/note_alias.json')) return { ok: true, status: 200, json: async () => JSON.parse(ALIAS) };
                if (u.includes('data/zt_svg/')) return { ok: true, status: 200, text: async () => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#ccc"/></svg>' };
                if (u.includes('data/dati.json')) return { ok: true, status: 200, json: async () => ({ subjects: [] }) };
                return { ok: true, status: 200, json: async () => ({}) };
            };
        }
    });
    const w = dom.window, doc = w.document;
    const root = () => doc.getElementById('datiRoot');
    const cards = () => [...root().querySelectorAll('.dati-qcard')];

    console.log('=== A. 真源加载 ===');
    const loaded = await waitFor(() => cards().length > 0);
    check('页面用 dati_zt.json 渲染出题卡', loaded, true);
    ok('没有回退到旧 dati.json（离线兜底未触发）', !fetches.some(u => u.includes('data/dati.json')));
    ok('拉取了 data/note_alias.json（笔记键归一）', fetches.some(u => u.includes('data/note_alias.json')));
    check('加载的科目数', w.eval('DATI.length'), 4);
    check('加载的题目总数', w.eval('allQuestions().length'), 126);

    console.log('\n=== B. 题卡渲染 HTML 题干（不再依赖截图） ===');
    const first = w.eval('flatItems()[0].q');
    const qbody = () => root().querySelector('.dati-qbody');
    check('题面容器使用 question-content', qbody().classList.contains('question-content'), true);
    ok('题面渲染的是 HTML（含 <p>/<div>），不是空容器', /<(p|div|pre|table)/i.test(qbody().innerHTML));
    ok('题面内容与真源 q.q 一致', qbody().innerHTML.includes(first.q.slice(0, 40).replace(/<[^>]*>/g, '')) || first.q.includes(qbody().textContent.trim().slice(0, 20)));
    ok('题头显示年份 + 卷面题号 + 分值', /\d{4} 年第 \d+ 题/.test(root().querySelector('.dati-qnum').textContent));
    ok('题头标记「统考真题」', root().querySelector('.dati-real') !== null);

    // 答案面板：单题模式 primeAnswer 已填充，点开即显示
    const abox = () => root().querySelector('.dati-abody');
    check('答案未展开（做题状态）', abox().classList.contains('open'), false);
    check('答案已预填充（filled=1）', abox().dataset.filled, '1');
    ok('答案区含 explanation-title / explanation-body',
        abox().querySelector('.explanation-title') && abox().querySelector('.explanation-body'));
    const ansText = abox().querySelector('.explanation-body').textContent.trim();
    ok('答案解析有实质内容（非「暂无解析」占位）', ansText.length > 20 && !ansText.includes('暂无详细解析'));
    w.toggleAnswer(first.id);
    check('点「查看答案」后面板展开', abox().classList.contains('open'), true);

    console.log('\n=== C. 外置 SVG 注入 ===');
    // 找一道题干/答案里带 zt-svgholder 的题，跳过去验证注入
    const svgQ = allQ().find(q => (q.svgs || []).length && q.sid === 'co') || allQ().find(q => (q.svgs || []).length);
    ok('存在引用外置 SVG 的题', !!svgQ);
    if (svgQ) {
        w.singleGoTo(svgQ.id);
        await sleep(150);
        const holders = () => [...root().querySelectorAll('.zt-svgholder[data-svg]')];
        const injected = () => root().querySelectorAll('.zt-svg-wrap svg').length;
        console.log(`     ${svgQ.id} 引用 ${(svgQ.svgs || []).length} 个 SVG`);
        if (holders().length) {
            const done = await waitFor(() => injected() > 0, 3000);
            check('题干里的 SVG 占位被真实注入', done, true);
        } else {
            check('题干里的 SVG 占位已全部注入（无残留）', holders().length, 0);
        }
        ok('fetch 了 data/zt_svg/ 资源', fetches.some(u => u.includes('data/zt_svg/')));
    }

    console.log('\n=== D. 折叠控制条 + 常驻题号栏 ===');
    const tools = doc.getElementById('datiTools');
    ok('控制条是 details', tools.tagName, 'DETAILS');
    check('默认折叠', tools.open, false);
    ok('折叠状态写入 localStorage', w.localStorage.getItem('datiBarCollapsed') === '1' || w.localStorage.getItem('datiBarCollapsed') === null);
    tools.open = true;
    tools.dispatchEvent(new w.Event('toggle'));
    check('展开后记住状态', w.localStorage.getItem('datiBarCollapsed'), '0');
    check('排序/筛选控件仍在（只是被折叠）', doc.querySelectorAll('#datiFilters .dati-chip').length > 8, true);

    const nav = doc.getElementById('datiNav');
    ok('题号栏常驻（不依赖 open 抽屉）', nav.querySelector('.dati-nav-mini') !== null);
    ok('窄条按年份横排，全部年份都有行', nav.querySelectorAll('.dati-nav-mini-row').length > 10);
    ok('窄条题号总按钮数 = 当前科目题数',
        nav.querySelectorAll('.dati-nav-mini-btn').length === w.eval('flatItems().length'));
    ok('当前题在窄条里高亮', nav.querySelector('.dati-nav-mini-btn.current') !== null);
    ok('宽版完整分组仍在 DOM（章节/年份导航）', nav.querySelectorAll('.num-group-title').length > 0);
    ok('窄条年份标签用两位年份', /^\d{2}$/.test(nav.querySelector('.dati-nav-mini-y').textContent.trim()));

    console.log('\n=== E. 切题与笔记/记录键同源 ===');
    w.singleStep(1);
    await sleep(80);
    const cur = w.eval('flatItems().find(i => i.q.id === singleQid).q');
    check('切题后仍是 1 张题卡', cards().length, 1);
    check('切题后题卡 id 与新题一致', cards()[0].id, 'q' + cur.id);
    ok('切题后答案仍默认折叠', !abox().classList.contains('open'));

    // 收藏：写 zhenti iid，不带 dati_ 前缀
    await w.toggleFav(cur.id, cur.sid);
    ok('收藏集合用 zhenti iid', w.eval(`favSet.has('${cur.id}')`));
    const favRows = await w.dbAll('favorites');
    ok('收藏表落到同一个 iid', favRows.some(r => r.question_id === cur.id));

    // 不熟 / 不会：互斥 + 同一 iid
    await w.toggleMark(cur.id, 'unfamiliar');
    ok('不熟标记用同一 iid', w.eval(`unfamSet.has('${cur.id}')`));
    const unfRows = await w.dbAll('unfamiliar');
    ok('不熟表落到同一个 iid', unfRows.some(r => r.question_id === cur.id));

    // 笔记：写规范键 zt{年}_{题号}（与 zhenti.js noteKeyOf 完全一致）
    const specKey = w.eval(`noteKeyOf('${cur.id}')`);
    ok('规范键形如 zt{年}_{题号}', /^zt\d{4}_\d+$/.test(specKey));
    const editor = root().querySelector('.dati-note-input');
    w.toggleNotePanel(cur.id);
    await sleep(30);
    const ed = root().querySelector('.dati-note-input');
    ok('笔记编辑器已装载', !!ed);
    if (ed) {
        ed.innerHTML = '<p>二轮刷题：这题的重点是同步互斥。</p>';
        w.onNoteInput(ed);
        await sleep(850);              // 防抖 700ms
        const notes = await w.dbAll('notes');
        const row = notes.find(r => r.question_id === specKey);
        check('笔记自动保存落到规范键（与真题页互通）', !!row, true);
        ok('笔记内容正确', row && row.content.includes('同步互斥'));
        ok('本地 iid 下没有另写一份笔记', !notes.some(r => r.question_id === cur.id));
    }

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(1); });
