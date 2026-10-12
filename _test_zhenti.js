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
  // v5：DS 大题替换为打卡表版本
  check('zhenti.js 建立打卡表映射（ds_daka real「YYYY年408真题第N题」→ 卡片）',
    /dakaByReal: new Map/.test(js) && /年408真题第/.test(js) && /dakaByReal\.set\(/.test(js));
  check('zhenti.js 讲义按 source 关联（ds_code / ds_code_extra）',
    /lectureBySource/.test(js) && /ds_code_extra\.json/.test(js));
  check('DS 大题走打卡表渲染分支（bigCard → dakaBigCard）', /if \(f\.daka\) return dakaBigCard\(f\)/.test(js));
  check('替换范围限定「算法题」（card && lecture 双条件）', /if \(card && lecture\) f\.daka = \{ card, lecture \}/.test(js));
  check('solHtml 含「暴力解」回退分支（💪 自生成）', /code-brute/.test(js) && /暴力解/.test(js));
  const commonSrc = fs.readFileSync(path.join(ROOT, 'pwa/js/common.js'), 'utf8');
  check('lightbox 委托支持 .zt-daka-figs（作用域限定不干扰 daka 页）',
    /zt-daka-figs/.test(commonSrc) && /daka_figs/.test(commonSrc));
  check('默认白纸：无「做过自动展开」逻辑', !/\(!!st && !state\.examMode\)/.test(js));
  check('本次会话作答机制（sessionAnswered）', /sessionAnswered/.test(js));
  check('做题模式下拦截查看答案（toggleAns）', /做题模式下不显示答案/.test(js));
  // v6：默认进入做题模式；取消时判分并显示历史记录与笔记
  check('默认进入做题模式（examMode 初始 true，无持久化）', /examMode:\s*true/.test(js) && !/localStorage\.getItem\('zhentiMode'\)/.test(js));
  check('取消做题模式先判分（gradePending 共用「对答案」与切换两入口）',
    /async function gradePending/.test(js) && (js.match(/await gradePending\(\)/g) || []).length >= 2);
  check('非做题模式显示历史记录（showHist 门控选项色/预选/结果条）', /const showHist = !state\.examMode/.test(js));
  check('做题模式隐藏笔记（3 处卡片门控 + 点击拦截）',
    (js.match(/const noteOpen = showNote && state\.noteOpen\.has\(f\.iid\);/g) || []).length === 3 &&
    /做题模式下不显示笔记/.test(js));
  check('做题模式年份完成度隐藏（取消后恢复）', /state\.examMode \? '' : `<span class="zt-year-done">/.test(js));
  check('题号导航做题模式隐藏历史色点', /if \(!state\.examMode && st\) cls \+= st\.is_correct/.test(js));
  // v7：题号点击修复（触屏容错 + 同题去重 + 只看收藏过滤）
  check('题号点击：gotoQ 同题 700ms 去重', /lastGoto/.test(js) && /now - lastGoto\.t < 700/.test(js));
  check('题号点击：触屏 pointerdown/pointerup 容错（12px/1s 阈值）',
    /bindFqTouch/.test(js) && /pointerdown/.test(js) && /pointerup/.test(js) &&
    /> 12\) return/.test(js) && /fqDown/.test(js));
  check('题号点击：flushNote 抛错不拖垮跳转（try-catch）', /try \{ flushNote\(\); \} catch/.test(js));
  check('只看收藏：题号条与卡片流同过滤', /!state\.favOnly \|\| state\.favSet\.has\(it\.iid\)/.test(js));
  check('题号触摸目标：touch-action manipulation + user-select none',
    /\.zt-fq-i \{[^}]*touch-action:\s*manipulation/.test(css) && /\.zt-fq-i \{[^}]*user-select:\s*none/.test(css));
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

  // 共享 IndexedDB 工厂：第二个页面实例（模拟「重开页面」）读取同一份数据（localStorage 各自全新）
  const idbFactory = new IDBFactory();
  const mkOptions = () => ({
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/zhenti.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = idbFactory;
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

  const dom = new JSDOM(html, mkOptions());

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
  // v6：默认进入做题模式（白纸）——年份完成度、历史痕迹全部隐藏
  check('默认进入做题模式：工具栏「做题中」+「对答案」',
    /做题中/.test(d.querySelector('#ztMain').textContent) && /对答案/.test(d.querySelector('#ztMain').textContent));
  check('做题模式：年份列表不显示完成度', !/\/40/.test(d.querySelector('#yearList').textContent));
  check('做题模式：进度显示「已选 0/40」', /已选 0\/40/.test(d.querySelector('#ztMain').textContent));
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

  // ---------- 交互：做题模式选答 → 取消判分显示记录 ----------
  console.log('▸ 交互：做题模式选答 → 取消后判分显示记录');
  const firstCard = d.querySelector('#ztMain .question-card');
  const iid = firstCard.dataset.iid;
  check('2026 第一题 iid 为新格式（{sid}_zt2026_1）', /^[a-z]{2}_zt2026_\d+$/.test(iid), iid);
  const firstItem = zt.items.find(x => x.i === +firstCard.dataset.i);

  // 做题模式：选答仅暂存（picked），不判定、不显示结果
  await w.pickOption(iid, firstItem.a);
  await sleep(200);
  let card = d.querySelector('#card-' + iid);
  check('做题模式选答：暂存不判定（无结果条）', !card.querySelector('.result-correct,.result-wrong'));
  check('做题模式选答：选项预选 + 题号导航 picked',
    !!card.querySelector('.option-item input:checked') && !!d.querySelector('#fqList .zt-fq-i.picked'));
  check('做题模式选答：进度「已选 1/40」', /已选 1\/40/.test(d.querySelector('#ztMain').textContent));

  // 取消做题模式 → 先判分，再显示记录
  await w.toggleExamMode();
  await sleep(300);
  card = d.querySelector('#card-' + iid);
  check('取消做题模式：本次选答判分入库（出现结果条）', !!card.querySelector('.result-correct,.result-wrong'));
  check('取消做题模式：题号导航格变绿（ok）', !!d.querySelector('#fqList .zt-fq-i.ok'));
  check('取消做题模式：解析自动展开（本次作答）', !!card.querySelector('.explanation-panel'));
  check('取消做题模式：年份完成度恢复显示', /\/40/.test(d.querySelector('#yearList').textContent));
  check('取消做题模式：进度恢复「已做 1/40」', /已做 1\/40/.test(d.querySelector('#ztMain').textContent));

  // 重新进入做题模式 → 历史痕迹全部隐藏（尽管库里有记录）
  await w.toggleExamMode();
  await sleep(300);
  card = d.querySelector('#card-' + iid);
  check('重进做题模式：历史记录隐藏（无结果条/无预选/无选项色/无解析展开）',
    !card.querySelector('.result-correct,.result-wrong') &&
    !card.querySelector('.option-item input:checked') &&
    !card.querySelector('.option-item.correct,.option-item.wrong') &&
    !card.querySelector('.explanation-panel'));
  check('重进做题模式：题号导航无历史色点', !d.querySelector('#fqList .zt-fq-i.ok, #fqList .zt-fq-i.bad'));
  check('重进做题模式：年份完成度再次隐藏', !/\/40/.test(d.querySelector('#yearList').textContent));

  // 再取消 → 记录恢复；随后演示非做题模式直接判分的答错链路
  await w.toggleExamMode();
  await sleep(300);
  card = d.querySelector('#card-' + iid);
  check('再次取消：历史记录与预选恢复', !!card.querySelector('.result-correct,.result-wrong') && !!card.querySelector('.option-item input:checked'));

  const wrongKey = ['A', 'B', 'C', 'D'].find(k => k !== firstItem.a);
  await w.pickOption(iid, wrongKey);
  await sleep(200);
  card = d.querySelector('#card-' + iid);
  check('非做题模式答错：题卡出现「回答错误 + 正确答案」', !!card.querySelector('.result-wrong') &&
    card.querySelector('.result-wrong').textContent.includes(firstItem.a));
  check('答错：题号导航格变红（bad）', !!d.querySelector('#fqList .zt-fq-i.bad'));

  // 回到做题模式（为后续「对答案」流程做准备）
  await w.toggleExamMode();
  await sleep(300);

  // 切换年份（2024 有映射，验证 qid 交互 id）
  w.switchYear(2024);
  await sleep(400);
  check('切换 2024 年：47 题卡', d.querySelectorAll('#ztMain .question-card').length === 47,
    `实际 ${d.querySelectorAll('#ztMain .question-card').length}`);
  const c24 = d.querySelector('#ztMain .question-card');
  check('2024 映射题 iid 用题库 id（与刷题页互通）', /^(ds|co|os|cn)_\d+$/.test(c24.dataset.iid), c24.dataset.iid);

  // ---------- 对答案流程 ----------
  console.log('▸ 对答案：判分并自动退出做题模式');
  check('做题模式：出现「对答案」按钮', /对答案/.test(d.querySelector('#ztMain').textContent));
  const iid2 = d.querySelector('#ztMain .question-card').dataset.iid;
  await w.pickOption(iid2, 'A');
  await sleep(150);
  check('做题模式：选答不判定（无 result 条）', !d.querySelector('#card-' + iid2).querySelector('.result-correct,.result-wrong'));
  check('做题模式：题号导航格为 picked', !!d.querySelector('#fqList .zt-fq-i.picked'));

  // 对答案：判分 + 退出做题模式（显示记录）
  await w.checkPending();
  await sleep(300);
  check('对答案：判分入库（出现结果条）',
    !!d.querySelector('#card-' + iid2 + ' .result-correct, #card-' + iid2 + ' .result-wrong'));
  check('对答案：自动退出做题模式（无「对答案」按钮，完成度恢复）',
    !/对答案/.test(d.querySelector('#ztMain').textContent) && /\/40/.test(d.querySelector('#yearList').textContent));

  // 收藏（经页面内 api 分发）
  await w.toggleFav(iid2);
  await sleep(200);
  check('收藏：题卡星标切换', !!d.querySelector('#card-' + iid2 + ' .btn-icon.favorited'));

  // ---------- v7：题号点击（触屏容错 + 去重 + 只看收藏过滤） ----------
  console.log('▸ 题号点击修复');
  const scrolled = [];
  w.Element.prototype.scrollIntoView = function () { scrolled.push(this.id || ''); };
  const mkPtr = (type, x, y, pt) => {
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    ev.clientX = x; ev.clientY = y; ev.pointerType = pt;
    return ev;
  };
  const fq10 = d.querySelector('#fqList .zt-fq-i[data-i="10"]');
  const iid10 = fq10.dataset.iid;
  fq10.dispatchEvent(mkPtr('pointerdown', 200, 300, 'touch'));
  fq10.dispatchEvent(mkPtr('pointerup', 205, 303, 'touch'));   // 位移 8px ≤ 12 → 补偿触发
  await sleep(80);
  check('触屏轻点（轻微位移）：pointerup 补偿触发跳转', scrolled.includes('card-' + iid10), scrolled.join(','));
  const n1 = scrolled.length;
  fq10.dispatchEvent(mkPtr('pointerdown', 200, 300, 'touch'));
  fq10.dispatchEvent(mkPtr('pointerup', 205, 303, 'touch'));   // 同题 700ms 内 → 去重
  await sleep(60);
  check('触屏轻点：700ms 内同题二次触发被去重', scrolled.length === n1, `再滚 ${scrolled.length - n1} 次`);
  const n2 = scrolled.length;
  fq10.dispatchEvent(mkPtr('pointerdown', 200, 300, 'touch'));
  fq10.dispatchEvent(mkPtr('pointerup', 230, 305, 'touch'));   // 35px → 明确滑动
  await sleep(60);
  check('触屏滑动（>12px）：不触发跳转', scrolled.length === n2);
  const n3 = scrolled.length;
  fq10.dispatchEvent(mkPtr('pointerdown', 200, 300, 'mouse'));
  fq10.dispatchEvent(mkPtr('pointerup', 201, 301, 'mouse'));
  await sleep(60);
  check('鼠标：pointerup 不补偿（原生 click 路径）', scrolled.length === n3);
  await sleep(750);
  const n4 = scrolled.length;
  w.gotoQ(iid10);
  check('去重窗口外：gotoQ 正常触发滚动', scrolled.length === n4 + 1);

  // 只看收藏：条列表与卡片流同过滤（避免点条无对应卡片 → 静默不跳）
  await w.toggleFavOnly();
  await sleep(400);
  const favCards = d.querySelectorAll('#ztMain .question-card').length;
  const favFq = d.querySelectorAll('#fqList .zt-fq-i').length;
  check('只看收藏：条列表数 = 卡片数（一致过滤）', favFq === favCards, `条 ${favFq} / 卡 ${favCards}`);
  check('只看收藏：条列表含已收藏的 iid2', !!d.querySelector('#fqList .zt-fq-i[data-iid="' + iid2 + '"]'));
  await w.toggleFavOnly();
  await sleep(400);
  check('退出只看收藏：条列表恢复全量 47', d.querySelectorAll('#fqList .zt-fq-i').length === 47);

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

    // v6：进入做题模式 → 笔记隐藏（面板与 ● 提示）；取消 → 恢复（内容保留）
    await w.toggleExamMode();
    await sleep(300);
    check('做题模式：笔记面板与 ● 提示隐藏',
      !d.querySelector('#card-' + iid2 + ' .zt-note-panel') &&
      !d.querySelector('#card-' + iid2 + ' .btn-explanation.has-note'));
    w.toggleNotePanel(iid2);   // 做题模式下点击应被拦截
    await sleep(150);
    check('做题模式：点击笔记被拦截（面板不出现）', !d.querySelector('#card-' + iid2 + ' .zt-note-panel'));

    await w.toggleExamMode();
    await sleep(350);
    const np2 = d.querySelector('#card-' + iid2 + ' .zt-note-panel');
    check('取消做题模式：笔记面板恢复且内容保留',
      !!np2 && /<b>测试<\/b>/.test((np2.querySelector('.note-input') || {}).innerHTML || ''));

    w.toggleNotePanel(iid2);
    await sleep(200);
    check('笔记：再次点击收起面板', !d.querySelector('#card-' + iid2 + ' .zt-note-panel'));
  }

  // v5：DS 算法题替换为打卡表版本（= 打卡表真题卡且有讲义命中；应用题不替换）
  console.log('\n▸ DS 算法题打卡表替换');
  const cardByI = i => [...d.querySelectorAll('#ztMain .question-card')].find(c => c.dataset.i === String(i));

  w.switchYear(2009);
  await sleep(500);
  const c41 = cardByI(41), c42 = cardByI(42), c43 = cardByI(43);
  check('2009|42（算法题）替换为打卡表卡片', !!c42 && c42.classList.contains('zt-daka-card'), true);
  check('2009|42 题图（daka_figs 教材原图）', !!c42 && !!c42.querySelector('.question-content .zt-daka-figs img[src*="daka_figs"]'), true);
  check('2009|41（最短路径应用题）不替换（保留原版）', !!c41 && !c41.classList.contains('zt-daka-card'), true);
  check('2009|43（计组）不替换', !!c43 && !c43.classList.contains('zt-daka-card'), true);
  check('2009 年卷仅 42 一处替换（只动算法题）', d.querySelectorAll('#ztMain .zt-daka-card').length, 1);
  // 展开全部答案（不经 toggleAns——当前处于做题模式会被拦截；同时覆盖 showAll 分支）
  w.toggleShowAll();
  await sleep(350);
  const c42x = cardByI(42);
  check('42 展开答案后含「暴力解」解法标签（讲义 kind 标注）',
    !!c42x && /暴力解/.test((c42x.querySelector('.explanation-body .sol-wrap') || {}).textContent || ''), true);
  check('42 展开答案后含解答原图', !!c42x && !!c42x.querySelector('.explanation-body .zt-daka-figs img[src*="daka_figs"]'), true);
  w.toggleShowAll();
  await sleep(250);

  w.switchYear(2016);
  await sleep(500);
  const g41 = cardByI(41), g42 = cardByI(42), g43 = cardByI(43);
  check('2016|41（计网）不替换', !!g41 && !g41.classList.contains('zt-daka-card'), true);
  check('2016|42（正则 k 叉树推导题）不替换', !!g42 && !g42.classList.contains('zt-daka-card'), true);
  check('2016|43（算法题特殊分布）替换', !!g43 && g43.classList.contains('zt-daka-card'), true);

  w.switchYear(2024);
  await sleep(500);
  const x41 = cardByI(41), x42 = cardByI(42);
  check('2024|41 讲义型替换（题干为文本、无题图）',
    !!x41 && x41.classList.contains('zt-daka-card') &&
    !x41.querySelector('.question-content .zt-daka-figs img'), true);
  check('2024|41 题干含原题文字', !!x41 && /载人航天|拓扑/.test(x41.querySelector('.question-content').textContent), true);
  check('2024|42（打卡表无讲义）不替换', !!x42 && !x42.classList.contains('zt-daka-card'), true);

  // ---------- 第二个页面实例：模拟「重开页面」（IndexedDB 共享，localStorage 全新） ----------
  console.log('\n▸ 重开页面：默认做题模式仍隐藏既有记录与笔记');
  w.close();
  const dom2 = new JSDOM(html, mkOptions());
  const w2 = dom2.window;
  const d2 = w2.document;
  let y2 = 0;
  for (let i = 0; i < 60; i++) { await sleep(100); y2 = d2.querySelectorAll('#yearList .ol-nav-item').length; if (y2) break; }
  await sleep(300);

  check('重开：默认进入做题模式（做题中 + 已选 0/40）',
    /做题中/.test(d2.querySelector('#ztMain').textContent) && /已选 0\/40/.test(d2.querySelector('#ztMain').textContent));
  check('重开：年份完成度隐藏（尽管库中已有历史作答）', !/\/40/.test(d2.querySelector('#yearList').textContent));

  const card2 = d2.querySelector('#ztMain .question-card');
  const iid3 = card2.dataset.iid;
  check('重开：同题同 id（交互互通）', iid3 === iid, iid3);
  check('重开：做题模式下历史作答不显示（无预选/无结果条/无选项色/无解析）',
    !card2.querySelector('.option-item input:checked') &&
    !card2.querySelector('.result-correct,.result-wrong') &&
    !card2.querySelector('.option-item.correct,.option-item.wrong') &&
    !card2.querySelector('.explanation-panel'));
  check('重开：题号导航无历史色点', !d2.querySelector('#fqList .zt-fq-i.ok, #fqList .zt-fq-i.bad'));

  // 切到 2024（仍在做题模式）：笔记与历史记录同样隐藏
  w2.switchYear(2024);
  await sleep(500);
  const findCard2 = id => [...d2.querySelectorAll('#ztMain .question-card')].find(c => c.dataset.iid === id);
  const nc0 = findCard2(iid2);
  check('重开：做题模式下笔记 ● 与面板均隐藏',
    !!nc0 && !nc0.querySelector('.btn-explanation.has-note') && !nc0.querySelector('.zt-note-panel'));
  check('重开：做题模式下 2024 历史作答也不显示',
    !!nc0 && !nc0.querySelector('.option-item input:checked') && !nc0.querySelector('.result-correct,.result-wrong'));

  // 取消做题模式 → 历史记录 + 笔记全部恢复
  await w2.toggleExamMode();
  await sleep(400);
  const nc1 = findCard2(iid2);
  check('重开+取消：历史作答恢复（预选 + 结果条）',
    !!nc1 && !!nc1.querySelector('.option-item input:checked') && !!nc1.querySelector('.result-correct,.result-wrong'));
  check('重开+取消：笔记 ● 提示出现', !!nc1 && !!nc1.querySelector('.btn-explanation.has-note'));
  w2.toggleNotePanel(iid2);
  await sleep(300);
  const np3 = d2.querySelector('#card-' + iid2 + ' .zt-note-panel');
  check('重开+取消：笔记面板可打开且内容保留',
    !!np3 && /<b>测试<\/b>/.test((np3.querySelector('.note-input') || {}).innerHTML || ''));

  // 2026 历史记录（答错演示）在取消后同样恢复
  w2.switchYear(2026);
  await sleep(500);
  const ncc = d2.querySelector('#card-' + iid3);
  check('重开+取消：2026 历史作答恢复（预选 + 错误条）',
    !!ncc && !!ncc.querySelector('.option-item input:checked') && !!ncc.querySelector('.result-wrong'));

  w2.close();
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
