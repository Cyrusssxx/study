// 真题套卷「本卷备注」回归（2026-11-08）
//
// 需求：每份试卷（按年份）最上方有一个小按钮 → 点开悬浮窗富文本编辑 →
//       保存后备注直接显示在试卷最上方。
//
// 实现要点：
//   · 存储键 zhentiPaperNote_<年份>，值为富文本 HTML；/api/backup/export 用
//     collectLocalStorage() 收集全部本地键，因此天然随「导出数据」备份；
//   · 富文本复用 note_richtext.js（noteToolbarHtml / loadNoteIntoEditor /
//     serializeNote / sanitizeNoteHtml / bindNoteToolbar），与题目笔记同形态；
//   · 保存只局部换横幅与按钮文案，不重绘整卷（避免丢失已展开面板与滚动位置）；
//   · Esc / 点遮罩 / 取消 都是「不保存」；切年份先收起弹窗，避免写到新年份上。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_paper_note.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HTML = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const BACKEND = fs.readFileSync(path.join(ROOT, 'pwa/js/backend.js'), 'utf8');

console.log('--- 一、静态结构：小按钮 / 悬浮窗 / 横幅 ---');
check('弹窗模板存在（遮罩 + 卡片）',
  /id="ztPnMask"/.test(HTML) && /id="ztPnModal"/.test(HTML), true);
check('弹窗标题与说明文案', /📝 本卷备注/.test(HTML) && /失分点、时间分配/.test(HTML), true);
check('弹窗有富文本容器与输入区',
  /class="note-editor zt-pn-editor"/.test(HTML) && /id="ztPnInput"[^>]*contenteditable="true"/.test(HTML), true);
check('工具条槽位 + 取消/保存按钮',
  /id="ztPnToolbarSlot"/.test(HTML) && /onclick="closePaperNote\(\)">取消/.test(HTML) && /onclick="savePaperNote\(\)">保存/.test(HTML), true);
check('底部提示「跟着导出数据一起备份」', /跟着「⬇ 导出数据」一起备份/.test(HTML), true);
check('工具栏小按钮 id=ztPnBtn', /id="ztPnBtn" onclick="openPaperNote\(\)"/.test(JS), true);
check('横幅插在 .zt-toolbar 之前',
  /let html = `\$\{paperNoteBarHtml\(\)\}<div class="zt-toolbar">/.test(JS), true);
check('按年份的 localStorage 键', /function paperNoteKey\(y\) \{ return 'zhentiPaperNote_' \+ y; \}/.test(JS), true);
check('导出确实收集全部 localStorage', /local: collectLocalStorage\(\)/.test(BACKEND), true);
check('三个动作暴露到 window',
  /openPaperNote, closePaperNote, savePaperNote/.test(JS), true);
check('Esc 收起弹窗', /if \(e\.key !== 'Escape'\) return;[\s\S]{0,160}closePaperNote\(\)/.test(JS), true);
check('切年份先收起弹窗', /closePaperNote\(\);\s*\/\/ 弹窗开着切年份/.test(JS), true);
check('CSS 有横幅与弹窗样式',
  /\.zt-pn-bar\s*\{/.test(CSS) && /\.zt-pn-modal\s*\{/.test(CSS) && /\.zt-pn-mask\[hidden\], \.zt-pn-modal\[hidden\]/.test(CSS), true);

let JSDOM = null, VC = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM, VirtualConsole: VC } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('\n跳过运行时：需要 jsdom 与 fake-indexeddb');
  console.log(`\n结果: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  console.log('\n--- 二、运行时：编辑 → 保存 → 横幅显示 ---');
  const cache = {};
  const readFile = f => {
    if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
    return cache[f];
  };
  const html = HTML.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
  }).replace(/<link\b[^>]*>/gi, '');
  const vc = new VC(); vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/zhenti.html', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
      w.alert = () => { }; w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.Element.prototype.scrollIntoView = function () { };
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.scrollBy = () => { }; w.scrollTo = () => { };
      w.fetch = async u => {
        const m = String(u).match(/data\/[\w./-]+\.(json|svg)/);
        if (m) {
          try {
            const t = readFile(m[0]);
            const isSvg = /\.svg$/.test(m[0]);
            return { ok: true, status: 200,
              text: async () => (isSvg ? t.replace(/\s*color-scheme:\s*[^;"']*/g, '') : t),
              json: async () => JSON.parse(t) };
          } catch (e) { return { ok: false, status: 404, text: async () => '', json: async () => ({}) }; }
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
    }
  });
  const w = dom.window, d = w.document;
  for (let i = 0; i < 60; i++) { await sleep(100); if (d.querySelectorAll('#yearList .ol-nav-item').length) break; }
  await sleep(500);
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const modal = d.getElementById('ztPnModal');
  const mask = d.getElementById('ztPnMask');
  const ed = d.getElementById('ztPnInput');
  const btn = d.getElementById('ztPnBtn');

  check('初始无横幅', !!d.getElementById('ztPnBar'), false);
  check('初始按钮文案「📝 本卷备注」', btn.textContent.trim(), '📝 本卷备注');
  check('初始弹窗隐藏', modal.hidden && mask.hidden, true);

  click(btn);
  await sleep(60);
  check('点小按钮：弹窗与遮罩显示', !modal.hidden && !mask.hidden, true);
  check('工具条已注入且 id 不冲突', !!d.getElementById('ztPnToolbar') && !d.querySelector('#ztPnModal #noteToolbar'), true);
  check('弹窗标题带年份', /\d{4} 年真题/.test(d.getElementById('ztPnYear').textContent), true);

  // 取消：不写入、横幅不出现
  ed.innerHTML = '这卷选择题时间超了 12 分钟';
  click(d.querySelector('.zt-pn-btns .btn:not(.btn-primary)'));
  await sleep(40);
  check('取消：弹窗关闭', modal.hidden && mask.hidden, true);
  check('取消：不写 localStorage', w.localStorage.getItem('zhentiPaperNote_2026'), null);
  check('取消：无横幅', !!d.getElementById('ztPnBar'), false);

  // 保存：横幅出现在 #ztMain 第一个子元素
  click(btn);
  await sleep(40);
  check('再次打开：编辑器是空的（取消未污染）', ed.innerHTML, '');
  ed.innerHTML = '<b>大苏打撒旦</b>阿萨大时代啊as';
  click(d.querySelector('.zt-pn-btns .btn-primary'));
  await sleep(60);
  const bar = d.getElementById('ztPnBar');
  check('保存：弹窗关闭', modal.hidden && mask.hidden, true);
  check('保存：横幅出现在试卷最上方（#ztMain 首元素）',
    d.getElementById('ztMain').firstElementChild === bar, true);
  check('保存：横幅文本正确且保留富文本 <b>',
    /大苏打撒旦/.test(bar.querySelector('.zt-pn-bar-text').innerHTML) &&
    /<b>大苏打撒旦<\/b>/.test(bar.querySelector('.zt-pn-bar-text').innerHTML), true);
  check('保存：写入按年份的 localStorage',
    /大苏打撒旦/.test(w.localStorage.getItem('zhentiPaperNote_2026') || ''), true);
  check('保存：按钮文案变「📝 编辑备注」', btn.textContent.trim(), '📝 编辑备注');
  check('保存：47 张题卡未被重绘', d.querySelectorAll('.question-card').length, 47);

  // 编辑回填
  click(d.getElementById('ztPnBar'));
  await sleep(60);
  check('点横幅可再次编辑', !modal.hidden, true);
  check('编辑器回填已保存的富文本', /<b>大苏打撒旦<\/b>/.test(ed.innerHTML), true);

  // Esc 收起，不改内容
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(40);
  check('Esc 收起且不改动存储', modal.hidden && /大苏打撒旦/.test(w.localStorage.getItem('zhentiPaperNote_2026')), true);

  // XSS 消毒：显示前走 sanitizeNoteHtml
  click(btn);
  await sleep(40);
  ed.innerHTML = '安全文字<script>alert(1)</script><b>加粗</b>';
  click(d.querySelector('.zt-pn-btns .btn-primary'));
  await sleep(60);
  check('恶意 <script> 被消毒',
    !/<script/i.test(d.getElementById('ztPnBar').querySelector('.zt-pn-bar-text').innerHTML), true);
  check('白名单 <b> 仍保留',
    /<b>加粗<\/b>/.test(d.getElementById('ztPnBar').querySelector('.zt-pn-bar-text').innerHTML), true);

  // 清空 → 横幅与存储键一起消失
  click(btn);
  await sleep(40);
  ed.innerHTML = '';
  click(d.querySelector('.zt-pn-btns .btn-primary'));
  await sleep(60);
  check('清空保存：横幅消失', !!d.getElementById('ztPnBar'), false);
  check('清空保存：localStorage 键删除', w.localStorage.getItem('zhentiPaperNote_2026'), null);
  check('清空保存：按钮恢复「📝 本卷备注」', btn.textContent.trim(), '📝 本卷备注');

  // 年份隔离
  click(btn);
  await sleep(40);
  ed.innerHTML = '2026 年专用备注';
  click(d.querySelector('.zt-pn-btns .btn-primary'));
  await sleep(60);
  w.switchYear(2025);
  await sleep(600);
  check('切年份：备注不串到别的卷', !!d.getElementById('ztPnBar'), false);
  check('切年份：2025 按钮仍是「本卷备注」', d.getElementById('ztPnBtn').textContent.trim(), '📝 本卷备注');
  check('切年份：2026 的存储仍在', /2026 年专用备注/.test(w.localStorage.getItem('zhentiPaperNote_2026') || ''), true);
  w.switchYear(2026);
  await sleep(600);
  check('切回 2026：横幅恢复', /2026 年专用备注/.test((d.getElementById('ztPnBar') || {}).textContent || ''), true);
  check('切年份会收起弹窗', modal.hidden, true);

  w.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
