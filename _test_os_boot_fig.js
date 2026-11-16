/**
 * _test_os_boot_fig.js — OS 1.5「系统启动四段接力」内联配图回归（第十八批）
 *
 * 背景：2021 统考真题 46（8 分）问两件事——
 *   ① ROM 引导程序 / 磁盘引导程序 / 分区引导程序 / 操作系统初始化程序 的执行顺序
 *   ② 制作启动盘：物理格式化 → 分区 → 逻辑格式化 → 安装操作系统
 * 1.5 是节级小节（无子节）、此前零配图，故补一张「四段接力」内联图：
 *   - 内联 SVG（不是 img 外链）：文字随主题取 var(--*)，亮/暗自适应，缩放不栅格化
 *   - 必须无 tspan（全库测试断言笔记 JSON 无 tspan；SVG 里加粗用 font-weight）
 *   - data-fig="1" 整体不参与行号 → OS 静态 3405 / jsdom 3409（1.5 精简后基线）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SUBS = ['os', 'co', 'cn', 'ds'];
const RAW = {};
for (const s of SUBS) RAW[s] = read('pwa/data/notes/' + s + '_notes.json');
const DOC = { os: JSON.parse(RAW.os) };
const CSS = read('pwa/css/style.css');
const BAK = 'archive/os_boot_fig_2026-11-15/os_notes.before.json';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(actual)); }
}
const subseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; };

// ---------- 1. 定位 1.5 ----------
const sec15 = (() => {
  for (const c of DOC.os.chapters) for (const s of c.sections || []) if (s.section.startsWith('1.5 ')) return s;
  return null;
})();
check('1.5 操作系统引导仍在（节级、无子节）', !!sec15 && !(sec15.subsections || []).length, true);
const H = (sec15 && sec15.html) || '';

// ---------- 2. 图块存在且结构合法 ----------
check('1.5 有内联启动图块',
  H.includes('<figure class="struct-fig boot-fig" data-fig="1">'), true);
check('图块带 data-fig=1（不参与行号）',
  /<figure class="struct-fig boot-fig" data-fig="1">/.test(H), true);
check('图块整体在 <p>/<li> 之外（不破坏段落闭合）',
  H.indexOf('<figure class="struct-fig boot-fig"') > 0 &&
  H.slice(0, H.indexOf('<figure class="struct-fig boot-fig"')).trimEnd().endsWith('</p>'), true);
check('图块只有一张（无重复注入）', (H.match(/boot-fig/g) || []).length, 1);
check('图块内部无 HTML 块级标签（p/div/table）',
  /<figure class="struct-fig boot-fig"[\s\S]*?<\/figure>/.test(H) &&
  !/<(p|div|table|ul|li)\b/.test(H.slice(H.indexOf('boot-fig'), H.indexOf('</figure>', H.indexOf('boot-fig')))), true);

// ---------- 3. 顺序与正文同源 ----------
const fig = H.slice(H.indexOf('<figure class="struct-fig boot-fig"'), H.indexOf('</figure>', H.indexOf('boot-fig')) + 9);
const order = ['ROM 引导程序', '磁盘引导程序', '分区引导程序', '操作系统初始化'];
const pos = order.map(t => fig.indexOf(t));
check('四段名称在图中都出现', pos.every(i => i >= 0), true);
check('图中顺序 = ROM → 磁盘 → 分区 → 操作系统初始化', pos, [...pos].sort((a, b) => a - b));
check('四段位置标签 ①ROM ②硬盘 ③活动分区 ④内存',
  ['① ROM', '② 硬盘第 1 扇区', '③ 活动分区首扇区', '④ 内存'].every(t => fig.includes(t)), true);
check('图内明写「顺序必背」的完整链条',
  fig.includes('ROM 引导程序 → 磁盘引导程序 → 分区引导程序 → 操作系统初始化程序'), true);
check('图内给出与七步流程的映射（①=1~2 步、④=5~7 步）',
  fig.includes('① = 七步流程第 1~2 步') && fig.includes('④ = 第 5~7 步'), true);
check('正文七步流程里同一顺序存在（同源）',
  ['BIOS', 'MBR', 'PBR'].every(t => H.includes(t)), true);

// ---------- 4. 主题与规范 ----------
check('图内无 tspan（全库笔记 JSON 禁 tspan）', fig.includes('tspan'), false);
check('图内无 HTML 加粗 <b>（SVG 用 font-weight 类）', /<b>/.test(fig), false);
check('图内无硬编码白底/深色文字（全部走 class）',
  /fill="#|stroke="#|fill="#fff/i.test(fig), false);
check('图用了 struct-fig / struct-svg 既有容器类', fig.includes('struct-svg'), true);
check('新增样式全部挂在 .boot-fig 下并用主题变量',
  ['.boot-title', '.boot-loc', '.boot-sub', '.boot-key', '.boot-div'].every(c =>
    new RegExp('\\.boot-fig \\.struct-svg (?:text|line)\\' + c + '\\s*\\{').test(CSS)),
  true);
check('boot 系列样式里没有写死颜色',
  /\.boot-fig[\s\S]{0,700}#[0-9a-fA-F]{3,6}/.test(CSS), false);

// ---------- 5. 精确总量 ----------
const FIG_N = { co: 54, os: 76, cn: 50, ds: 37 };
for (const s of SUBS)
  check(s + ' 配图 ' + FIG_N[s] + ' 张（fig-img 未变）', (RAW[s].match(/fig-img/g) || []).length, FIG_N[s]);
const STRUCT = { co: 0, ds: 0, cn: 12, os: 16 };
for (const s of SUBS)
  check(s + ' 内联 struct-fig = ' + STRUCT[s] + ' 张', (RAW[s].match(/struct-fig/g) || []).length, STRUCT[s]);
for (const s of SUBS)
  check(s + ' 笔记 JSON 无 tspan', RAW[s].includes('tspan'), false);
check('os_notes.json 仍是 indent=1 + LF + 尾换行',
  [RAW.os.includes('\r\n'), RAW.os.endsWith('\n')], [false, true]);

// ---------- 6. 纯插入守卫（有 before 备份才跑） ----------
if (fs.existsSync(path.join(ROOT, BAK))) {
  const before = JSON.parse(read(BAK));
  const A = new Map();
  for (const ch of DOC.os.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) A.set(x.section.split(' ')[0], x.html || '');
  let changed = 0, bad = 0, changedKeys = [];
  for (const ch of before.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) {
      const neu = A.get(x.section.split(' ')[0]) || '';
      if ((x.html || '') !== neu) { changed++; changedKeys.push(x.section.split(' ')[0]); if (!subseq(x.html || '', neu) && x.section.split(' ')[0] !== '1.5' && x.section.split(' ')[0] !== '5.3.1' && x.section.split(' ')[0] !== '5.3.3') bad++; }
    }
  // before 备份早于「考点标注」批次（那次给 18 个块插了 zt-ref），所以不能要求变化集合恰好相等；
  // 真正的守卫是 bad（非纯插入的改写数）。
  check('三个已备案精简的小节都在变化列表里', ['1.5', '5.3.1', '5.3.3'].every(k => changedKeys.includes(k)), true);
  check('本批变化是纯插入（0 删除 / 0 改写）', bad, 0);
} else {
  console.log('SKIP 纯插入守卫：缺 before 备份（归档不进 git）');
}

// ---------- 7. jsdom 真实渲染 + 行号双基线 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_os_boot_fig: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    async function render(raw) {
      const pageHtml = read('pwa/notes.html')
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
          try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
        }).replace(/<link\b[^>]*>/gi, '');
      const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
      const dom = new JSDOM(pageHtml, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://x.test/notes.html?subject=os', virtualConsole: vc,
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
      return {
        lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
        // OS 1.5 已按「精简」重排（110 段 → 41 段，见 tools/slim_os15.py）：
        // 逐行比对与数量一致性都排除该节，其余小节仍要求零漂移。
        no15: [...d.querySelectorAll('.anno-line')].filter(e => {
            // 已按「精简」重排的节/小节：1.5（节级）、5.3.1（小节级）
            const h = e.closest('.notes-sub') || e.closest('.notes-section');
            return !(h && /^(1\.5 |5\.3\.1 |5\.3\.3 )/.test(h.dataset.sec));
        }).map(e => e.textContent.trim()),
        figs: d.querySelectorAll('img.fig-img').length,
        bootFigs: d.querySelectorAll('figure.boot-fig').length,
        misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
        inP: [...d.querySelectorAll('figure.boot-fig')].filter(f => f.closest('p,li')).length,
        window: dom.window
      };
    }
    const a = await render(RAW.os);
    check('真实渲染 .anno-line = 3409（OS 基线，图块未计入）', a.lines.length, 3409);
    check('真实渲染 fig-img 76 张（新增 3 张 OS 图）', a.figs, 76);
    check('真实渲染 boot-fig 1 张', a.bootFigs, 1);
    check('图块被误标行号 = 0', a.misLabeled, 0);
    check('图块没落进 p/li', a.inP, 0);
    if (fs.existsSync(path.join(ROOT, BAK))) {
      const b = await render(read(BAK));
      check('双版本 .anno-line 数量一致', b.no15.length, a.no15.length);
      let first = -1;
      if (b.no15.length === a.no15.length)
        for (let k = 0; k < b.no15.length; k++) if (b.no15[k] !== a.no15[k]) { first = k; break; }
      check('双版本逐行文本完全一致（已存行级批注零错位）', first, -1);
      b.window.close();
    } else {
      console.log('SKIP 双版本逐行比对：缺 before 备份');
    }
    a.window.close();
    console.log('_test_os_boot_fig: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
