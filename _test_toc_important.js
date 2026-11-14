/* 2026-11-14：讲义目录两档重点标记回归。
 * 数据 important（加粗主色）/ core（加粗 + * 星标），章/节级为渲染时汇总，不写进数据。
 * 口径：5×大题真题锚点 + min(题库题量,40)/4 + 1.2×(我的错题/不熟/不会)。
 *   core = score>=20 或 大题>=3 或 (题库>=25 且 薄弱>=8)
 *   important = core 或 score>=9 或 大题>=1 或 题库>=15 或 薄弱>=6
 * 锁精确量：important os24/co24/cn29/ds32，core os10/co7/cn6/ds8。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}
const SUBS = ['os', 'co', 'cn', 'ds'];
const RAW = {}, DOC = {}, BEFORE = {};
for (const s of SUBS) {
  RAW[s] = read('pwa/data/notes/' + s + '_notes.json');
  DOC[s] = JSON.parse(RAW[s]);
  const bp = 'archive/toc_important_2026-11-14/' + s + '_notes.before.json';
  if (fs.existsSync(path.join(ROOT, bp))) BEFORE[s] = JSON.parse(read(bp));
}
const NOTES_HTML = read('pwa/notes.html');
const CSS = read('pwa/css/style.css');
const IMPORTANT = { os: 24, co: 24, cn: 29, ds: 32 };
const CORE = { os: 10, co: 7, cn: 6, ds: 8 };
const SUB_N = { os: 80, co: 102, cn: 108, ds: 91 };

function subs(doc) {
  const out = [];
  for (const ch of doc.chapters) for (const sec of ch.sections || [])
    for (const x of (sec.subsections || [])) out.push(x);
  return out;
}
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}

// ---------- 1. 数据精确量 / 层级关系 / 序列化 ----------
for (const s of SUBS) {
  const list = subs(DOC[s]);
  const imp = list.filter(x => x.important);
  const core = list.filter(x => x.core);
  check(s + ' 小节总数 ' + SUB_N[s], list.length, SUB_N[s]);
  check(s + ' 重点 ' + IMPORTANT[s] + ' 个', imp.length, IMPORTANT[s]);
  check(s + ' 很重点 ' + CORE[s] + ' 个', core.length, CORE[s]);
  check(s + ' 很重点必同时是重点（加粗 + *）', core.every(x => x.important), true);
  check(s + ' 标记只加在小节上，未污染章/节对象',
    DOC[s].chapters.every(ch => !ch.important && !ch.core &&
      ch.sections.every(sec => !sec.important && !sec.core)), true);
  const expect = s === 'os'
    ? JSON.stringify(DOC[s], null, 1) + '\n'
    : JSON.stringify(DOC[s], null, 1).replace(/\n/g, '\r\n');
  check(s + ' 序列化格式与字节回比', RAW[s], expect);
}
check('用户点名的 2020 真题 46 对应小节 OS 3.1.3 = 很重点',
  subs(DOC.os).some(x => x.section.startsWith('3.1.3') && x.core && x.important), true);
check('全库重点 109 个', SUBS.reduce((n, s) => n + IMPORTANT[s], 0), 109);
check('全库很重点 31 个', SUBS.reduce((n, s) => n + CORE[s], 0), 31);

// ---------- 2. 纯加字段守卫：正文 HTML 一个字都没动 ----------
let guardDone = 0;
for (const s of SUBS) {
  if (!BEFORE[s]) continue;
  guardDone++;
  const b = new Map(subs(BEFORE[s]).map(x => [x.section, x.html || '']));
  const a = new Map(subs(DOC[s]).map(x => [x.section, x.html || '']));
  const changed = [...b.keys()].filter(k => b.get(k) !== a.get(k));
  const allowed = s === 'os' ? ['3.1.3 基本分页存储管理'] : [];
  check(s + ' 正文 HTML 变化集合 = ' + JSON.stringify(allowed), changed, allowed);
  check(s + ' 所有变化仍是纯插入（0 删除 / 0 改写）',
    changed.every(k => subseq(b.get(k), a.get(k))), true);
  const beforeImp = subs(BEFORE[s]).filter(x => x.important).length;
  const beforeCore = subs(BEFORE[s]).filter(x => x.core).length;
  check(s + ' before 版本几乎无标记（历史仅 OS 4.2.10 一处）',
    [beforeImp, beforeCore], s === 'os' ? [1, 0] : [0, 0]);
}
if (guardDone < 4) console.log('SKIP 纯加字段守卫：缺 before 备份（归档不进 git）');

// ---------- 3. 前端渲染逻辑 / 样式 ----------
check('notes.html 小节渲染 important + core 双 class',
  NOTES_HTML.includes("s.important ? ' notes-toc-sub-strong' : ''") &&
  NOTES_HTML.includes("s.core ? ' notes-toc-sub-core' : ''"), true);
check('notes.html 节级汇总 core > important', NOTES_HTML.includes("subs.some(s => s.core) ? ' notes-toc-sec-core'"), true);
check('notes.html 章级汇总阈值 2 / 3',
  NOTES_HTML.includes('chCore >= 2') && NOTES_HTML.includes('chImp >= 3'), true);
check('章/节汇总在渲染时现算（数据里不写汇总字段）',
  NOTES_HTML.includes('ch.sections.reduce') && NOTES_HTML.includes('const chSubs'), true);
check('style.css 三级的 * 星标都用伪元素',
  CSS.includes("content: '*'") &&
  ['.notes-toc-ch-core::after', '.notes-toc-sec-core::after', '.notes-toc-sub-core::after']
    .every(k => CSS.includes(k)), true);
check('style.css 暗色星标可读', CSS.includes('.dark .notes-toc-sub-core::after'), true);
check('原有 .notes-toc-sub-strong 规则仍在（重点=加粗主色）',
  CSS.includes('.notes-toc-sub-strong {') && CSS.includes('.dark .notes-toc-sub-strong {'), true);

// ---------- 4. jsdom 真实渲染 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_toc_important: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    async function render(sub, raw) {
      const pageHtml = NOTES_HTML
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
          try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
        }).replace(/<link\b[^>]*>/gi, '');
      const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
      const dom = new JSDOM(pageHtml, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://x.test/notes.html?subject=' + sub, virtualConsole: vc,
        beforeParse(w) {
          w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
          w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
          w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
          w.Element.prototype.scrollIntoView = function () { };
          w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
        }
      });
      await new Promise(r => setTimeout(r, 4000));
      const d = dom.window.document;
      const out = {
        strong: d.querySelectorAll('.notes-toc-sub-strong').length,
        core: d.querySelectorAll('.notes-toc-sub-core').length,
        secCore: d.querySelectorAll('.notes-toc-sec-core').length,
        chCore: d.querySelectorAll('.notes-toc-ch-core').length,
        secStrong: d.querySelectorAll('.notes-toc-sec-strong').length,
        chStrong: d.querySelectorAll('.notes-toc-ch-strong').length,
        subLinks: d.querySelectorAll('.notes-toc-sub[data-sec]').length,
        starInText: [...d.querySelectorAll('.notes-toc-sub-core, .notes-toc-sec-core, .notes-toc-ch-core')]
          .some(e => e.textContent.includes('*')),
        window: dom.window, document: d
      };
      return out;
    }
    for (const s of SUBS) {
      const a = await render(s, RAW[s]);
      check(s + ' 真实渲染重点小节 ' + IMPORTANT[s] + ' 个', a.strong, IMPORTANT[s]);
      check(s + ' 真实渲染很重点小节 ' + CORE[s] + ' 个', a.core, CORE[s]);
      check(s + ' 目录小节链接数 = ' + SUB_N[s], a.subLinks, SUB_N[s]);
      check(s + ' 章/节汇总标记确实出现', a.secCore + a.chCore + a.secStrong + a.chStrong > 0, true);
      check(s + ' 星标是伪元素，不进 textContent（不破搜索/跳转）', a.starInText, false);
      a.window.close();
    }
    console.log('_test_toc_important: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
