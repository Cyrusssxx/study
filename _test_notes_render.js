// 考点笔记页：分片渲染回归测试
//
// 背景：点「知识点」进来时鼠标卡飞。根因是 loadNotes() 把整科笔记（最大 846KB）
// 一次性拼字符串 + 一次 innerHTML，且每节都要跑 fmtNotes 的 4 轮全文正则 ——
// 全在同一个同步任务里，主线程被堵死。
//
// 改成：骨架占位 → 目标节优先渲染 → 其余按 8ms 时间片逐节填充 → finishNotes。
//
// 本测试锁住「改完之后功能不能少」：
//   1) 所有节最终都渲染出来（数量、顺序、内容）
//   2) 目标节（?goto=）优先渲染
//   3) 目录点击能在未渲染时补渲染
//   4) 渲染完成后 finishNotes 跑了（滚动联动 / 表格包裹 / 批注高亮初始化）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_notes_render.js
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

// 3 章 × 3 节，其中一节带 2 个小节；含表格与例题段落，覆盖 fmtNotes 各分支
const NOTES = {
  subject: 'os', title: '操作系统考点笔记', source: 'test',
  chapters: [
    {
      chapter: '第1章 概述', sections: [
        { section: '1.1 基本概念', html: '<p>操作系统是管理硬件的程序。</p>' },
        { section: '1.2 内核态', html: '<p>内核态与用户态。</p><table><tr><td>a</td></tr></table>' },
        {
          section: '1.3 中断', html: '<p>中断处理流程。</p>',
          subsections: [
            { section: '1.3.1 内中断', html: '<p>内中断来源。</p>', important: true },
            { section: '1.3.2 外中断', html: '<p>外中断来源。</p>' }
          ]
        }
      ]
    },
    {
      chapter: '第2章 进程', sections: [
        { section: '2.1 进程概念', html: '<p>进程是资源分配单位。</p>' },
        { section: '2.2 线程', html: '<p>线程是调度单位。</p>' },
        { section: '2.3 调度', html: '<p>调度算法。</p>' }
      ]
    },
    {
      chapter: '第3章 内存', sections: [
        { section: '3.1 分页', html: '<p>分页存储。</p>' },
        { section: '3.2 分段', html: '<p>分段存储。</p>' },
        { section: '3.3 虚拟内存', html: '<p>页面置换。</p>' }
      ]
    }
  ]
};
const TOTAL_SECS = 9;

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
  let html = SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,   // 提供 requestAnimationFrame
    url: 'https://x.test/notes.html?subject=os',
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        let obj;
        if (/data\/notes\/os_notes\.json/.test(u)) obj = JSON.parse(JSON.stringify(NOTES));
        else if (u.includes('data/notes/')) obj = { chapters: [], sections: [] };
        else if (/data\/[a-z_0-9]+\.json/.test(u)) obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        else obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        return { ok: true, status: 200, json: async () => obj };
      };
    }
  });
  const w = dom.window, doc = w.document;

  console.log('--- 一、分片渲染：所有节最终都要出来 ---');
  const done = await waitFor(() => doc.querySelectorAll('.notes-section').length >= TOTAL_SECS);
  check('全部 9 个节都渲染完成', doc.querySelectorAll('.notes-section').length, TOTAL_SECS);
  check('章标题 3 个', doc.querySelectorAll('.notes-ch-title').length, 3);
  check('小节 2 个', doc.querySelectorAll('.notes-sub').length, 2);

  console.log('\n--- 二、DOM 顺序与内容正确 ---');
  const secNames = [...doc.querySelectorAll('.notes-section')].map(s => s.dataset.sec);
  check('节顺序与数据一致', secNames, [
    '1.1 基本概念', '1.2 内核态', '1.3 中断',
    '2.1 进程概念', '2.2 线程', '2.3 调度',
    '3.1 分页', '3.2 分段', '3.3 虚拟内存'
  ]);
  check('第一节内容渲染', /操作系统是管理硬件的程序/.test(doc.querySelector('.notes-section[data-sec="1.1 基本概念"]').textContent), true);
  check('最后一节内容渲染', /页面置换/.test(doc.querySelector('.notes-section[data-sec="3.3 虚拟内存"]').textContent), true);

  console.log('\n--- 三、渲染完成后 finishNotes 的收尾工作 ---');
  await sleep(120);   // 等最后一帧的 finishNotes 跑完（建索引 / 表格包裹）
  check('表格已包 .notes-table-wrap', doc.querySelectorAll('.notes-table-wrap').length, 1);
  check('目录链接已生成', doc.querySelectorAll('.notes-toc-sec').length, TOTAL_SECS);

  console.log('\n--- 三半、搜索能命中正文（骨架包裹层曾打断索引）---');
  let searchOk = false, searchPath = '';
  try {
    w.doNoteSearch('操作系统');
    await sleep(50);
    const box = doc.getElementById('notesSearchResults');
    searchOk = /搜索结果 · \d+ 条/.test(box.innerHTML);
    const m = box.innerHTML.match(/notes-sr-path">([^<]*)</);
    searchPath = m ? m[1] : '';
  } catch (e) { console.log('    [debug] doNoteSearch 抛错:', e.message); }
  check('搜正文词能命中（不再是 0 结果）', searchOk, true);
  check('命中的是正文所在的节', searchPath, '1.1 基本概念');

  console.log('\n--- 四、源码：不能退回一次性 innerHTML ---');
  const BACK = SRC;
  check('存在时间片调度 pump', /function pump\(\)/.test(BACK) && /performance\.now\(\) - t0 < 8/.test(BACK), true);
  check('存在单节渲染函数', /function renderSection\(i\)/.test(BACK), true);
  check('目标节优先渲染', /const targetIdx = GOTO \? findSecIdx\(GOTO\) : -1;[\s\S]{0,120}?if \(targetIdx >= 0\) renderSection\(targetIdx\)/.test(BACK), true);
  check('目录点击会补渲染未渲染的节', /const ensureSecRendered = name =>/.test(BACK), true);
  check('不再有 body 一次性拼接 + 一次 innerHTML',
    /document\.getElementById\('notesContent'\)\.innerHTML = body;/.test(BACK), false);
  check('占位骨架保留 DOM 顺序', /notes-sec-slot/.test(BACK), true);

  console.log('\n--- 五、索引随渲染逐节累积（不再一次性遍历全页） ---');
  // 旧实现 buildNoteIndex 在 finishNotes 里用 TreeWalker 遍历几千个节点，
  // 是分片渲染后的第二波卡顿源。新实现 indexSection 随 renderSection 逐节调用。
  check('存在 indexSection 增量索引函数', /function indexSection\(section\)/.test(BACK), true);
  check('已删除 buildNoteIndex 整页遍历', /function buildNoteIndex\(\)/.test(BACK), false);
  check('indexSection 随渲染调用', /indexSection\(secEl\)/.test(BACK), true);
  check('行号标注在 indexSection 内完成', /el\.dataset\.line = line\+\+/.test(BACK), true);
  check('章标题直接进索引（不等 DOM）', /noteIndex\.push\(\{ text: ch\.chapter, path: '章'/.test(BACK), true);
  check('首章标题样式已适配包裹层',
    /\.notes-ch-block:first-child \.notes-ch-title/.test(
      fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8')), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
