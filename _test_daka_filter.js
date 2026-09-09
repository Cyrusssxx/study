// 打卡表分类筛选回归测试
// 提取 daka.html 内联脚本中的筛选函数, 用真实 ds_daka.json 验证四维筛选。
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="dakaSummary"></div>
  <div id="dakaFilterModule"></div><div id="dakaFilterSheet"></div>
  <div id="dakaFilterDone"></div><div id="dakaFilterPriority"></div>
  <div id="dakaNav"></div><div id="dakaList"></div>
</body></html>`, { url: 'http://localhost/daka.html' });
const { window } = dom;
const document = window.document;

const html = fs.readFileSync('pwa/daka.html', 'utf-8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const main = scripts.find(s => s.includes('function renderDaka')) || scripts.join('\n');


// 仅替换字符串外出现的裸标识符(避开 'x' "x" \`x\`)
function windowifyIdentifiers(code) {
    const names = ['dakaQuestions', 'dakaProgress', 'dakaGroups', 'dakaFilter', 'localStorage'];
    let out = '';
    let i = 0;
    while (i < code.length) {
        const ch = code[i];
        if (ch === '\'' || ch === '"' || ch === '`') {
            let j = i + 1;
            while (j < code.length && code[j] !== ch) {
                if (code[j] === '\\') j++;
                j++;
            }
            out += code.slice(i, j + 1);
            i = j + 1;
            continue;
        }
        if (ch === '/' && code[i + 1] === '/') {   // 行注释
            let j = code.indexOf('\n', i);
            if (j < 0) j = code.length;
            out += code.slice(i, j);
            i = j;
            continue;
        }
        // 词边界匹配
        let hit = false;
        for (const n of names) {
            const prevOK = i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1]);
            const nextOK = i + n.length < code.length && !/[A-Za-z0-9_$]/.test(code[i + n.length]);
            const here = code.startsWith(n, i);
            if (here && prevOK && nextOK) {
                out += 'window.' + n;
                i += n.length;
                hit = true;
                break;
            }
        }
        if (!hit) { out += ch; i++; }
    }
    return out;
}

// ---- 函数提取 ----
function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\}');
  const m = src.match(re);
  if (!m) { console.log('  !! 未找到函数 ' + name); return ''; }
  return m[0] + '\n';
}

// ---- 完全用 window 全局(与浏览器一致) ----
const storage = {};   // 闭包模拟 localStorage
// jsdom 的 window.localStorage 是只读 getter,须用 defineProperty 覆盖
try { Object.defineProperty(window, 'localStorage', { value: {
  _s: storage,
  getItem(k){ return storage[k] ?? null; },
  setItem(k,v){ storage[k] = String(v); }
}, configurable: true }); } catch (e) { console.log('localStorage redefine warn:', e.message); }
const sandbox = `
window._seen = [];
window.setDakaFilter = function(dim,val){ window.dakaFilter[dim]=val; window._seen.push(dim+':'+val); window.localStorage.setItem('daka_filter_'+dim, val); window.renderFilters(false); window.renderDaka(); };
window.dakaQuestions = []; window.dakaProgress = {}; window.dakaGroups = [];
window.dakaNavCollapsed = false;
window.dakaFilter = { module: '全部', sheet: '全部', priority: '全部', done: '全部' };
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
`;
let code = sandbox;
for (const n of ['dakaModules', 'filteredDaka', 'renderFilters', 'restoreDakaFilter']) {
    let fn = extractFn(main, n);
    // 函数体裸标识符 → window. 前缀(与浏览器全局一致;注意 dakaModules 的形参 qs 不受影响)
    // 只替换"裸标识符"出现(不在字符串/注释内): 用字符扫描避开单双引号与反引号
    fn = windowifyIdentifiers(fn);
    fn = fn.replace(/esc\(/g, 'esc(');   // esc 保留(已在沙箱定义)
    code += fn;
}
// 函数声明在 new Function 作用域内,显式挂到 window
code += `
window.dakaModules = dakaModules;
window.filteredDaka = filteredDaka;
window.renderFilters = renderFilters;
window.restoreDakaFilter = restoreDakaFilter;
window.renderDaka = function(){ window._lastList = window.filteredDaka(); };
`;

const S = new Function('window', 'document', 'storage', code);
S(window, document, storage);

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

// ============ 数据 ============
const data = JSON.parse(fs.readFileSync('pwa/data/ds_daka.json', 'utf-8'));
window.dakaQuestions = data.questions;
window.dakaProgress = { 'ds_daka_6_4_6_8': true, 'ds_daka_7_5_5_6': true };

// 1) module 分类
const mods = window.dakaModules(window.dakaQuestions);
assert(mods.length >= 5, `module 分类数 ${mods.length}: ${mods.join(' | ')}`);
assert(mods.includes('真题训练'), '含 真题训练');
assert(mods.some(m => m.includes('链表')), '含 链表模块');

// 2) 默认全部
window.renderDaka();
assert(window._lastList.length === 62, `默认全部 62 题, 实际 ${window._lastList.length}`);

// 3) 模块筛选: 链表
window.setDakaFilter('module', mods.find(m => m.includes('链表')));
assert(window._lastList.length === 18, `链表 18 题, 实际 ${window._lastList.length}`);
assert(window._lastList.every(q => q.module.includes('链表')), '全部命中链表模块');

// 4) 题型筛选: 应用题
window.setDakaFilter('module', '全部');
window.setDakaFilter('sheet', '应用题');
assert(window._lastList.length === 16, `应用题 16 题, 实际 ${window._lastList.length}`);

// 5) 优先级: 必做
window.setDakaFilter('sheet', '全部');
window.setDakaFilter('priority', '必做');
assert(window._lastList.length === 34, `必做 34 题, 实际 ${window._lastList.length}`);

// 6) 完成状态: 已完成
window.setDakaFilter('priority', '全部');
window.setDakaFilter('done', '已完成');
assert(window._lastList.length === 2, `已完成 2 题, 实际 ${window._lastList.length}`);

// 7) 多维组合: 必做 + 未完成
window.setDakaFilter('done', '未完成');
window.setDakaFilter('priority', '必做');
const expectCombo = window.dakaQuestions.filter(q => q.priority_label === '必做' && !window.dakaProgress[q.id]).length;
assert(window._lastList.length === expectCombo, `必做+未完成 ${expectCombo} 题, 实际 ${window._lastList.length}`);

// 8) localStorage 持久化 + 还原
window.setDakaFilter('sheet', '应用题');
assert(storage['daka_filter_sheet'] === '应用题', 'localStorage 持久化 dim=sheet');
window.dakaFilter = { module: '全部', sheet: '全部', priority: '全部', done: '全部' };
window.restoreDakaFilter();
assert(window.dakaFilter.sheet === '应用题', 'restoreDakaFilter 恢复 sheet=应用题');

// 9) chip 渲染数量
window.dakaFilter = { module: '全部', sheet: '全部', priority: '全部', done: '全部' };
window.renderFilters(true);
const cM = document.getElementById('dakaFilterModule').querySelectorAll('.review-chip').length;
const cS = document.getElementById('dakaFilterSheet').querySelectorAll('.review-chip').length;
const cD = document.getElementById('dakaFilterDone').querySelectorAll('.review-chip').length;
const cP = document.getElementById('dakaFilterPriority').querySelectorAll('.review-chip').length;
assert(cM === mods.length, `module chips=${cM} 期望 ${mods.length}`);
assert(cS === 3, `sheet chips=${cS} 期望 3`);
assert(cD === 3, `done chips=${cD} 期望 3`);
assert(cP === 6, `priority chips=${cP} 期望 6`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);