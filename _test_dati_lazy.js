// dati.html 大题专项：章节级懒加载 + 未练筛选 + 已练标记 + 上次位置 回归测试
// 从 dati.html 提取真实函数(questionCard/passFilter/toggleDone/activateChapterImgs 等)在 jsdom 中执行。
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="cntAll"></div><div id="cntReal"></div><div id="cntFav"></div><div id="cntTodo"></div>
</body></html>`, { url: 'https://x.test/dati.html' });
const { window } = dom;
const document = window.document;

// ---- localStorage 覆盖(jsdom 只读 getter,必须 defineProperty) ----
const storage = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem(k) { return storage[k] ?? null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; }
  }, configurable: true
});

// ---- 沙箱全局(与浏览器一致) ----
const sandbox = `
window.doneSet = new Set();
window.ansTpl = {};
window.noteMap = {};
window.noteOpen = new Set();
window.favSet = new Set();
window.DATI = null;
window.filter = 'all';
window.year = '';
window.openChapters = new Set();
window.lastSeenQ = '';
window.activeSubject = 'os';
window.saveDoneSet = function(){ window.localStorage.setItem('datiDone', JSON.stringify([...window.doneSet])); };
window.updateCounts = function(){};
window.render = function(){};
window.qimg = (key, fn) => \`<img data-src="data/dati_figs/\${key}/\${fn}" loading="lazy" alt="大题截图">\`;
window.aimg = (key, fn) => \`<img src="data/dati_figs/\${key}/\${fn}" loading="lazy" alt="大题答案">\`;
`;

// ---- 从 dati.html 提取真实函数 ----
const html = fs.readFileSync('pwa/dati.html', 'utf-8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const main = scripts.find(s => s.includes('function questionCard'));

function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\}');
  const m = src.match(re);
  if (!m) throw new Error('提取失败: ' + name);
  return m[0] + '\n';
}

// 仅替换字符串/注释外的裸标识符 → window. 前缀
// 模板字符串：字面部分不动，${...} 插值区是 JS 代码 → 递归 windowify（避免漏掉 ${q.year}/${fn => qimg(...)}）
function windowifyIdentifiers(code, names_) {
  const names = names_ || ['doneSet', 'lastSeenQ', 'openChapters', 'ansTpl', 'noteMap', 'noteOpen',
    'favSet', 'DATI', 'filter', 'year', 'saveDoneSet', 'localStorage', 'qimg', 'aimg', 'activeSubject'];

  function matchName(at) {
    for (const nm of names) {
      if (at + nm.length <= code.length && code.slice(at, at + nm.length) === nm) {
        const prev = at === 0 ? '' : code[at - 1];
        const next = at + nm.length < code.length ? code[at + nm.length] : '';
        // 裸标识符：前后非字母数字_$，且前一个字符不能是 .(属性访问 q.year) 
        if (prev !== '.' && !/[A-Za-z0-9_$]/.test(prev) && !/[A-Za-z0-9_$]/.test(next)) return nm;
      }
    }
    return null;
  }

  // 从 at(开反引号后) 找插值/闭合，返回处理后的 out 增量与终止位置
  // 返回 {out, next}：next 为处理完整个模板字符串后的位置
  function skipTemplate(at, depth) {
    let j = at + 1;
    let seg = code.slice(at, at + 1);          // 开反引号
    while (j < code.length) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '$' && code[j + 1] === '{') {
        seg += code.slice(at + 1, j);          // 字面部分
        const close = findBrace(j + 2);
        if (close < 0) break;
        seg += '${' + windowifyIdentifiers(code.slice(j + 2, close), names) + '}';
        j = close + 1;
        if (!(j < code.length)) { j--; break; }
        // 继续扫本模板的剩余部分：把 at 前移到 j，保持 seg 累积
        // 简化：递归处理剩余模板段
        const rest = skipTemplateAt(j, depth);
        seg += rest.out;
        j = rest.next;
        return { out: seg, next: j };
      }
      if (c === '`') {
        seg += code.slice(at + 1, j) + '`';
        return { out: seg, next: j + 1 };
      }
      j++;
    }
    seg += code.slice(at + 1);
    return { out: seg, next: code.length };
  }

  // 从 pos(模板中间某处，已非开反引号) 继续扫描到闭合反引号
  function skipTemplateAt(pos, depth) {
    let j = pos;
    let seg = '';
    while (j < code.length) {
      const c = code[j];
      if (c === '\\') { seg += code.slice(pos, j); seg += code.slice(j, j + 2); j += 2; pos = j; continue; }
      if (c === '$' && code[j + 1] === '{') {
        seg += code.slice(pos, j);
        const close = findBrace(j + 2);
        seg += close < 0 ? code.slice(j) : '${' + windowifyIdentifiers(code.slice(j + 2, close), names) + '}';
        if (close < 0) return { out: seg, next: code.length };
        j = close + 1; pos = j;
        continue;
      }
      if (c === '`') {
        seg += code.slice(pos, j) + '`';
        return { out: seg, next: j + 1 };
      }
      j++;
    }
    seg += code.slice(pos);
    return { out: seg, next: code.length };
  }

  // 从 start 找配对的 }（处理嵌套 {}、字符串、模板字符串）
  function findBrace(start) {
    let depth = 0;
    for (let k = start; k < code.length; k++) {
      const c = code[k];
      if (c === '\\') { k++; continue; }
      if (c === "'" || c === '"') {
        const q = c; k++;
        while (k < code.length && code[k] !== q) { if (code[k] === '\\') k++; k++; }
        continue;
      }
      if (c === '`') {
        const r = skipTemplateAt(k, 0);
        k = r.next - 1;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        if (depth === 0) return k;
        depth--;
      }
    }
    return -1;
  }

  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      out += code.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '`') {
      const r = skipTemplate(i, 0);
      out += r.out; i = r.next; continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i); if (j < 0) j = code.length;
      out += code.slice(i, j); i = j; continue;
    }
    const nm = matchName(i);
    if (nm) { out += 'window.' + nm; i += nm.length; continue; }
    out += c; i++;
  }
  return out;
}

let code = sandbox;
for (const n of ['visibleQuestionsOf', 'passFilter', 'updateCounts', 'toggleDone', 'questionCard', 'activateChapterImgs']) {
  const fn = extractFn(main, n);
  code += windowifyIdentifiers(fn);
}
// new Function 内函数声明不外泄 → 显式挂到 window
code += `
window.visibleQuestionsOf = visibleQuestionsOf;
window.passFilter = passFilter;
window.updateCounts = updateCounts;
window.toggleDone = toggleDone;
window.questionCard = questionCard;
window.activateChapterImgs = activateChapterImgs;
`;

new Function('window', 'document', code)(window, document);

// ---- 断言 ----
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

// fixture：一个 os 科目 2 题
const sub = {
  key: 'os', name: '操作系统',
  chapters: [{ name: '第1章', sections: [{ name: '1.1', questions: [
    { id: 'dati_os_001', num: 1, q: ['q1.png'], a: ['a1.png'], real: true, year: 2018 },
    { id: 'dati_os_002', num: 2, q: ['q2a.png', 'q2b.png'], a: [], real: false }
  ] }] }]
};
window.DATI = [sub];

// 1) 题干图惰挂载：data-src 无 src(收起章节 0 请求)
{
  const card = window.questionCard('os', '1.1', sub.chapters[0].sections[0].questions[0], false);
  assert(card.includes('data-src="data/dati_figs/os/q1.png"'), '题干图用 data-src 惰挂载');
  const srcCount = (card.match(/<img src=/g) || []).length;
  assert(srcCount === 0, `题干卡片内无直接 <img src= (实际 ${srcCount})`);
}

// 2) 答案图保持正常 src（答案面板本身惰性,展开才注入）
{
  const firstQ = sub.chapters[0].sections[0].questions[0];
  const card = window.questionCard('os', '1.1', firstQ, false);
  assert(window.ansTpl[firstQ.id].includes('src="data/dati_figs/os/a1.png"'), '答案图模板带正常 src');
}

// 3) 已练按钮初始文案
{
  const q2 = sub.chapters[0].sections[0].questions[1];
  const card = window.questionCard('os', '1.1', q2, false);
  assert(card.includes('○ 未练') && card.includes(`onclick="toggleDone('${q2.id}')"`), '未练按钮文案与事件');
}

// 4) toggleDone：切换 + localStorage 持久化 + 已练标记写入
{
  const qid = 'dati_os_001';
  // 按钮 DOM（独立容器，不覆盖 cnt 元素）
  const btnHost = document.createElement('div');
  btnHost.innerHTML = `<button class="btn btn-secondary dati-done-btn" data-qid="${qid}">○ 未练</button>`;
  document.body.appendChild(btnHost);
  window.toggleDone(qid);   // 第一次 toggle → 已练
  assert(window.doneSet.has(qid), 'toggleDone 后 doneSet 含该题');
  assert(JSON.parse(storage['datiDone']).includes(qid), 'localStorage datiDone 已持久化');
  const btn = document.querySelector('.dati-done-btn');
  assert(btn.textContent === '✅ 已练' && btn.classList.contains('done'), '按钮文案与 done class 更新');
  window.toggleDone(qid);   // 第二次 toggle → 复原未练
  assert(!window.doneSet.has(qid), '再 toggle 复原为未练');
  assert(btn.textContent === '○ 未练', '按钮复原');
  btnHost.remove();
}

// 5) passFilter：todo 档只放行未练
{
  const q1 = sub.chapters[0].sections[0].questions[0];
  const q2 = sub.chapters[0].sections[0].questions[1];
  window.doneSet.clear(); window.favSet.clear();
  window.filter = 'todo';
  assert(window.passFilter(q1) === true, 'todo 下未练题通过');
  window.doneSet.add('dati_os_001');
  assert(window.passFilter(q1) === false, 'todo 下已练题被过滤');
  assert(window.passFilter(q2) === true, 'todo 下其它未练题仍通过');
  // 原行为不变
  window.filter = 'all'; assert(window.passFilter(q1) === true, 'all 档不变');
  window.filter = 'real'; assert(window.passFilter(q1) === true && window.passFilter(q2) === false, 'real 档不变(非真题过滤)');
  window.favSet.add('dati_os_002');
  window.filter = 'fav'; assert(window.passFilter(q2) === true && window.passFilter(q1) === false, 'fav 档不变');
  window.filter = 'all';
}

// 6) updateCounts 未练计数
{
  window.doneSet.clear();
  window.doneSet.add('dati_os_001');
  window.updateCounts();
  assert(document.getElementById('cntTodo').textContent === '1', '未练计数=1 (2题已练1)');
  assert(document.getElementById('cntAll').textContent === '2', '全部计数=2');
}

// 7) activateChapterImgs：data-src → src
{
  const d = document.createElement('details');
  d.innerHTML = `<img data-src="data/dati_figs/os/q2a.png"><img data-src="data/dati_figs/os/q2b.png">`;
  window.activateChapterImgs(d);
  const imgs = [...d.querySelectorAll('img')];
  const srcs = imgs.map(i => i.getAttribute('src'));
  assert(imgs.length === 2 && srcs.includes('data/dati_figs/os/q2a.png') && srcs.includes('data/dati_figs/os/q2b.png'),
    'data-src 全部激活为 src');
  assert(d.querySelectorAll('img[data-src]').length === 0, 'data-src 属性已移除');
  // 幂等：再次调用不报错不重复
  window.activateChapterImgs(d);
  assert(imgs.every(i => !!i.getAttribute('src') && !i.hasAttribute('data-src')), '重复激活幂等');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);