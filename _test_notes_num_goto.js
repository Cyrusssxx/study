// 考点笔记页：纯编号锚点（?goto=2.3）跳转回归（2026-11-04）
//
// 背景：真题套卷的大题知识点入口会传 notes.html?subject=ds&goto=2.3 这种
//      「只有编号、没有标题」的锚点（来自王道书号）。resolveSectionEl 靠精确名
//      匹配找不到，而骨架阶段 DOM 里还没有 .notes-section —— 若解析依赖 DOM，
//      目标节不会被优先渲染，jumpTo 也查不到落点 → 表现为「点了没反应」。
//
// 正确实现：在 loadNotes 里基于 flat 数据把 "2.3" 改写成真实节名 "2.3 调度"，
//      之后的优先渲染 / resolveSectionEl / jumpTo 全部复用既有精确路径。
//
// 本测试锁定：① 目标节存在 ② 该节被高亮（jumpTo 精确落位）③ 目录高亮跟随
//            ④ 跳转参数用完后被清掉 ⑤ 全部分节仍正常渲染（没有因改写 GOTO 卡住）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_notes_num_goto.js
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
const SRC = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');
const NOTES = {
  subject: 'os', title: '操作系统考点笔记', source: 'test',
  chapters: [{
    chapter: '第1章 概述', sections: [
      { section: '1.1 基本概念', html: '<p>操作系统是管理硬件的程序。</p>' },
      { section: '1.2 内核态', html: '<p>内核态与用户态。</p>' }
    ]
  }, {
    chapter: '第2章 进程', sections: [
      { section: '2.1 进程概念', html: '<p>进程是资源分配单位。</p>' },
      { section: '2.2 线程', html: '<p>线程是调度单位。</p>' },
      { section: '2.3 调度', html: '<p>调度算法。</p>' }
    ]
  }]
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(30);
  }
  return false;
}

(async () => {
  const idb = new IDBFactory();
  const html = SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/notes.html?subject=os&goto=2.3',
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(NOTES)) });
    }
  });
  const w = dom.window, doc = w.document;

  console.log('--- 一、全部分节正常渲染（改写 GOTO 不影响切片调度） ---');
  await waitFor(() => doc.querySelectorAll('.notes-section').length >= 5);
  check('5 个节全部渲染', doc.querySelectorAll('.notes-section').length, 5);

  console.log('\n--- 二、纯编号锚点被解析成真实节名并精确落位 ---');
  await sleep(250);   // 等 GOTO 的 60ms setTimeout 跳转跑完
  const target = doc.querySelector('.notes-section[data-sec="2.3 调度"]');
  check('目标节存在', !!target, true);
  check('目标节被 goto-highlight 高亮（jumpTo 精确落位）',
    target ? target.classList.contains('goto-highlight') : false, true);
  check('其它节没有被误高亮',
    [...doc.querySelectorAll('.notes-section.goto-highlight')].map(s => s.dataset.sec),
    ['2.3 调度']);

  console.log('\n--- 三、目录高亮跟随目标节 ---');
  const active = [...doc.querySelectorAll('.notes-toc-sec.active')].map(a => a.dataset.sec);
  check('目录 active 指向 2.3 调度', active, ['2.3 调度']);

  console.log('\n--- 四、跳转参数用完即清（刷新走正常滚动恢复） ---');
  check('location.search 不再含 goto', /goto=/.test(w.location.search), false);
  check('subject 参数保留', /subject=os/.test(w.location.search), true);

  console.log('\n--- 五、源码锁：解析必须基于 flat 数据，不能查 DOM ---');
  check('编号锚点基于 flat 匹配真实节名',
    /if \(\/\^\\d\+\(\\\.\\d\+\)\*\$\/\.test\(GOTO \|\| ''\)\)[\s\S]{0,300}?flat\.find/.test(SRC), true);
  check('GOTO 为 let（可被改写）', /let GOTO = _params\.get\('goto'\)/.test(SRC), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
