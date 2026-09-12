// 笔记图片「贴两张只留一张」根因回归测试。
//
// 覆盖的 4 个真实缺陷：
//   1) 保存竞态：saveNote 曾用响应回写 q.note_images，并发保存时旧响应会把新图覆盖掉
//      —— 现为串行队列 + 本地权威（断言：连续两次保存后仍是 2 张，且源码不再有响应回写）
//   2) 粘贴多图健壮性：getAsFile() 返回 null 的项曾被 filter(Boolean) 静默丢弃
//      —— 现逐项收集，并用剪贴板 HTML 内嵌 base64 兜底
//   3) 单张压缩失败中断整批：旧实现 for + 单个 try/catch，第 2 张抛错 → 整批只剩第 1 张
//      —— 现逐张独立 try/catch
//   4) DB 版本：新增 store 未提升 DB_VER → 老用户库不升级、新 store 不存在（写入静默失败）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_note_images.js
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
// 允许用 QUIZ_HTML 指向另一份 quiz.html（用于对旧实现做反向验证，确认测试能抓到旧缺陷）
const QUIZ_PATH = path.resolve(ROOT, process.env.QUIZ_HTML || 'pwa/quiz.html');
const QUIZ_SRC = fs.readFileSync(QUIZ_PATH, 'utf8');
const BACKEND_SRC = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');

const FIXTURE = {
  subject: 'cn',
  title: '计算机网络',
  source: 'test',
  questions: [
    { id: 'cn_0001', number: 1, content: '测试题干一', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 计算机网络体系结构', section: '1.1 计算机网络概述', subsection: '1.1.1 计算机网络的概念' },
    { id: 'cn_0002', number: 2, content: '测试题干二', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '', chapter: '第1章 计算机网络体系结构', section: '1.1 计算机网络概述', subsection: '1.1.1 计算机网络的概念' }
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
  // 内联外部脚本，避免 jsdom 走网络
  let html = QUIZ_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return '<script>' + fs.readFileSync(p, 'utf8') + '</script>';
  });

  let imgSeq = 0;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/quiz.html?subject=cn',
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { };
      w.confirm = () => true;
      // jsdom 无全局 CSS 对象，页面用到了 CSS.escape（选择器转义）
      w.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
      // fetch：题库返回 fixture，其它一律返回安全空结构（避免 data.questions is not iterable）
      w.fetch = async (url) => {
        const u = String(url);
        let obj;
        if (u.includes('data/notes/') || u.includes('_map.json') || u.includes('algo_notes')) {
          obj = { chapters: [], sections: [] };
        } else if (/data\/[a-z_0-9]+\.json/.test(u)) {
          obj = JSON.parse(JSON.stringify(FIXTURE));
        } else {
          obj = { questions: [], chapters: [], sections: [], subjects: {}, total: 0 };
        }
        return {
          ok: true, status: 200,
          json: async () => obj,
          blob: async () => ({ type: 'image/png', size: 8 })
        };
      };
      // canvas / Image 打桩，让 compressImage 立即产出唯一 base64
      w.URL.createObjectURL = (f) => 'blob:' + ((f && f.name) || 'x');
      w.URL.revokeObjectURL = () => { };
      w.Image = class {
        set src(v) {
          setTimeout(() => {
            if (String(v).includes('BAD')) { this.onerror && this.onerror(); }
            else { this.width = 100; this.height = 100; this.onload && this.onload(); }
          }, 0);
        }
      };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: '', fillRect() { }, drawImage() { } });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,N' + (++imgSeq);
    }
  });
  const w = dom.window;

  const ready = await waitFor(() => w.document.querySelector('.options-list') && w.document.querySelector('.question-card'), 8000);
  check('页面初始化完成（题目渲染）', ready, true);
  if (!ready) { console.log('\n初始化失败，终止'); process.exit(1); }

  const noteImgCount = () => w.document.querySelectorAll('.note-img-item').length;
  const dbNotes = () => new Promise((res, rej) => {
    const req = w.indexedDB.open('quiz408', 3);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes').objectStore('notes').getAll();
      tx.onsuccess = () => res(tx.result);
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
  const fakeFile = (name) => ({ name, type: 'image/png', size: 16 });

  // ---------- 静态断言：防回归 ----------
  console.log('\n--- 静态断言（防回归） ---');
  check('saveNote 不再用响应回写 note_images', /q\.note_images\s*=\s*result\.images/.test(QUIZ_SRC), false);
  check('saveNote 不再用响应回写 note', /q\.note\s*=\s*result\.note/.test(QUIZ_SRC), false);
  check('存在串行保存链 _noteSaveChain', /_noteSaveChain/.test(QUIZ_SRC), true);
  check('DB_VER 已提升到 3', /const DB_VER = 3;/.test(BACKEND_SRC), true);

  // ---------- 场景 1：一次粘贴两张 ----------
  console.log('\n--- 场景 1：一次粘贴 2 张图 ---');
  w.toggleNote();                                   // 展开笔记面板
  check('笔记面板已展开', !!w.document.getElementById('noteInput'), true);
  const ev2 = {
    preventDefault() { },
    clipboardData: {
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => fakeFile('a.png') },
        { kind: 'file', type: 'image/png', getAsFile: () => fakeFile('b.png') }
      ],
      getData: () => ''
    }
  };
  await w.pasteNoteImage(ev2);
  await sleep(300);
  check('DOM 显示 2 张图', noteImgCount(), 2);
  let notes = await dbNotes();
  const rec1 = notes.find(n => n.question_id === 'cn_0001');
  check('DB 中 cn_0001 存有 2 张图', rec1 ? rec1.images.length : 0, 2);
  check('两张图内容不同（未互相覆盖）', rec1 && rec1.images[0] !== rec1.images[1], true);

  // ---------- 场景 2：第二张 getAsFile() 返回 null，靠 HTML 兜底 ----------
  console.log('\n--- 场景 2：file 项只给 1 张，HTML 里有 2 张（兜底） ---');
  const evHtml = {
    preventDefault() { },
    clipboardData: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => fakeFile('only.png') }],
      getData: (t) => (t === 'text/html'
        ? '<p>x</p><img src="data:image/png;base64,AAA1"><img src="data:image/png;base64,AAA2">'
        : '')
    }
  };
  await w.pasteNoteImage(evHtml);
  await sleep(300);
  check('HTML 兜底后 DOM 共 4 张图', noteImgCount(), 4);
  notes = await dbNotes();
  const rec2 = notes.find(n => n.question_id === 'cn_0001');
  check('DB 中累计 4 张图', rec2 ? rec2.images.length : 0, 4);

  // ---------- 场景 3：单张压缩失败不中断整批 ----------
  console.log('\n--- 场景 3：一张失败不影响其他 ---');
  const evBad = {
    preventDefault() { },
    clipboardData: {
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => fakeFile('BAD-1.png') },
        { kind: 'file', type: 'image/png', getAsFile: () => fakeFile('ok-2.png') }
      ],
      getData: () => ''
    }
  };
  await w.pasteNoteImage(evBad);
  await sleep(300);
  check('失败一张后仍新增 1 张（共 5 张）', noteImgCount(), 5);

  // ---------- 场景 4：切题往返后图片不丢 ----------
  console.log('\n--- 场景 4：切题往返 ---');
  w.nextQuestion();
  await sleep(200);
  w.prevQuestion();                                  // 回到第 1 题
  await sleep(300);
  check('切题往返后仍为 5 张', noteImgCount(), 5);
  notes = await dbNotes();
  const rec3 = notes.find(n => n.question_id === 'cn_0001');
  check('DB 仍为 5 张', rec3 ? rec3.images.length : 0, 5);

  // ---------- 场景 5：并发保存不丢（串行队列） ----------
  console.log('\n--- 场景 5：连续快速保存（并发窗口） ---');
  const evOne = () => ({
    preventDefault() { },
    clipboardData: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => fakeFile('r.png') }],
      getData: () => ''
    }
  });
  // 不 await，连续触发两次（模拟手速快的连点/连续粘贴）
  const p1 = w.pasteNoteImage(evOne());
  const p2 = w.pasteNoteImage(evOne());
  await Promise.all([p1, p2]);
  await sleep(400);
  check('并发两次粘贴后共 7 张', noteImgCount(), 7);
  notes = await dbNotes();
  const rec4 = notes.find(n => n.question_id === 'cn_0001');
  check('DB 最终为 7 张（未被旧响应覆盖）', rec4 ? rec4.images.length : 0, 7);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
