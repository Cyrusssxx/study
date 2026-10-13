// _test_plan_page.js —— 考研冲刺计划页（打卡勾选 + 我的备注）回归（2026-10-13）
// 覆盖：单词已去 / 数学 30题 / 阅读重做按年份隔天；68 行打卡列 + 10 周表头；
//       勾选持久化（sprint_done）、备注持久化（sprint_notes）、重开恢复、清空按钮。
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
  check('去单词（无「单词」字样）', /单词/.test(PLAN), false);
  check('实习日志期英语列归为「—」', /<td class="cen">—<\/td>/.test(PLAN), true);
  check('数学一刷期统一 30题', (PLAN.match(/<td class="cma">30题<\/td>/g) || []).length, 36);
  check('阅读重做为 10 个年份组（隔天一年份）', (PLAN.match(/阅读重做：/g) || []).length, 10);
  check('阅读重做含年份括注篇目（分组）', /阅读重做：2015（T1、T2、T3）/.test(PLAN), true);
  check('打卡复选框 68 个（=68 天）', (PLAN.match(/class="sprint-ck"/g) || []).length, 68);
  check('数据行均带 data-key', (PLAN.match(/data-key="/g) || []).length, 68);
  check('10 个周表头各加打卡列', (PLAN.match(/<th class="ck">/g) || []).length, 10);
  check('备注框为 contenteditable + 占位符', /class="mynote" contenteditable="true" data-ph="备注…"/.test(PLAN), true);
  check('进度行元素存在', /id="sprintProgress"/.test(PLAN), true);
  check('样式齐备（完成态淡化 + 占位符 + 移动端标签 + 打印）',
    /tr\.done td:not\(\.ck\)\s*\{\s*opacity/.test(PLAN) && /\.mynote:empty::before/.test(PLAN)
    && /@media \(max-width: 760px\)[\s\S]{0,120}td\.ck::before/.test(PLAN)
    && /@media print[\s\S]{0,120}\.mynote/.test(PLAN), true);
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
  check('页面加载后行数 = 68', rows.length, 68);
  const r0 = d.querySelector('tr[data-key="10/16"]');
  check('定位到 10/16 行', !!r0, true);

  // ① 勾选
  const cb = r0.querySelector('.sprint-ck');
  cb.checked = true;
  cb.dispatchEvent(new w.Event('change'));
  check('勾选后行加 done 类', r0.classList.contains('done'), true);
  check('勾选写入 localStorage(sprint_done)', JSON.parse(w.localStorage.getItem('sprint_done')), { '10/16': 1 });
  check('进度更新为 1/68', /已完成 <b>1<\/b> \/ 68 天/.test(d.getElementById('sprintProgress').innerHTML), true);

  // ② 备注
  const nt = r0.querySelector('.mynote');
  nt.textContent = '套卷错题多，重做 2014 卷二';
  nt.dispatchEvent(new w.Event('input'));
  await sleep(420);
  check('备注写入 localStorage(sprint_notes)',
    JSON.parse(w.localStorage.getItem('sprint_notes')), { '10/16': '套卷错题多，重做 2014 卷二' });

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
  check('重开后进度 = 2/68', /已完成 <b>2<\/b> \/ 68 天/.test(d2.getElementById('sprintProgress').innerHTML), true);
  check('未勾选行保持未完成', d2.querySelector('tr[data-key="10/16"]').classList.contains('done'), false);
  dom2.window.close();

  console.log(`\n${failed ? '❌' : '✅'} ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
