// 真题套卷：不熟 / 不会 / 考点分析 回归（2026-11-03）
//
// 需求：套卷里每道题也能像刷题页那样标记「不熟 / 不会」；收藏过的题出现「考点分析」按钮。
//
// 关键约束（本测试锁定）：
//   ① 只有**映射到题库**的题（it.qid 存在）才显示这两个功能 —— 合成 id 写不进标记表
//   ② 考点分析含「答案 X」，**做题模式（examMode）下必须隐藏**
//   ③ 考点分析按需拉取 /api/kp/<qid>，不整本载入题库
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_marks.js
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
const PAGE = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 套卷：第 1 题映射到 os_0001，第 2 题没有 qid（合成 id）
const PAPER = {
  y: 2020, n: 2,
  items: [
    { i: 1, t: 1, sid: 'os', s: 2, q: '题干一', o: ['甲', '乙', '丙', '丁'], a: 'A', an: '解析一', qid: 'os_0001' },
    { i: 2, t: 1, sid: 'os', s: 2, q: '题干二（无题库映射）', o: ['甲', '乙', '丙', '丁'], a: 'B', an: '解析二' }
  ]
};
const INDEX = { years: [2020], counts: { 2020: { choice: 2, big: 0 } }, iids: { 2020: ['os_0001', 'os_zt2020_2'] } };
const OS_BANK = {
  subject: '操作系统', total: 1,
  questions: [{
    id: 'os_0001', number: 1, content: '题库题干', options: { A: '甲', B: '乙', C: '丙', D: '丁' },
    answer: 'A', explanation: '', chapter: '第1章', section: '1.1',
    kp_analysis: '<div class="kp-sec"><b>考点</b>测试考点内容</div>'
  }]
};

(async () => {
  let html = PAGE.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    try { return '<script>' + fs.readFileSync(p, 'utf8') + '</script>'; } catch (e) { return ''; }
  });

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/zhenti.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.Element.prototype.scrollIntoView = function () { };
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        const j = obj => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(obj)) });
        if (/data\/zt\/index\.json/.test(u)) return j(INDEX);
        if (/data\/zt\/zt_2020\.json/.test(u)) return j(PAPER);
        if (/data\/os\.json/.test(u)) return j(OS_BANK);
        if (/data\/zt_svg\//.test(u)) return { ok: true, status: 200, text: async () => '<svg></svg>' };
        if (/data\/(ds_daka|ds_code|ds_code_extra)\.json/.test(u)) return j({ cards: [], list: [] });
        return j({ questions: [], chapters: [], sections: [] });
      };
    }
  });
  const w = dom.window;
  const doc = w.document;

  await sleep(600);

  const card = iid => doc.getElementById('card-' + iid);
  const c1 = card('os_0001'), c2 = card('os_zt2020_2');

  console.log('--- 一、卡片渲染 ---');
  check('套卷渲染出两张卡', !!c1 && !!c2, true);

  console.log('\n--- 二、不熟 / 不会：只有映射题才有 ---');
  const marks1 = c1 ? c1.querySelectorAll('.mark-btn').length : -1;
  const marks2 = c2 ? c2.querySelectorAll('.mark-btn').length : -1;
  check('映射题有 2 个标记按钮（不熟/不会）', marks1, 2);
  check('无映射题不显示标记按钮', marks2, 0);

  console.log('\n--- 三、考点分析：做题模式下隐藏（含答案） ---');
  const kpBtn = c => [...c.querySelectorAll('.btn-explanation')].find(b => /考点分析/.test(b.textContent));
  check('做题模式下无「考点分析」按钮', !!kpBtn(c1), false);

  // 退出做题模式（对答案），再收藏第 1 题
  w.toggleExamMode();
  await sleep(200);
  check('未收藏时仍无「考点分析」按钮（只有收藏题才有）', !!kpBtn(card('os_0001')), false);

  const star = card('os_0001').querySelector('.btn-icon');
  check('找到收藏星', !!star, true);
  star.click();
  await sleep(250);
  check('收藏后出现「考点分析」按钮', !!kpBtn(card('os_0001')), true);

  console.log('\n--- 四、点「不熟」写入标记库并变色 ---');
  const unBtn = [...card('os_0001').querySelectorAll('.mark-btn')].find(b => /不熟/.test(b.textContent));
  check('找到「不熟」按钮', !!unBtn, true);
  unBtn.click();
  await sleep(250);
  const unfams = await w.dbAll('unfamiliar');
  check('unfamiliar 表里出现 os_0001', unfams.some(r => r.question_id === 'os_0001'), true);
  const unBtn2 = [...card('os_0001').querySelectorAll('.mark-btn')].find(b => /不熟/.test(b.textContent));
  check('按钮变为已标记样式', unBtn2.classList.contains('mark-unfamiliar'), true);

  console.log('\n--- 五、点「考点分析」按需拉取并展开 ---');
  const kb = kpBtn(card('os_0001'));
  kb.click();
  await sleep(300);
  const panel = card('os_0001').querySelector('.kp-panel');
  check('展开出 kp-panel', !!panel, true);
  check('面板内容来自题库 kp_analysis', /测试考点内容/.test(panel ? panel.innerHTML : ''), true);
  check('按钮变为展开态 ▴', /▴/.test(kpBtn(card('os_0001')).textContent), true);

  // 再点一次收起
  kpBtn(card('os_0001')).click();
  await sleep(150);
  check('再点一次收起面板', !!card('os_0001').querySelector('.kp-panel'), false);

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})();
