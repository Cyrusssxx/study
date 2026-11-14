/* 2026-11-14 第十六批：OS 3.1.3 补「两级页表地址翻译」自绘图（2020 真题 46）。
 * 锁精确总量：fig-img 196（co46/os71/cn48/ds31）、黄框 310 未动。
 * 行号双基线 OS 静态 3660 / jsdom 3668，本批零漂移；before 备份存在时做双版本逐行文本比对。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}
const SUBS = ['co', 'os', 'cn', 'ds'];
const RAW = {}, DOC = {};
for (const s of SUBS) {
  RAW[s] = read('pwa/data/notes/' + s + '_notes.json');
  DOC[s] = JSON.parse(RAW[s]);
}
const sw = read('pwa/sw.js');
const NAME = 'os_fig_2level_addr';
const SVG = read('pwa/img/' + NAME + '.svg');
const BAK = 'archive/fig_p16_2026-11-14/os_notes.before.json';

function secHtml(sub, num) {
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || []))
      if (x.section.split(' ')[0] === num) return x.html || '';
  return '';
}

// ---------- 1. 精确总量 / 序列化 / SW ----------
const FIG_N = { co: 46, os: 71, cn: 48, ds: 31 };
const CALL_N = { co: 74, os: 77, cn: 53, ds: 106 };
for (const sub of SUBS) {
  check(sub + ' 配图 ' + FIG_N[sub] + ' 张（P16 精确总量）', (RAW[sub].match(/fig-img/g) || []).length, FIG_N[sub]);
  check(sub + ' 黄框 ' + CALL_N[sub] + ' 个（P16 未动）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img 196 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), 196);
check('全库黄框 310 个', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), 310);
check('os_notes.json 仍是 indent1 + LF + 尾换行',
  RAW.os === JSON.stringify(DOC.os, null, 1) + '\n', true);
check('新图进了 SW DATA_PRECACHE', sw.includes("'img/" + NAME + ".svg'"), true);

// ---------- 2. SVG 结构（自绘 / 无 HTML 标签 / 无 g 级 stroke） ----------
check('白底 + 680 宽 viewBox', /<rect x="0" y="0" width="680"/.test(SVG) && /viewBox="0 0 680 \d+"/.test(SVG), true);
check('无 HTML 标签 / 无 g 级 stroke 继承 / 收尾完整',
  ['<b>', '</b>', '<br', '<i>', '</i>', 'font-size="0"', '<g stroke'].every(t => !SVG.includes(t)) &&
  SVG.trim().startsWith('<svg') && SVG.trim().endsWith('</svg>'), true);
check('text 标签成对', (SVG.match(/<text\b/g) || []).length, (SVG.match(/<\/text>/g) || []).length);
check('没有元素画到 680 之外', [...SVG.matchAll(/\sx="(\d+)"/g)].every(m => +m[1] <= 640), true);
check('虚线连线 fill=none（不盖住说明文字）',
  [...SVG.matchAll(/<path d="M656[^"]+"[^>]*>/g)].every(m => m[0].includes('fill="none"')), true);

// ---------- 3. 图/正文同源 + 落位 ----------
const h = secHtml('os', '3.1.3');
check('3.1.3 正文含两级页表 10/10/12 结构',
  h.includes('页目录号10位') && h.includes('页内偏移12位'), true);
check('3.1.3 正文含 4KB/4B=1024 表项口径', h.includes('4KB/4B=1024'), true);
check('SVG 用同一套术语（页目录号 / 页内偏移 / 4KB / 4B）',
  ['页目录号', '页内偏移', '4KB', '4B'].every(k => SVG.includes(k)), true);
check('SVG 数字与真题一致（042H / 001H / 008H / 00301H / 00201108H）',
  ['042H', '001H', '008H', '00301H', '00201108H', '00301004H'].every(k => SVG.includes(k)), true);
check('图落在 3.1.3', h.includes('img/' + NAME + '.svg'), true);
check('图块带 data-fig="1"（不参与行号）',
  /<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/os_fig_2level_addr\.svg"/.test(h), true);
check('图在 ★ 高频真题考点之前',
  h.indexOf(NAME) < h.indexOf('★ 高频真题考点与陷阱'), true);
check('紧跟「下见例题④」那段之后',
  h.slice(h.indexOf('下见例题④'), h.indexOf(NAME)).includes('</p>'), true);
const i = h.indexOf('<p class="paragraph" data-fig="1"><b>图：2020 真题 46');
check('锚点前一标签是闭合标签（不落在 <p>/<li> 内部）',
  i > 0 && h[i] === '<' && h.slice(0, i).trimEnd().endsWith('</p>'), true);
check('3.1.3 里只有一张这张图', (h.match(new RegExp(NAME, 'g')) || []).length, 1);

// ---------- 4. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
if (fs.existsSync(path.join(ROOT, BAK))) {
  const before = JSON.parse(read(BAK));
  let changed = 0, bad = 0;
  const A = new Map();
  for (const ch of DOC.os.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) A.set(x.section.split(' ')[0], x.html || '');
  for (const ch of before.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) {
      const neu = A.get(x.section.split(' ')[0]) || '';
      if ((x.html || '') !== neu) { changed++; if (!subseq(x.html || '', neu)) bad++; }
    }
  check('OS before 备份参与了纯插入校验', changed, 1);
  check('本批变化是纯插入（0 删除 / 0 改写）', bad, 0);
} else {
  console.log('SKIP 纯插入守卫：缺 before 备份（归档不进 git）');
}

// ---------- 5. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p16: ' + pass + ' passed, ' + fail + ' failed');
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
      const out = {
        lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
        figs: d.querySelectorAll('img.fig-img').length,
        misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
        badFig: [...d.querySelectorAll('img.fig-img')]
          .filter(img => (img.getAttribute('src') || '').includes(NAME) && img.closest('li')).length,
        window: dom.window, document: d
      };
      const fig = [...d.querySelectorAll('img.fig-img')].find(img => (img.getAttribute('src') || '').includes(NAME));
      if (fig) {
        fig.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        const lb = d.querySelector('#figLightbox');
        out.lightbox = !!lb && lb.classList.contains('show');
      }
      return out;
    }
    const a = await render(RAW.os);
    check('真实渲染 .anno-line = 3668（OS 基线）', a.lines.length, 3668);
    check('真实渲染配图 71 张', a.figs, 71);
    check('图块被误标行号 = 0', a.misLabeled, 0);
    check('新图没落进 li', a.badFig, 0);
    check('新图可点击放大', a.lightbox, true);
    if (fs.existsSync(path.join(ROOT, BAK))) {
      const b = await render(read(BAK));
      check('双版本 .anno-line 数量一致', b.lines.length, a.lines.length);
      let first = -1;
      if (b.lines.length === a.lines.length)
        for (let k = 0; k < b.lines.length; k++) if (b.lines[k] !== a.lines[k]) { first = k; break; }
      check('双版本逐行文本完全一致（行级批注零错位）', first, -1);
      b.window.close();
    } else {
      console.log('SKIP 双版本逐行比对：缺 before 备份');
    }
    a.window.close();
    console.log('_test_fig_p16: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
