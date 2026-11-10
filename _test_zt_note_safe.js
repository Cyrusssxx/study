// 真题笔记「不会被空 DOM 误删」回归（2026-11-10）
//
// 背景：用户反馈 zhenti 里保存的笔记集中丢失。
// 后端 /api/note 的 POST 语义是「content 为空且无图片 → dbDelete」，
// 而前端 flushNote() 只要 DOM 内容与 noteMap 不同就保存。于是只要出现
// 「编辑器还没回填内容（DOM 为空）但 state.noteMap 有内容」，一次自动保存
// 就会把库里已存的笔记删掉。
//
// 本次加固三处：
//   1) initNoteEditors 回填完成后才打 noteLoaded 标记；
//      flushNote 只处理带该标记的编辑器（未装载的空 DOM 直接跳过）。
//   2) flushNote 自动保存不负责清空：cur 为空而库里有内容时不写。
//      真要删除笔记，走「保存笔记」按钮（saveZtNoteNow 显式路径）。
//   3) applyNoteAlias 不拿「空记录」覆盖另一边（会显示成笔记丢了）。
//   另：renderPaper 重绘整卷前先 flushNote，避免未落盘内容丢。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_note_safe.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HTML = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const DATI = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');
const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');
const ALIAS = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/note_alias.json'), 'utf8'));

console.log('--- 一、静态：三处防误删 + 后端空删语义 ---');
check('后端空内容即删除（前端必须避免误发空保存）',
  /if \(content \|\| images\.length\) \{[\s\S]{0,200}?\} else \{[\s\S]{0,80}?dbDelete\('notes', qid\)/.test(BACKEND), true);
check('initNoteEditors 回填后才打 noteLoaded',
  /loadNoteIntoEditor\(el, state\.noteMap\[el\.dataset\.qid\] \|\| ''\);[\s\S]{0,220}?el\.dataset\.noteLoaded = '1';/.test(JS), true);
check('flushNote 跳过未回填的编辑器',
  /if \(!el\.dataset\.noteLoaded\) return;/.test(JS), true);
check('flushNote 自动保存不清空笔记',
  /if \(!cur && old\) return;/.test(JS), true);
check('flushNote 已暴露（便于自检/回归）', /copyZtCard, flushNote,/.test(JS), true);
check('renderPaper 重绘前先 flushNote',
  /async function renderPaper\(\) \{\s*flushNote\(\);/.test(JS), true);
check('applyNoteAlias 用 has() 判断「有笔记」，空记录不算',
  /const has = rec => !!\(rec && \(\(rec\.content && rec\.content\.trim\(\)\) \|\| \(rec\.images && rec\.images\.length\)\)\)/.test(JS), true);
check('dati 自动保存同样不清空',
  /if \(!html && \(cur\.content \|\| ''\)\.trim\(\)\) return;/.test(DATI), true);
check('后端允许规范键（首段非科目）读写笔记',
  /const maybeSub = String\(qid\)\.split\('_'\)\[0\];\s*\n\s*const subject = SUBJECTS\[maybeSub\] \? maybeSub : '';/.test(BACKEND), true);
check('saveNote 校验保存结果并回滚（不再静默失败）',
  /if \(!resp \|\| !resp\.ok\) \{[\s\S]{0,260}?state\.noteMap\[qid\] = before;/.test(JS), true);

let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  console.log('\n--- 二、运行时：空 DOM / 清空 / 显式保存 ---');
  const cache = {};
  const readFile = f => {
    if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    return cache[f];
  };
  const html = HTML.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
  }).replace(/<link\b[^>]*>/gi, '');

  // 同一个 fake-indexeddb 实例跨两个 JSDOM 复用：第一轮建库 + 写入笔记，第二轮读回来
  const idb = new IDBFactory();
  const boot = () => {
    const vc = new VC(); vc.on('jsdomError', () => { });
    return new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'http://localhost/zhenti.html', virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = idb; w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true;
        w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.requestAnimationFrame = cb => setTimeout(cb, 0);
        w.scrollBy = () => { }; w.scrollTo = () => { };
        w.fetch = async u => {
          const m = String(u).match(/data\/[\w./-]+\.(json|svg)/);
          if (m) {
            try {
              const t = readFile(m[0]);
              const isSvg = /\.svg$/.test(m[0]);
              return { ok: true, status: 200,
                text: async () => (isSvg ? t.replace(/\s*color-scheme:\s*[^;"']*/g, '') : t),
                json: async () => JSON.parse(t) };
            } catch (e) { return { ok: false, status: 404, text: async () => '', json: async () => ({}) }; }
          }
          return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
      }
    });
  };
  const waitReady = async (w, d) => {
    for (let i = 0; i < 80; i++) { await sleep(100); if (d.querySelector('#yearList .ol-nav-item')) break; }
    await sleep(400);
  };

  // 第一轮：让 backend 建库，取第一张卡的 iid
  let dom = boot();
  await waitReady(dom.window, dom.window.document);
  const card = dom.window.document.querySelector('#ztMain .question-card');
  check('拿到第一张题卡', !!card, true);
  if (!card) { dom.window.close(); process.exit(1); }
  const iid = card.dataset.iid;
  const noteKey = ALIAS[iid] || iid;
  const db1 = await dom.window.openDB();
  const putNote = (key, content, images) => new Promise((res, rej) => {
    const tx = db1.transaction('notes', 'readwrite');
    tx.objectStore('notes').put({ question_id: key, subject: String(key).split('_')[0], content, images: images || [], updated_at: '2026-11-01 10:00:00' });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const delNote = key => new Promise((res, rej) => {
    const tx = db1.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete(key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const NOTE_TEXT = '<p>预置笔记内容 ABC</p>';
  await putNote(noteKey, NOTE_TEXT);
  // 再预置一对「规范键有内容 / 本地键空记录」，验证空记录不会覆盖显示
  await putNote('zt2015_42', '<p>规范键里的笔记 XYZ</p>');
  await putNote('ds_zt2015_42', '');
  dom.window.close();

  // 第二轮：同一个库，笔记应被 loadStores 读进来
  dom = boot();
  const w = dom.window, d = w.document;
  await waitReady(w, d);

  const apiNote = async key => (await (await w.api('/api/note/' + encodeURIComponent(key))).json());
  // 规范键（zt2015_42）必须能读写——首段不是科目，曾被 400 拒绝导致大题笔记保存静默失败
  const specResp = await w.api('/api/note/' + encodeURIComponent('zt2015_42'));
  check('规范键可读（不再 400）', specResp.ok, true);
  const postSpec = await w.api('/api/note/' + encodeURIComponent('zt2015_42'), {
    method: 'POST', body: JSON.stringify({ content: '<p>规范键写入测试</p>', images: [] })
  });
  check('规范键可写（不再 400）', postSpec.ok, true);
  check('规范键写完能读回', (await apiNote('zt2015_42')).note, '<p>规范键写入测试</p>');
  // 恢复后面 2015 用例要用的内容（走同一条写入路径）
  await w.api('/api/note/' + encodeURIComponent('zt2015_42'), {
    method: 'POST', body: JSON.stringify({ content: '<p>规范键里的笔记 XYZ</p>', images: [] })
  });

  check('库里的预置笔记还在（前提）', (await apiNote(noteKey)).note, NOTE_TEXT);

  // 展开该题笔记 → 编辑器应回填
  w.toggleNotePanel(iid);
  await sleep(300);
  const ed = () => d.querySelector('.zt-note-input[data-qid="' + iid + '"]');
  check('笔记面板已展开', !!ed(), true);
  check('编辑器回填了预置内容', /预置笔记内容 ABC/.test((ed() || {}).innerHTML || ''), true);
  check('编辑器已打 noteLoaded 标记', (ed() || {}).dataset ? ed().dataset.noteLoaded : '', '1');

  // ① 模拟「还没回填」的空编辑器：去掉标记并清空 DOM → flushNote 必须跳过
  ed().removeAttribute('data-note-loaded');
  ed().dataset.noteLoaded = '';
  delete ed().dataset.noteLoaded;
  ed().innerHTML = '';
  w.flushNote();
  await sleep(200);
  check('未回填的空 DOM 不会删除笔记', (await apiNote(noteKey)).note, NOTE_TEXT);

  // ② 已回填但被清空 → 自动保存不负责清空
  ed().dataset.noteLoaded = '1';
  ed().innerHTML = '';
  w.flushNote();
  await sleep(200);
  check('清空 DOM 后自动保存仍不删除', (await apiNote(noteKey)).note, NOTE_TEXT);

  // ③ 显式点「保存笔记」才允许清空
  w.saveZtNoteNow(iid);
  await sleep(250);
  check('显式保存才删除（记录消失）', (await apiNote(noteKey)).note, '');

  // ④ 整卷重绘（展开全部答案）不会误删其它笔记
  w.switchYear(2015);
  await sleep(600);
  const ed42 = d.querySelector('.zt-note-input[data-qid="ds_zt2015_42"]');
  if (ed42) {
    check('2015-42 本地键空记录被规范键内容填充', /规范键里的笔记 XYZ/.test(ed42.innerHTML), true);
  } else {
    w.toggleNotePanel('ds_zt2015_42');
    await sleep(300);
    const e2 = d.querySelector('.zt-note-input[data-qid="ds_zt2015_42"]');
    check('2015-42 本地键空记录被规范键内容填充', !!e2 && /规范键里的笔记 XYZ/.test(e2.innerHTML), true);
  }
  w.toggleShowAll();
  await sleep(500);
  check('重绘/展开全部后规范键笔记仍在', (await apiNote('zt2015_42')).note, '<p>规范键里的笔记 XYZ</p>');

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
