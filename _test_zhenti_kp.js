// 真题套卷：知识点跳转入口回归（2026-11-04）
//
// 需求：套卷里**每道题**都要有跳转到考点笔记的入口；选择题复用刷题页的跳转契约
//       （notes.html?subject=&goto=，锚点取题库 subsection/section），大题单独用
//       data/zt_bigq_kp.json 的锚点。
//
// 本测试锁定的行为：
//   ① 映射到题库的选择题 → 有 .zt-kp-link，href 带 goto=<小节名>（题库异步就绪后补渲染）
//   ② 未映射的选择题 → 无入口（没有章节信息，不猜）
//   ③ DS 大题（节级锚点）→ href 带 goto=2.3
//   ④ CO 大题（科目级）→ 无 goto，只跳该科笔记首页
//   ⑤ 做题模式下入口仍然可见（跳笔记不泄答案，与「考点分析」不同）
//   ⑥ 入口不重复（题库加载完成再渲染一次也只保留一个）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_kp.js
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

const PAPER = {
  y: 2020, n: 4,
  items: [
    { i: 1, t: 1, sid: 'os', s: 2, q: '题干一', o: ['甲', '乙', '丙', '丁'], a: 'A', an: '解析一', qid: 'os_0001' },
    { i: 2, t: 1, sid: 'os', s: 2, q: '题干二（无题库映射）', o: ['甲', '乙', '丙', '丁'], a: 'B', an: '解析二' },
    { i: 41, t: 3, sid: 'ds', s: 13, q: 'DS 大题', o: [], a: null, an: '解析三' },
    { i: 43, t: 3, sid: 'co', s: 13, q: 'CO 大题', o: [], a: null, an: '解析四' }
  ]
};
const INDEX = { years: [2020], counts: { 2020: { choice: 2, big: 2 } }, iids: { 2020: ['os_0001', 'os_zt2020_2'] }, choice_total: 2, big_total: 2 };
const OS_BANK = {
  subject: '操作系统', total: 1,
  questions: [{
    id: 'os_0001', number: 1, content: '题库题干', options: { A: '甲', B: '乙', C: '丙', D: '丁' },
    answer: 'A', explanation: '', chapter: '第2章 进程管理', section: '2.2 CPU调度', subsection: '2.2.3 调度算法'
  }]
};
// 大题锚点表：DS 走节级书号，CO 只有科目级
const KP_TABLE = {
  '2020': {
    '1': { sub: 'os', goto: '', mode: 'bank' },
    '41': { sub: 'ds', goto: '2.3', mode: 'sec' },
    '43': { sub: 'co', goto: '', mode: 'sub' }
  }
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
        if (/data\/zt_bigq_kp\.json/.test(u)) return j(KP_TABLE);
        if (/data\/os\.json/.test(u)) return j(OS_BANK);
        if (/data\/zt_svg\//.test(u)) return { ok: true, status: 200, text: async () => '<svg></svg>' };
        if (/data\/(ds_daka|ds_code|ds_code_extra)\.json/.test(u)) return j({ cards: [], list: [], questions: [] });
        return j({ questions: [], chapters: [], sections: [] });
      };
    }
  });
  const w = dom.window;
  const doc = w.document;

  await sleep(800);   // 等题库按科目异步加载完（warmKpLinks）

  const card = iid => doc.getElementById('card-' + iid);
  const kp = iid => {
    const c = card(iid);
    return c ? c.querySelector('.zt-kp-link') : null;
  };

  console.log('--- 一、选择题：映射题有入口，锚点取题库小节（非科目级） ---');
  const k1 = kp('os_0001');
  check('映射选择题有 .zt-kp-link', !!k1, true);
  check('href 指向 notes.html 且科目正确', /^notes\.html\?subject=os/.test(k1 ? k1.getAttribute('href') : ''), true);
  check('goto = 题库小节名（优先 subsection）',
    decodeURIComponent((k1.getAttribute('href').match(/goto=([^&]*)/) || [])[1] || ''), '2.2.3 调度算法');
  check('入口文案为「知识点」', /知识点/.test(k1.textContent), true);
  check('target=_blank（新窗口打开，不打断做题）', k1.getAttribute('target'), '_blank');

  console.log('\n--- 二、未映射选择题：没有章节信息，不显示入口 ---');
  check('无映射选择题没有 .zt-kp-link', !!kp('os_zt2020_2'), false);

  console.log('\n--- 三、大题：DS 节级锚点 / CO 科目级 ---');
  const b41 = kp('ds_zt2020_41');
  check('DS 大题有入口', !!b41, true);
  check('DS 大题 goto = 2.3（王道书号 → 节级）',
    decodeURIComponent((b41.getAttribute('href').match(/goto=([^&]*)/) || [])[1] || ''), '2.3');
  check('DS 大题 href 科目为 ds', /subject=ds/.test(b41.getAttribute('href')), true);

  const b43 = kp('co_zt2020_43');
  check('CO 大题有入口', !!b43, true);
  check('CO 大题不带 goto（科目级，不冒充精确考点）', /goto=/.test(b43.getAttribute('href')), false);
  check('CO 大题文案为「知识点笔记」', /知识点笔记/.test(b43.textContent), true);

  console.log('\n--- 四、做题模式下入口照常可见（跳笔记不泄答案） ---');
  // state 在 zhenti.js 的 IIFE 内，外部取不到；改为观察做题模式的 DOM 特征：
  // 做题模式下卡片不显示历史作答结果条（.result-correct / .result-wrong）
  check('默认未显示历史作答结果条（在做题模式）',
    doc.querySelectorAll('#ztMain .result-correct, #ztMain .result-wrong').length, 0);
  check('做题模式下映射选择题仍有入口', !!kp('os_0001'), true);

  console.log('\n--- 五、入口不重复（重复渲染不叠加） ---');
  w.renderPaper && (await w.renderPaper());
  await sleep(500);
  const dup = doc.querySelectorAll('#card-os_0001 .zt-kp-link').length;
  check('重渲染后只有一个入口', dup, 1);

  console.log('\n--- 六、大题入口排在笔记之后、考点分析之前 ---');
  const order = [...card('os_0001').querySelectorAll('.question-tools > *')].map(el =>
    el.classList.contains('zt-kp-link') ? 'kp' : /笔记/.test(el.textContent) ? 'note' : /答案与解析/.test(el.textContent) ? 'ans' : 'other');
  check('按钮顺序：答案 → 笔记 → 知识点', order.filter(x => x !== 'other'), ['ans', 'note', 'kp']);

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})();
