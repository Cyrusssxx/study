// CO2024-44 图片解析分页回归：胶囊切换 + 默认图片页 + 记忆选择
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_explain_tabs.js
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
    while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await sleep(30); }
    return false;
}

const ZT = fs.readFileSync(path.join(PWA, 'data/dati_zt.json'), 'utf8');
const ALIAS = fs.readFileSync(path.join(PWA, 'data/note_alias.json'), 'utf8');
const HTML = fs.readFileSync(path.join(PWA, 'dati.html'), 'utf8');

(async () => {
    const domHTML = HTML.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
        const p = path.join(PWA, src);
        try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
    });
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => console.log('JSDOM ERROR:', e && (e.stack || e.message || e)));
    const dom = new JSDOM(domHTML, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://x.test/dati.html', virtualConsole: vc,
        beforeParse(w) {
            w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
            w.alert = () => { }; w.scrollTo = () => { };
            w.Element.prototype.scrollIntoView = function () { };
            w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
            w.fetch = async u => {
                const url = String(u);
                if (url.includes('data/dati_zt.json')) return { ok: true, json: async () => JSON.parse(ZT) };
                if (url.includes('data/note_alias.json')) return { ok: true, json: async () => JSON.parse(ALIAS) };
                return { ok: true, json: async () => ({}) };
            };
        }
    });
    const w = dom.window, doc = w.document;
    ok('加载出题目', await waitFor(() => doc.querySelectorAll('.dati-qcard').length > 0));

    w.singleGoTo('co_zt2024_44');
    ok('CO44 答案区已填充', await waitFor(() => {
        const box = doc.querySelector('.dati-abody[data-ans="co_zt2024_44"]');
        return box && box.dataset.filled === '1';
    }));
    const box = () => doc.querySelector('.dati-abody[data-ans="co_zt2024_44"]');
    const tabs = () => [...box().querySelectorAll('.explain-switch-btn')];
    const pane = k => box().querySelector(`[data-explain-pane="${k}"]`);

    check('分段控件两项', tabs().map(b => b.textContent), ['文字解析', '图片解析']);
    check('默认图片页高亮', tabs().map(b => b.classList.contains('active')), [false, true]);
    check('默认隐藏文字页显示图片页', [pane('text').hidden, pane('fig').hidden], [true, false]);
    check('图片页含 3 张图解', pane('fig').querySelectorAll('img.fig-img').length, 3);
    ok('文字页仍有解析正文', pane('text').textContent.trim().length > 20);

    w.switchExplainPane('co_zt2024_44', 'text');
    check('切文字后高亮', tabs().map(b => b.classList.contains('active')), [true, false]);
    check('切文字后显隐', [pane('text').hidden, pane('fig').hidden], [false, true]);
    check('选择已记忆', w.localStorage.getItem('explainTab_co_zt2024_44'), 'text');

    w.switchExplainPane('co_zt2024_44', 'fig');
    check('切回图片后高亮', tabs().map(b => b.classList.contains('active')), [false, true]);
    check('切回图片后显隐', [pane('text').hidden, pane('fig').hidden], [true, false]);

    console.log(`\n通过 ${pass} / ${pass + fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
