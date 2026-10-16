// _test_plan_page.js —— 考研冲刺计划页（v2 重排：打卡表大题 → 错题 + 三科大题）回归（2026-10-13）
// 覆盖：不再有真题套卷 / 单词已去 / 数学 30题 / 阅读按年份连排一天一篇；
//       67 行打卡列 + 10 周表头；勾选持久化（sprint_done）、备注（sprint_notes）、重开恢复、清空。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  if (ok) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, `\n      实际: ${JSON.stringify(actual)}\n      期望: ${JSON.stringify(expect)}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PLAN = fs.readFileSync(path.join(ROOT, 'pwa/plan.html'), 'utf8');
const DESK = fs.readFileSync('E:/Desktop/考研冲刺计划.html', 'utf8');

function boot(preload, opts) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  return new JSDOM(PLAN, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/plan.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.confirm = () => true;
      w.alert = () => { };
      if (preload) for (const [k, v] of Object.entries(preload)) w.localStorage.setItem(k, v);
      if (opts && opts.fixedDate) {
        const [Y, M, D] = opts.fixedDate;   // M 为 0 起（11 月 = 10）
        const F = class extends w.Date {
          constructor(...a) { if (a.length === 0) super(Y, M, D, 9, 0, 0); else super(...a); }
        };
        w.Date = F;
      }
      if (opts && opts.countScroll) {
        w.__scrolls = 0;
        w.scrollTo = function () { w.__scrolls++; };
      }
    }
  });
}

(async () => {
  console.log('▸ 静态结构（pwa/plan.html）');
  check('不再排真题套卷（无「掐表 3h」/「卷 N/18」）',
    /限时 3h 掐表/.test(PLAN) || /卷 \d+\/18/.test(PLAN), false);
  check('去单词（无「单词」字样）', /单词/.test(PLAN), false);
  check('实习日志 3 天（10/13–10/15）', (PLAN.match(/<tr class="it"/g) || []).length, 3);
  check('阶段A 打卡表行 = 13（第一周不排机动日）', (PLAN.match(/<td class="cb">打卡表 \d+ 题/g) || []).length, 13);
  check('阶段A 选择题收藏/错题并行 = 13 行',
    (PLAN.match(/<td class="cw">收藏 \/ 错题 \d+ 题/g) || []).length, 13);
  check('阶段B 错题一刷行 = 22', (PLAN.match(/<td class="cw">错题 \d+ 题/g) || []).length, 22);
  check('阶段B 三科大题行 = 38（扣除机动日与模拟日）',
    (PLAN.match(/<td class="cb">大题 \d+ 题/g) || []).length, 38);
  check('全真模拟日 = 3 天', (PLAN.match(/<tr class="sim"/g) || []).length, 3);
  check('模拟日一天三套（数学 + 408 + 英语各一整套）',
    /全套模拟 · 数学二 1 套/.test(PLAN) && /全套模拟 · 408 1 套/.test(PLAN)
    && /全套模拟 · 英语二 2022 整套/.test(PLAN) && /全套模拟 · 英语二 2023 整套/.test(PLAN)
    && /全套模拟 · 英语二 2024 整套/.test(PLAN), true);
  check('模拟日红色强调（tr.sim 红底 + 红字 + 图例）',
    /tr\.sim td \{ background: rgba\(220,38,38/.test(PLAN)
    && /tr\.sim \.cw, tr\.sim \.cb, tr\.sim \.cma, tr\.sim \.cen \{ color: #b3261e/.test(PLAN)
    && /class="sim">全真模拟日：12\/6 · 12\/13 · 12\/16/.test(PLAN), true);
  check('机动日 = 6 天（12 月前每周日，第一周不排）', (PLAN.match(/<tr class="fx"/g) || []).length, 6);
  check('第一周无机动日（机动日 = 10/25 起每周日共 6 天）',
    [...PLAN.matchAll(/<tr class="fx" data-key="([\d/]+)"/g)].map(m => m[1]),
    ['10/25', '11/1', '11/8', '11/15', '11/22', '11/29']);
  check('机动日派活（英语按背诵阶段复盘 + 数学讲义/错题 + 408 知识点）',
    /作文·大 句池复盘/.test(PLAN) && /作文·小 拼信复盘/.test(PLAN)
    && /作文套写复盘/.test(PLAN) && /讲义 \+ 错题复习（不做新题）/.test(PLAN)
    && /知识点复习｜本周错题章节回看/.test(PLAN), true);
  check('英二 2022–2024 封存（常态队列不出现）',
    /完型 2022|完型 2023|完型 2024|英二新题型二刷 2022|英二新题型二刷 2023|英二新题型二刷 2024/
    .test(PLAN) || /译 2022|作文·小 2023|作文·大 2024/.test(PLAN), false);
  // —— 2026-10-14 英语二轮调整：英二新题型一刷已完成 → 先排完型 + 英一小标题，11 月起二刷 ——
  check('英一小标题只排 2007 / 2016 / 2020 三年（其他年份为排序或七选五，不计入）',
    /英一小标题 2007/.test(PLAN) && /英一小标题 2016/.test(PLAN) && /英一小标题 2020/.test(PLAN)
    && !/英一小标题 2017|英一小标题 2021/.test(PLAN), true);
  check('英一小标题排在 10 月内（先安排）',
    /data-key="10\/17"[\s\S]{0,400}?英一小标题 2007/.test(PLAN)
    && /data-key="10\/21"[\s\S]{0,400}?英一小标题 2020/.test(PLAN), true);
  check('英二新题型二刷从 11/1 起（下个月再安排复习）',
    /data-key="11\/2"[\s\S]{0,400}?英二新题型二刷 2021/.test(PLAN)
    && !/data-key="10\/\d+"[\s\S]{0,400}?英二新题型二刷/.test(PLAN), true);
  check('完型优先排（10/16 起，英二 14 年 + 英一 4 年 = 18 篇）',
    (PLAN.match(/完型 (?:英一)?\d{4}/g) || []).length, 18);
  check('数学统一 30题（25 天）', (PLAN.match(/<td class="cma">30题<\/td>/g) || []).length, 25);
  check('英语阅读一天一篇（48 篇）', (PLAN.match(/阅读 (英一)?\d{4}·T\d/g) || []).length, 48);
  check('打卡复选框 67 个（=67 天）', (PLAN.match(/class="sprint-ck"/g) || []).length, 67);
  check('数据行均带 data-key（锚定 <tr> 标签，避免计入 JS 选择器字符串）',
    (PLAN.match(/<tr[^>]*data-key="/g) || []).length, 67);
  check('10 个周表头各加打卡列', (PLAN.match(/<th class="ck">/g) || []).length, 10);
  check('两列表头（选择题错题 / 大题）',
    /<th>408 · 选择题错题<\/th><th>408 · 大题<\/th>/.test(PLAN), true);
  check('备注框为 contenteditable + 占位符', /class="mynote" contenteditable="true" data-ph="备注…"/.test(PLAN), true);
  check('进度行元素存在', /id="sprintProgress"/.test(PLAN), true);
  check('样式齐备（完成态淡化 + 占位符 + 移动端标签 + 打印）',
    /tr\.done td:not\(\.ck\)\s*\{\s*opacity/.test(PLAN) && /\.mynote:empty::before/.test(PLAN)
    && /@media \(max-width: 760px\)[\s\S]{0,160}td\.ck::before/.test(PLAN)
    && /@media print[\s\S]{0,120}\.mynote/.test(PLAN), true);
  // —— 2026-10-14 体检修订 ——
  check('英语列仅实习期留空（3 天），其余 64 天全有任务（收口队列兜底）',
    (PLAN.match(/<td class="cen">—<\/td>/g) || []).length, 3);
  check('收口队列以「考前速背」收尾（落在 12/18）',
    /考前：作文模板 \+ 通用理由速背（不动笔，22:30 前睡）/.test(PLAN), true);
  check('英语节奏卡说明收口期（12/11 起转收口）',
    /末段（12\/11 起）转收口/.test(PLAN), true);
  check('收口队列 7 项且末项落在 12/18（推进日由 54 增为 55）',
    /考前：作文模板 \+ 通用理由速背（不动笔，22:30 前睡）/.test(PLAN)
    && /data-key="12\/18"[\s\S]{0,400}?考前：作文模板/.test(PLAN), true);
  // —— 排版：阶段A 多科目分行 + 题数单独一行 ——
  check('阶段A 选择题：题数与科目分行（<br>），科目一行一个（span.s2）',
    /<td class="cw">收藏 \/ 错题 \d+ 题<br><span class="s2">/.test(PLAN)
    && /<span class="s2">CO 计算机系统概述 19 题<\/span><span class="s2">CN 计算机网络体系结构 31 题<\/span>/.test(PLAN), true);
  check('span.s2 为块级带细左导轨（CSS）', /\.cw \.s2 \{ display: block;/.test(PLAN)
    && /\.cw \.s2 \{[^}]*border-left: 2px solid var\(--line\)/.test(PLAN), true);
  // —— 悬浮半透明条状目录 ——
  check('悬浮周目录存在（细条 + 面板 + 10 周条目）',
    /<nav class="plan-toc" id="planToc"/.test(PLAN) && /class="ptoc-tab" id="ptocTab"/.test(PLAN)
    && (PLAN.match(/class="ptoc-item"/g) || []).length === 10, true);
  check('周 section 带 id（w1–w10）供目录跳转',
    (PLAN.match(/<section class="week ph-\w+" id="w\d+"/g) || []).length, 10);
  check('目录默认只占 8px 细条且不挤压正文（fixed + 宽 0 面板，hover 才展开）',
    /\.plan-toc \{ position: fixed; left: 0;/.test(PLAN)
    && /\.plan-toc \.ptoc-tab \{ width: 8px;/.test(PLAN)
    && /\.plan-toc \.ptoc-body \{ width: 0; opacity: 0; pointer-events: none;/.test(PLAN)
    && /\.plan-toc:hover \.ptoc-body, \.plan-toc\.pinned \.ptoc-body \{ width: 176px;/.test(PLAN), true);
  check('目录半透明毛玻璃 + 深色适配 + 窄屏隐藏',
    /\.plan-toc \.ptoc-body \{[^}]*backdrop-filter: blur\(8px\)/.test(PLAN)
    && /@media \(prefers-color-scheme: dark\) \{\s*\.plan-toc \.ptoc-body/.test(PLAN)
    && /@media \(max-width: 760px\) \{ \.plan-toc \{ display: none; \}/.test(PLAN), true);
  check('周标签：混合周明确标注（实习→A / A→B / B→C）',
    /实习期 → 阶段A/.test(PLAN) && /阶段A → 阶段B/.test(PLAN) && /阶段B → 阶段C/.test(PLAN), true);
  check('周标签：含模拟日的周加「＋ 全真模拟」（3 周）',
    (PLAN.match(/＋ 全真模拟<\/span>/g) || []).length, 3);
  check('错题大章拆天题数动态计算（34/34、30/30、28/27）',
    /OS 进程与线程（前 34 题）/.test(PLAN) && /OS 进程与线程（后 34 题）/.test(PLAN)
    && /CN 数据链路层（前 30 题）/.test(PLAN) && /CN 数据链路层（后 30 题）/.test(PLAN)
    && /CN 网络层（前 28 题）/.test(PLAN) && /CN 网络层（后 27 题）/.test(PLAN), true);
  check('打卡 / 备注列宽 148px（加宽后）', /th\.ck, td\.ck \{ width: 148px; \}/.test(PLAN), true);
  check('模拟卷来源建议（408 用 zhenti 2024–2026 三套）',
    /408 用 zhenti\.html 的/.test(PLAN) && /2024 \/ 2025 \/ 2026/.test(PLAN), true);
  // —— 2026-10-16 修改：选择题前四天改 DS 一天一章 ——
  check('阶段A 前四天选择题 = DS 一天一章（绪论 / 线性表 / 栈队列数组 / 串）',
    /data-key="10\/16"[\s\S]{0,500}?DS 绪论 \d+ 题/.test(PLAN)
    && /data-key="10\/17"[\s\S]{0,500}?DS 线性表 \d+ 题/.test(PLAN)
    && /data-key="10\/18"[\s\S]{0,500}?DS 栈、队列和数组 \d+ 题/.test(PLAN)
    && /data-key="10\/19"[\s\S]{0,500}?DS 串 \d+ 题/.test(PLAN), true);
  check('10/20 起恢复四科轮转（原内容后移，OS 计算机系统概述整章打头）',
    /data-key="10\/20"[\s\S]{0,500}?OS 计算机系统概述 44 题/.test(PLAN), true);
  // —— 2026-10-16 修改：作文改大作文先行 16 天背诵 ——
  check('作文大先行：骨架 3 天 → 句池 6 天（归因/补充/主体，每天套 1 篇真题）',
    /作文·大 骨架 D1/.test(PLAN) && /作文·大 骨架 D3/.test(PLAN)
    && /作文·大 句池①归因 16 句/.test(PLAN) && /作文·大 句池②第一段补充 12 句/.test(PLAN)
    && /作文·大 句池③第三段主体 22 句/.test(PLAN)
    && /句池①归因 16 句 ＋ 套写真题 2010/.test(PLAN)
    && /句池③第三段主体 22 句 ＋ 套写真题 2016/.test(PLAN), true);
  check('小作文后置：骨架 2 天 → 10 类 5 天（每天 2 类拼信）',
    /作文·小 骨架 D1/.test(PLAN) && /作文·小 骨架 D2/.test(PLAN)
    && /作文·小 10 类 D1（建议信＋推荐信/.test(PLAN)
    && /作文·小 10 类 D5（通知＋备忘录/.test(PLAN), true);
  check('11/20 起转限时套写：大作文一/三（2017–2026）＋ 小作文四/六',
    /作文·大 套写 2017/.test(PLAN) && /作文·大 套写 2026/.test(PLAN)
    && /作文·小 套写 2010/.test(PLAN) && /作文·小 套写 2017/.test(PLAN), true);
  check('旧作文排期已移除（无「作文·小 2010」年签式旧标签）',
    !/作文·小 \d{4}/.test(PLAN) && !/作文·大 \d{4}/.test(PLAN), true);
  // —— 2026-10-16 修改：翻译改两天一篇（整篇）——
  check('翻译两天一篇（整篇，共 14 篇，不再半篇天天写）',
    /译 2015（整篇）/.test(PLAN) && /译 2010（整篇）/.test(PLAN)
    && !/第 1–3 句/.test(PLAN) && !/第 4–5 句/.test(PLAN), true);
  check('翻译每篇只出现一次（无同篇重复，杜绝「两天一篇写两次」）',
    (() => {
      const ys = [...PLAN.matchAll(/译 (\d{4})（整篇）/g)].map(m => m[1]);
      return [ys.length, new Set(ys).size];
    })(), [14, 14]);
  check('阶段A 文案口径（池去重 1282 / 前四天 DS 一天一章 / 覆盖 387 题）',
    /池共 1282 题 ＝ 收藏 1130 ∪ 错题 662 去重/.test(PLAN) && /阶段 A 覆盖 387 题/.test(PLAN)
    && /DS 一天一章/.test(PLAN), true);
  check('阶段A 选择题 13 天共 387 题（前四天 DS 单章 3–23 题，轮转日 30–50 题）',
    (() => {
      const qs = [...PLAN.matchAll(/<td class="cw">收藏 \/ 错题 (\d+) 题/g)].map(m => +m[1]);
      return [qs.length, Math.min(...qs) >= 3, Math.max(...qs) <= 50, qs.reduce((a, b) => a + b, 0)];
    })(), [13, true, true, 387]);
  // 桌面版与站内版：去掉「返回首页」差异与全部空白后应完全一致（同源生成）
  const norm = s => s
    .replace(/[\s\S]*?<body>/, '')
    .replace(/<a id="backHome"[\s\S]*?<\/a>/, '')
    .replace(/<script>if \(location\.protocol[\s\S]*?<\/script>/, '')
    .replace(/\s+/g, '');
  check('桌面版与站内版同源（结构一致，站内版多返回链接）', norm(DESK) === norm(PLAN), true);

  console.log('\n▸ 动态（jsdom：勾选 / 备注 / 恢复 / 清空）');
  const dom = boot();
  const w = dom.window, d = w.document;
  await sleep(120);
  const rows = [...d.querySelectorAll('tr[data-key]')];
  check('页面加载后行数 = 67', rows.length, 67);
  const r0 = d.querySelector('tr[data-key="10/16"]');
  check('定位到 10/16 行', !!r0, true);

  // ① 勾选
  const cb = r0.querySelector('.sprint-ck');
  cb.checked = true;
  cb.dispatchEvent(new w.Event('change'));
  check('勾选后行加 done 类', r0.classList.contains('done'), true);
  check('勾选写入 localStorage(sprint_done)', JSON.parse(w.localStorage.getItem('sprint_done')), { '10/16': 1 });
  check('进度更新为 1/67', /已完成 <b>1<\/b> \/ 67 天/.test(d.getElementById('sprintProgress').innerHTML), true);

  // ② 备注
  const nt = r0.querySelector('.mynote');
  nt.textContent = '打卡表第 1–4 张，顺序表基本功';
  nt.dispatchEvent(new w.Event('input'));
  await sleep(420);
  check('备注写入 localStorage(sprint_notes)',
    JSON.parse(w.localStorage.getItem('sprint_notes')), { '10/16': '打卡表第 1–4 张，顺序表基本功' });

  // ③ 取消勾选
  cb.checked = false;
  cb.dispatchEvent(new w.Event('change'));
  check('取消勾选后移除 done 与数据', [r0.classList.contains('done'), JSON.parse(w.localStorage.getItem('sprint_done'))], [false, {}]);

  // ④ 清空按钮（confirm 已 stub 为 true）
  cb.checked = true; cb.dispatchEvent(new w.Event('change'));
  const beforeNotes = JSON.parse(w.localStorage.getItem('sprint_notes'));
  d.getElementById('sprintReset').click();
  check('清空后 done/notes 均为空',
    [JSON.parse(w.localStorage.getItem('sprint_done')), JSON.parse(w.localStorage.getItem('sprint_notes'))], [{}, {}]);
  check('清空后所有行取消 done（含备注框清空）',
    [d.querySelectorAll('tr.done').length, r0.querySelector('.mynote').textContent], [0, '']);
  check('清空前备注确实存在（对照）', !!beforeNotes['10/16'], true);
  dom.window.close();

  // ⑤ 重开恢复（预置 localStorage 后新实例）
  const dom2 = boot({
    sprint_done: JSON.stringify({ '10/18': 1, '11/5': 1 }),
    sprint_notes: JSON.stringify({ '10/18': '补 2012 阅读' })
  });
  const d2 = dom2.window.document;
  await sleep(120);
  const r2 = d2.querySelector('tr[data-key="10/18"]');
  check('重开后恢复勾选状态', [r2.querySelector('.sprint-ck').checked, r2.classList.contains('done')], [true, true]);
  check('重开后恢复备注文本', r2.querySelector('.mynote').textContent, '补 2012 阅读');
  check('重开后进度 = 2/67', /已完成 <b>2<\/b> \/ 67 天/.test(d2.getElementById('sprintProgress').innerHTML), true);
  check('未勾选行保持未完成', d2.querySelector('tr[data-key="10/16"]').classList.contains('done'), false);
  dom2.window.close();

  console.log('\n▸ 悬浮周目录（细条 / 展开 / 跳转）');
  const dom3 = boot();
  const w3 = dom3.window, d3 = w3.document;
  await sleep(150);
  const toc = d3.getElementById('planToc');
  const items3 = [...d3.querySelectorAll('.ptoc-item')];
  // jsdom 里 offsetTop 恒为 0，只能断言「有且仅有一项高亮」（真实浏览器按滚动位置高亮）
  check('目录 10 项且当前周唯一高亮',
    [items3.length, items3.filter(a => a.classList.contains('active')).length], [10, 1]);
  check('周 section 与目录条目一一对应（href → #wN）',
    items3.every(a => !!d3.getElementById(a.getAttribute('href').slice(1))), true);
  const tab = d3.getElementById('ptocTab');
  tab.click();
  check('点细条钉住目录（pinned）', toc.classList.contains('pinned'), true);
  tab.click();
  check('再点一次取消钉住', toc.classList.contains('pinned'), false);
  let scrolled = 0;
  w3.scrollTo = () => { scrolled++; };
  items3[4].dispatchEvent(new w3.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('点击第 5 周条目触发平滑滚动', scrolled, 1);
  check('目录展开态不影响正文（面板默认 width:0 / pointer-events:none）',
    /\.plan-toc \.ptoc-body \{ width: 0; opacity: 0; pointer-events: none;/.test(PLAN), true);
  dom3.window.close();

  console.log('\n▸ 今天自动定位 + 短暂高亮（2026-10-14 追加）');
  check('今天定位：CSS 脉冲高亮（亮 / 暗两套 + 打印关闭）',
    /@keyframes todayPulse \{/.test(PLAN) && /@keyframes todayPulseDark \{/.test(PLAN)
    && /tr\.today-flash td \{ animation: todayPulse 2\.6s ease-in-out 1; \}/.test(PLAN)
    && /@media \(prefers-color-scheme: dark\) \{ tr\.today-flash td \{ animation-name: todayPulseDark; \} \}/.test(PLAN)
    && /@media print \{ tr\.today-flash td \{ animation: none; \} \}/.test(PLAN), true);
  check('今天定位：JS 按日期查行 + 76px 吸顶偏移 + 2.7s 后移除高亮',
    /querySelector\('tr\[data-key="' \+ \(d\.getMonth\(\) \+ 1\) \+ '\/' \+ d\.getDate\(\) \+ '"\]'\)/.test(PLAN)
    && /window\.scrollY - 76/.test(PLAN)
    && /classList\.remove\('today-flash'\); \}, 2700\)/.test(PLAN), true);
  // dom4：日期桩固定为 2026-11-05（计划内）→ 应滚动 + 高亮 + 超时移除
  const dom4 = boot(null, { fixedDate: [2026, 10, 5], countScroll: true });
  const w4 = dom4.window, d4 = w4.document;
  await sleep(400);
  const rt = d4.querySelector('tr[data-key="11/5"]');
  check('定位到 11/5 行并加 today-flash', !!rt && rt.classList.contains('today-flash'), true);
  check('自动滚动恰好触发一次（76px 偏移）', w4.__scrolls, 1);
  check('全表仅今天一行高亮', d4.querySelectorAll('tr.today-flash').length, 1);
  await sleep(2700);
  check('2.7s 后高亮自动移除', d4.querySelectorAll('tr.today-flash').length, 0);
  dom4.window.close();
  // dom5：日期桩固定为 2027-02-01（计划外）→ 不滚动、不高亮
  const dom5 = boot(null, { fixedDate: [2027, 1, 1], countScroll: true });
  const w5 = dom5.window, d5 = w5.document;
  await sleep(400);
  check('日期不在计划范围内：不滚动也不高亮',
    [w5.__scrolls, d5.querySelectorAll('tr.today-flash').length], [0, 0]);
  dom5.window.close();

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
