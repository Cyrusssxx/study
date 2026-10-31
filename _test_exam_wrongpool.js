// 模拟考「仅模拟考错题」模式回归测试
//
// 需求：组卷选项里加一个池子，只抽**历次模拟考里做错的题**。
// 与「仅错题」的区别：错题本（wrong store）混了刷题/套卷/模拟考所有来源，
// 这个池子只认模拟考这一条线。
//
// 口径（本测试锁定）：
//   · 同一题在多场模拟考出现 → 以**最后一场**的作答为准（后来做对了就不算错题）
//   · 未作答也算错（与成绩单口径一致）
//   · 已废弃（abandoned）的会话不计入
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_wrongpool.js
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
const EXAM_SRC = fs.readFileSync(path.join(ROOT, 'pwa/exam.html'), 'utf8');
const BACKEND_SRC = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');

const FIXTURE = {
  subject: 'cn', title: '计算机网络', source: 'test',
  questions: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    id: 'cn_000' + n, number: n, content: '题干' + n,
    options: { A: '甲', B: '乙', C: '丙', D: '丁' }, answer: 'A', explanation: '',
    chapter: '第1章 概述', section: '1.1 概念'
  }))
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const idb = new IDBFactory();
  let html = EXAM_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/exam.html',
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.fetch = async (url) => {
        const u = String(url);
        let obj;
        if (u.includes('data/notes/') || u.includes('_map.json') || u.includes('algo_notes')) obj = { chapters: [], sections: [] };
        else if (/data\/cn\.json/.test(u)) obj = JSON.parse(JSON.stringify(FIXTURE));
        else if (/data\/[a-z_0-9]+\.json/.test(u)) obj = { subject: 'x', questions: [] };
        else obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        return { ok: true, status: 200, json: async () => obj };
      };
    }
  });
  const w = dom.window;
  await sleep(300);

  const db = await w.openDB();
  const put = (store, rows) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    for (const r of rows) tx.objectStore(store).put(r);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });

  // 三场模拟考：
  //   e1 (10/20)：cn_0001 答错(B)、cn_0002 答对(A)、cn_0003 未作答
  //   e2 (10/25)：cn_0001 答对(A)   ← 最后一场做对了 → 不该再算错题
  //   e3 (10/26)：cn_0004 答错(C)
  //   e4 (abandoned)：cn_0005 答错 → 不该计入
  const mkExam = (id, sub, answers, qids, status) => ({
    id, mode: 'full', question_ids: qids, answers,
    total_count: qids.length, correct_count: 0, score: 0, duration_sec: 3600,
    status: status || 'submitted', started_at: sub, submitted_at: sub
  });
  await put('exams', [
    mkExam(1, '2026-10-20 10:00:00', { cn_0001: 'B', cn_0002: 'A' }, ['cn_0001', 'cn_0002', 'cn_0003']),
    mkExam(2, '2026-10-25 10:00:00', { cn_0001: 'A' }, ['cn_0001']),
    mkExam(3, '2026-10-26 10:00:00', { cn_0004: 'C' }, ['cn_0004']),
    mkExam(4, '2026-10-27 10:00:00', { cn_0005: 'B' }, ['cn_0005'], 'abandoned')
  ]);

  console.log('--- 一、池子口径 ---');
  // 首屏统计（pool）不碰题库：老会话没有 wrong_ids 时数字为 0（性能取舍）
  const pool0 = await w.api('/api/exam/pool').then(r => r.json());
  check('首屏 pool 不触发题库（老会话暂算 0）', pool0.exam_wrong, 0);

  // 补算接口才遍历题库，返回准确结果
  const calc = await w.api('/api/exam/examwrong').then(r => r.json());
  check('补算后：模拟考错题 2 题（cn_0003 未作答 + cn_0004 答错）', calc.exam_wrong, 2);
  check('分科统计：网络 2', calc.exam_wrong_by_subject.cn, 2);
  check('其它科目为 0', [calc.exam_wrong_by_subject.ds, calc.exam_wrong_by_subject.co, calc.exam_wrong_by_subject.os], [0, 0, 0]);

  // 补算会把 wrong_ids 写回会话，之后 pool 直接命中
  const pool1 = await w.api('/api/exam/pool').then(r => r.json());
  check('写回后 pool 也能拿到准确数字', pool1.exam_wrong, 2);

  console.log('\n--- 二、组卷只抽模拟考错题 ---');
  const g = await w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'examwrong', count: 5 })
  }).then(r => r.json());
  check('组卷成功', !!g.exam_id, true);
  const ids = (g.questions || []).map(q => q.id);
  check('前 2 题 = 池内两题', ids.slice(0, 2).sort(), ['cn_0003', 'cn_0004']);
  check('池子不够时从全题库补足到 5', ids.length, 5);
  check('后做对的 cn_0001 不在池内', ids.slice(0, 2).includes('cn_0001'), false);
  check('已废弃会话的 cn_0005 不在池内', ids.slice(0, 2).includes('cn_0005'), false);
  check('答对过的 cn_0002 不在池内', ids.slice(0, 2).includes('cn_0002'), false);
  check('组卷结果不含答案', (g.questions || []).every(q => q.answer === undefined), true);

  console.log('\n--- 三、与「仅错题」池子相互独立 ---');
  // 错题本里有 cn_0001（刷题来源错），但它不在模拟考错题池
  await put('wrong', [{ question_id: 'cn_0001', subject: 'cn', wrong_count: 2, is_resolved: 0, last_wrong_at: '2026-10-19 09:00:00' }]);
  const pool2 = await w.api('/api/exam/pool').then(r => r.json());
  check('错题本有 1 题，模拟考错题仍是 2 题', pool2.exam_wrong, 2);
  const gw = await w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'wrong', count: 5 })
  }).then(r => r.json());
  check('「仅错题」模式仍能抽到 cn_0001', (gw.questions || []).map(q => q.id).slice(0, 1), ['cn_0001']);

  console.log('\n--- 四、前端接线 ---');
  const sel = w.document.getElementById('examMode');
  const opt = [...sel.options].find(o => o.value === 'examwrong');
  check('下拉有 examwrong 选项', !!opt, true);
  check('选项文案（含手动标记 + 留池规则）', opt ? opt.textContent.trim() : '', '仅模拟考错题（含手动标记 · 做对后留池不抽）');
  check('「仅错题」文案标注了来源范围',
    /仅错题（错题本全部来源）/.test(sel.innerHTML), true);
  check('MODE_NAMES 有 examwrong', /examwrong: '仅模拟考错题'/.test(EXAM_SRC), true);
  check('getExamTitle 有对应标题', /if \(mode === 'examwrong'\) return '模拟考错题考试';/.test(EXAM_SRC), true);
  check('空池有引导文案', /模拟考做错的题会自动进来；试卷回顾里点「7 天后重练」「猜对了」也会加进来/.test(EXAM_SRC), true);
  check('组卷前提示口径（含留池不抽规则）', /模拟考做错的题 \+ 手动标记题 · 做对一次后仍留在池子里/.test(EXAM_SRC), true);

  console.log('\n--- 五、源码口径 ---');
  check('池子成员身份持久化（kind=examwrong）', /kind: 'examwrong'/.test(BACKEND_SRC), true);
  check('池子 = 动态错题 ∪ 持久标记', /async function examWrongPoolQids/.test(BACKEND_SRC), true);
  check('做错会清掉 mastered（重新可抽）', /rdWrong\.mastered = 0/.test(BACKEND_SRC), true);
  check('backend 有 examWrongQids', /async function examWrongQids\(calc\)/.test(BACKEND_SRC), true);
  check('只取已交卷会话', /filter\(e => e\.status === 'submitted'\)/.test(BACKEND_SRC), true);
  check('以最后一场为准（latest 覆盖）', /for \(const \[qid, isWrong\] of latest\) if \(isWrong\) out\.push\(qid\);/.test(BACKEND_SRC), true);
  check('未作答算错（!ua）', /if \(!ua \|\| ua !== q\.answer\) ids\.push\(qid\);/.test(BACKEND_SRC), true);
  check('交卷时固化 wrong_ids（避免事后遍历题库）',
    /exam\.wrong_ids = details\.filter\(d => !d\.is_correct\)\.map\(d => d\.id\);/.test(BACKEND_SRC), true);
  check('首屏 pool 传 calc=false（不碰题库）',
    /examWrongQids\(false\)/.test(BACKEND_SRC), true);
  check('后台补算接口存在', /action === 'examwrong'/.test(BACKEND_SRC), true);
  check('组卷 isSpecial 含 examwrong',
    /const isSpecial = mode === 'favorites' \|\| mode === 'wrong' \|\| mode === 'unfamiliar' \|\| mode === 'examwrong';/.test(BACKEND_SRC), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
