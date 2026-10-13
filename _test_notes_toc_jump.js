// _test_notes_toc_jump.js —— 笔记页目录跳转回归（2026-10-13）
// 背景：用户反馈「目录跳转有时候点击原地跳转不动」。三个叠加根因：
//   ① 点击「有子节的节」只展开/收起小节、不跳转（旧委托 hassub → toggleTocSec）；
//   ② scrollIntoView 默认贴视口顶，目标被吸顶导航盖住 → 看着像没跳；
//   ③ PS.restoreScroll 的追滚补偿最长 ~1.4s，会把用户刚跳过去的位置拽回旧存档。
// 覆盖：章标题/节/箭头/小节 四类点击语义；顶栏偏移；恢复追滚取消。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, actual, expect) {
  const ok = actual === expect;
  if (ok) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, `\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expect)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, tries = 100, step = 50) {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await sleep(step); }
  return false;
}

// 精简笔记数据：一章两节，第一节有子节，第二节无子节
const NOTES = JSON.stringify({
  title: '测试笔记', source: 'test', chapters: [{
    chapter: '第1章 绪论', sections: [
      { section: '1.1 有子节的节', html: '<p>正文一</p>', subsections: [{ section: '1.1.1 小节甲', html: '<p>甲</p>' }] },
      { section: '1.2 无子节的节', html: '<p>正文二</p>' }
    ]
  }]
});

(async () => {
  console.log('▸ 静态结构（notes.html / common.js）');
  const src = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');
  const common = fs.readFileSync(path.join(ROOT, 'pwa/js/common.js'), 'utf8');
  check('节点击一律跳转（不再 hassub→只折叠）',
    /const secLink = e\.target\.closest\('\.notes-toc-sec'\);\s*\n\s*if \(!secLink\) return;\s*\n\s*jumpTo\(secLink\.dataset\.sec, false\);/.test(src), true);
  check('箭头区单独折叠（不跳转）', /e\.target\.closest\('\.toc-sec-arrow'\)/.test(src) && /toggleTocSec\(arrowSec\)/.test(src), true);
  check('章标题可点跳转（data-sec=本章首节）', /notes-toc-ch" data-sec="\$\{chFirst\}"/.test(src) && /chLink\.dataset\.sec\) jumpTo/.test(src), true);
  check('跳转前取消滚动恢复追滚（cancelScrollRestore）',
    /function cancelScrollRestore\(\)/.test(src) && /jumpTo\(name, highlight, instant\) \{\s*\n\s*cancelScrollRestore\(\)/.test(src), true);
  check('滚动带顶栏偏移（SCROLL_TOP_OFFSET=84）', /const SCROLL_TOP_OFFSET = 84;/.test(src) && /window\.scrollTo\(\{ top: Math\.max\(0, y\)/.test(src), true);
  check('目录点击不再用裸 scrollIntoView（避免被吸顶栏盖住）',
    /smoothScrollToEl\(target, 'start'\)/.test(src), true);
  check('restoreScroll 补偿检测"用户已挪走则停止"', /if \(Math\.abs\(window\.scrollY - lastSet\) > 4\) return;/.test(common), true);
  check('restoreScroll 暴露取消句柄 __psCancelRestore', /window\.__psCancelRestore = \(\) =>/.test(common), true);

  console.log('\n▸ 动态（jsdom 模拟点击）');
  let html = src.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
  });
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const scrollCalls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/notes.html?subject=cn',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = (x, y) => { if (typeof x === 'object') scrollCalls.push(x); else scrollCalls.push({ top: y }); };
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        if (u.includes('data/notes/cn_notes.json')) return { ok: true, status: 200, json: async () => JSON.parse(NOTES) };
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
    }
  });
  const w = dom.window, d = w.document;
  const okRender = await waitFor(() => d.querySelector('.notes-toc-sec') && d.querySelector('.notes-section'));
  check('目录与正文渲染完成', okRender, true);
  if (!okRender) { console.log(`\n❌ ${failed} 项失败`); process.exit(1); }

  // 几何 stub：目标元素位于文档 500px 处 → 期望滚动到 500-84=416
  w.Element.prototype.getBoundingClientRect = function () {
    return { top: 500, bottom: 520, height: 20, left: 0, right: 100, width: 100 };
  };

  // ① 点击「有子节的节」→ 必须跳转（旧实现只折叠）
  scrollCalls.length = 0;
  d.querySelector('.notes-toc-sec[data-hassub]').click();
  await sleep(30);
  check('点击有子节的节触发滚动（跳转）', scrollCalls.length > 0, true);
  check('滚动目标 = 元素位置 - 84 顶栏偏移', scrollCalls.length && scrollCalls[0].top, 416);
  check('滚动为平滑行为', scrollCalls.length && scrollCalls[0].behavior, 'smooth');
  check('跳转时其小节列表自动展开', d.querySelector('.notes-toc-subs').classList.contains('collapsed'), false);

  // ② 点击箭头 → 只折叠，不滚动
  scrollCalls.length = 0;
  d.querySelector('.notes-toc-sec .toc-sec-arrow').click();
  await sleep(30);
  check('点击箭头只折叠小节列表', d.querySelector('.notes-toc-subs').classList.contains('collapsed'), true);
  check('点击箭头不触发滚动', scrollCalls.length, 0);

  // ③ 点击无子节的节 → 跳转
  scrollCalls.length = 0;
  const plainSec = Array.from(d.querySelectorAll('.notes-toc-sec')).find(a => !a.dataset.hassub);
  plainSec.click();
  await sleep(30);
  check('点击无子节的节触发滚动', scrollCalls.length > 0, true);

  // ④ 点击章标题 → 跳到本章第一节
  scrollCalls.length = 0;
  d.querySelector('.notes-toc-ch').click();
  await sleep(30);
  check('点击章标题触发滚动', scrollCalls.length > 0, true);

  // ⑤ 跳转后恢复追滚被取消：restoreScroll 的 retry 不再拽回旧位置
  // 注意：common.js 的 PS 是内联脚本顶层 const（不在 window 上），用 eval 取
  w.sessionStorage.setItem('ps_scroll_notes.html', '1234');
  scrollCalls.length = 0;
  w.eval('PS.restoreScroll()');   // 立即执行一次 scrollTo(0, 1234)
  const afterFirst = scrollCalls.length;
  w.__psCancelRestore && w.__psCancelRestore();
  await sleep(500);
  check('取消后追滚循环停止（无后续 scrollTo）', scrollCalls.length, afterFirst);

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
