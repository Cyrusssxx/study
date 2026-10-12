// 真题套卷页（zhenti.html）回归测试 v2：全量数据（data/zt）+ 渲染 / 作答判分 / 题号导航 / 顶栏一致性
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}

function inline(html) {
  return html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    let code = '';
    try { code = fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
    return '<script>' + code + '</script>';
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  // ---------- 静态：页面结构与数据 ----------
  console.log('▸ 静态结构');
  const html = inline(fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8'));
  const rawHtml = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
  check('zhenti.html 引入 js/zhenti.js', /<script src="js\/zhenti\.js">/.test(rawHtml));
  check('页面引入 KaTeX 样式', /vendor\/katex\/katex\.min\.css/.test(rawHtml));
  check('页面含 左年份栏 / 中题目流 / 右题号导航 三容器',
    /id="ztNav"/.test(rawHtml) && /id="ztMain"/.test(rawHtml) && /id="ztFq"/.test(rawHtml));
  check('main 带 toc-fixed + zt-page 作用域类', /<main class="container toc-fixed zt-page">/.test(rawHtml));
  // v3：选项两列网格（仅 zt-page）、答案速查、白纸逻辑
  check('选项两列网格（.zt-page 作用域）', /\.zt-page \.options-list \{[^}]*grid-template-columns:\s*repeat\(2/.test(css));
  check('选项圆形字母徽章样式存在', /\.zt-page \.option-letter \{[^}]*border-radius:\s*50%/.test(css));
  check('答案速查浮层样式存在', /\.zt-ans-pop\b/.test(css) && /\.zt-ans-grid\b/.test(css));
  check('题号导航竖排横条样式（含 .cur 跟随高亮）', /\.zt-fq-i\.cur \{/.test(css) && !/\.zt-fq-grid \{/.test(css));
  // v4：笔记富文本形态 + 题号放大 + 年份收起箭头钉中线
  check('zhenti.html 引入 note_richtext.js（富文本笔记）', /<script src="js\/note_richtext\.js">/.test(rawHtml));
  check('笔记面板：contenteditable + 工具条（与刷题页同源）',
    /noteToolbarHtml\(\)/.test(js) && /contenteditable="true"/.test(js) && /bindNoteToolbar\(el\)/.test(js) && !/textarea/.test(js));
  check('笔记：装载/序列化走 note_richtext（保留加粗/颜色形态）',
    /loadNoteIntoEditor\(el,/.test(js) && /serializeNote\(el\)/.test(js));
  check('笔记：保存时原图片数组透传（不误清 quiz 页图片）', /images:\s*state\.noteImages\[qid\] \|\| \[\]/.test(js));
  check('题号导航放大（42×14px、10px 字）',
    /\.zt-fq-i \{[^}]*width:\s*42px[^}]*height:\s*14px[^}]*font-size:\s*10px/.test(css));
  check('收起箭头钉目录右缘中点（ol-nav-toggle fixed · 50vh 折算）',
    /\.toc-fixed \.ol-nav-head \.ol-nav-toggle \{[^}]*position:\s*fixed[^}]*top:\s*calc\(50vh - 76px\)/.test(css) &&
    /\.toc-fixed \.ol-nav \{[^}]*transform:\s*translateX\(0\)/.test(css));
  check('默认白纸：无「做过自动展开」逻辑', !/\(!!st && !state\.examMode\)/.test(js));
  check('本次会话作答机制（sessionAnswered）', /sessionAnswered/.test(js));
  check('做题模式下拦截查看答案（toggleAns）', /做题模式下不显示答案/.test(js));
  check('答案速查 toggleAnsPop 已导出', /function toggleAnsPop/.test(js) && /toggleAnsPop,/.test(js));
  const navLinks = [...rawHtml.matchAll(/<a href="([\w.]+)\.html" class="nav-link[^"]*">([^<]+)<\/a>/g)].map(m => m[1]);
  check('顶栏链接 14 项且含真题套卷（active）', navLinks.length === 14 && /zhenti\.html" class="nav-link active"/.test(rawHtml), navLinks.join(','));

  // 数据完整性
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/index.json'), 'utf8'));
  check('index.json：18 年（2009-2026）', idx.years.length === 18 && idx.years[0] === 2009 && idx.years[17] === 2026);
  let totalItems = 0, qidN = 0, svgRefs = 0;
  let all47 = true;
  const svgDir = path.join(ROOT, 'pwa/data/zt_svg');
  const svgFiles = new Set(fs.readdirSync(svgDir).map(f => f.replace(/\.svg$/, '')));
  for (const y of idx.years) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, `pwa/data/zt/zt_${y}.json`), 'utf8'));
    totalItems += d.items.length;
    if (!(d.items.length === 47 && d.items.filter(x => x.t === 1).length === 40 &&
          d.items.filter(x => x.t !== 1).length === 7)) all47 = false;
    for (const it of d.items) {
      if (it.qid) qidN++;
      for (const m of (it.q + it.o.join('') + (it.an || '')).matchAll(/data-svg="([^"]+)"/g)) {
        svgRefs++;
        if (!svgFiles.has(m[1])) { failed++; console.log('    ❌ 缺 SVG 文件', m[1]); }
      }
    }
  }
  check('每年 47 题（40 选择 + 7 大题）', all47);
  check('数据总量 846 题、qid 映射 652 条', totalItems === 846 && qidN === 652, `qid=${qidN}`);
  check(`SVG 引用与文件全匹配（${svgRefs} 引用 / ${svgFiles.size} 文件）`, svgRefs === svgFiles.size);
  const zt = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/zt_2026.json'), 'utf8'));
  check('2026 全卷无 qid 映射（新题用 zt id）', zt.items.every(x => !x.qid));
  check('2026 选择题全部有答案', zt.items.filter(x => x.t === 1).every(x => x.a));
  const zt24 = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt/zt_2024.json'), 'utf8'));
  check('2024 有 qid 映射（与题库互通）', zt24.items.some(x => x.qid));

  // ---------- 动态：jsdom 渲染 ----------
  console.log('▸ 动态渲染（jsdom + fake-indexeddb + 真实数据）');
  const dataCache = {};
  const readFile = f => {
    if (!dataCache[f]) dataCache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    return dataCache[f];
  };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Could not load|not implemented/i.test(e.message)) console.log('JSDOM ERR:', e.message); });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/zhenti.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => {};
      w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.fetch = async (u) => {
        const s = String(u);
        const m = s.match(/data\/[\w./-]+\.(json|svg)/);
        if (m) {
          const rel = m[0];
          try {
            const t = readFile(rel);
            return { ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) };
          } catch (e) {
            return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
          }
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
    },
  });

  const w = dom.window;
  let years = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    years = w.document.querySelectorAll('#yearList .ol-nav-item').length;
    if (years) break;
  }
  check('年份列表渲染（2009-2026 共 18 年）', years === 18, `实际 ${years}`);

  const d = w.document;
  await sleep(300);
  const cards = d.querySelectorAll('#ztMain .question-card');
  check('默认渲染 2026 年套卷（47 题卡）', cards.length === 47, `实际 ${cards.length}`);
  check('选择题分组标题 4 个科目', d.querySelectorAll('.zt-group-title').length === 4);
  check('大题区存在', /二、大题/.test(d.querySelector('#ztMain').textContent));
  check('题号导航 47 格', d.querySelectorAll('#fqList .zt-fq-i').length === 47,
    `实际 ${d.querySelectorAll('#fqList .zt-fq-i').length}`);
  check('题号导航竖排（无网格分组容器）', !d.querySelector('.zt-fq-grid') && !d.querySelector('.zt-fq-g'));
  check('题号编排：第 1 题与第 41 题', /第 1 题/.test(d.querySelector('#ztMain').textContent) &&
    /第 41 题/.test(d.querySelector('#ztMain').textContent));
  check('年份项显示完成度', /\/40/.test(d.querySelector('#yearList').textContent));
  // v3 白纸：初始无结果条/无预选/解析收起
  check('初始白纸：无结果条、无预选、解析全部收起',
    d.querySelectorAll('#ztMain .result-correct, #ztMain .result-wrong').length === 0 &&
    d.querySelectorAll('#ztMain .option-item input:checked').length === 0 &&
    d.querySelectorAll('#ztMain .explanation-panel').length === 0,
    `result=${d.querySelectorAll('#ztMain .result-correct, #ztMain .result-wrong').length}, checked=${d.querySelectorAll('#ztMain .option-item input:checked').length}, panel=${d.querySelectorAll('#ztMain .explanation-panel').length}`);
  check('选项字母徽章渲染（4 项 × 40 题）',
    d.querySelectorAll('#ztMain .option-item .option-letter').length === 160,
    `实际 ${d.querySelectorAll('#ztMain .option-item .option-letter').length}`);

  // v3 答案速查浮层
  w.toggleAnsPop();
  await sleep(150);
  check('答案速查：浮层打开，40 条答案', !!d.querySelector('#ztAnsPop') &&
    d.querySelectorAll('#ztAnsPop .zt-ans-i').length === 40,
    `实际 ${d.querySelectorAll('#ztAnsPop .zt-ans-i').length}`);
  const ansFirst = d.querySelector('#ztAnsPop .zt-ans-i');
  check('答案速查：内容形如「1. 字母」', /^1\.\xa0[A-D]$/.test(ansFirst.textContent) || /^1\..*[A-D]/.test(ansFirst.textContent), ansFirst.textContent);
  w.toggleAnsPop();
  await sleep(100);
  check('答案速查：再次点击关闭', !d.querySelector('#ztAnsPop'));;

  // ---------- 交互：作答（新 id 客户端判分） ----------
  console.log('▸ 交互：作答与切换年份');
  const firstCard = d.querySelector('#ztMain .question-card');
  const iid = firstCard.dataset.iid;
  check('2026 第一题 iid 为新格式（{sid}_zt2026_1）', /^[a-z]{2}_zt2026_\d+$/.test(iid), iid);
  const firstItem = zt.items.find(x => x.i === +firstCard.dataset.i);
  await w.pickOption(iid, firstItem.a);
  await sleep(200);
  let card = d.querySelector('#card-' + iid);
  check('答对：题卡出现「回答正确」', !!card.querySelector('.result-correct'));
  check('答对：题号导航格变绿（ok）', !!d.querySelector('#fqList .zt-fq-i.ok'));
  check('答对：解析自动展开', !!card.querySelector('.explanation-panel'));

  const wrongKey = ['A', 'B', 'C', 'D'].find(k => k !== firstItem.a);
  await w.pickOption(iid, wrongKey);
  await sleep(200);
  card = d.querySelector('#card-' + iid);
  check('答错：题卡出现「回答错误 + 正确答案」', !!card.querySelector('.result-wrong') &&
    card.querySelector('.result-wrong').textContent.includes(firstItem.a));
  check('答错：题号导航格变红（bad）', !!d.querySelector('#fqList .zt-fq-i.bad'));

  // 切换年份（2024 有映射，验证 qid 交互 id）
  w.switchYear(2024);
  await sleep(400);
  check('切换 2024 年：47 题卡', d.querySelectorAll('#ztMain .question-card').length === 47,
    `实际 ${d.querySelectorAll('#ztMain .question-card').length}`);
  const c24 = d.querySelector('#ztMain .question-card');
  check('2024 映射题 iid 用题库 id（与刷题页互通）', /^(ds|co|os|cn)_\d+$/.test(c24.dataset.iid), c24.dataset.iid);

  // 做题模式
  w.toggleExamMode();
  await sleep(300);
  check('做题模式：出现「对答案」按钮', /对答案/.test(d.querySelector('#ztMain').textContent));
  const iid2 = d.querySelector('#ztMain .question-card').dataset.iid;
  await w.pickOption(iid2, 'A');
  await sleep(150);
  check('做题模式：选答不判定（无 result 条）', !d.querySelector('#card-' + iid2).querySelector('.result-correct,.result-wrong'));
  check('做题模式：题号导航格为 picked', !!d.querySelector('#fqList .zt-fq-i.picked'));

  // 收藏（经页面内 api 分发）
  await w.toggleFav(iid2);
  await sleep(200);
  check('收藏：题卡星标切换', !!d.querySelector('#card-' + iid2 + ' .btn-icon.favorited'));

  // v4：笔记富文本（与刷题页同源：contenteditable + 工具条 + HTML 落库）
  w.toggleNotePanel(iid2);
  await sleep(250);
  const np = d.querySelector('#card-' + iid2 + ' .zt-note-panel');
  check('笔记面板：富文本编辑器（contenteditable，非 textarea）',
    !!np && !!np.querySelector('.note-input[contenteditable="true"]') && !np.querySelector('textarea'));
  check('笔记面板：工具条就位（加粗按钮）', !!np && !!np.querySelector('.note-toolbar [data-cmd="bold"]'));
  const ed = np && np.querySelector('.note-input');
  if (ed) {
    w.loadNoteIntoEditor(ed, '<p>帧长<b>减小</b></p>');
    check('笔记：富文本装载渲染（保留 <b> 形态）', ed.innerHTML.includes('<b>减小</b>'), ed.innerHTML.slice(0, 60));
    ed.innerHTML = '<p>保存<b>测试</b></p>';
    w.onNoteInput(ed);
    await sleep(1100);
    const row = (typeof w.dbGet === 'function') ? await w.dbGet('notes', iid2) : null;
    check('笔记：停顿自动保存（HTML 落库）', !!row && /<b>测试<\/b>/.test(row.content || ''),
      row ? String(row.content).slice(0, 60) : '无记录');
    check('笔记：空图数组正常透传', !!row && Array.isArray(row.images));
    w.toggleNotePanel(iid2);
    await sleep(200);
    check('笔记：再次点击收起面板', !d.querySelector('#card-' + iid2 + ' .zt-note-panel'));
  }

  // SVG 注入（mock 返回假 svg）
  w.close();
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
