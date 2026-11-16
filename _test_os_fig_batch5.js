/**
 * _test_os_fig_batch5.js — 第五批 OS 配图回归（2026-11-16）
 *
 * 4 张新图：
 *   1) 2.2.4 进程切换 —— 内联 struct-fig「进程切换 vs 同进程内线程切换」三寄存器对比（用户指定）
 *   2) 3.2.6 页框回收 —— os_fig_page_reclaim.svg（页面缓冲算法双链表，2025 新增考点 + 2012-45）
 *   3) 4.3.4 文件系统挂载 —— os_fig_mount.svg（挂载前后对照，一挂多/一点一挂）
 *   4) 5.1.4 应用程序 I/O 接口 —— os_fig_io_iface.svg（字符/块/网络三类接口）
 *
 * 硬约束：真实小节落位、data-fig 不参与行号（OS 基线不变）、SW 预缓存三方一致、
 *        内联图走 CSS 变量（无写死背景色）、笔记 JSON 无 tspan。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RAW = read('pwa/data/notes/os_notes.json');
const DOC = JSON.parse(RAW);
const CSS = read('pwa/css/style.css');
const SW = read('pwa/sw.js');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(actual)); }
}
const subseq = (a, b) => { let i = 0; for (const c of b) if (c === a[i]) i++; return i === a.length; };

function secOf(num) {
  for (const ch of DOC.chapters)
    for (const s of ch.sections || [])
      for (const x of [s].concat(s.subsections || []))
        if ((x.section || '').split(' ')[0] === num) return x;
  return null;
}
const S224 = secOf('2.2.4'), S326 = secOf('3.2.6'), S434 = secOf('4.3.4'), S514 = secOf('5.1.4');
const H224 = (S224 && S224.html) || '', H326 = (S326 && S326.html) || '';
const H434 = (S434 && S434.html) || '', H514 = (S514 && S514.html) || '';

// ---------- 1. 四图落位在正确小节 ----------
check('2.2.4 存在内联进程切换对比图', H224.includes('<figure class="struct-fig ctxsw-fig" data-fig="1">'), true);
check('3.2.6 引用 os_fig_page_reclaim.svg', H326.includes('img/os_fig_page_reclaim.svg'), true);
check('4.3.4 引用 os_fig_mount.svg', H434.includes('img/os_fig_mount.svg'), true);
check('5.1.4 引用 os_fig_io_iface.svg', H514.includes('img/os_fig_io_iface.svg'), true);

// ---------- 2. 内联图内容：三寄存器 + 核心区别 ----------
for (const kw of ['程序计数器 PC', '栈基址寄存器 SP/FP', '页表基地址寄存器 CR3', '不需要更新', '刷 TLB'])
  check('对比图含关键词「' + kw + '」', H224.includes(kw), true);
check('对比图 CR3 行高亮（ct-keyrow）', H224.includes('ct-keyrow'), true);
check('对比图「不需要更新」绿徽章（ct-badgeno）', H224.includes('ct-badgeno'), true);
check('对比图带 data-fig（零行号）', /<figure class="struct-fig ctxsw-fig" data-fig="1">[\s\S]*?<\/figure>/.test(H224), true);

// ---------- 3. 外链图内容同源 ----------
check('页框图含「空闲页面链表」「修改页面链表」',
  ['空闲页面链表', '修改页面链表'].every(k => fs.readFileSync(path.join(ROOT, 'pwa/img/os_fig_page_reclaim.svg'), 'utf8').includes(k)), true);
check('挂载图含「一挂多」「一点一挂」',
  ['一挂多', '一点一挂'].every(k => fs.readFileSync(path.join(ROOT, 'pwa/img/os_fig_mount.svg'), 'utf8').includes(k)), true);
check('I/O 接口图含三类设备',
  ['字符设备接口', '块设备接口', '网络设备接口'].every(k => fs.readFileSync(path.join(ROOT, 'pwa/img/os_fig_io_iface.svg'), 'utf8').includes(k)), true);

// ---------- 4. 三张外链图落位在正文/易错之前 ----------
for (const [name, h, img] of [
  ['3.2.6 页框图', H326, 'os_fig_page_reclaim.svg'],
  ['4.3.4 挂载图', H434, 'os_fig_mount.svg'],
  ['5.1.4 I/O图', H514, 'os_fig_io_iface.svg'],
]) {
  const iFig = h.indexOf(img);
  const star = h.indexOf('★ 高频真题考点与陷阱');
  check(name + ' 在 ★ 之前', iFig >= 0 && (star < 0 || iFig < star), true);
  const idx = h.indexOf(img);
  const head = h.slice(Math.max(0, idx - 420), idx);
  check(name + ' 的图块是 data-fig 两段',
    head.includes('data-fig="1"><b>图：') && head.includes('data-fig="1"><img'), true);
}

// ---------- 5. SW 预缓存三方一致 ----------
for (const f of ['os_fig_page_reclaim.svg', 'os_fig_mount.svg', 'os_fig_io_iface.svg']) {
  check('SW 预缓存含 ' + f, SW.includes('img/' + f), true);
  check('SVG 文件存在 ' + f, fs.existsSync(path.join(ROOT, 'pwa/img', f)), true);
}

// ---------- 6. 内联图样式走 CSS 变量（亮暗自适应，无写死背景） ----------
check('ctxsw CSS 类存在', CSS.includes('.ctxsw-fig .struct-svg'), true);
check('ctxsw 标题走 var(--text)', /\.ctxsw-fig[^{]*text\.ct-title\s*\{\s*fill:\s*var\(--text\)/.test(CSS), true);
check('ctxsw 行框走 var(--card-bg)', /\.ctxsw-fig[^{]*rect\.ct-row\s*\{\s*fill:\s*var\(--card-bg\)/.test(CSS), true);
check('ctxsw 结论条走 var(--primary)', /\.ctxsw-fig[^{]*rect\.ct-concl\s*\{\s*fill:\s*var\(--primary\)/.test(CSS), true);
check('内联图源码无写死 #ffffff 背景', /<figure class="struct-fig ctxsw-fig"[\s\S]*?<\/figure>/.exec(H224)[0].includes('#ffffff'), false);
check('笔记 JSON 无 tspan', RAW.includes('tspan'), false);

// ---------- 7. 图集页能收集带附加类的内联 figure（boot/ctxsw 历史 bug 修复） ----------
const FIGS_HTML = read('pwa/figs.html');
check('图集正则兼容 struct-fig 后带附加类 + 其它属性',
  FIGS_HTML.includes('<figure class="struct-fig(?:\\s[^"]*)?"[^>]*>'), true);

// ---------- 7. 行号基线：仅新增 data-fig，不改正文 ----------
const BAK = 'archive/os_notes.before_3figs.json';
if (fs.existsSync(path.join(ROOT, BAK))) {
  const before = JSON.parse(read(BAK));
  const pick = (doc, num) => {
    for (const ch of doc.chapters) for (const s of ch.sections || [])
      for (const x of [s].concat(s.subsections || [])) if ((x.section || '').split(' ')[0] === num) return x;
    return null;
  };
  // 行号基线本质：非 data-fig 的 <p>/<li>/全角分号数不变（这些才进 anno-line）
  const cp = h => (h.match(/<p(?! class="paragraph" data-fig)/g) || []).length;
  const cl = h => (h.match(/<li>/g) || []).length;
  const cs = h => (h.match(/；/g) || []).length;
  for (const num of ['3.2.6', '4.3.4', '5.1.4']) {
    const bh = pick(before, num).html, nh = pick(DOC, num).html;
    check(num + ' 非fig <p> 数不变', cp(nh), cp(bh));
    check(num + ' <li> 数不变', cl(nh), cl(bh));
    check(num + ' 全角分号数不变（行号零漂移）', cs(nh), cs(bh));
  }
}

console.log('\n_test_os_fig_batch5: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
