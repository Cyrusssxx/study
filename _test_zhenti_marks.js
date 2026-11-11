// 真题套卷：不熟 / 不会 / 考点分析 回归（2026-11-03）
//
// 需求：套卷里每道题也能像刷题页那样标记「不熟 / 不会」；考点分析常驻显示。
//
// 关键约束（本测试锁定）：
//   ① 「不熟 / 不会」：映射题与**大题**都有（标记写 IndexedDB，按本页 iid 存）
//   ② 考点分析「常驻」（2026-11-11 用户要求）：选择题默认展开、不再要求先收藏，
//      按钮只用于收起；收起状态按题存 localStorage('zhentiKpClosed')
//   ③ 考点分析含「答案 X」，**做题模式（examMode）下必须整块隐藏**
//   ④ 数据来源：映射题取题库 kp_analysis（随知识点入口那次拉取一起收下），
//      未映射选择题取 data/zt_kp.json；两者都不再走 /api/kp
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

// 套卷：第 1 题映射到 os_0001；第 2 题无映射的选择题；第 3 题是综合题（大题，永远无映射）
const PAPER = {
  y: 2020, n: 3,
  items: [
    { i: 1, t: 1, sid: 'os', s: 2, q: '题干一', o: ['甲', '乙', '丙', '丁'], a: 'A', an: '解析一', qid: 'os_0001' },
    { i: 2, t: 1, sid: 'os', s: 2, q: '题干二（无题库映射）', o: ['甲', '乙', '丙', '丁'], a: 'B', an: '解析二' },
    { i: 3, t: 2, sid: 'os', s: 7, q: '综合题三', a: '参考答案三', an: '大题解析三' }
  ]
};
const INDEX = { years: [2020], counts: { 2020: { choice: 2, big: 1 } }, iids: { 2020: ['os_0001', 'os_zt2020_2', 'os_zt2020_3'] } };
// 未映射选择题的考点分析（真题卷里没有题库条目的那批，走 data/zt_kp.json）
const ZT_KP = { 'os_zt2020_2': '<div class="kp-sec"><b>考点</b>未映射题考点</div>' };
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
        if (/data\/zt_kp\.json/.test(u)) return j(ZT_KP);
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
  const c1 = card('os_0001'), c2 = card('os_zt2020_2'), c3 = card('os_zt2020_3');

  console.log('--- 一、卡片渲染 ---');
  check('套卷渲染出三张卡（含 1 道大题）', !!c1 && !!c2 && !!c3, true);

  console.log('\n--- 二、不熟 / 不会：只有映射题才有 ---');
  const marks1 = c1 ? c1.querySelectorAll('.mark-btn').length : -1;
  const marks2 = c2 ? c2.querySelectorAll('.mark-btn').length : -1;
  check('映射题有 2 个标记按钮（不熟/不会）', marks1, 2);
  check('无映射的选择题不显示标记按钮', marks2, 0);
  // 大题（综合题）一律有标记：它没有题库映射，但标记写的是本页的 unfamiliar/dontknow 表
  check('大题有 2 个标记按钮（不熟/不会）',
    c3 ? c3.querySelectorAll('.mark-btn').length : -1, 2);

  console.log('\n--- 三、考点分析：选择题常驻（默认展开，做题模式隐藏） ---');
  const kpBtn = c => [...c.querySelectorAll('.btn-explanation')].find(b => /考点分析/.test(b.textContent));
  const kpPanel = iid => card(iid) ? card(iid).querySelector('.kp-panel') : null;
  // 2026-11-11 用户要求「选择题的考点分析搞成常驻」：不再要求先收藏，也不再需要点开
  check('未收藏也有「考点分析」按钮（常驻）', !!kpBtn(card('os_0001')), true);
  check('默认就展开出 kp-panel', !!kpPanel('os_0001'), true);
  check('面板内容来自题库 kp_analysis（题库异步到位后回填）',
    /测试考点内容/.test((kpPanel('os_0001') || {}).innerHTML || ''), true);
  check('按钮默认 ▴（展开态）', /▴/.test(kpBtn(card('os_0001')).textContent), true);
  check('未映射的选择题也常驻（数据来自 data/zt_kp.json）', !!kpPanel('os_zt2020_2'), true);
  check('未映射题面板内容来自 zt_kp.json',
    /未映射题考点/.test((kpPanel('os_zt2020_2') || {}).innerHTML || ''), true);
  check('大题不常驻考点分析（走知识点跳转）', !!kpPanel('os_zt2020_3'), false);

  // 考点分析写明答案 → 做题模式必须整块隐藏
  await w.toggleExamMode();
  await sleep(250);
  check('做题模式下无「考点分析」按钮', !!kpBtn(card('os_0001')), false);
  check('做题模式下无 kp-panel', !!kpPanel('os_0001'), false);
  await w.toggleExamMode();
  await sleep(250);
  check('退出做题模式后恢复常驻', !!kpBtn(card('os_0001')) && !!kpPanel('os_0001'), true);

  console.log('\n--- 四、点「不熟」写入标记库并变色 ---');
  const unBtn = [...card('os_0001').querySelectorAll('.mark-btn')].find(b => /不熟/.test(b.textContent));
  check('找到「不熟」按钮', !!unBtn, true);
  unBtn.click();
  await sleep(250);
  const unfams = await w.dbAll('unfamiliar');
  check('unfamiliar 表里出现 os_0001', unfams.some(r => r.question_id === 'os_0001'), true);
  const unBtn2 = [...card('os_0001').querySelectorAll('.mark-btn')].find(b => /不熟/.test(b.textContent));
  check('按钮变为已标记样式', unBtn2.classList.contains('mark-unfamiliar'), true);

  console.log('\n--- 五、常驻面板可收起 / 再展开，收起状态按题记住 ---');
  kpBtn(card('os_0001')).click();
  await sleep(150);
  check('点一次收起面板', !!kpPanel('os_0001'), false);
  check('按钮变 ▾', /▾/.test(kpBtn(card('os_0001')).textContent), true);
  check('收起状态写入 localStorage(zhentiKpClosed)',
    JSON.parse(w.localStorage.getItem('zhentiKpClosed') || '[]').includes('os_0001'), true);

  kpBtn(card('os_0001')).click();
  await sleep(150);
  check('再点展开回来', !!kpPanel('os_0001'), true);
  check('展开后内容仍在（走缓存，不重新请求）',
    /测试考点内容/.test((kpPanel('os_0001') || {}).innerHTML || ''), true);
  check('展开后 localStorage 里已移除',
    JSON.parse(w.localStorage.getItem('zhentiKpClosed') || '[]').includes('os_0001'), false);

  console.log('\n--- 五之一、收藏与考点分析解耦 ---');
  const star = card('os_0001').querySelector('.btn-icon');
  check('找到收藏星', !!star, true);
  star.click();
  await sleep(250);
  check('收藏后 kp 面板仍在（不因收藏状态变化收起）', !!kpPanel('os_0001'), true);
  check('收藏后按钮仍是常驻（只是星变实）',
    !!kpBtn(card('os_0001')) && card('os_0001').querySelector('.btn-icon').classList.contains('favorited'), true);
  star.click();
  await sleep(200);
  check('取消收藏后 kp 面板依然常驻', !!kpPanel('os_0001'), true);

  console.log('\n--- 五之二、大题标记 + 右侧题号标黄/标红 ---');
  const fqOf = iid => doc.querySelector(`#fqList .zt-fq-i[data-iid="${iid}"]`);
  const c3Now = card('os_zt2020_3');      // 前面 toggleExamMode 整卷重绘过，旧引用已失效
  const bigBtn = kind => [...card('os_zt2020_3').querySelectorAll('.mark-btn')].find(b => b.textContent.includes(kind));
  check('大题卡渲染在「综合题」分组', !!fqOf('os_zt2020_3'), true);
  bigBtn('不会').click();
  await sleep(250);
  check('大题「不会」写入 dontknow 表',
    (await w.dbAll('dontknow')).some(r => r.question_id === 'os_zt2020_3'), true);
  check('大题卡按钮变红样式',
    bigBtn('不会').classList.contains('mark-dontknow'), true);
  check('右侧题号 + dk（标红）', fqOf('os_zt2020_3').classList.contains('dk'), true);
  check('题号 title 标注「不会」', /不会/.test(fqOf('os_zt2020_3').title), true);
  // 互斥：再点「不熟」→ 不会自动清掉，题号由红转黄
  bigBtn('不熟').click();
  await sleep(250);
  check('互斥：不熟清掉不会', (await w.dbAll('dontknow')).some(r => r.question_id === 'os_zt2020_3'), false);
  check('互斥：不熟已入库', (await w.dbAll('unfamiliar')).some(r => r.question_id === 'os_zt2020_3'), true);
  check('右侧题号 + un（标黄）、dk 已移除',
    [fqOf('os_zt2020_3').classList.contains('un'), fqOf('os_zt2020_3').classList.contains('dk')], [true, false]);
  // 标记切换不得整卡重绘（重绘会让题图退回占位、按钮行跳）
  check('标记后卡片节点未变（原地更新，不整卡重绘）', card('os_zt2020_3') === c3Now, true);

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
