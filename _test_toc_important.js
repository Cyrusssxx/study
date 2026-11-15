/* 2026-11-14：讲义目录两档重点标记回归。
 * 数据 important（加粗主色）/ core（加粗 + * 星标），章级为渲染时汇总，不写进数据。
 * 口径：5×大题真题锚点 + min(题库题量,40)/4 + 1.2×(我的错题/不熟/不会)。
 *   core = score>=20 或 大题>=3 或 (题库>=25 且 薄弱>=8)
 *   important = core 或 score>=9 或 大题>=1 或 题库>=15 或 薄弱>=6
 * 2026-11-15 第十八批叠加「大题覆盖兜底」：锚点只写到第 2 级时（os:1.5、cn:4.2 等）
 * 标记落在「节」上，故节对象也允许 important/core；小节的精确量见下。
 * 锁精确量：小节 important os25/co25/cn32/ds32，core os10/co7/cn6/ds8；
 *           节 important os2/co3/cn3/ds3（全部来自 tools/bigq_kp_manual.json 的 2 级锚点）。
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
// 大题锚点（主表 + 副表）：{ '1.5': ['os', 命中数], ... }
const ANCHORS = (() => {
  const out = {};
  const add = (code, n) => {
    const [sub, c] = code.split(':');
    if (!out[c]) out[c] = [sub, 0];
    out[c][1] += n;
  };
  const man = JSON.parse(read('tools/bigq_kp_manual.json'));
  for (const y of Object.keys(man)) {
    if (y.startsWith('_')) continue;
    for (const num of Object.keys(man[y])) add(man[y][num], 1);
  }
  if (fs.existsSync(path.join(ROOT, 'tools/bigq_kp_extra.json'))) {
    const ex = JSON.parse(read('tools/bigq_kp_extra.json'));
    for (const y of Object.keys(ex)) {
      if (y.startsWith('_')) continue;
      for (const num of Object.keys(ex[y])) [].concat(ex[y][num]).forEach(c => add(c, 1));
    }
  }
  return out;
})();
const IMPORTANT = { os: 25, co: 25, cn: 32, ds: 32 };
const SEC_CNT = { os: 2, co: 3, cn: 3, ds: 3 };   // 带 important 的「节」个数（来自 2 级锚点）
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
  check(s + ' 章对象从不带标记（汇总只在渲染时现算）',
    DOC[s].chapters.every(ch => !ch.important && !ch.core), true);
  const secImp = DOC[s].chapters.flatMap(ch => ch.sections).filter(sec => sec.important || sec.core);
  check(s + ' 带标记的节 = ' + SEC_CNT[s] + ' 个', secImp.length, SEC_CNT[s]);
  check(s + ' 带标记的节全部来自 2 级大题锚点（不靠加权分乱标）',
    secImp.every(sec => {
      const code = sec.section.split(' ')[0];
      if (code.split('.').length !== 2) return false;
      const m = ANCHORS[code];
      return !!m && m[0] === s;
    }), true);
  const expect = s === 'os'
    ? JSON.stringify(DOC[s], null, 1) + '\n'
    : JSON.stringify(DOC[s], null, 1).replace(/\n/g, '\r\n');
  check(s + ' 序列化格式与字节回比', RAW[s], expect);
}
check('用户点名的 2020 真题 46 对应小节 OS 3.1.3 = 很重点',
  subs(DOC.os).some(x => x.section.startsWith('3.1.3') && x.core && x.important), true);
check('全库重点小节 114 个', SUBS.reduce((n, s) => n + IMPORTANT[s], 0), 114);
check('全库重点节 11 个（2 级锚点落点）', SUBS.reduce((n, s) => n + SEC_CNT[s], 0), 11);
check('每个 2 级锚点都落到了节上（11 个全覆盖）',
  Object.entries(ANCHORS).filter(([c]) => c.split('.').length === 2)
    .every(([c, [sub]]) => DOC[sub].chapters.some(ch => ch.sections.some(sec =>
      sec.section.split(' ')[0] === c && sec.important))), true);
check('每个 3/4 级锚点都落到了小节上（重点或很重点）',
  Object.entries(ANCHORS).filter(([c]) => c.split('.').length >= 3)
    .every(([c, [sub]]) => subs(DOC[sub]).some(x => x.section.split(' ')[0] === c && x.important)), true);
check('全库很重点 31 个', SUBS.reduce((n, s) => n + CORE[s], 0), 31);

// ---------- 2. 纯加字段守卫：正文 HTML 一个字都没动 ----------
let guardDone = 0;
for (const s of SUBS) {
  if (!BEFORE[s]) continue;
  guardDone++;
  // before 备份早于「考点标注」批次：那次给 77 个块首位插了 <div class="zt-ref">（纯插入、
  // 不入行号）。比对前先剥掉，否则四科的 zt-ref 块会全被算成「正文被改」。
  const stripZt = h => (h || '').replace(/^<div class="zt-ref">[\s\S]*?<\/div>/, '');
  const b = new Map(subs(BEFORE[s]).map(x => [x.section, stripZt(x.html)]));
  const a = new Map(subs(DOC[s]).map(x => [x.section, stripZt(x.html)]));
  const changed = [...b.keys()].filter(k => b.get(k) !== a.get(k));
  // 1.5 不在本批 before 快照里（该快照已晚于 1.5 精简），故只备案这三处
  const allowed = s === 'os' ? ['3.1.3 基本分页存储管理', '5.3.1 磁盘', '5.3.3 磁盘调度算法']
    : s === 'cn' ? ['2.1.3 编码与调制', '4.2.5 地址解析协议（ARP）']
    : s === 'co' ? ['2.2.4 定点数的乘除运算'] : [];
  // 已备案的「替换类」改动：CN 2.1.3 波形图改内联 SVG；
  // OS 1.5 / 5.3.1 / 5.3.3 正文精简重排（tools/slim_*.py，含写盘前硬校验）。
  // CN 4.2.5 是纯插入（2021-47 时序图，两段都带 data-fig="1"），不进 REPLACED。
  // co 2.2.4 是「改写」不是插入：乘除法溢出判据纠错（tools/fix_co224.py），
  // 段数/行数不变（p 10 / li 3），但 0 删除 0 改写的前提不成立，须备案。
  const REPLACED = ['2.1.3 编码与调制', '1.5 操作系统引导', '5.3.1 磁盘', '5.3.3 磁盘调度算法', '2.2.4 定点数的乘除运算'];
  check(s + ' 正文 HTML 变化集合 = ' + JSON.stringify(allowed), changed, allowed);
  check(s + ' 所有变化仍是纯插入或已备案替换',
    changed.every(k => subseq(b.get(k), a.get(k)) || REPLACED.includes(k)), true);
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
check('notes.html 节级只按「节自身标记」加重（不因子节连带）',
  NOTES_HTML.includes("sec.core ? ' notes-toc-sec-core'") &&
  NOTES_HTML.includes("(sec.important ? ' notes-toc-sec-strong' : '')") &&
  !NOTES_HTML.includes('subs.some(s => s.core)') &&
  !NOTES_HTML.includes('subs.some(s => s.important)'), true);
check('notes.html 章级只在 >=2 个很重点时才加 *（不再按重点数加粗）',
  NOTES_HTML.includes('chCore >= 2') && !NOTES_HTML.includes('chImp >= 3'), true);
check('章/节汇总在渲染时现算（数据里不写汇总字段）',
  NOTES_HTML.includes('ch.sections.reduce') && NOTES_HTML.includes('const chItems') &&
  NOTES_HTML.includes('ch.sections.concat(chSubs)'), true);
check('style.css 星标用伪元素（章/节在后，子节在前防 ellipsis 吞掉）',
  CSS.includes("content: '*'") &&
  ['.notes-toc-ch-core::after', '.notes-toc-sec-core::after', '.notes-toc-sub-core::before']
    .every(k => CSS.includes(k)) &&
  !CSS.includes('.notes-toc-sub-core::after'), true);
check('style.css 暗色星标可读', CSS.includes('.dark .notes-toc-sub-core::before { color: #ff7a45; }'), true);
const subStrongBlock = (CSS.split('.notes-toc-sub-strong {')[1] || '').split('}')[0];
check('重点子节=主色 400（不再加粗；Windows 中文只有 400/700 两档，600 会合成 Bold）',
  CSS.includes('.notes-toc-sub-strong {') && /font-weight:\s*400/.test(subStrongBlock) &&
  !/font-weight:\s*(600|700)/.test(subStrongBlock), true);
check('很重点子节仍加粗（粗体档只留给 core，醒目度不被稀释）',
  /\.notes-toc-sec-core,\s*\.notes-toc-sub-core\s*\{[^}]*font-weight:\s*700/.test(CSS), true);
check('暗色主题重点子节与很重点区分开（蓝 vs 金，不同色相）',
  CSS.includes('.dark .notes-toc-sub-strong {\n    color: #8fb0d9;') &&
  CSS.includes('.dark .notes-toc-sub-core { color: #ffc53d; }'), true);

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
        secTokens: [...d.querySelectorAll('.notes-toc-sub[data-sec]')].map(e => e.dataset.sec),
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
