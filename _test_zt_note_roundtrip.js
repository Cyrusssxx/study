// 真题套卷：笔记「写入 → 重开页面 → 回显 → 收起不丢」端到端回归（2026-11-10）
//
// 用户报「我做的笔记怎么又没了」。这条链路涉及三层，缺一层都会表现为「笔记没了」：
//   ① 保存：saveNote → /api/note/<noteKeyOf(iid)>（真题大题走规范键 zt2015_45）
//   ② 读取：loadStores 读 notes 表 → applyNoteAlias 把规范键拷回本页 iid
//   ③ 显示：hasNoteOf(iid) 打 ● / initNoteEditors 装填编辑器；
//      且「收起面板」flushNote 绝不能把已有内容当成清空删掉。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_note_roundtrip.js
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

let JSDOM = null, VirtualConsole = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(0);
}

// 2015 年第 45 题（OS 大题，无题库映射，走规范键 zt2015_45）
const PAPER = {
  y: 2015, n: 3,
  items: [
    { i: 44, t: 1, sid: 'os', s: 2, q: '选择题', o: ['甲', '乙', '丙', '丁'], a: 'A', an: '解析', qid: 'os_0001' },
    { i: 45, t: 2, sid: 'os', s: 7, q: '大题四十五', a: '答案', an: '大题解析' },
    { i: 46, t: 2, sid: 'os', s: 8, q: '大题四十六', a: '答案', an: '大题解析' }
  ]
};
const INDEX = { years: [2015], counts: { 2015: { choice: 1, big: 2 } }, iids: { 2015: ['os_0001', 'os_zt2015_45', 'os_zt2015_46'] } };
const ALIAS = { os_zt2015_45: 'zt2015_45', os_zt2015_46: 'zt2015_46' };
const OS_BANK = {
  subject: '操作系统', total: 1,
  questions: [{ id: 'os_0001', number: 1, content: '题干', options: { A: '甲', B: '乙', C: '丙', D: '丁' }, answer: 'A', explanation: '' }]
};

const cache = {};
const readFile = f => {
  if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
  return cache[f];
};
function makeFetch() {
  return async u => {
    const s = String(u);
    const file = (s.match(/data\/[\w./-]+\.(json|svg)/) || [])[0];
    if (file) {
      try {
        const t = readFile(file);
        if (/\.svg$/.test(file)) return { ok: true, status: 200, text: async () => t };
        if (/zt\/index\.json/.test(s)) return { ok: true, status: 200, json: async () => INDEX };
        if (/zt\/zt_2015\.json/.test(s)) return { ok: true, status: 200, json: async () => PAPER };
        if (/note_alias\.json/.test(s)) return { ok: true, status: 200, json: async () => ALIAS };
        if (/data\/os\.json/.test(s)) return { ok: true, status: 200, json: async () => OS_BANK };
        return { ok: true, status: 200, json: async () => JSON.parse(t) };
      } catch (e) { return { ok: false, status: 404, json: async () => ({}), text: async () => '' }; }
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
}

async function boot(idb) {
  const html = readFile('zhenti.html').replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    try { return '<script>' + readFile(src) + '</script>'; } catch (e) { return ''; }
  }).replace(/<link\b[^>]*>/gi, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://x.test/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = idb;                       // 两次启动共用同一份库（模拟刷新）
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.scrollTo = () => { };
      w.fetch = makeFetch();
    }
  });
  for (let i = 0; i < 50; i++) { await sleep(100); if (dom.window.document.querySelector('#yearList .ol-nav-item')) break; }
  await sleep(400);
  return dom;
}

(async () => {
  const idb = new IDBFactory();

  console.log('--- 一、首次打开：写入大题笔记与选择题笔记 ---');
  let dom = await boot(idb);
  let w = dom.window, doc = w.document;
  const cardOf = iid => doc.getElementById('card-' + iid);
  check('渲染出大题卡', !!cardOf('os_zt2015_45'), true);

  // 打开笔记面板 → 填内容 → 点「保存笔记」
  cardOf('os_zt2015_45').querySelector('[data-toggle="note"]').click();
  await sleep(300);
  let ed = cardOf('os_zt2015_45').querySelector('.note-input');
  check('笔记面板已就地展开', !!ed, true);
  ed.innerHTML = '<p>2015-45 我的大题笔记：银行家算法要先算 Need</p>';
  w.onNoteInput(ed);
  await sleep(250);
  cardOf('os_zt2015_45').querySelector('.note-save-btn').click();
  await sleep(500);

  let rows = await w.dbAll('notes');
  check('notes 表写入 1 条', rows.length, 1);
  // 别名：保存写的是规范键 zt2015_45（noteKeyOf(os_zt2015_45)）
  check('写入的是规范键 zt2015_45', rows[0] && rows[0].question_id, 'zt2015_45');
  check('内容已落库', /银行家算法/.test(rows[0] ? rows[0].content : ''), true);

  // 选择题笔记（无别名，键就是 qid）
  cardOf('os_0001').querySelector('[data-toggle="note"]').click();
  await sleep(300);
  ed = cardOf('os_0001').querySelector('.note-input');
  ed.innerHTML = '<p>选择题笔记</p>';
  w.onNoteInput(ed);
  await sleep(250);
  cardOf('os_0001').querySelector('.note-save-btn').click();
  await sleep(500);
  rows = await w.dbAll('notes');
  check('notes 表 2 条', rows.length, 2);
  check('选择题键为 os_0001', rows.some(r => r.question_id === 'os_0001'), true);

  console.log('\n--- 二、同一份库「刷新」后：● 与内容都要回来 ---');
  dom.window.close();
  dom = await boot(idb);
  w = dom.window; doc = w.document;

  check('大题卡有「笔记 ●」提示',
    !!doc.querySelector('#card-os_zt2015_45 .btn-explanation.has-note'), true);
  check('选择题卡有「笔记 ●」提示',
    !!doc.querySelector('#card-os_0001 .btn-explanation.has-note'), true);

  doc.querySelector('#card-os_zt2015_45 [data-toggle="note"]').click();
  await sleep(300);
  ed = doc.querySelector('#card-os_zt2015_45 .note-input');
  check('面板可打开', !!ed, true);
  check('编辑器回填了大题笔记内容',
    /银行家算法/.test(ed ? ed.innerHTML : ''), true);

  console.log('\n--- 三、收起面板（flushNote）不能把已有笔记删掉 ---');
  const before = await w.dbAll('notes');
  doc.querySelector('#card-os_zt2015_45 [data-toggle="note"]').click();   // 收起
  await sleep(400);
  const after = await w.dbAll('notes');
  check('收起后 notes 行数不变（没被当成清空）', after.length, before.length);
  check('收起后内容仍在', /银行家算法/.test((after.find(r => r.question_id === 'zt2015_45') || {}).content || ''), true);
  check('收起后 ● 提示仍在', !!doc.querySelector('#card-os_zt2015_45 .btn-explanation.has-note'), true);

  console.log('\n--- 四、整卷重绘（换年份 / 做题模式切换）不能吞笔记 ---');
  doc.querySelector('#card-os_zt2015_45 [data-toggle="note"]').click();   // 重新打开
  await sleep(250);
  ed = doc.querySelector('#card-os_zt2015_45 .note-input');
  ed.innerHTML = '<p>2015-45 我的大题笔记：银行家算法要先算 Need</p>';
  w.onNoteInput(ed);
  await sleep(250);
  await w.toggleExamMode();      // 整卷重绘（flushNote → renderPaper）
  await sleep(500);
  await w.toggleExamMode();
  await sleep(500);
  const rows4 = await w.dbAll('notes');
  check('重绘后 notes 仍是 2 条', rows4.length, 2);
  check('重绘后大题笔记仍在', /银行家算法/.test((rows4.find(r => r.question_id === 'zt2015_45') || {}).content || ''), true);
  check('重绘后 ● 提示仍在', !!doc.querySelector('#card-os_zt2015_45 .btn-explanation.has-note'), true);

  console.log('\n--- 五、空编辑器绝不能覆盖已有笔记 ---');
  // 打开面板后立刻 flush（模拟「面板刚插入、内容还没装填完就被 flush」）
  if (!doc.querySelector('#card-os_zt2015_45 .note-input')) {
    doc.querySelector('#card-os_zt2015_45 [data-toggle="note"]').click();
    await sleep(300);
  }
  ed = doc.querySelector('#card-os_zt2015_45 .note-input');
  ed.innerHTML = '';                       // 模拟装填前的空 DOM
  ed.dataset.noteLoaded = '1';             // 但仍标记为已装载（危险态）
  w.flushNote();
  await sleep(500);
  const rows5 = await w.dbAll('notes');
  check('空内容 flush 不删除已有笔记（自动保存不清空）',
    /银行家算法/.test((rows5.find(r => r.question_id === 'zt2015_45') || {}).content || ''), true);
  check('行数没变', rows5.length, 2);

  console.log('\n--- 六、关页 / 切后台：防抖窗口里的笔记必须落库 ---');
  // 上一节把面板留在「内容被我清空」的状态，先恢复
  ed = doc.querySelector('#card-os_zt2015_45 .note-input');
  if (ed) { ed.innerHTML = '<p>2015-45 我的大题笔记：银行家算法要先算 Need</p>'; w.onNoteInput(ed); await sleep(120); }
  w.flushNote();
  await sleep(300);

  // 新写一条、只等 120ms（远小于 700ms 防抖），马上关页
  if (!doc.querySelector('#card-os_0001 .note-input')) {
    doc.querySelector('#card-os_0001 [data-toggle="note"]').click();
    await sleep(300);
  }
  ed = doc.querySelector('#card-os_0001 .note-input');
  ed.innerHTML = '<p>关页前刚写的笔记</p>';
  w.onNoteInput(ed);
  await sleep(120);                                   // 防抖还没到点
  const beforeHide = (await w.dbAll('notes')).find(r => r.question_id === 'os_0001');
  check('防抖窗口内：库里还是旧内容', /选择题笔记/.test(beforeHide ? beforeHide.content : ''), true);
  w.dispatchEvent(new w.Event('pagehide'));           // 模拟关闭 / 刷新
  await sleep(400);
  const afterHide = (await w.dbAll('notes')).find(r => r.question_id === 'os_0001');
  check('pagehide 后：新内容已落库（不再被防抖吞掉）', /关页前刚写的笔记/.test(afterHide ? afterHide.content : ''), true);

  console.log('\n--- 七、源码：zhenti / dati 都挂了离页落库 ---');
  const ZT = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
  const DTI = fs.readFileSync(path.join(ROOT, 'pwa/dati.html'), 'utf8');
  check('zhenti：pagehide 触发 flushNote', /addEventListener\('pagehide', flushNote\)/.test(ZT), true);
  check('zhenti：visibilitychange(hidden) 也触发 flushNote', /visibilitychange[\s\S]{0,120}flushNote\(\)/.test(ZT), true);
  check('dati：pagehide 触发 flushDatiNote', /addEventListener\('pagehide', flushDatiNote\)/.test(DTI), true);
  check('dati：visibilitychange(hidden) 也触发', /visibilitychange[\s\S]{0,120}flushDatiNote\(\)/.test(DTI), true);
  check('zhenti：保存失败会弹 toast（旧实现静默吞掉）', /showZtTip\('笔记保存失败/.test(ZT), true);
  check('zhenti：showZtTip 会自建节点（页面里没有 #ztTip）',
    /el\.className = 'quiz-tip'/.test(ZT), true);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
