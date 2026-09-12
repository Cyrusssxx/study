// 验证「切换模式跳章节」修复：切模式后若新题集仍含当前题，应停在原题，
// 而不是无条件跳回第 1 题 / 按新模式存档恢复 / 被章节定位拉走。
//
// 覆盖场景：
//   1) 顺序模式刷到第 3 章某题 → 切收藏模式（该题已收藏）→ 仍停在该题
//   2) 切模式后当前题不在新题集 → 回第 1 题（合理 fallback，不报错）
//   3) 切模式前有防抖笔记保存 pending → 先冲刷到原题，不写错题
//   4) 位置存档（quiz_pos_<科目>_<模式>）不覆盖切模式保留的原题
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_mode_switch.js
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
const QUIZ_SRC = fs.readFileSync(path.join(ROOT, 'pwa/quiz.html'), 'utf8');

// 4 道题：1/2 属第1章，3/4 属第3章 —— 用于区分「是否跳到别的章节」
const FIXTURE = {
  subject: 'cn',
  title: '计算机网络',
  source: 'test',
  questions: [
    { id: 'cn_0001', number: 1, content: '题一', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 计算机网络体系结构', section: '1.1 概述', subsection: '1.1.1 概念' },
    { id: 'cn_0002', number: 2, content: '题二', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 计算机网络体系结构', section: '1.1 概述', subsection: '1.1.1 概念' },
    { id: 'cn_0003', number: 3, content: '题三', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第3章 数据链路层', section: '3.1 概述', subsection: '3.1.1 概念' },
    { id: 'cn_0004', number: 4, content: '题四', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第3章 数据链路层', section: '3.1 概述', subsection: '3.1.1 概念' }
  ]
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(30);
  }
  return false;
}

(async () => {
  let html = QUIZ_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return '<script>' + fs.readFileSync(p, 'utf8') + '</script>';
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/quiz.html?subject=cn',
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
      w.fetch = async (u) => {
        const s = String(u);
        let obj;
        if (s.includes('data/notes/') || s.includes('_map.json') || s.includes('algo_notes')) obj = { chapters: [], sections: [] };
        else if (/data\/[a-z_0-9]+\.json/.test(s)) obj = JSON.parse(JSON.stringify(FIXTURE));
        else obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        return { ok: true, status: 200, json: async () => obj, blob: async () => ({ type: 'image/png' }) };
      };
    }
  });
  const w = dom.window;

  // 当前渲染题目的章节（.chapter-badge 文本），用于断言「是否跳章节」
  const curChapter = () => {
    const b = w.document.querySelector('.chapter-badge');
    return b ? b.textContent.trim() : '';
  };
  // 当前渲染题目的题号（.question-number 文本）
  const curNum = () => {
    const n = w.document.querySelector('.question-number');
    return n ? n.textContent.trim() : '';
  };
  // 当前题 id：题号 N → cn_000N（fixture 约定 id 与 number 对应）
  const curId = () => {
    const m = curNum().match(/本轮第 (\d+) 题/);
    return m ? 'cn_000' + m[1] : '';
  };

  const ready = await waitFor(() => w.document.querySelector('.options-list'), 8000);
  check('页面初始化完成', ready, true);
  if (!ready) { console.log('初始化失败'); process.exit(1); }

  const post = (url) => w.api(url, { method: 'POST' }).then(r => r.json());
  const waitLoad = async () => {
    // 切模式后 loadQuizQuestions 是异步的，轮询等待题目区重渲染且题号变化
    for (let i = 0; i < 100; i++) {
      await sleep(30);
      if (w.document.querySelector('.options-list')) return;
    }
  };

  // ---------- 场景 1：顺序刷到第3章 → 切收藏模式 → 停回原题 ----------
  console.log('\n--- 场景 1：切模式保留当前题 ---');
  check('初始在第1章', curChapter().includes('第1章'), true);
  await post('/api/favorite/cn_0003');          // 收藏第3章题
  await post('/api/favorite/cn_0001');          // 也收藏第1章题（让收藏题集包含两个章节）
  // 顺序模式一路刷到 cn_0003（第 4 题位置不对，这里直接 next 两次到第 3 题）
  w.nextQuestion(); await sleep(60);
  w.nextQuestion(); await sleep(60);
  check('已刷到第3章题', curChapter().includes('第3章'), true);
  // 切到收藏模式
  w.switchPracticeMode('favorite');
  await waitLoad(); await sleep(200);
  check('切收藏后仍在第3章（原题保留）', curChapter().includes('第3章'), true);

  // ---------- 场景 2：切模式后当前题不在新题集 → 合理回退第 1 题 ----------
  console.log('\n--- 场景 2：当前题不在新题集时回退 ---');
  w.switchPracticeMode('sequential');           // 先回顺序模式
  await waitLoad(); await sleep(100);
  w.nextQuestion(); w.nextQuestion(); await sleep(100);   // 又刷到第3章 cn_0003
  check('又回到第3章', curChapter().includes('第3章'), true);
  w.switchPracticeMode('dontknow');             // 当前题未标记"不会" → 题集不含它
  await waitLoad(); await sleep(200);
  // dontknow 题集为空 → 显示空状态「还没有标记"不会"」
  check('切到空题集显示空状态', w.document.querySelector('.empty-state h3') ? w.document.querySelector('.empty-state h3').textContent : '', '暂无题目');

  // ---------- 场景 3：切模式前有防抖笔记 pending，先冲刷到原题 ----------
  console.log('\n--- 场景 3：切模式前冲刷笔记 ---');
  w.switchPracticeMode('sequential');           // 回顺序模式（可能恢复上次位置，落到任意题）
  await waitLoad(); await sleep(100);
  const t3id = curId();                         // 记录当前题 id（笔记将写到这里）
  w.toggleNote();                               // 展开笔记面板
  const ni = w.document.getElementById('noteInput');
  ni.innerHTML = '<p>切模式前的笔记</p>';
  ni.dispatchEvent(new w.Event('input', { bubbles: true }));   // 触发 onNoteInput → 800ms 防抖 pending
  await sleep(50);                              // 防抖还没触发
  w.switchPracticeMode('favorite');             // 切模式应 flushNoteSave 先保存
  await waitLoad(); await sleep(400);
  const saved = await (await w.api('/api/note/' + t3id)).json();   // 原题（当前题）id
  check('切模式前笔记已入库到原题', saved.note.includes('切模式前的笔记'), true);
  const savedWrong = await (await w.api('/api/note/' + (t3id === 'cn_0003' ? 'cn_0001' : 'cn_0003'))).json();
  check('笔记未串题到其他题', savedWrong.note, '');

  // ---------- 场景 4：位置存档不覆盖切模式保留的原题 ----------
  console.log('\n--- 场景 4：位置存档不覆盖保留的原题 ---');
  try { w.localStorage.setItem('quiz_pos_cn_favorite', JSON.stringify({ qid: 'cn_0001', idx: 0, ts: Date.now() })); } catch (e) { }
  w.switchPracticeMode('sequential');
  await waitLoad(); await sleep(100);
  w.nextQuestion(); w.nextQuestion(); await sleep(100);   // 刷到 cn_0003
  w.switchPracticeMode('favorite');             // 存档指向 cn_0001，但 preserve 应优先
  await waitLoad(); await sleep(200);
  check('切收藏后停在原题而非存档位置', curChapter().includes('第3章'), true);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
