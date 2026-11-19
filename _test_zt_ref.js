// 讲义「大题考点」标注回归：节/小节顶部那条列出「这一节考过哪几年大题」的横条。
//
// 为什么要有：图和真题此前完全没打通（全库正文提年份 16 处、图块 0 处），
// 看讲义的人无从知道这一节是不是某年大题的考点。标注口径与 bigq_kp_*.json 同源。
//
// 三条硬约束：
//   ① 必须用 <div> 而非 <p>：行号器只数 .notes-body li/p，用 p 会让整节行号后移，
//      已存的行级批注全部错位（本仓库头号红线）；
//   ② 标注必须在块 html 的最前面（渲染出来就在小节标题下、正文上）；
//   ③ 数量与题号集合必须和锚点表严格一致，多一个少一个都是数据不同步。
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

const SUBJECTS = ['co', 'os', 'cn', 'ds'];
const notes = {};
for (const s of SUBJECTS) {
  notes[s] = JSON.parse(fs.readFileSync(path.join(ROOT, `pwa/data/notes/${s}_notes.json`), 'utf8'));
}

// ---------- 1. 数据：标注位置与数量 ----------
console.log('▸ 数据（*_notes.json）');
function blocks(subj) {
  const out = [];
  for (const ch of notes[subj].chapters || []) {
    for (const sec of ch.sections || []) {
      out.push(sec);
      for (const sub of sec.subsections || []) out.push(sub);
    }
  }
  return out;
}
const DIV_RE = /^<div class="zt-ref">([\s\S]*?)<\/div>/;
let totalDiv = 0, totalQ = 0, badHead = 0, inP = 0;
const tags = new Set();
for (const subj of SUBJECTS) {
  for (const b of blocks(subj)) {
    const html = b.html || '';
    const m = html.match(DIV_RE);
    if (!m) {
      if (html.includes('class="zt-ref"')) badHead++;
      continue;
    }
    totalDiv++;
    const qs = m[1].match(/zt-ref-q">([^<]+)</g) || [];
    totalQ += qs.length;
    qs.forEach(q => tags.add(q.replace(/.*">/, '').replace('<', '')));
    // 标注必须是第一个元素（前面不能有其它块）
    if (html.indexOf(m[0]) !== 0) badHead++;
  }
  // 不许有落在 p / li 里的
  for (const b of blocks(subj)) {
    const h = b.html || '';
    if (/<p[^>]*>(?:(?!<\/p>).)*class="zt-ref"/.test(h) || /<li[^>]*>(?:(?!<\/li>).)*class="zt-ref"/.test(h)) inP++;
  }
}
check('四处标注全部在块 html 首位', badHead === 0, badHead);
check('没有 zt-ref 被包进 p / li', inP === 0, inP);
check('全库标注块 = 77（与锚点块数一致）', totalDiv, 77);
check('题号出现 131 次（126 道大题里有 5 道带副锚点，会标两处）', totalQ === 131, totalQ);
check('去重后 126 道题（2009-2026 每年 7 道）', tags.size === 126, tags.size);

// 与锚点源表严格对齐
let srcTags = new Set();
for (const f of ['tools/bigq_kp_manual.json', 'tools/bigq_kp_extra.json']) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const [y, v] of Object.entries(d)) {
    if (y.startsWith('_')) continue;
    for (const [q, val] of Object.entries(v)) (Array.isArray(val) ? val : [val]).forEach(() => srcTags.add(`${y}-${q}`));
  }
}
check('标注题号集合与锚点源表完全一致',
  srcTags.size === tags.size && [...srcTags].every(t => tags.has(t)), `${srcTags.size} vs ${tags.size}`);

// ---------- 2. 样式与生成脚本 ----------
console.log('▸ 样式与脚本');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
check('style.css 有 .notes-body .zt-ref', CSS.includes('.notes-body .zt-ref {'));
check('style.css 暗色有对应规则', CSS.includes('.dark .notes-body .zt-ref {'));
check('题号用等宽数字（tabular-nums）', /\.notes-body \.zt-ref-q \{[\s\S]{0,120}tabular-nums/.test(CSS));
check('生成脚本存在且带 --dry', /python tools\/mark_zt_ref\.py --dry/.test(
  fs.readFileSync(path.join(ROOT, 'tools/mark_zt_ref.py'), 'utf8')));

// ---------- 3. 渲染：行号零漂移 ----------
console.log('▸ 渲染（行号零漂移）');
let JSDOM, VirtualConsole, IDBFactory, IDBKeyRange;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
const LINE_BASE = { co: 1962, os: 3409, cn: 1220, ds: 1330 };
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 渲染部分：缺 jsdom / fake-indexeddb');
} else {
  const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const PAGE = read('pwa/notes.html')
    .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
      try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
    }).replace(/<link\b[^>]*>/gi, '');
  async function render(subj) {
    const raw = read(`pwa/data/notes/${subj}_notes.json`);
    const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
    const dom = new JSDOM(PAGE, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: `https://x.test/notes.html?subject=${subj}`, virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
        w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
      }
    });
    await new Promise(r => setTimeout(r, 9000));
    const d = dom.window.document;
    const r = {
      lines: d.querySelectorAll('.anno-line').length,
      zt: d.querySelectorAll('.zt-ref').length,
      inP: d.querySelectorAll('p .zt-ref, li .zt-ref').length
    };
    dom.window.close();
    return r;
  }
  (async () => {
    for (const subj of SUBJECTS) {
      const r = await render(subj);
      check(`${subj} 行号零漂移（.anno-line = ${LINE_BASE[subj]}）`, r.lines === LINE_BASE[subj], r.lines);
      check(`${subj} 渲染出 zt-ref`, r.zt > 0, r.zt);
      check(`${subj} 无 zt-ref 落进 p/li`, r.inP === 0, r.inP);
    }
    console.log(`\n_test_zt_ref: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })();
}
if (!JSDOM || !IDBFactory) {
  console.log(`\n_test_zt_ref: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
