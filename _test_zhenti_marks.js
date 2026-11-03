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

  console.log('\n--- 六、加入错题池（手动入池，与「7 天后重练」同一张 redo 表） ---');
  const poolBtn = () => card('os_0001').querySelector('.pool-btn');
  check('映射题有「加入错题池」按钮', !!poolBtn(), true);
  check('无映射题没有该按钮', !!card('os_zt2020_2').querySelector('.pool-btn'), false);
  check('初始文案', /加入错题池/.test(poolBtn().textContent), true);

  poolBtn().click();
  await sleep(300);
  const rec = (await w.dbAll('redo')).find(r => r.question_id === 'os_0001');
  check('redo 表写入 kind=ztwrong', rec && rec.kind, 'ztwrong');
  const DAY = 86400000;
  const inDays = rec ? (rec.due_at - Date.now()) / DAY : -99;
  check('due_at = 加入后 7 天', inDays > 6.9 && inDays <= 7.01, true);
  check('按钮变为「已在错题池」', /已在错题池/.test(poolBtn().textContent), true);

  const poolNow = await w.examWrongPoolQids(false);
  check('该题进入模拟考错题池', poolNow.pending.includes('os_0001'), true);

  // 冷却期内：错题池刷题仍可刷到，但收藏池组卷要排除
  const rWrong = await w.api('/api/questions/os?mode=wrong&page=1&per_page=9999').then(r => r.json());
  check('冷却期内「错题」刷题仍能刷到', (rWrong.questions || []).map(q => q.id).includes('os_0001'), true);
  check('冷却逻辑：收藏池按 ztwrong.due_at 排除',
    /ztCooling\.has\(q\.id\)/.test(fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8')), true);

  // 再做对一次 → 留池不抽（mastered）
  await w.applyAnswer('os_0001', 'os', 'A', true, null, false);
  const poolAfter = await w.examWrongPoolQids(false);
  check('做对后退出可抽池', poolAfter.pending.includes('os_0001'), false);
  check('做对后仍留在池里（mastered）', poolAfter.mastered.includes('os_0001'), true);

  // 清掉 mastered 后点按钮移出
  await w.dbPut('redo', Object.assign({}, rec, { mastered: 0 }));
  await sleep(100);
  poolBtn().click();
  await sleep(300);
  check('再点一次移出 redo 表', (await w.dbAll('redo')).some(r => r.question_id === 'os_0001'), false);

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})();
