// 格式刷（Format Painter）回归测试：验证捕获格式 → 回放到目标选区 → 取消武装。
// 直接加载 note_richtext.js 在 jsdom 里执行（不依赖具体页面，用最小 DOM 模拟 contenteditable）。
// 用法：NODE_PATH=<workspace>/node_modules node _test_note_painter.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, 'pwa/js/note_richtext.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://x.test/'
  });
  const w = dom.window;
  // note_richtext 只依赖 document/window；execCommand 在 jsdom 无实现，打桩记录调用
  const cmds = [];
  w.document.execCommand = (cmd, _a, val) => {
    cmds.push(cmd + (val ? ':' + val : ''));
    // bold/italic 返回 true 模拟成功；foreColor/hiliteColor 也 true
    return true;
  };
  w.eval(SRC);

  // 构建最小编辑器 DOM：<div contenteditable> 内含源段落与目标段落
  w.document.body.innerHTML = `
    <div class="note-panel">
      <div id="ed" contenteditable="true">
        <p><span style="color:#d93025"><b>源文字</b></span>普通文字</p>
        <p>目标文字 123</p>
      </div>
    </div>`;
  const ed = w.document.getElementById('ed');
  const sel = w.getSelection();
  const makeRange = (el) => {
    const r = w.document.createRange();
    const txt = el.firstChild && el.firstChild.firstChild ? el.firstChild.firstChild : el.firstChild;
    r.selectNodeContents(el);
    return r;
  };
  const sourceP = ed.querySelector('p:first-child');
  const targetP = ed.querySelector('p:last-child');
  let btnOn = false;
  const painterBtn = { classList: { add() { btnOn = true; }, remove() { btnOn = false; } } };

  // ---------- 1. 捕获源格式 ----------
  sel.removeAllRanges();
  sel.addRange(makeRange(sourceP));
  w.toggleFormatPainter(ed, painterBtn);
  check('捕获后按钮进入激活态', btnOn, true);

  // ---------- 2. 选中目标文字触发 selectionchange → 自动回放 ----------
  sel.removeAllRanges();
  const r2 = makeRange(targetP);
  sel.addRange(r2);
  w.document.dispatchEvent(new w.Event('selectionchange'));
  // applyFormatPainter 会先 cancel（按钮解除武装），再 execCommand 回放
  check('回放后按钮解除武装', btnOn, false);
  // style.color getter 会把 #d93025 规范化为 rgb(217, 48, 37)（Chrome 亦如此），断言匹配 rgb
  check('回放了 foreColor(红色)', cmds.some(c => c.startsWith('foreColor:') && c.includes('217, 48, 37')), true);
  check('回放了 bold', cmds.includes('bold'), true);

  // ---------- 3. 取消武装 ----------
  cmds.length = 0;
  sel.removeAllRanges();
  const r3 = w.document.createRange();
  r3.selectNodeContents(sourceP);
  sel.addRange(r3);
  w.toggleFormatPainter(ed, painterBtn);
  check('再次武装成功', btnOn, true);
  w.cancelFormatPainter();
  check('cancel 后解除', btnOn, false);
  sel.removeAllRanges();
  const r4 = w.document.createRange();
  r4.selectNodeContents(targetP);
  sel.addRange(r4);
  w.document.dispatchEvent(new w.Event('selectionchange'));
  check('取消后不再回放', cmds.length, 0);

  // ---------- 4. 无格式源选区不给武装 ----------
  const plainP = w.document.createElement('p');
  plainP.textContent = '无格式';
  ed.appendChild(plainP);
  sel.removeAllRanges();
  const r5 = w.document.createRange();
  r5.selectNodeContents(plainP);
  sel.addRange(r5);
  w.toggleFormatPainter(ed, painterBtn);
  check('无格式源不武装', btnOn, false);

  // ---------- 5. 高亮格式捕获与回放 ----------
  const hlSpan = w.document.createElement('span');
  hlSpan.className = 'hl hl-yellow';
  hlSpan.textContent = '高亮源';
  sourceP.appendChild(hlSpan);
  sel.removeAllRanges();
  const r6 = w.document.createRange();
  r6.selectNodeContents(hlSpan);
  sel.addRange(r6);
  w.toggleFormatPainter(ed, painterBtn);
  check('高亮源武装成功', btnOn, true);
  cmds.length = 0;
  sel.removeAllRanges();
  const r7 = w.document.createRange();
  r7.selectNodeContents(plainP);
  sel.addRange(r7);
  w.document.dispatchEvent(new w.Event('selectionchange'));
  check('回放了 hiliteColor(yellow)', cmds.some(c => c.startsWith('hiliteColor:#fff3a3')), true);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
