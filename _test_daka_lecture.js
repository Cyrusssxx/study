// 打卡表讲义映射全链路验证：loadDaka 真实加载 ds_daka.json + ds_code.json → 算法题卡渲染出完整讲义
// 运行：NODE_PATH=<workspace>/node_modules node _test_daka_lecture.js
const fs = require('fs');
const path = require('path');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom'); process.exit(0); }

const SRC = fs.readFileSync(path.resolve(__dirname, 'pwa/daka.html'), 'utf8');
const DATA = fs.readFileSync(path.resolve(__dirname, 'pwa/data/ds_daka.json'), 'utf8');
const CODE = fs.readFileSync(path.resolve(__dirname, 'pwa/data/ds_code.json'), 'utf8');
const EXTRA = fs.readFileSync(path.resolve(__dirname, 'pwa/data/ds_code_extra.json'), 'utf8');

(async () => {
  const dom = new JSDOM(SRC, {
    url: 'http://localhost/daka.html', runScripts: 'dangerously',
    beforeParse(w) {
      w.fetch = (url) => {
        const u = String(url);
        if (u.indexOf('ds_daka.json') > -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(DATA)) });
        if (u.indexOf('ds_code.json') > -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(CODE)) });
        if (u.indexOf('ds_code_extra.json') > -1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(EXTRA)) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ progress: {} }) });
      };
      w.api = (path) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ progress: {} }) });
      w.scrollTo = () => {};
      w.localStorage = { getItem: () => null, setItem: () => {} };
      // common.js（外部脚本 jsdom 不加载）提供的全局：PS 持久化工具 + 富文本格式化
      w.PS = { get: d => ({ ...d }), set: () => {}, restoreScroll: () => {} };
      w.fmtContent = w.fmtAnswer = s => String(s == null ? '' : s);
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 400));
  const d = w.document;
  let pass = 0, fail = 0;
  const check = (n, g, x) => { const ok = JSON.stringify(g) === JSON.stringify(x); console.log((ok ? 'PASS' : 'FAIL').padEnd(5), n, ok ? '' : `→ 实际 ${JSON.stringify(g)} 期望 ${JSON.stringify(x)}`); ok ? pass++ : fail++; };

  // 卡片总数（默认显示全部）
  const cards = d.querySelectorAll('.daka-card');
  check('卡片渲染数 = 62', cards.length, 62);
  // 讲义折叠面板出现（summary 文案）
  const lectures = d.querySelectorAll('details.daka-answer summary');
  check('讲义折叠面板总数 = 62（每卡一个）', lectures.length, 62);
  const lectureHeads = [...lectures].filter(s => s.textContent.indexOf('考点分析 · 易错点 · 讲义解法') > -1);
  check('升级为完整讲义的折叠面板 = 46（15 真题 + 31 教材习题）', lectureHeads.length, 46);
  // 讲义内容关卡：解法条目与代码块存在于页面
  check('页面含 sol-item 解法条目 ≥ 46', d.querySelectorAll('div.sol-item').length >= 46, true);
  check('页面含 code-block 代码块 ≥ 46', d.querySelectorAll('pre.code-block').length >= 46, true);
  check('页面含复杂度行 sol-cx ≥ 46', d.querySelectorAll('div.sol-cx').length >= 46, true);
  // 抽查：2009 算法题卡（2.3.7_17=ds_code_2009）有完整讲义
  const q2009 = d.getElementById('card-ds_daka_2_3_7_17');
  check('2009 卡存在', !!q2009, true);
  check('2009 卡含「链表」讲义解法', q2009 && q2009.textContent.indexOf('解法') > -1, true);
  check('2009 卡化合物复杂度 O(', q2009 && /O\(/.test(q2009.textContent), true);
  // 面板内容顺序：考点分析·易错点（daka-analysis）必须排在解法一（sol-item）之前
  const y2009Body = q2009 && q2009.querySelector('.daka-answer-body');
  if (y2009Body) {
    const h = y2009Body.innerHTML;
    check('考点分析/易错点排在解法一之前', h.indexOf('daka-analysis') > -1 && h.indexOf('daka-analysis') < h.indexOf('sol-item'), true);
  }
  // 未映射应用题卡仍是「查看答案」
  const qApp = d.getElementById('card-ds_daka_6_4_6_8');
  check('应用题卡存在', !!qApp, true);
  check('应用题卡仍为「查看答案」', qApp && /^查看答案/.test(qApp.querySelector('summary').textContent.trim()), true);
  check('应用题卡无 sol-item', qApp ? qApp.querySelectorAll('.sol-item').length : 99, 0);
  // 左侧目录项：真题只留年份、教材习题去掉「王道书」前缀
  const nav2009 = d.querySelector('.ol-nav-item.sub[data-target="card-ds_daka_2_3_7_17"]');
  check('真题目录项只显示年份 2009', nav2009 ? nav2009.textContent.trim() : '缺失', '2009');
  const navSeq1 = d.querySelector('.ol-nav-item.sub[data-target="card-ds_daka_2_2_3_1"]');
  check('教材习题目录项去掉「王道书」前缀', navSeq1 ? navSeq1.textContent.trim() : '缺失', '2.2.3_大题_1');
  const navAll = [...d.querySelectorAll('.ol-nav-item.sub')].map(a => a.textContent.trim());
  check('无目录项含「王道书」', navAll.every(t => t.indexOf('王道书') < 0), true);
  check('全部真题目录项均为 4 位年份', navAll.filter(t => /^\d{4}$/.test(t)).length >= 20, true);
  // 「📷 解答原图」独立按钮：仅真题卡片有，点击单独展开解答教材原图
  const realBtn = qApp && qApp.querySelector('button.ansfig-toggle');   // 应用题卡=真题
  check('真题卡片有「📷 解答原图」按钮', !!realBtn, true);
  // 按钮必须紧贴在折叠标题（summary）内右侧，而不是卡片头部
  check('按钮位于折叠标题 summary 内', qApp ? qApp.querySelectorAll('summary button.ansfig-toggle').length : 0, 1);
  check('卡片头部不再放按钮', qApp ? qApp.querySelectorAll('.daka-card-header button.ansfig-toggle').length : 9, 0);
  check('按钮文案含「解答原图」', realBtn ? realBtn.textContent.indexOf('解答原图') > -1 : false, true);
  const realBlock = d.getElementById('ansfig-ds_daka_6_4_6_8');
  check('真题卡片有独立解答原图区(默认隐藏)', !!realBlock && realBlock.hidden, true);
  const nonRealCard = d.getElementById('card-ds_daka_2_2_3_1');   // 教材习题=非真题
  check('非真题卡片无「解答原图」按钮', nonRealCard ? nonRealCard.querySelectorAll('button.ansfig-toggle').length : 99, 0);
  check('真题折叠区内不再重复放解答原图', qApp ? qApp.querySelector('.daka-answer-body').textContent.indexOf('解答教材原图') < 0 : false, true);
  if (realBtn) {
    realBtn.click();                                   // 点击展开
    check('点击后解答原图区展开', d.getElementById('ansfig-ds_daka_6_4_6_8').hidden, false);
    check('按钮进入选中态', realBtn.classList.contains('checked'), true);
    realBtn.click();                                   // 再点收起
    check('再点击后收起', d.getElementById('ansfig-ds_daka_6_4_6_8').hidden, true);
  }
  // 批注：卡片级块锚点 + 顶部笔记区 + 「📝 批注」按钮（与解答原图按钮并排）
  check('卡片全部带块锚点 data-blk', d.querySelectorAll('.daka-card[data-blk]').length, 62);
  check('每卡都有笔记区 .daka-notes', d.querySelectorAll('.daka-notes').length, 62);
  check('「📝 批注」按钮数 = 卡片数', d.querySelectorAll('summary button.anno-toggle').length, 62);
  check('批注按钮不在卡片头部', d.querySelectorAll('.daka-card-header button.anno-toggle').length, 0);
  check('笔记区位于折叠标题上方', [...d.querySelectorAll('.daka-card')].every(c => {
    const box = c.querySelector('.daka-notes'), det = c.querySelector('details.daka-answer');
    return !!(box && det && (box.compareDocumentPosition(det) & 4));
  }), true);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();