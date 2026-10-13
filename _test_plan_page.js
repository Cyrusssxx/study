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

function boot(preload) {
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
    }
  });
}

(async () => {
  console.log('▸ 静态结构（pwa/plan.html）');
  check('不再排真题套卷（无「掐表 3h」/「卷 N/18」）',
    /限时 3h 掐表/.test(PLAN) || /卷 \d+\/18/.test(PLAN), false);
  check('去单词（无「单词」字样）', /单词/.test(PLAN), false);
  check('实习日志 3 天（10/13–10/15）', (PLAN.match(/<tr class="it"/g) || []).length, 3);
  check('阶段A 打卡表行 = 12（扣除 2 个机动日）', (PLAN.match(/<td class="cb">打卡表 \d+ 题/g) || []).length, 12);
  check('阶段A 选择题收藏/错题并行 = 12 行',
    (PLAN.match(/<td class="cw">收藏 \/ 错题 \d+ 题/g) || []).length, 12);
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
  check('机动日 = 7 天（12 月前每周日）', (PLAN.match(/<tr class="fx"/g) || []).length, 7);
  check('机动日派活（英语作文背诵 + 数学讲义/错题 + 408 知识点）',
    /作文背诵（模板 \+ 通用理由）/.test(PLAN) && /讲义 \+ 错题复习（不做新题）/.test(PLAN)
    && /知识点复习｜本周错题章节回看/.test(PLAN), true);
  check('英二 2022–2024 封存（常态队列不出现）',
    /完型 2022|新题型 2022|译 2022|作文·小 2023|作文·大 2024/.test(PLAN), false);
  check('数学统一 30题（25 天）', (PLAN.match(/<td class="cma">30题<\/td>/g) || []).length, 25);
  check('英语阅读一天一篇（48 篇）', (PLAN.match(/阅读 (英一)?\d{4}·T\d/g) || []).length, 48);
  check('打卡复选框 67 个（=67 天）', (PLAN.match(/class="sprint-ck"/g) || []).length, 67);
  check('数据行均带 data-key', (PLAN.match(/data-key="/g) || []).length, 67);
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
    /最后 6 天（12\/11 起）转收口/.test(PLAN), true);
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
  check('阶段A 文案口径（池去重 1282 / 覆盖 431 / 30–46 题每天）',
    /池共 1282 题 ＝ 收藏 1130 ∪ 错题 662 去重/.test(PLAN) && /阶段 A 覆盖 431 题/.test(PLAN)
    && /约 30–46 题\/天/.test(PLAN), true);
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

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
