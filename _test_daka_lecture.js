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
  // 未映射应用题卡仍是「查看答案」
  const qApp = d.getElementById('card-ds_daka_6_4_6_8');
  check('应用题卡存在', !!qApp, true);
  check('应用题卡仍为「查看答案」', qApp && qApp.querySelector('summary').textContent, '查看答案');
  check('应用题卡无 sol-item', qApp ? qApp.querySelectorAll('.sol-item').length : 99, 0);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();