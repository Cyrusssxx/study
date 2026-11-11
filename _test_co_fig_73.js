/* 计组 7.3 I/O 方式：补图 + 重点标注的契约回归
 * 重点锁死「行号不漂移」：新增内容只允许 data-fig 图块 / table / div.key-callout。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

const notesRaw = read('pwa/data/notes/co_notes.json');
const notes = JSON.parse(notesRaw);
const sw = read('pwa/sw.js');
const svg = read('pwa/img/co_fig_io_modes.svg');
const page = read('pwa/notes.html');

function secHtml(prefix) {
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      if (s.section.indexOf(prefix) === 0) {
        return [s.html || '', (s.subsections || []).map(x => x.html || '').join('\n')];
      }
    }
  }
  return ['', ''];
}
function subHtml(prefix) {
  for (const c of notes.chapters) {
    for (const s of c.sections || []) {
      for (const x of s.subsections || []) {
        if (x.section.indexOf(prefix) === 0) return x.html || '';
      }
    }
  }
  return '';
}

const h731 = subHtml('7.3.1');
const h732 = subHtml('7.3.2');
const h733 = subHtml('7.3.3');
const all73 = h731 + h732 + h733;

check('计组笔记仍是 CRLF + 无尾换行（防 json.dump 污染）',
  [notesRaw.indexOf('\r\n') > 0, notesRaw.endsWith('\n')], [true, false]);
check('计组配图引用 5 张', (notesRaw.match(/fig-img/g) || []).length, 5);
check('7.3.3 引用新图 co_fig_io_modes.svg', h733.includes('img/co_fig_io_modes.svg'), true);
check('图题与图都带 data-fig="1"',
  (h733.match(/<p class="paragraph" data-fig="1">/g) || []).length, 2);

const iDiffEnd = h733.indexOf('⑥从数据传送看');
const iFig = h733.indexOf('co_fig_io_modes.svg');
const iQuiz = h733.indexOf('<h4>★ 高频真题考点与陷阱</h4>', iFig);
check('配图紧跟「DMA 与中断的区别」之后', iFig > iDiffEnd && iDiffEnd > 0, true);
check('配图在高真题考点列表之前', iQuiz > iFig, true);

check('7.3.1 有黄框', h731.includes('class="key-callout"'), true);
check('7.3.2 有黄框', h732.includes('class="key-callout"'), true);
check('7.3.3 有黄框', h733.includes('class="key-callout"'), true);
check('全计组黄框 4 个', (notesRaw.match(/class=\\"key-callout\\"/g) || []).length, 4);
check('加粗总量提升（>=800）', (notesRaw.match(/<b>/g) || []).length >= 800, true);

check('对比表存在且为 4 列', h733.includes('<table class="mc-table">'), true);
check('对比表 8 行', (h733.match(/<tr>/g) || []).length, 8);
check('对比表覆盖三个方式',
  ['程序查询', '程序中断', 'DMA'].every(k => h733.slice(h733.indexOf('<table')).includes(k)), true);

// 行号护栏：新增块（图题 → 黄框结束）不得含任何裸 <p> 或 <li>
const block = h733.slice(h733.indexOf('<p class="paragraph" data-fig="1">'), h733.indexOf('<h4>★ 高频真题考点与陷阱</h4>'));
const nakedP = (block.match(/<p\b[^>]*>/g) || []).filter(t => !t.includes('data-fig'));
check('新增块 0 个裸 <p>', nakedP.length, 0);
check('新增块 0 个 <li>', /<li\b/.test(block), false);
check('前端仍会跳过 data-fig 的行号标注',
  page.includes("el.hasAttribute('data-fig') || el.closest('[data-fig]')"), true);
check('表格不参与 anno-line（只进搜索索引）',
  page.includes("section.querySelectorAll('.notes-body th, .notes-body td')"), true);

// 行号漂移护栏：全库「不带 data-fig 的 <p> + 全部 <li>」= 可批注行数。
// 补图前的基线值是 1819，新增内容一个可批注行都不能带来（否则已存批注全部错位）。
let annoLines = 0;
for (const c of notes.chapters) {
  for (const s of c.sections || []) {
    for (const x of [s].concat(s.subsections || [])) {
      const h = x.html || '';
      const ps = h.match(/<p\b[^>]*>([\s\S]*?)<\/p>/g) || [];
      ps.forEach(t => { if (!/^<p\b[^>]*data-fig/.test(t)) annoLines++; });
      annoLines += (h.match(/<li\b[^>]*>/g) || []).length;
    }
  }
}
check('全库可批注行数锁死 1819（补图不产生新行号）', annoLines, 1819);
check('三节既有 <p>/<li> 序列未被改写（总数仍 > 100）',
  (all73.match(/<p\b|<li\b/g) || []).length > 100, true);

check('SVG 文件含 viewBox 与白底', svg.includes('viewBox="0 0 680 540"') && svg.includes('fill="#ffffff"'), true);
const svgNoNs = svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
check('SVG 无外链 / 无脚本',
  /<script|https?:\/\/|xlink:href|href="http|<image\b/.test(svgNoNs), false);
check('SVG 三种方式齐全',
  ['程序查询', '程序中断', 'DMA'].every(k => svg.includes(k)), true);
check('SVG 标注 CPU 介入粒度结论', svg.includes('CPU 介入粒度'), true);

for (const f of ['von_neumann', 'mem_hierarchy', 'cache_map', 'pipeline', 'io_modes']) {
  check('SW DATA_PRECACHE 收录 img/co_fig_' + f + '.svg', sw.includes("'img/co_fig_" + f + ".svg'"), true);
}
check('SW 里计组图恰好 5 条', (sw.match(/'img\/co_fig_[^']+'/g) || []).length, 5);
check('本地 SVG 文件齐全',
  ['von_neumann', 'mem_hierarchy', 'cache_map', 'pipeline', 'io_modes']
    .every(f => fs.existsSync(path.join(ROOT, 'pwa/img/co_fig_' + f + '.svg'))), true);

console.log('_test_co_fig_73: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
