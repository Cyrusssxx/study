// 模拟卷（一）接入 zhenti.html 的渲染回归（2026-11-26）
// 直接用真实 index.json / zt_mock1.json，jsdom 跑 zhenti.js，验证：
//   ① 目录分「历年真题 / 模拟试卷」两组，模拟卷（一）在模拟组
//   ② 切到 mock1 后 47 题全渲染（40 选择 + 7 大题），科目分组非空的 4 组
//   ③ 选择题考点面板常驻（卷自带 item.kp），大题也有考点面板
//   ④ 做题模式隐藏考点；图题 img src 指向 zt_mock1_*.png
//   ⑤ 卷标题/答案速查显示「模拟卷（一）」而非「mock1 年真题」
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_mock1.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb');
  process.exit(0);
}
const ROOT = __dirname;
const PAGE = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/index.json'), 'utf8'));
const PAPER = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/zt_mock1.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let html = PAGE.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  });
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        const j = obj => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(obj)) });
        if (/data\/zt\/index\.json/.test(u)) return j(INDEX);
        if (/data\/zt\/zt_mock1\.json/.test(u)) return j(PAPER);
        if (/data\/os\.json|data\/ds\.json|data\/co\.json|data\/cn\.json/.test(u)) return j({ questions: [] });
        if (/data\/zt_kp\.json/.test(u)) return j({});
        if (/data\/zt_bigq_kp\.json/.test(u)) return j({});
        if (/data\/zt_svg\//.test(u)) return { ok: true, status: 200, text: async () => '<svg></svg>' };
        if (/data\/(ds_daka|ds_code|ds_code_extra)\.json/.test(u)) return j({ questions: [], cards: [] });
        return j({ questions: [], chapters: [], sections: [] });
      };
    }
  });
  const w = dom.window, doc = w.document;
  await sleep(700);

  // ① 目录分组
  const groups = Array.from(doc.querySelectorAll('.zt-year-group > summary')).map(s => s.textContent.trim().replace(/\s+/g, ''));
  check('目录两个折叠大目录', groups.length, 2);
  check('第一组=历年真题', /历年真题/.test(groups[0] || ''), true);
  check('第二组=模拟试卷', /模拟试卷/.test(groups[1] || ''), true);
  const mockLink = doc.querySelector('#yearList a[data-year="mock1"]');
  check('模拟卷（一）在目录里', !!mockLink && /模拟卷（一）/.test(mockLink.textContent), true);
  // 回归：字符串年份的 onclick 必须完整带单引号，双引号会截断 onclick="..." 属性导致点击无效
  check('模拟卷目录项 onclick 可调用',
    mockLink && mockLink.getAttribute('onclick') === "switchYear('mock1')", true);

  // 切到模拟卷（一）
  w.switchYear('mock1');
  await sleep(700);

  const cards = doc.querySelectorAll('#ztMain .question-card');
  check('47 题全渲染', cards.length, 47);
  const titles = doc.querySelectorAll('#ztMain .zt-title');
  check('标题为模拟卷（一）', /模拟卷（一）套卷/.test(titles[0]?.textContent || ''), true);

  // 科目分组（每个科目标题 .zt-group-title）
  const grp = Array.from(doc.querySelectorAll('#ztMain .zt-group-title')).map(x => x.textContent.trim());
  check('4 个科目标题都有', grp.length, 4);
  check('科目标题非空且是四科', grp.every(g => /数据结构|计算机组成原理|操作系统|计算机网络/.test(g)), true);

  // 考点面板：选择题 40 + 大题 7 = 47 个 kp-panel，且都含真实考点（非"暂无"）
  const kps = doc.querySelectorAll('#ztMain .kp-panel');
  const filled = Array.from(kps).filter(p => /考点/.test(p.textContent) && !/暂无考点分析/.test(p.textContent));
  check('47 题都有考点面板', kps.length, 47);
  check('考点面板全部有真实内容', filled.length, 47);

  // 大题（41-47）也有考点按钮 + 面板
  const bigCards = Array.from(cards).filter(c => c.textContent.includes('大题') || c.querySelector('.zt-score-badge'));
  const bigKpBtns = bigCards.filter(c => c.querySelector('[data-toggle="kp"]')).length;
  check('7 道大题都有考点按钮', bigKpBtns, 7);

  // 图题 img src
  const imgs = Array.from(doc.querySelectorAll('#ztMain .question-content img')).map(i => i.getAttribute('src'));
  check('图题数=8', imgs.length, 8);
  check('图 src 全指 zt_mock1_*.png', imgs.every(s => /^data\/zt_img\/zt_mock1_\d+\.png$/.test(s)), true);

  // 做题模式隐藏考点
  w.toggleExamMode();
  await sleep(200);
  const kpsExam = doc.querySelectorAll('#ztMain .kp-panel');
  check('做题模式隐藏考点面板', kpsExam.length, 0);

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
