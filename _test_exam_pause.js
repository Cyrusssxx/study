// 模拟考「时间暂停器」回归测试
//
// 核心诉求：暂停期间时间不走，且**刷新/重进页面也不会被墙钟追回**。
// 这一点只有后端按 paused_sec / paused_at 扣除后重算才能保证 ——
// 如果只在前面 clearInterval，用户点暂停后关页面，回来剩余时间照样少掉。
//
// 覆盖：
//   一、后端计时扣除（真跑 examApi，fake-indexeddb）
//       1) 未暂停：remaining = 限时 - 墙钟
//       2) 暂停中：remaining 不再递减（墙钟继续走，但被 paused_at 抵消）
//       3) 恢复后：paused_sec 累加，remaining 从暂停时的值继续
//       4) 多次暂停：paused_sec 累加不覆盖
//       5) 重复 pause 幂等（不重置 paused_at）
//       6) 交卷：used_sec 扣除暂停，且已提交会话不能再 pause
//   二、前端接线
//       7) 顶栏暂停按钮 / 遮罩 / 三个函数存在
//       8) 暂停时清 interval、冻结文案、按钮变「继续」
//       9) 暂停时翻题被拦截（键盘/侧键都走 examPrev/examNext）
//      10) 交卷前自动 resume，成绩单「时长」优先用 used_sec
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_exam_pause.js
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
const SRC = fs.readFileSync(path.resolve(ROOT, 'pwa/exam.html'), 'utf8');
const BACKEND = fs.readFileSync(path.resolve(ROOT, 'pwa/js/backend.js'), 'utf8');
const CSS = fs.readFileSync(path.resolve(ROOT, 'pwa/css/style.css'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function near(name, got, want, tol = 4) {
  const ok = typeof got === 'number' && Math.abs(got - want) <= tol;
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? `（${got}s ≈ ${want}s）` : `→ 实际 ${got} 期望 ${want} ±${tol}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function inline(src) {
  return src.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    const p = path.join(ROOT, 'pwa', s);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8') + '</script>';
  });
}

(async () => {
  const idb = new IDBFactory();
  const dom = new JSDOM(inline(SRC), {
    url: 'http://localhost/exam.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      w.scrollTo = () => { };
      w.alert = () => { };
      w.confirm = () => true;
    }
  });
  const w = dom.window, doc = w.document;
  await sleep(400);

  const api = (url, opt) => w.api(url, opt);
  const post = (action, body) => api('/api/exam/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  }).then(r => r.json());

  // 直接写一条会话：started_at = 30 分钟前，限时 60 分钟
  const MIN = 60, HOUR = 3600;
  const wallAgo = 30 * MIN;
  const fmt = ms => {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const seed = async (id) => {
    const db = await w.openDB();
    const rec = {
      id, mode: 'favorites', question_ids: [], answers: {}, total_count: 0,
      correct_count: 0, score: 0, duration_sec: HOUR, status: 'in_progress',
      started_at: fmt(Date.now() - wallAgo * 1000), submitted_at: null,
      record_wrong: 1, paused_sec: 0, paused_at: null
    };
    await new Promise((res, rej) => {
      const tx = db.transaction('exams', 'readwrite');
      tx.objectStore('exams').put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return rec;
  };
  const readExam = async id => {
    const db = await w.openDB();
    return new Promise(res => {
      const tx = db.transaction('exams', 'readonly');
      const req = tx.objectStore('exams').get(id);
      req.onsuccess = () => res(req.result);
    });
  };
  const setField = async (id, patch) => {
    const rec = await readExam(id);
    Object.assign(rec, patch);
    const db = await w.openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('exams', 'readwrite');
      tx.objectStore('exams').put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  };

  console.log('--- 一、后端计时扣除（真跑 examApi）---');
  await seed('e_pause');
  const active0 = (await api('/api/exam/active').then(r => r.json())).active;
  near('未暂停：remaining = 3600 − 1800', active0.remaining_sec, HOUR - wallAgo);
  check('未暂停标记 paused=false', active0.paused, false);
  check('未暂停 paused_sec=0', active0.paused_sec, 0);

  await post('pause', { exam_id: 'e_pause' });
  const recPaused = await readExam('e_pause');
  check('pause 写入 paused_at（毫秒时间戳）', typeof recPaused.paused_at, 'number');

  // 真实场景：暂停 5 分钟 → 墙钟也前进了 5 分钟（started_at 再往前推）
  // 两者必须相互抵消，remaining 才会纹丝不动
  await setField('e_pause', {
    started_at: fmt(Date.now() - (wallAgo + 5 * MIN) * 1000),
    paused_at: Date.now() - 5 * MIN * 1000
  });
  const activePaused = (await api('/api/exam/active').then(r => r.json())).active;
  near('暂停 5 分钟：remaining 不退（墙钟已被抵扣）', activePaused.remaining_sec, HOUR - wallAgo);
  check('暂停中标记 paused=true', activePaused.paused, true);
  near('暂停中回传已暂停秒数', activePaused.paused_sec, 5 * MIN);

  // 重复 pause：不应把 paused_at 重置（否则这 5 分钟被吞掉）
  const atBefore = (await readExam('e_pause')).paused_at;
  await post('pause', { exam_id: 'e_pause' });
  check('重复 pause 幂等（paused_at 不变）', (await readExam('e_pause')).paused_at, atBefore);

  const r1 = await post('resume', { exam_id: 'e_pause' });
  near('resume 累加 paused_sec = 300', r1.paused_sec, 5 * MIN);
  const recResumed = await readExam('e_pause');
  check('resume 清空 paused_at', recResumed.paused_at, null);

  const active1 = (await api('/api/exam/active').then(r => r.json())).active;
  near('恢复后 remaining 从暂停点继续', active1.remaining_sec, HOUR - wallAgo);
  check('恢复后 paused=false', active1.paused, false);

  // 第二次暂停 2 分钟（墙钟同步前进 2 分钟）→ 累计 7 分钟
  await post('pause', { exam_id: 'e_pause' });
  await setField('e_pause', {
    started_at: fmt(Date.now() - (wallAgo + 7 * MIN) * 1000),
    paused_at: Date.now() - 2 * MIN * 1000
  });
  const r2 = await post('resume', { exam_id: 'e_pause' });
  near('两次暂停累加 = 420s（不覆盖）', r2.paused_sec, 7 * MIN);

  console.log('\n--- 交卷：used_sec 扣掉暂停 ---');
  await post('pause', { exam_id: 'e_pause' });
  await setField('e_pause', {
    started_at: fmt(Date.now() - (wallAgo + 8 * MIN) * 1000),
    paused_at: Date.now() - 1 * MIN * 1000
  });
  const sub = await post('submit', { exam_id: 'e_pause', answers: {} });
  check('交卷成功', !!sub.exam_id, true);
  const afterSubmit = await readExam('e_pause');
  // 墙钟 1800+480=2280s，累计暂停 420+60=480s → 实际用时 ≈ 1800s
  near('used_sec = 墙钟 − 累计暂停', afterSubmit.used_sec, wallAgo, 6);
  check('交卷后 paused_at 归零', afterSubmit.paused_at, null);

  const pausedOnSubmitted = await post('pause', { exam_id: 'e_pause' });
  check('已交卷的会话不能再暂停', pausedOnSubmitted.error, '考试不在进行中');

  const hist = await api('/api/exam/history').then(r => r.json());
  const rec = hist.records.find(x => x.id === 'e_pause');
  check('history 回传 used_sec', typeof rec.used_sec, 'number');
  near('history 的 used_sec 已扣暂停', rec.used_sec, afterSubmit.used_sec);

  console.log('\n--- 二、前端接线 ---');
  check('顶栏有暂停按钮', !!doc.getElementById('examPauseBtn'), true);
  check('暂停按钮文案「⏸ 暂停」', doc.getElementById('examPauseBtn').textContent.trim(), '⏸ 暂停');
  check('有全屏遮罩', !!doc.getElementById('examPauseMask'), true);
  check('遮罩内有「继续考试」', /继续考试/.test(doc.getElementById('examPauseMask').textContent), true);
  for (const fn of ['togglePause', 'pauseExam', 'resumeExam', 'setPaused', 'persistAnswers']) {
    check(`函数 ${fn} 已定义`, typeof w[fn], 'function');
  }

  // UI 行为：直接切到答题视图后按暂停（不组卷，避免依赖题库）
  w.show('examView');
  const timerEl = doc.getElementById('examTimer');
  timerEl.textContent = '⏳ 30:00';
  w.setPaused(true, 0);
  await sleep(300);
  check('暂停后计时文案冻结为「⏸ 暂停中」', timerEl.textContent, '⏸ 暂停中');
  check('暂停后遮罩可见', doc.getElementById('examPauseMask').style.display, 'flex');
  check('暂停后按钮变「▶ 继续」', doc.getElementById('examPauseBtn').textContent.trim(), '▶ 继续');
  check('暂停后计时器挂 timer-paused 类', timerEl.classList.contains('timer-paused'), true);
  check('遮罩提示：本场尚未累计暂停', doc.getElementById('examPauseHint').textContent.trim(), '本场尚未累计暂停时长');
  check('遮罩挡住答题区（z-index 低于导航栏，仍可从导航离开）',
    /\.exam-pause-mask\s*\{[^}]*position:\s*fixed/.test(CSS), true);

  w.setPaused(true, 300);
  check('累计暂停 300s 显示「5 分 0 秒」', doc.getElementById('examPauseHint').textContent.trim(), '本场已累计暂停 5 分 0 秒');

  w.setPaused(false);
  await sleep(50);
  check('恢复后遮罩隐藏', doc.getElementById('examPauseMask').style.display, 'none');
  check('恢复后按钮变回「⏸ 暂停」', doc.getElementById('examPauseBtn').textContent.trim(), '⏸ 暂停');
  check('恢复后计时器摘掉 timer-paused 类', timerEl.classList.contains('timer-paused'), false);
  check('恢复后不再是暂停文案', timerEl.textContent.includes('暂停中'), false);

  console.log('\n--- 源码层：关键接线不被改坏 ---');
  check('active 扣除暂停（wall − paused − pausedNow）', /wallSec - pausedSec - pausedNowSec/.test(BACKEND), true);
  check('后端有 pause / resume action', /action === 'pause'/.test(BACKEND) && /action === 'resume'/.test(BACKEND), true);
  check('交卷落库 used_sec', /exam\.used_sec = Math\.max\(0, wall - paused\)/.test(BACKEND), true);
  check('暂停中翻题被拦截（examPrev/Next/Goto）',
    (SRC.match(/if \(isPaused\) return;/g) || []).length >= 3, true);
  check('交卷前自动 resume', /isPaused\)[\s\S]{0,200}?\/api\/exam\/resume/.test(SRC), true);
  check('history 优先用 used_sec', /let durSec = rec\.used_sec \|\| 0/.test(SRC), true);
  check('startTimer 支持 keepState（恢复时不清超时提示）', /function startTimer\(keepState\)/.test(SRC), true);
  check('恢复会话时带 paused 参数', /enterExam\(a\.exam_id[^)]*a\.paused/.test(SRC), true);
  check('CSS 有暂停遮罩样式', /\.exam-pause-mask\s*\{/.test(CSS), true);
  check('遮罩 z-index 低于导航栏（90 < 100）', /\.exam-pause-mask\s*\{[^}]*z-index:\s*90/.test(CSS), true);
  check('暂停中计时器有独立配色', /\.exam-timer\.timer-paused\s*\{/.test(CSS), true);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
