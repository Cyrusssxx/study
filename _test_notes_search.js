// _test_notes_search.js —— 考点笔记搜索 v2 回归（2026-10-12 重写后）
// 背景：旧实现两个 bug —— ① 进入页面恢复 PS.q 并重放 → "自动弹出搜索记录"；
//       ② 显示历史依赖 focus hack（已聚焦时点击不再派发 focus）→ "点击搜索没反应"。
// 覆盖：进入不自动弹 / 点击必有反应 / Enter 跳第一条 / Esc 收起 / 定位兜底不静默 / 历史管理。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, actual, expect) {
  const ok = actual === expect;
  if (ok) { passed++; console.log('  ✅', name, (typeof actual === 'string' && actual) ? ` ${String(actual).slice(0, 50)}` : ''); }
  else { failed++; console.log('  ❌', name, `\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expect)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, tries = 80, step = 100) {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await sleep(step); }
  return false;
}

(async () => {
  console.log('▸ 静态结构（notes.html）');
  const src = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');
  check('不再恢复/重放上次搜索词（PS.get q 已移除）', /PS\.get\(\{\s*q:/.test(src), false);
  check('不再写搜索词到页面状态（PS.set q 已移除）', /PS\.set\(\{\s*q:/.test(src), false);
  check('点击输入框绑定 onSearchClick', /onclick="onSearchClick\(\)"/.test(src), true);
  check('键盘绑定 onSearchKey', /onkeydown="onSearchKey\(event\)"/.test(src), true);
  check('旧 focus hack（data-user-focus）已移除', /data-user-focus|dataset\.userFocus/.test(src), false);
  check('定位失败回退所在节（jumpTo 兜底）', /!locateNoteBlock\(h\.text\) && h\.sec/.test(src), true);
  check('locateNoteBlock 返回布尔且失败返回 false', /if \(!best\) return false;/.test(src) && /\n            return true;/.test(src), true);
  check('空白归一匹配（防换行/缩进差异漏配）', /replace\(\/\\s\+\/g, ' '\)\.trim\(\)/.test(src) && /b\.textContent\.replace\(\/\\s\+\/g, ' '\)/.test(src), true);

  console.log('\n▸ 动态（jsdom + 真实 cn_notes 数据）');
  const NOTES = fs.readFileSync(path.join(ROOT, 'pwa/data/notes/cn_notes.json'), 'utf8');
  let html = src.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
  });
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/notes.html?subject=cn',
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
        if (u.includes('data/notes/cn_notes.json')) {
          return { ok: true, status: 200, json: async () => JSON.parse(NOTES) };
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
      // 模拟"上次搜索过"的旧页面状态 + 已有两条搜索历史
      w.localStorage.setItem('ps_notes.html', JSON.stringify({ q: '链路' }));
      w.localStorage.setItem('notesSearchHistory', JSON.stringify(['以太网', 'TCP']));
    },
  });
  const w = dom.window;
  const d = w.document;
  const okLoad = await waitFor(() => d.querySelectorAll('.notes-section').length > 0);
  check('笔记正文渲染完成', okLoad, true);

  const si = () => d.getElementById('notesSearchInput');
  const box = () => d.getElementById('notesSearchResults');
  const sb = d.getElementById('notesSearchBox');

  console.log('\n--- 场景 1：进入页面不自动弹出（旧 PS.q 不再重放） ---');
  check('搜索框已显示', sb.hidden, false);
  check('输入框为空（不恢复旧词「链路」）', si().value, '');
  check('下拉收起（不自动弹出搜索记录）', box().hidden, true);

  console.log('\n--- 场景 2：点击输入框必有反应 ---');
  si().value = '';
  w.onSearchClick();
  check('空值点击 → 显示搜索历史', box().hidden, false);
  check('历史列表渲染（2 条）', box().querySelectorAll('.notes-sh-item').length, 2);

  si().value = '数据链路层';
  w.onSearchClick();
  check('有值点击 → 重放结果（下拉展开）', box().hidden, false);
  check('结果列表出现', box().querySelectorAll('.notes-sr-item').length > 0, true);
  check('结果头部显示条数（与左侧目录视觉区分）', /搜索结果 · \d+ 条/.test(box().textContent), true);

  console.log('\n--- 场景 3：输入即时搜索与历史 ---');
  w.doNoteSearch('以太网');
  check('输入搜索：有结果', box().querySelectorAll('.notes-sr-item').length > 0, true);
  w.doNoteSearch('');
  check('清空输入 → 回到历史', box().querySelectorAll('.notes-sh-item').length, 2);
  w.doNoteSearch('绝不可能存在的词xyz');
  check('无结果提示', /无结果/.test(box().textContent), true);

  console.log('\n--- 场景 4：Enter 跳第一条 / Esc 收起 ---');
  w.doNoteSearch('数据链路层');
  check('前置：有命中', box().querySelectorAll('.notes-sr-item').length > 0, true);
  w.onSearchKey({ key: 'Enter', isComposing: false, target: si(), preventDefault() { } });
  await sleep(100);
  check('Enter → 执行定位（输入框清空 + 下拉收起）', si().value === '' && box().hidden === true, true);

  w.doNoteSearch('数据链路层');
  check('前置：下拉已展开', box().hidden, false);
  w.onSearchKey({ key: 'Escape', preventDefault() { } });
  check('Esc 收起下拉', box().hidden, true);
  w.onSearchKey({ key: 'Escape', preventDefault() { } });
  check('下拉已收起时 Esc 不拦截（交还浏览器）', box().hidden, true);

  console.log('\n--- 场景 5：定位兜底（不静默） ---');
  check('找不到块时返回 false（触发节级回退）', w.locateNoteBlock('__不存在的定位文本__'), false);
  w.doNoteSearch('数据链路层');
  w.locateNoteHit(0);
  await sleep(100);
  check('点结果：输入框清空 + 下拉收起（必有着落）', si().value === '' && box().hidden === true, true);
  const before = si().value;
  w.locateNoteHit(5);   // 越界索引 → 安全返回不崩
  check('越界索引安全返回', si().value, before);

  console.log('\n--- 场景 6：历史管理 ---');
  for (const t of ['A词', 'B词', 'C词', 'D词', 'E词', 'F词']) w.saveNoteHist(t);
  const hist = JSON.parse(w.localStorage.getItem('notesSearchHistory'));
  check('历史最多 5 条', hist.length, 5);
  check('最新在最前', hist[0], 'F词');
  si().value = '';
  w.onSearchClick();
  check('历史渲染 5 条', box().querySelectorAll('.notes-sh-item').length, 5);
  w.delNoteHist({ stopPropagation() { } }, 0);
  check('单条删除后剩 4 条', box().querySelectorAll('.notes-sh-item').length, 4);
  w.clearNoteHist();
  check('清空历史后下拉收起', box().hidden, true);

  w.close();
  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
