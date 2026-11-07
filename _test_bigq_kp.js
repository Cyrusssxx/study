// 真题套卷「大题知识点映射」回归（2026-11-07）
//
// 需求：大题的「知识点」入口不能再只跳科目首页，要落到对应小节或章。
//
// 实现：
//   · tools/bigq_kp_manual.json：126 道大题（2009-2026 × 7）按题干内容人工审定
//     「科目:编号」，编号对应 notes/{科目}_notes.json 的章 X / 节 X.Y / 小节 X.Y.Z；
//   · tools/build_zt_bigq_kp.py 生成 data/zt_bigq_kp.json，全部大题 mode=sec、goto 非空；
//   · notes.html 的纯编号锚点解析扩展为三级：章号落本章首节、节号落该节、小节号落该小节；
//   · 少数 zt 原始 sid 标错的题（如 2014-42 题干是 OSPF 却标 ds）由源表覆盖为真实科目。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_bigq_kp.js
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
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const KP = JSON.parse(read('pwa/data/zt_bigq_kp.json'));
const MANUAL = JSON.parse(read('tools/bigq_kp_manual.json'));
const NOTES_SRC = read('pwa/notes.html');
const ZT_SRC = read('pwa/js/zhenti.js');

/* ---------------- 一、生成结果 ---------------- */
console.log('--- 一、大题映射表：全部落到具体章节 ---');
const all = Object.entries(KP).flatMap(([y, per]) => Object.entries(per).map(([i, v]) => ({ y, i, ...v })));
const bigs = all.filter(v => v.mode !== 'bank');
check('18 年 / 763 条', [Object.keys(KP).length, all.length], [18, 763]);
check('选择题仍为 bank（637）', all.filter(v => v.mode === 'bank').length, 637);
check('大题 126 道', bigs.length, 126);
check('大题 mode 全为 sec（无 sub / kw 残留）',
  [...new Set(bigs.map(v => v.mode))], ['sec']);
check('大题 goto 全部非空', bigs.filter(v => !v.goto).length, 0);
check('大题 goto 全是编号格式（章 / 节 / 小节）',
  bigs.filter(v => !/^\d+(\.\d+)*$/.test(v.goto)).map(v => `${v.y}-${v.i}=${v.goto}`), []);
check('科目取值合法', [...new Set(bigs.map(v => v.sub))].sort(), ['cn', 'co', 'ds', 'os']);

console.log('\n--- 二、覆盖完整性：与 zt 真题数据逐题对齐 ---');
{
  const miss = [], extra = [];
  for (const y of Object.keys(KP)) {
    const items = JSON.parse(read(`pwa/data/zt/zt_${y}.json`)).items.filter(it => it.t !== 1);
    const keys = new Set(items.map(it => String(it.i)));
    const mapped = new Set(Object.entries(KP[y]).filter(([, v]) => v.mode !== 'bank').map(([i]) => i));
    for (const k of keys) if (!mapped.has(k)) miss.push(`${y}-${k}`);
    for (const k of mapped) if (!keys.has(k)) extra.push(`${y}-${k}`);
  }
  check('没有大题漏映射', miss, []);
  check('没有映射到不存在的大题', extra, []);
}

console.log('\n--- 三、锚点必须真的存在于笔记里 ---');
{
  const nums = {};
  for (const sub of ['ds', 'co', 'os', 'cn']) {
    const d = JSON.parse(read(`pwa/data/notes/${sub}_notes.json`));
    nums[sub] = new Set();
    for (const ch of d.chapters) for (const sec of ch.sections) {
      const m = /^(\d+(?:\.\d+)*)/.exec(sec.section);
      if (m) nums[sub].add(m[1]);
      for (const s2 of sec.subsections || []) {
        const m2 = /^(\d+(?:\.\d+)*)/.exec(s2.section);
        if (m2) nums[sub].add(m2[1]);
      }
    }
  }
  const bad = bigs.filter(v => {
    const set = nums[v.sub];
    if (!set) return true;
    if (!v.goto.includes('.')) return ![...set].some(n => n.startsWith(v.goto + '.'));
    return !set.has(v.goto);
  }).map(v => `${v.y}-${v.i} → ${v.sub}:${v.goto}`);
  check('126 个锚点全部命中笔记的章 / 节 / 小节', bad, []);
  const kinds = { chap: 0, sec: 0, sub: 0 };
  bigs.forEach(v => kinds[v.goto.split('.').length === 1 ? 'chap' : v.goto.split('.').length === 2 ? 'sec' : 'sub']++);
  console.log('     粒度分布：章 %d / 节 %d / 小节 %d', kinds.chap, kinds.sec, kinds.sub);
}

console.log('\n--- 四、人工源表与生成结果一致、覆盖 sid 错误 ---');
{
  const diff = [];
  for (const [y, per] of Object.entries(MANUAL)) {
    if (y.startsWith('_')) continue;
    for (const [i, rec] of Object.entries(per)) {
      const [sub, goto] = rec.split(':');
      const v = (KP[y] || {})[i];
      if (!v || v.sub !== sub || v.goto !== goto) diff.push(`${y}-${i}`);
    }
  }
  check('源表 126 条与生成表完全一致', diff, []);
  check('2014-42（OSPF 路由协议）跳计网 4.4.4 而非 ds',
    [KP['2014']['42'].sub, KP['2014']['42'].goto], ['cn', '4.4.4']);
  check('2016-41（TCP 拥塞窗口，题号 41 但是计网题）跳 5.3.6',
    [KP['2016']['41'].sub, KP['2016']['41'].goto], ['cn', '5.3.6']);
  check('2024-41 拓扑排序不再用关键词「图」', KP['2024']['41'].goto, '6.4.4');
  check('2025-41 顺序表不再用关键词「顺序表」', KP['2025']['41'].goto, '2.2.2');
  check('2026-41 BST 不再用关键词「树和二叉树」', KP['2026']['41'].goto, '7.3.1');
}

console.log('\n--- 五、前端：链接拼装与三级编号解析 ---');
check('kpHref 对 sec 拼 &goto=', /t\.mode === 'sec' && t\.goto \? '&goto=' \+ encodeURIComponent\(t\.goto\)/.test(ZT_SRC), true);
check('大题用卷面题号索引 KP_TABLE', /KP_TABLE\[state\.year\] \|\| \{\}\)\[String\(f\.i\)\]/.test(ZT_SRC), true);
check('notes.html 章号判定（无小数点 → 本章首节）', /const isChap = !GOTO\.includes\('\.'\)/.test(NOTES_SRC), true);
check('notes.html 节级用 flat.find 匹配', /const hit = flat\.find\(t => match\(numOf\(t\.sec\.section \|\| ''\)\)\)/.test(NOTES_SRC), true);
check('notes.html 小节级回退到 subsections', /\(t\.sec\.subsections \|\| \[\]\)\.find\(s => match\(numOf\(s\.section \|\| ''\)\)\)/.test(NOTES_SRC), true);

/* ---------------- 六、运行时 ---------------- */
let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

const FIXTURE = {
  subject: 'ds', title: '数据结构考点笔记', source: 'test',
  chapters: [{
    chapter: '第6章 图', sections: [
      { section: '6.1 图的基本概念', html: '<p>图的定义。</p>' },
      {
        section: '6.4 图的应用', html: '<p>图的应用总述。</p>', subsections: [
          { section: '6.4.1 最小生成树', html: '<p>Prim 与 Kruskal。</p>' },
          { section: '6.4.2 最短路径', html: '<p>Dijkstra。</p>' }
        ]
      }
    ]
  }]
};

async function noteJump(goto, targetSel, label) {
  const html = NOTES_SRC.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });
  const vc = new VC();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: `https://x.test/notes.html?subject=ds&goto=${goto}`, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(FIXTURE)) });
    }
  });
  const w = dom.window, doc = w.document;
  for (let i = 0; i < 80; i++) { await sleep(50); if (doc.querySelectorAll('.notes-section').length >= 2) break; }
  await sleep(280);
  const target = doc.querySelector(targetSel);
  check(`${label}：目标存在且被 goto-highlight 精确高亮`,
    !!target && target.classList.contains('goto-highlight'), true);
  check(`${label}：跳转参数用完即清`, /goto=/.test(w.location.search), false);
  w.close();
}

(async () => {
  console.log('\n--- 六、notes.html 三级编号运行时落位 ---');
  await noteJump('6.4', '.notes-section[data-sec="6.4 图的应用"]', '节级 6.4');
  await noteJump('6.4.2', '.notes-sub[data-sec="6.4.2 最短路径"]', '小节级 6.4.2');
  await noteJump('6', '.notes-section[data-sec="6.1 图的基本概念"]', '章级 6（本章首节）');

  console.log('\n--- 七、套卷页端到端：大题链接带 subject + goto ---');
  {
    const cache = {};
    const readFile = f => {
      if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
      return cache[f];
    };
    const html = read('pwa/zhenti.html').replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
      try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
    }).replace(/<link\b[^>]*>/gi, '');
    const vc = new VC(); vc.on('jsdomError', () => { });
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'http://localhost/zhenti.html', virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true;
        w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.requestAnimationFrame = cb => setTimeout(cb, 0);
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
    const w = dom.window, doc = w.document;
    for (let i = 0; i < 60; i++) { await sleep(100); if (doc.querySelectorAll('#yearList .ol-nav-item').length) break; }
    await sleep(500);
    const cards = [...doc.querySelectorAll('.question-card')];
    const isBig = c => c.querySelector('.zt-subj-badge') && /大题/.test(c.querySelector('.zt-subj-badge').textContent);
    const bigCards = cards.filter(isBig);
    check('7 道大题都有知识点入口', bigCards.filter(c => c.querySelector('.zt-kp-link')).length, 7);
    const hrefs = bigCards.map(c => (c.querySelector('.zt-kp-link') || {}).getAttribute
      ? c.querySelector('.zt-kp-link').getAttribute('href') : '');
    check('7 个链接全部带 goto 参数', hrefs.filter(h => /&goto=/.test(h)).length, 7);
    check('7 个链接全部是 notes.html?subject=', hrefs.filter(h => /^notes\.html\?subject=/.test(h)).length, 7);
    const realHrefs = hrefs.filter(Boolean);
    check('标签统一为「知识点」而非「知识点笔记」',
      bigCards.every(c => !/知识点笔记/.test(c.querySelector('.zt-kp-link').textContent)), true);
    // 逐一核对 href 与生成表一致
    const bad = [];
    bigCards.forEach(c => {
      const i = c.dataset.i;
      const h = c.querySelector('.zt-kp-link').getAttribute('href');
      const rec = KP['2026'][String(i)];
      if (!rec || !h.includes('subject=' + rec.sub) || !h.includes('goto=' + encodeURIComponent(rec.goto))) {
        bad.push(`${i}: ${h}`);
      }
    });
    check('7 个链接的 subject/goto 与映射表逐条一致', bad, []);
    console.log('     示例：', realHrefs.slice(0, 3).join(' | '));
    w.close();
  }

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
