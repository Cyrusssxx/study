// 试卷回顾：题号面板「答对标绿 + 显示选项」+「不熟题进下次练习池」回归测试
//
// 背景（用户截图反馈）：
//   1) 试卷回顾右侧题号面板全是白格 —— 因为面板只读 answered[]，而 exam_review 模式
//      从不填充它（题目带的是 exam_user_answer，不是 last_status）。答对的题看不出对。
//   2) 想在格子里直接看到本场选了哪个选项，不点进去也能复盘。
//   3) 「不熟」标记只是打了个 tag，没有明确的"下次练习"去处。
//
// 覆盖：
//   一、题号面板
//      1) 答对 → correct 类（绿）；答错 → wrong 类（红）；未作答 → 两者都不是
//      2) 每格右下角显示本场选项字母（多空题 BAA 按长度缩字号）
//      3) 当前题同时带 current
//   二、下次练习池
//      4) 点「不熟」→ unfamiliar store 落库
//      5) 题号格出现 unm 角标（已加入练习池的可见反馈）
//      6) 轻提示文案出现，1.8s 后消失
//      7) 模拟考组卷 mode=unfamiliar 只抽不熟/不会池里的题
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_review_marks.js
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

// 4 道题：1 对、2 错、3 对、4 未作答；另加 5 用来测多空题选项显示
const FIXTURE = {
  subject: 'cn', title: '计算机网络', source: 'test',
  questions: [
    { id: 'cn_0001', number: 1, content: '题干一', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 概述', section: '1.1 概念' },
    { id: 'cn_0002', number: 2, content: '题干二', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 概述', section: '1.1 概念' },
    { id: 'cn_0003', number: 3, content: '题干三', options: { A: '甲', B: '乙' }, answer: 'B', explanation: '', chapter: '第1章 概述', section: '1.1 概念' },
    { id: 'cn_0004', number: 4, content: '题干四', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 概述', section: '1.1 概念' },
    { id: 'cn_0005', number: 5, content: '多空题（①）（②）（③）', options: { A: '甲', B: '乙' }, answer: 'BAA', multi_blank: true, explanation: '', chapter: '第1章 概述', section: '1.1 概念' }
  ]
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(30);
  }
  return false;
}

(async () => {
  const idb = new IDBFactory();
  let html = QUIZ_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/quiz.html?mode=exam_review&exam_id=1&filter=all&subject=cn',
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.fetch = async (url) => {
        const u = String(url);
        let obj;
        if (u.includes('data/notes/') || u.includes('_map.json') || u.includes('algo_notes')) obj = { chapters: [], sections: [] };
        // 只有计网给题目；其它三科给空库（exam_review 会遍历四科合并，都返回同一份会重复 4 遍）
        else if (/data\/cn\.json/.test(u)) obj = JSON.parse(JSON.stringify(FIXTURE));
        else if (/data\/[a-z_0-9]+\.json/.test(u)) obj = { subject: 'x', questions: [] };
        else obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        return { ok: true, status: 200, json: async () => obj };
      };
    }
  });
  const w = dom.window, doc = w.document;

  // 造一条已交卷的试卷：1 对(A)、2 错(B)、3 对(B)、4 未作答、5 多空 BAA（对）
  // 注意：页面脚本在 JSDOM 构造时就会跑一次 loadQuizQuestions，那时库里还没有这张卷。
  // 所以先等它跑完（会显示"加载失败"），再落库并手动重载。
  await sleep(400);
  const db = await w.openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('exams', 'readwrite');
    tx.objectStore('exams').put({
      id: 1, mode: 'full', question_ids: ['cn_0001', 'cn_0002', 'cn_0003', 'cn_0004', 'cn_0005'],
      answers: { cn_0001: 'A', cn_0002: 'B', cn_0003: 'B', cn_0005: 'BAA' },
      total_count: 5, correct_count: 3, score: 6, duration_sec: 3600,
      status: 'submitted', started_at: '2026-10-26 10:00:00', submitted_at: '2026-10-26 10:50:00'
    });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await w.loadQuizQuestions();

  const ready = await waitFor(() => doc.querySelectorAll('.num-btn').length >= 5);
  check('题号面板渲染出 5 格', doc.querySelectorAll('.num-btn').length, 5);

  console.log('\n--- 一、题号面板：对错颜色 + 选项字母 ---');
  const btns = [...doc.querySelectorAll('.num-btn')];
  check('第 1 题（答对）→ correct 类', btns[0].classList.contains('correct'), true);
  check('第 2 题（答错）→ wrong 类', btns[1].classList.contains('wrong'), true);
  check('第 3 题（答对）→ correct 类', btns[2].classList.contains('correct'), true);
  check('第 4 题（未作答）→ 既不对也不错的底色',
    [btns[3].classList.contains('correct'), btns[3].classList.contains('wrong')], [false, false]);
  check('第 5 题（多空全对）→ correct 类', btns[4].classList.contains('correct'), true);

  const optOf = b => (b.querySelector('.num-opt') || {}).textContent || '';
  check('答对格显示选项 A', optOf(btns[0]), 'A');
  check('答错格显示选项 B', optOf(btns[1]), 'B');
  check('未作答格不显示选项', optOf(btns[3]), '');
  check('多空题显示完整答案 BAA', optOf(btns[4]), 'BAA');
  check('多空题用 l3 小字号', (btns[4].querySelector('.num-opt') || {}).className, 'num-opt l3');
  check('单选项用 l1 字号', (btns[0].querySelector('.num-opt') || {}).className, 'num-opt l1');
  check('答错格 title 带「本场选了 B（答错）」',
    /本场选了 B（答错）/.test(btns[1].getAttribute('title') || ''), true);
  check('当前题带 current 类', btns[0].classList.contains('current'), true);

  console.log('\n--- 二、不熟 → 下次练习池 ---');
  // 点第 1 题的「不熟」按钮（当前题就是第 1 题）
  const markBtn = [...doc.querySelectorAll('.mark-btn')].find(b => b.textContent.trim() === '不熟');
  check('存在「不熟」按钮', !!markBtn, true);
  markBtn.click();
  await sleep(300);

  const marksResp = await w.api('/api/marks?kind=all').then(r => r.json());
  check('不熟池落库 1 题', marksResp.total, 1);
  check('落库的正是第 1 题', marksResp.marks[0].question_id, 'cn_0001');

  const tip = doc.getElementById('quizTip');
  check('出现轻提示', !!tip, true);
  check('提示文案指向下次练习池', /下次练习池/.test((tip || {}).textContent || ''), true);
  check('提示处于显示态', (tip || { className: '' }).className.includes('show'), true);

  const btns2 = [...doc.querySelectorAll('.num-btn')];
  check('题号格出现 unm 角标', btns2[0].classList.contains('unm'), true);
  check('其它题号没有 unm 角标', btns2[1].classList.contains('unm'), false);

  await sleep(2000);
  check('1.8s 后提示自动消失', (doc.getElementById('quizTip') || { className: '' }).className.includes('show'), false);

  console.log('\n--- 三、模拟考「仅不熟题」只抽不熟池 ---');
  // 再标一道「不会」，验证两个池合并
  await w.api('/api/mark/dontknow/cn_0003', { method: 'POST' }).then(r => r.json());
  const gen = await w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'unfamiliar', count: 5 })
  }).then(r => r.json());
  check('组卷成功', !!gen.exam_id, true);
  const ids = (gen.questions || []).map(q => q.id);
  // 池里只有 2 题、请求 5 题 → 后 3 题按既有逻辑从全题库补足；
  // 断言「优先抽的就是这两道不熟题」即可（补足部分不受此测约束）
  check('不熟池的题排在最前（2 道都抽到）', ids.slice(0, 2).sort(), ['cn_0001', 'cn_0003']);
  check('补足部分才用池外题', ids.length, 5);
  check('组卷结果不含答案（防作弊）', (gen.questions || []).every(q => q.answer === undefined), true);

  console.log('\n--- 源码层：口径不被改坏 ---');
  check('exam 模式用 exam_user_answer 初始化 answered',
    /exam_user_answer\)[\s\S]{0,160}?answered\[q\.id\] = \{/.test(QUIZ_SRC), true);
  check('不再用 last_status 覆盖试卷作答（先 exam 分支 continue）',
    /MODE === 'exam_wrong'\) && q\.exam_user_answer\)[\s\S]{0,400}?continue;/.test(QUIZ_SRC), true);
  check('backend 组卷支持 unfamiliar 池',
    /mode === 'unfamiliar'\) \{[\s\S]{0,160}?dbAll\('unfamiliar'\)/.test(
      fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8')), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
