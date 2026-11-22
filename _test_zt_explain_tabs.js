// 真题页 CO2024-44 图片解析分页回归（与大题专项页共用 explain_inline.js）
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_explain_tabs.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
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

let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
    console.log('跳过：需要 jsdom 与 fake-indexeddb');
    process.exit(0);
}

const cache = {};
const readFile = f => {
    if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    return cache[f];
};

(async () => {
    const html = readFile('zhenti.html')
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
            try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
        })
        .replace(/<link\b[^>]*>/gi, '');
    const vc = new VC();
    vc.on('jsdomError', e => console.log('JSDOM ERROR:', e && (e.stack || e.message || e)));
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'http://localhost/zhenti.html', virtualConsole: vc,
        beforeParse(w) {
            w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
            w.alert = () => { }; w.confirm = () => true;
            w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
            w.Element.prototype.scrollIntoView = function () { };
            w.scrollTo = () => { }; w.scrollBy = () => { };
            w.requestAnimationFrame = cb => setTimeout(cb, 0);
            Object.defineProperty(w, 'innerHeight', { value: 768, configurable: true });
            w.fetch = async u => {
                const m = String(u).match(/data\/[\w./-]+\.(json|svg)/);
                if (m) {
                    try {
                        const t = readFile(m[0]);
                        return { ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) };
                    } catch (e) { return { ok: false, status: 404, text: async () => '', json: async () => ({}) }; }
                }
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            };
        }
    });
    const w = dom.window, doc = w.document;
    ok('页面加载出年份列表', await waitFor(() => doc.querySelectorAll('#yearList .ol-nav-item').length > 0));

    w.switchYear(2024);
    ok('切到 2024 卷并渲染出 CO44', await waitFor(() => !!doc.getElementById('card-co_zt2024_44')));
    w.toggleAns('co_zt2024_44');
    const card = () => doc.getElementById('card-co_zt2024_44');
    const panel = () => card().querySelector('.explanation-panel');
    ok('答案面板已就地展开', await waitFor(() => !!panel()));

    const tabs = () => [...panel().querySelectorAll('.explain-switch-btn')];
    const pane = k => panel().querySelector(`[data-explain-pane="${k}"]`);
    check('分段控件两项', tabs().map(b => b.textContent), ['文字解析', '图片解析']);
    check('默认图片页高亮', tabs().map(b => b.classList.contains('active')), [false, true]);
    check('默认隐藏文字页显示图片页', [pane('text').hidden, pane('fig').hidden], [true, false]);
    check('图片页含 3 张图解', pane('fig').querySelectorAll('img.fig-img').length, 3);
    ok('文字页保留真题原解析', pane('text').textContent.trim().length > 20);

    w.switchExplainPane('co_zt2024_44', 'text');
    check('切文字后高亮', tabs().map(b => b.classList.contains('active')), [true, false]);
    check('切文字后显隐', [pane('text').hidden, pane('fig').hidden], [false, true]);
    check('选择已记忆', w.localStorage.getItem('explainTab_co_zt2024_44'), 'text');

    w.switchExplainPane('co_zt2024_44', 'fig');
    check('切回图片后高亮', tabs().map(b => b.classList.contains('active')), [false, true]);
    check('切回图片后显隐', [pane('text').hidden, pane('fig').hidden], [true, false]);
    ok('真题卡节点未被整卡重绘', !!doc.getElementById('card-co_zt2024_44'));

    console.log(`\n通过 ${pass} / ${pass + fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
