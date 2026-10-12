// 真题套卷页（zhenti.html）回归测试：数据装配 / 套卷渲染 / 题号导航 / 作答交互 / 顶栏一致性
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
  // ---------- 静态：页面结构与顶栏 ----------
  console.log('▸ 静态结构');
  const html = inline(fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8'));
  const rawHtml = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
  check('zhenti.html 引入 js/zhenti.js', /<script src="js\/zhenti\.js">/.test(rawHtml));
  check('页面含 左年份栏 / 中题目流 / 右题号导航 三容器',
    /id="ztNav"/.test(rawHtml) && /id="ztMain"/.test(rawHtml) && /id="ztFq"/.test(rawHtml));
  check('main 带 toc-fixed（目录贴左统一机制）', /<main class="container toc-fixed">/.test(rawHtml));
  const navLinks = [...rawHtml.matchAll(/<a href="([\w.]+)\.html" class="nav-link[^"]*">([^<]+)<\/a>/g)].map(m => m[1]);
  check('顶栏链接 14 项且含真题套卷（active）', navLinks.length === 14 && /真题套卷/.test(rawHtml) && /zhenti\.html" class="nav-link active"/.test(rawHtml), navLinks.join(','));
  check('真题套卷链接排在刷题之后', navLinks.indexOf('zhenti') === navLinks.indexOf('quiz') + 1, navLinks.slice(0, 4).join(' > '));

  // ---------- 动态：jsdom 渲染 ----------
  console.log('▸ 动态渲染（jsdom + fake-indexeddb + 真实数据）');
  const dataCache = {};
  const readJson = f => {
    if (!dataCache[f]) dataCache[f] = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8'));
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
        const m = s.match(/data\/([\w.]+\.json)/);
        if (m) return { ok: true, status: 200, json: async () => readJson('data/' + m[1]) };
        return { ok: true, status: 200, json: async () => ({}) };
      };
    },
  });

  // 等待初始化渲染完成（年份列表出现）
  const w = dom.window;
  let years = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    years = w.document.querySelectorAll('#yearList .ol-nav-item').length;
    if (years) break;
  }
  check('年份列表渲染（2009-2025 共 17 年）', years === 17, `实际 ${years}`);

  const d = w.document;
  const cards = d.querySelectorAll('#ztMain .question-card');
  const papers = readJson('data/papers.json');
  const defYear = String(papers.years[papers.years.length - 1]);
  const defPaper = papers.papers[defYear];
  check(`默认渲染 ${defYear} 年套卷（题卡数 = ${defPaper.total}）`, cards.length === defPaper.total, `实际 ${cards.length}`);
  check('选择题分组标题 4 个科目', d.querySelectorAll('.zt-group-title').length === 4);
  check('大题区存在（DS 代码题 + co/os/cn）', /二、大题/.test(d.querySelector('#ztMain').textContent));
  check('题号导航格子数 = 总题数', d.querySelectorAll('#fqList .zt-fq-i').length === defPaper.total,
    `实际 ${d.querySelectorAll('#fqList .zt-fq-i').length}`);
  check('题号按试卷编排（第 1 题起，大题接排）', /第 1 题/.test(d.querySelector('#ztMain').textContent) &&
    new RegExp(`第 ${defPaper.choice_total + 1} 题`).test(d.querySelector('#ztMain').textContent));
  check('年份项显示完成度', /\/\d+/.test(d.querySelector('#yearList').textContent));

  // ---------- 交互：作答 ----------
  console.log('▸ 交互：作答与切换年份');
  const firstQid = defPaper.choice.ds[0];
  const qEntry = readJson('data/ds.json').questions.find(q => q.id === firstQid);
  const rightAns = qEntry.answer;
  await w.pickOption(firstQid, rightAns);
  await sleep(120);
  let card = d.querySelector(`#card-${firstQid}`);
  check('答对：题卡出现「回答正确」', !!card.querySelector('.result-correct'));
  check('答对：题号导航格变绿（ok）', !!d.querySelector(`#fqList .zt-fq-i.ok`));
  check('答对：解析自动展开', !!card.querySelector('.explanation-panel'));

  const wrongKey = Object.keys(qEntry.options).find(k => k !== rightAns);
  if (wrongKey) {
    await w.pickOption(firstQid, wrongKey);
    await sleep(120);
    card = d.querySelector(`#card-${firstQid}`);
    check('答错：题卡出现「回答错误 + 正确答案」', !!card.querySelector('.result-wrong') &&
      card.querySelector('.result-wrong').textContent.includes(rightAns));
    check('答错：题号导航格变红（bad）', !!d.querySelector(`#fqList .zt-fq-i.bad`));
  }

  // 切换年份
  const otherYear = papers.years[0];
  w.switchYear(otherYear);
  await sleep(150);
  const otherPaper = papers.papers[String(otherYear)];
  check(`切换 ${otherYear} 年：题卡数 = ${otherPaper.total}`, d.querySelectorAll('#ztMain .question-card').length === otherPaper.total);
  check('切换年份后工具条标题更新', new RegExp(`${otherYear} 年真题套卷`).test(d.querySelector('#ztMain').textContent));

  // 做题模式
  w.toggleExamMode();
  await sleep(150);
  check('做题模式：出现「对答案」按钮', /对答案/.test(d.querySelector('#ztMain').textContent));
  const firstId2 = otherPaper.choice.ds[0];
  await w.pickOption(firstId2, 'A');
  await sleep(100);
  check('做题模式：选答不判定（无 result 条）', !d.querySelector(`#card-${firstId2}`).querySelector('.result-correct,.result-wrong'));
  check('做题模式：题号导航格为 picked', !!d.querySelector('#fqList .zt-fq-i.picked'));

  // 收藏
  await w.toggleFav(firstId2);
  await sleep(100);
  check('收藏：题卡星标切换', !!d.querySelector('#card-' + firstId2 + ' .btn-icon.favorited'));

  w.close();
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
