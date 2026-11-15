// 行级批注「行号自愈」回归：讲义正文增删段落后，批注必须仍挂在原来那一行。
//
// 背景：行级批注（*_kn）存的是 {sec, line}，line 是渲染时按 .notes-body li/p 顺序数出来的序号。
// 讲义正文一旦精简（合并重复段落、罗列改表格），后面所有行号整体位移：
//   · 位移后「恰好」落在别的行上 → 批注挂错地方（最坏情况，用户以为没丢但内容对不上）
//   · 超出行数 → lineEl 返回 null → 批注静默消失
// 现在每条批注补 anchor（该行归一化文本前 80 字），加载时按 anchor 重建映射并回写新行号。
//
// 本测试用两个 JSDOM 实例模拟「改写前 / 改写后」：
//   ① 老数据（无 anchor，line=4）→ 加载后应挂第 4 行，且自动补 anchor 落库
//   ② 正文删掉前两段后（该段落变成第 2 行），用 ① 产出的 kn 加载 → 应挂第 2 行并回写
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

const HTML_SRC = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');

// ---------- 1. 静态：自愈逻辑存在且口径正确 ----------
console.log('▸ 静态结构（notes.html）');
check('批注挂了 anchor 自愈入口', /function resolveAnnoLine\(item\)/.test(HTML_SRC));
check('老批注首次加载自动补 anchor（80 字截断）',
  /item\.anchor = t\.slice\(0, 80\)/.test(HTML_SRC) && /t\.length >= 6/.test(HTML_SRC));
check('anchor 优先于行号（startsWith 匹配，不是全等）',
  /annoNorm\(byLine\)\.startsWith\(item\.anchor\)/.test(HTML_SRC) &&
  /annoNorm\(el\)\.startsWith\(item\.anchor\)/.test(HTML_SRC));
check('多处命中取离原行号最近的一处', /Math\.abs\(\+el\.dataset\.line - item\.line\)/.test(HTML_SRC));
check('行号被纠正后回写落库', /item\.line = nl; annoAnchorDirty = true/.test(HTML_SRC) &&
  /if \(annoAnchorDirty\) \{ annoAnchorDirty = false; saveAnnos\(\); \}/.test(HTML_SRC));
check('高亮漂移改「就近查找」而非全文第一处',
  /full\.indexOf\(it\.text, Math\.max\(0, start - 500\)\)/.test(HTML_SRC) &&
  /near <= start \+ 5000/.test(HTML_SRC));

// ---------- 2. 动态：两个实例模拟改写前后 ----------
let JSDOM, VirtualConsole, IDBFactory, IDBKeyRange;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log(`_test_anno_anchor: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const SEC = '1.1 测试节';
const P = t => `<p class="paragraph">${t}</p>`;
const LONG = [
  '第一段甲内容',
  '第二段乙内容',
  '第三段丙内容',
  '第四段丁内容需要被批注',
  '第五段戊内容'
];
const SHORT = LONG.slice(2);   // 改写后删掉前两段：被批注的那段从第 4 行变成第 2 行

function notesJson(paras) {
  return JSON.stringify({
    title: '测试讲义', source: '单测',
    chapters: [{ chapter: '第1章 测试章', sections: [{ section: SEC, html: paras.map(P).join(''), subsections: [] }] }]
  });
}

async function boot(raw) {
  const pageHtml = HTML_SRC
    .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
      try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
    }).replace(/<link\b[^>]*>/gi, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
  const dom = new JSDOM(pageHtml, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://x.test/notes.html?subject=os', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
    }
  });
  await new Promise(r => setTimeout(r, 3000));
  return dom;
}

(async () => {
  console.log('▸ 动态①：老批注（无 anchor）自动补锚');
  const dom1 = await boot(notesJson(LONG));
  const w1 = dom1.window, d1 = w1.document;
  check('节渲染出 5 行 anno-line', d1.querySelectorAll('.anno-line').length, 5);

  const oldItem = { sec: SEC, line: 4, text: '我的批注内容', images: [] };
  await w1.api('/api/note/os_kn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([oldItem]), images: [] })
  });
  await w1.loadAnnos();
  await new Promise(r => setTimeout(r, 800));   // saveAnnos debounce 300ms

  let mounted = d1.querySelector('.line-anno-block');
  check('批注挂在第 4 行', mounted && mounted.dataset.line, '4');
  const persisted1 = JSON.parse((await w1.api('/api/note/os_kn')).note || '{}');
  const body1 = await (await w1.api('/api/note/os_kn')).json();
  const arr1 = JSON.parse(body1.note || '[]');
  check('落库已补 anchor', !!(arr1[0] && arr1[0].anchor), arr1[0] && arr1[0].anchor);
  check('anchor = 该行文本（归一化后）', arr1[0] && arr1[0].anchor === LONG[4], LONG[4]);

  console.log('▸ 动态②：正文精简两段后，批注跟着走');
  const dom2 = await boot(notesJson(SHORT));
  const w2 = dom2.window, d2 = w2.document;
  check('改写后只剩 3 行', d2.querySelectorAll('.anno-line').length, 3);
  // 用改写前产出的 kn（line 还是 4，但带 anchor）
  await w2.api('/api/note/os_kn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify(arr1), images: [] })
  });
  await w2.loadAnnos();
  await new Promise(r => setTimeout(r, 800));

  const m2 = d2.querySelector('.line-anno-block');
  check('批注仍挂在同一行（行号 4 → 2）', m2 && m2.dataset.line, '2');
  const body2 = await (await w2.api('/api/note/os_kn')).json();
  const arr2 = JSON.parse(body2.note || '[]');
  check('新行号已回写（下次不必再扫节）', arr2[0] && arr2[0].line, 2);
  check('anchor 原样保留', arr2[0] && arr2[0].anchor === LONG[4], arr2[0] && arr2[0].anchor);

  console.log('▸ 动态③：anchor 也被删掉时退回原行号（不静默丢弃）');
  const dom3 = await boot(notesJson(SHORT));
  const w3 = dom3.window, d3 = w3.document;
  await w3.api('/api/note/os_kn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([{ sec: SEC, line: 1, text: 'x', anchor: '这段文字已经不存在了' }]), images: [] })
  });
  await w3.loadAnnos();
  await new Promise(r => setTimeout(r, 500));
  const m3 = d3.querySelector('.line-anno-block');
  check('找不到 anchor 时仍按原行号挂上（不吞批注）', m3 && m3.dataset.line, '1');

  console.log(`\n_test_anno_anchor: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
