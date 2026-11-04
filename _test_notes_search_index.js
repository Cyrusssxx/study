// 考点笔记搜索：索引覆盖回归（2026-11-04）
//
// 用户报障：搜「隐式链接」搜不到 OS 4.2.6，只能搜到 4.2.10 / 4.2.1。
//
// 两个真实缺陷（本测试锁定）：
//   ① indexSection 只索引 `.notes-body li, .notes-body p` —— **表格内容完全没进索引**，
//      而「链接分配：隐式链接与显式链接（FAT）」这类对比表恰恰全在 <table> 里；
//      同时 `.notes-sub-title`（小节标题，h4）也没索引，搜小节名搜不到。
//   ② doNoteSearch 用 if/else：倒排索引一旦精确命中某词项，就**丢弃**包含同一子串
//      但词项更长的其它行，表现为「只出来两三行，讲过它的段落全不见」。
//
// 修法：① 补 th/td（不加 anno-line，避免破坏行号/批注体系）+ 小节标题；
//       ② 倒排命中与子串回退合并并去重；③ 命中项路径细化到所属小节。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_notes_search_index.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');
const NOTES = fs.readFileSync(path.join(ROOT, 'pwa/data/notes/os_notes.json'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(50);
  }
  return false;
}

(async () => {
  // 源码层先锁死：这三处一旦被改回去，索引就会再次漏内容
  console.log('--- 一、源码层：索引必须覆盖表格与小节标题 ---');
  check('索引表格单元格（th/td）', /\.notes-body th, \.notes-body td/.test(SRC), true);
  check('表格单元格不进 anno-line（不破坏行号/批注）',
    /querySelectorAll\('\.notes-body th, \.notes-body td'\)[\s\S]{0,420}?noteIndex\.push/.test(SRC)
    && !/querySelectorAll\('\.notes-body th, \.notes-body td'\)[\s\S]{0,200}?anno-line/.test(SRC), true);
  check('索引小节标题（.notes-sub-title）', /\.notes-sec-title, \.notes-sub-title/.test(SRC), true);
  check('倒排命中与子串回退合并（不再 if/else）',
    /\(invertedIndex\.get\(q\) \|\| \[\]\)\.forEach/.test(SRC) && /noteIndex\.forEach\(it => \{\s*\n\s*if \(it\.text\.toLowerCase\(\)\.includes\(q\) && !seen\.has\(it\.order\)\)/.test(SRC), true);

  console.log('\n--- 二、运行时：用真实 OS 笔记搜索 ---');
  const html0 = SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  }).replace(/<link\b[^>]*>/gi, '');

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html0, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/notes.html?subject=os',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(NOTES) });
    }
  });
  const w = dom.window, doc = w.document;

  // 分片渲染：等全部节渲染完（os 笔记共 19 节），索引随 renderSection 累积
  const done = await waitFor(() => doc.querySelectorAll('.notes-section').length >= 19);
  check('OS 笔记全部节渲染完成（索引才完整）', done, true);
  check('表格已渲染（.notes-table-wrap 或 table）', doc.querySelectorAll('.notes-body table').length > 0, true);

  const search = k => {
    w.doNoteSearch(k);
    const box = doc.getElementById('notesSearchResults');
    const html = box ? box.innerHTML : '';
    return {
      n: (html.match(/notes-sr-item/g) || []).length,
      paths: [...new Set([...html.matchAll(/notes-sr-path">([^<]*)</g)].map(m => m[1]))],
      html
    };
  };

  console.log('\n--- 三、搜「隐式链接」必须能命中 4.2.6 ---');
  const r1 = search('隐式链接');
  check('有命中', r1.n > 0, true);
  check('路径里出现 4.2.6（小节）', r1.paths.some(p => /4\.2\.6/.test(p)), true);
  check('表格行也参与命中（路径带「表格」）', r1.paths.some(p => /表格/.test(p)), true);
  // 修复前：倒排精确命中即放弃子串回退，只剩个位数结果
  check('结果数 ≥ 20（子串回退没被倒排吞掉）', r1.n >= 20, true);

  console.log('\n--- 四、搜小节名（原 h4 没进索引） ---');
  const r2 = search('文件的物理结构');
  check('命中 4.2.6', r2.paths.some(p => /4\.2\.6/.test(p)), true);

  console.log('\n--- 五、路径细化到小节（不是只显示父节 4.2） ---');
  check('命中项带小节路径而非只有「4.2 目录与文件」',
    r1.paths.some(p => /4\.2\.\d/.test(p)), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
