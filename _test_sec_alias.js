// 旧节名批注「回接」回归：节被重构改名后，老批注必须靠别名表回到新节的新行上。
//
// 背景：行级批注存 {sec, line}。节一旦改名（「5.4 控制单元」被拆成 5.4.1/5.4.2/5.4.3），
// 这批批注连「宿主节」都找不到，页面上根本不渲染 —— anchor 自愈救不了，因为它在节名
// 失配那一步就走不下去了。所以 notebooks 里需要一张 SEC_ALIAS：旧节名 → 现节名 + 行号搬迁。
//
// 本测试锁三件事：
//   ① 别名表登记了全部已知失联节（co 2 个 / os 1 个），且搬迁目标行确实存在；
//   ② 搬迁后的行，文本语义必须对得上（含关键词）—— 防止数据改动后表里的行号悄悄失效；
//   ③ 加载即搬迁并落库（下次进来直接用新 sec/line），未登记的行丢弃而非乱挂。
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

const HTML_SRC = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');

// ---------- 1. 静态：别名表存在且接线正确 ----------
console.log('▸ 静态结构（notes.html）');
check('SEC_ALIAS 表存在', /const SEC_ALIAS = \{/.test(HTML_SRC));
for (const old of ['5.4 控制单元', '5.3 指令执行过程', '2.4 死锁']) {
  check(`登记了旧节名「${old}」`, HTML_SRC.includes(`'${old}'`));
}
check('migrateAnno 在加载链上（map + filter(Boolean)）',
  /\.map\(migrateAnno\)\.filter\(Boolean\)/.test(HTML_SRC));
check('搬迁后清空 anchor（旧行文本对新行无意义）',
  /item\.anchor = '';\s*\/\/ anchor 是旧行文本/.test(HTML_SRC));
check('搬迁标记脏 → 触发落库',
  /item\.line = nl;[\s\S]{0,60}annoAnchorDirty = true;/.test(HTML_SRC));
check('未登记的行返回 null（丢弃，不乱挂）',
  /if \(typeof nl !== 'number'\) return null;/.test(HTML_SRC));

// ---------- 2. 动态：用真实讲义数据验证搬迁落点 ----------
let JSDOM, VirtualConsole, IDBFactory, IDBKeyRange;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log(`_test_sec_alias: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

async function boot(subj) {
  const raw = fs.readFileSync(path.join(ROOT, `pwa/data/notes/${subj}_notes.json`), 'utf8');
  const pageHtml = HTML_SRC
    .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
      try { return '<script>' + fs.readFileSync(path.join(ROOT, 'pwa', s), 'utf8') + '</script>'; } catch (e) { return ''; }
    }).replace(/<link\b[^>]*>/gi, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
  const dom = new JSDOM(pageHtml, {
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
  return dom;
}

const lineText = (d, sec, line) => {
  const s = [...d.querySelectorAll('.notes-section')].find(x => x.dataset.sec === sec);
  if (!s) return null;
  const el = s.querySelector(`.anno-line[data-line="${line}"]`);
  return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
};

(async () => {
  // ===== CO：两个旧节名，四条有效批注（空批注 line 18 不登记）=====
  console.log('▸ 动态①：co 旧节名批注回到新节');
  const dom1 = await boot('co');
  const w1 = dom1.window, d1 = w1.document;

  // 表里声明的落点必须真的存在，且语义对得上
  const CO_NEW = '5.4 控制器的功能和工作原理';
  const coCases = [
    [31, ['微程序'], '每条指令对应一个微程序'],
    [4, ['指令寄存器', '程序计数器'], '控制器主要部件'],
    [37, ['μPC', 'μIR'], 'μPC/μIR 位数含义']
  ];
  for (const [ln, kws, why] of coCases) {
    const t = lineText(d1, CO_NEW, ln);
    check(`落点 ${CO_NEW} L${ln} 存在（${why}）`, !!t);
    check(`落点 L${ln} 语义对得上`, !!t && kws.some(k => t.includes(k)), t ? t.slice(0, 48) : null);
  }
  const t15 = lineText(d1, '5.2 指令执行过程', 15);
  check('落点 5.2 指令执行过程 L15 存在', !!t15);
  check('落点 L15 是「取指」那条', !!t15 && t15.includes('取指'), t15 ? t15.slice(0, 40) : null);

  // 真实老批注（含一条空内容、未登记行号的 line 18）
  const oldKn = [
    { sec: '5.4 控制单元', line: 13, text: '每条机器指令由若干微指令组成的微程序来执行\n一条指令对应一个微程序', images: [] },
    { sec: '5.4 控制单元', line: 35, text: 'CPU控制器主要由三个部件组成：指令寄存器、程序计数器和操作控制器', images: [] },
    { sec: '5.4 控制单元', line: 18, text: '', images: [] },
    { sec: '5.4 控制单元', line: 14, text: 'uPC：位数代表可以存放多少条微指令，uIR：位数代表一条微指令的大小', images: [] },
    { sec: '5.3 指令执行过程', line: 2, text: '取指 译码 间址 取数 执行（指令译码器仅在取指阶段工作）', images: [] }
  ];
  await w1.api('/api/note/co_kn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify(oldKn), images: [] })
  });
  await w1.loadAnnos();
  await new Promise(r => setTimeout(r, 900));

  const blocks = [...d1.querySelectorAll('.line-anno-block')];
  check('5 条里渲染出 4 条（空批注丢弃）', blocks.length, 4);
  const secsSet = [...new Set(blocks.map(b => b.dataset.sec))].sort();
  check('渲染的批注都挂在新节名下', secsSet.length === 2 &&
    secsSet.includes(CO_NEW) && secsSet.includes('5.2 指令执行过程'), secsSet);
  const lines = blocks.filter(b => b.dataset.sec === CO_NEW).map(b => b.dataset.line).sort((a, b) => a - b);
  check('四个旧行号搬到 4 / 31 / 37', JSON.stringify(lines), JSON.stringify(['31', '37', '4']));

  const after1 = JSON.parse((await (await w1.api('/api/note/co_kn')).json()).note || '[]');
  check('落库已重写 sec（旧名不再出现）', after1.every(x => x.sec !== '5.4 控制单元' && x.sec !== '5.3 指令执行过程'),
    after1.map(x => x.sec));
  check('落库条数 = 4（空批注已剔除）', after1.length, 4);
  check('落库已回填新 anchor', after1.every(x => typeof x.anchor === 'string' && x.anchor.length >= 6),
    after1.map(x => (x.anchor || '').slice(0, 12)));

  // 二次加载：不该再触发搬迁，也不该重复
  await w1.loadAnnos();
  await new Promise(r => setTimeout(r, 600));
  const after2 = JSON.parse((await (await w1.api('/api/note/co_kn')).json()).note || '[]');
  check('二次加载幂等（条数不变）', after2.length, 4);
  dom1.window.close();

  // ===== OS：2.4 死锁 → 2.5 死锁 =====
  console.log('▸ 动态②：os 2.4 死锁 → 2.5 死锁');
  const dom2 = await boot('os');
  const w2 = dom2.window, d2 = w2.document;
  const tOs = lineText(d2, '2.5 死锁', 7);
  check('落点 2.5 死锁 L7 是死锁经典例子', !!tOs && tOs.includes('打印机'), tOs ? tOs.slice(0, 40) : null);

  await w2.api('/api/note/os_kn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([{ sec: '2.4 死锁', line: 7, text: '每人持有一个 请求另一个被持有的', images: [] }]), images: [] })
  });
  await w2.loadAnnos();
  await new Promise(r => setTimeout(r, 900));
  const bOs = d2.querySelector('.line-anno-block');
  check('批注已挂到 2.5 死锁', bOs && bOs.dataset.sec, '2.5 死锁');
  check('挂在第 7 行', bOs && bOs.dataset.line, '7');
  const afterOs = JSON.parse((await (await w2.api('/api/note/os_kn')).json()).note || '[]');
  check('os 落库 sec 已更新', afterOs[0] && afterOs[0].sec, '2.5 死锁');
  dom2.window.close();

  console.log(`\n_test_sec_alias: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
