// 模拟考抽题分层 + 池子统计 + 7 天后重练 回归测试
//
// 用户规则（2026-10-27 修订）：
//   1) 答对的题**不要 7 天冷却**，改为优先级最低 —— 排在"做过的错题"之后，
//      只要上面几层抽完就照样抽到（不是"永远不抽"）
//   2) 错题的 7 天重抽门槛保留
//   3) 试卷回顾里做对的题，可手动排进"7 天后重练"池
//
// 分层顺序：due（到期错题 + 到期重练）→ fresh（没做过）→ wrongish（做过且错题未解决）
//           → correct（做过且答对）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_pool.js
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
const QUIZ_SRC = fs.readFileSync(path.join(ROOT, 'pwa/quiz.html'), 'utf8');
const BACKEND_SRC = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');

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

const fmt = ms => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const DAY = 86400000;

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

  // 性能护栏：首屏统计（pool）绝不能触发题库加载（4 个 JSON 共 2.9MB）
  let bankFetches = 0;
  const origFetch = w.fetch;
  w.fetch = (url) => {
    if (/data\/(ds|co|os|cn)\.json/.test(String(url))) bankFetches++;
    return origFetch(url);
  };
  bankFetches = 0;
  await w.api('/api/exam/pool').then(r => r.json());
  check('首屏 pool 不加载题库（性能护栏）', bankFetches, 0);

  // 收藏池 6 题，覆盖四层：
  //   cn_0001 没做过                        → fresh
  //   cn_0002 3 天前做过、答对              → correct（最低优先，但没有冷却）
  //   cn_0003 3 天前做过、答错且未解决      → wrongish（未满 7 天，不进 due）
  //   cn_0004 8 天前答错且未解决            → due（到期错题）
  //   cn_0005 没做过，但被排了已到期的重练  → due（重练层，排在错题之后）
  //   cn_0006 排了未到期的重练              → 不参与本轮
  await put('favorites', [1, 2, 3, 4, 5, 6].map(n => ({
    question_id: 'cn_000' + n, subject: 'cn', added_at: fmt(Date.now() - 30 * DAY)
  })));
  await put('progress', [
    { question_id: 'cn_0002', subject: 'cn', answered_at: fmt(Date.now() - 3 * DAY), is_correct: 1, user_answer: 'A' },
    { question_id: 'cn_0003', subject: 'cn', answered_at: fmt(Date.now() - 3 * DAY), is_correct: 0, user_answer: 'B' },
    { question_id: 'cn_0004', subject: 'cn', answered_at: fmt(Date.now() - 8 * DAY), is_correct: 0, user_answer: 'C' }
  ]);
  await put('wrong', [
    { question_id: 'cn_0003', subject: 'cn', wrong_count: 1, is_resolved: 0, last_wrong_at: fmt(Date.now() - 3 * DAY) },
    { question_id: 'cn_0004', subject: 'cn', wrong_count: 1, is_resolved: 0, last_wrong_at: fmt(Date.now() - 8 * DAY) }
  ]);
  await put('redo', [
    { question_id: 'cn_0005', subject: 'cn', added_at: fmt(Date.now() - 10 * DAY), due_at: Date.now() - DAY },
    { question_id: 'cn_0006', subject: 'cn', added_at: fmt(Date.now()), due_at: Date.now() + 5 * DAY }
  ]);

  const gen = (mode, count) => w.api('/api/exam/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, count })
  }).then(r => r.json());

  console.log('--- 一、抽题分层顺序 ---');
  const g = await gen('favorites', 6);
  check('组卷成功', !!g.exam_id, true);
  const ids = (g.questions || []).map(q => q.id);
  const at = id => ids.indexOf(id);
  check('抽出 6 题', ids.length, 6);
  check('到期错题 cn_0004 排最前', at('cn_0004'), 0);
  check('没做过的 cn_0001 在"做过的对题"之前', at('cn_0001') < at('cn_0002'), true);
  check('做过的错题 cn_0003 在"做过的对题"之前', at('cn_0003') < at('cn_0002'), true);
  check('答对的 cn_0002 排在最后一位', at('cn_0002'), ids.length - 1);
  check('到期重练 cn_0005 也进池（排在到期错题之后）', at('cn_0005') > at('cn_0004') && at('cn_0005') >= 0, true);
  // cn_0006 本身没做过，所以它作为普通新题仍在池里；关键是它不能进 due 层
  check('未到期的重练 cn_0006 不进 due 层（排在到期重练之后）', at('cn_0006') > at('cn_0005'), true);

  console.log('\n--- 二、答对的题不再有 7 天冷却 ---');
  check('3 天前答对的题仍被抽到（没有冷却硬排除）', at('cn_0002') >= 0, true);
  check('源码里已无 cooling 层', /cooling\.push\(q\)/.test(BACKEND_SRC), false);
  check('源码分层 = due + fresh + wrongish + correct',
    /return due\.concat\(fresh, wrongish, correct\)/.test(BACKEND_SRC), true);

  console.log('\n--- 三、池子统计与抽题同口径 ---');
  // 不熟/不会各放一条「没做过」和「做过」的，验证未做数只算前者
  await put('unfamiliar', [{ question_id: 'cn_0007', subject: 'cn', added_at: fmt(Date.now()) }]);
  await put('dontknow', [
    { question_id: 'cn_0008', subject: 'cn', added_at: fmt(Date.now()) },
    { question_id: 'cn_0002', subject: 'cn', added_at: fmt(Date.now()) }   // cn_0002 做过
  ]);
  const pool = await w.api('/api/exam/pool').then(r => r.json());
  check('收藏池总数 6', pool.favorites_total, 6);
  check('待抽（没做过）3 题（cn_0001 / cn_0005 / cn_0006）', pool.favorites_fresh, 3);
  check('做过的错题 2 题（cn_0003 / cn_0004）', pool.favorites_wrongish, 2);
  check('做过的对题 1 题（cn_0002）', pool.favorites_correct, 1);
  check('三层之和 = 收藏总数',
    pool.favorites_fresh + pool.favorites_wrongish + pool.favorites_correct, pool.favorites_total);
  check('到期错题 1 题', pool.due_wrong, 1);
  check('重练池：已到期 1 / 待到期 1', [pool.redo_due, pool.redo_pending], [1, 1]);
  check('本用例没造模拟考会话 → exam_answered 0', pool.exam_answered, 0);
  check('已交卷场数 0', pool.exam_sessions, 0);
  check('不熟 1 题', pool.unfamiliar, 1);
  check('不熟池里未做的 1 题（cn_0007）', pool.unfamiliar_undone, 1);
  check('不会 2 题', pool.dontknow, 2);
  check('不会池里未做的 1 题（cn_0008；cn_0002 做过不算）', pool.dontknow_undone, 1);

  console.log('\n--- 四、7 天后重练：加入 / 取消 ---');
  const r1 = await w.api('/api/mark/redo/cn_0007', { method: 'POST' }).then(r => r.json());
  check('加入成功', r1.is_redo, true);
  check('回传冷却天数 7', r1.days, 7);
  check('due_at 约为 7 天后', Math.abs(r1.due_at - (Date.now() + 7 * DAY)) < 5000, true);
  const pool2 = await w.api('/api/exam/pool').then(r => r.json());
  check('重练池待到期 +1', pool2.redo_pending, 2);

  const r2 = await w.api('/api/mark/redo/cn_0007', { method: 'POST' }).then(r => r.json());
  check('再次点击取消', r2.is_redo, false);
  const pool3 = await w.api('/api/exam/pool').then(r => r.json());
  check('重练池待到期回到 1', pool3.redo_pending, 1);

  console.log('\n--- 五、前端：统计条 / 二次确认 / 重练按钮 ---');
  for (const id of ['examPoolBar', 'psFav', 'psFavSub', 'psExam', 'psExamSub', 'psUnfam', 'psDk']) {
    check(`设置页有 #${id}`, !!w.document.getElementById(id), true);
  }
  check('统计条 4 格', w.document.querySelectorAll('#examPoolBar .pool-cell').length, 4);
  // 第 1 格是收藏池总量（副标写待抽），第 2 格是模拟考做过 —— 两者口径不同，别混
  w.renderPoolStats(pool);
  check('第 1 格显示收藏池总量', w.document.getElementById('psFav').textContent, String(pool.favorites_total));
  check('第 1 格副标把「待抽 / 已做」拆开写', /待抽 \d+ · 已做 \d+/.test(w.document.getElementById('psFavSub').textContent), true);
  check('第 2 格显示模拟考做过题数', w.document.getElementById('psExam').textContent, String(pool.exam_answered));
  check('第 2 格副标点出场数', /模拟考做过 · \d+ 场/.test(w.document.getElementById('psExamSub').textContent), true);
  check('不熟副标带未做数', /不熟 · 未做 \d+/.test(w.document.getElementById('psUnfamSub').textContent), true);
  check('不会副标带未做数', /不会 · 未做 \d+/.test(w.document.getElementById('psDkSub').textContent), true);
  check('tooltip 分区块说明口径', /【收藏池】[\s\S]*【模拟考】[\s\S]*【标记】/.test(w.document.getElementById('examPoolBar').title), true);
  check('清除记录有二次确认', /再确认一次/.test(EXAM_SRC), true);
  check('二次确认列出会话数', /即将删除 \$\{total\} 场会话/.test(EXAM_SRC), true);
  check('quiz 有 toggleRedo', /async function toggleRedo\(questionId\)/.test(QUIZ_SRC), true);
  check('重练按钮仅在试卷回顾 + 答对时出现',
    /MODE === 'exam_review' \|\| MODE === 'exam_wrong'\) && q\.exam_user_answer && q\.exam_user_answer === q\.answer/.test(QUIZ_SRC), true);
  check('题号面板有 redo 角标类', /if \(q\.is_redo\) cls \+= ' redo'/.test(QUIZ_SRC), true);
  check('CSS 有 .num-btn.redo 角标', /\.num-btn\.redo::after\s*\{/.test(CSS), true);
  check('CSS 有 .mark-btn.mark-redo', /\.mark-btn\.mark-redo\s*\{/.test(CSS), true);

  console.log('\n--- 六、DB 版本与 store ---');
  check('DB_VER 升到 4（新增 redo store）', /const DB_VER = 4;/.test(BACKEND_SRC), true);
  check('建库列表含 redo', /'unfamiliar', 'dontknow', 'redo'/.test(BACKEND_SRC), true);

  console.log('\n--- 七、数据库被占用时不能永久转圈 ---');
  // 其他页面持有旧连接 → 升级 blocked。旧实现 1.2s 就 reject 且立刻重试，
  // 会陷入「reject → 重试 → 再 blocked」死循环，页面永远显示加载中。
  check('连接持有 onversionchange（主动让路给升级）',
    /db\.onversionchange = \(\) => \{/.test(BACKEND_SRC), true);
  check('blocked 只等 2.5 秒就降级（不无限等）',
    /req\.onblocked = \(\) => \{[\s\S]{0,700}?\}, 2500\);/.test(BACKEND_SRC), true);
  check('失败不缓存 promise（允许重试）',
    /_dbPromise = null;   \/\/ 失败不缓存/.test(BACKEND_SRC), true);
  check('exam 页有接口超时包装 apiTimeout', /function apiTimeout\(url, opts, ms\)/.test(EXAM_SRC), true);
  check('loadHistory 有 try/catch + 重试按钮',
    /async function loadHistory\(\)[\s\S]{0,700}?onclick="loadHistory\(\)">重试/.test(EXAM_SRC), true);
  check('checkActive 有超时兜底（不挡首屏）',
    /apiTimeout\('\/api\/exam\/active', undefined, 6000\)/.test(EXAM_SRC), true);
  check('统计失败把原因写进 tooltip', /池子统计读取失败：/.test(EXAM_SRC), true);

  // 行为验证：接口抛错时，历史区要给出错误 + 重试，而不是停在「加载中」
  const realApi = w.api;
  w.api = () => Promise.reject(new Error('模拟数据库不可用'));
  await w.loadHistory();
  await sleep(50);
  const histHtml = w.document.getElementById('historyList').innerHTML;
  check('接口失败后不再显示「加载中」', /加载中/.test(histHtml), false);
  check('接口失败后显示错误原因', /历史成绩加载失败/.test(histHtml), true);
  check('接口失败后提供重试按钮', /onclick="loadHistory\(\)">重试/.test(histHtml), true);
  w.api = realApi;

  console.log('\n--- 八、降级打开（其它页面占着旧连接时不卡死）---');
  check('openRaw 支持不带版本打开（不触发升级 → 不会被 blocked）',
    /function openRaw\(ver\)[\s\S]{0,260}?ver \? indexedDB\.open\(DB_NAME, ver\) : indexedDB\.open\(DB_NAME\)/.test(BACKEND_SRC), true);
  check('blocked 后降级打开当前版本',
    /if \(!e\.blocked\) throw e;[\s\S]{0,220}?const db = await openRaw\(\);/.test(BACKEND_SRC), true);
  check('降级标记暴露给页面', /window\.__dbDegraded = _dbDegraded/.test(BACKEND_SRC), true);
  check('缺 store 时读操作返回空（不抛错）',
    /async function dbAll\(store\)[\s\S]{0,160}?if \(!db\.objectStoreNames\.contains\(store\)\) return \[\];/.test(BACKEND_SRC), true);
  check('缺 store 时 dbGet 返回 undefined',
    /async function dbGet\(store, key\)[\s\S]{0,160}?if \(!db\.objectStoreNames\.contains\(store\)\) return undefined;/.test(BACKEND_SRC), true);
  check('缺 store 时写操作明确报错（不静默）',
    /async function dbPut\(store, val\)[\s\S]{0,220}?throw new Error\(`本地数据库缺少 \$\{store\}/.test(BACKEND_SRC), true);
  check('页面有降级提示条', /function showDbDegradedTip\(\)/.test(EXAM_SRC), true);
  check('CSS 有 .db-degraded-tip', /\.db-degraded-tip\s*\{/.test(CSS), true);

  // 行为：读一个不存在的 store 必须返回空数组，而不是抛错把整页拖垮
  const ghost = await w.dbAll('__not_exist__');
  check('dbAll 读不存在的 store 返回 []', ghost, []);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
