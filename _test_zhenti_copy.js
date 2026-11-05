// 真题套卷「一键复制」回归（2026-11-05）
//
// 需求：套卷模式的每道题都要能一键复制，选择题与大题（含 DS 打卡表版本）都要有。
//
// 约定：
//   · 做题模式（默认，白纸状态）只复制题干与选项——答案/解析里含答案，复制出去等于泄题；
//   · 非做题模式复制完整内容（题干 + 选项 + 答案 + 解析 / 参考答案与解析）；
//   · DS 算法大题在套卷里显示的是打卡表版本，复制要取它实际显示的内容（讲义解法 + 代码），
//     而不是 408os 原版解析；
//   · 题干里的插图（外置 SVG / img）折叠成【图】占位，不能把 SVG 内部文字标签当正文抄进来；
//   · 复制走「execCommand 同步 → clipboard API → 浮层手动复制」三级兜底。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zhenti_copy.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 一、源码结构 ---------------- */
console.log('--- 一、源码：三处卡片都挂复制按钮 ---');
const JS = fs.readFileSync(path.join(ROOT, 'pwa/js/zhenti.js'), 'utf8');
check('有 copyBtnHtml 生成按钮', /function copyBtnHtml\(f\)/.test(JS), true);
check('有 copyZtCard 执行复制', /function copyZtCard\(iid, btn\)/.test(JS), true);
check('有文本化 ztPlain（图片/SVG 折叠为【图】）',
  /function ztPlain\(html\)/.test(JS) && JS.includes('【图】'), true);
check('有打卡表大题的答案文本化 ztDakaAnswerText', /function ztDakaAnswerText\(f\)/.test(JS), true);
check('三处卡片（选择/大题/打卡表大题）都调用 copyBtnHtml(f)',
  (JS.match(/\$\{copyBtnHtml\(f\)\}/g) || []).length, 3);
check('copyZtCard 暴露到 window', /Object\.assign\(window, \{[\s\S]*copyZtCard/.test(JS), true);
check('三级兜底：execCommand → clipboard → 浮层',
  /document\.execCommand\('copy'\)/.test(JS) && /navigator\.clipboard\.writeText/.test(JS) && /ztCopyFallback/.test(JS), true);
check('做题模式复制不含答案（答题答案受 examMode 门控）',
  /if \(!state\.examMode\) \{[\s\S]{0,400}【答案】/.test(JS), true);
check('解法标题不重复（tag 已含「解法N」时不再补序号）',
  /x\.tag \|\| `解法\$\{i \+ 1\}`/.test(JS), true);

/* ---------------- 二、运行时 ---------------- */
console.log('\n--- 二、运行时（jsdom + 真实 2026 卷） ---');
const cache = {};
const readFile = f => {
  if (!cache[f]) cache[f] = fs.readFileSync(path.join(ROOT, 'pwa', f), 'utf8');
  return cache[f];
};
const html = fs.readFileSync(path.join(ROOT, 'pwa/zhenti.html'), 'utf8')
  .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    try { return '<script>' + readFile(s) + '</script>'; } catch (e) { return ''; }
  })
  .replace(/<link\b[^>]*>/gi, '');

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Could not load|not implemented/i.test(e.message)) console.log('JSDOM ERR:', e.message); });

let cap = '';          // execCommand 捕获到的复制文本
let forceFail = false; // 模拟 execCommand 失败（测兜底）
let dom;
dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/zhenti.html', virtualConsole: vc,
  beforeParse(w) {
    w.indexedDB = new IDBFactory();
    w.IDBKeyRange = IDBKeyRange;
    w.alert = () => {};
    w.confirm = () => true;
    w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
    w.Element.prototype.scrollIntoView = function () { };
    w.requestAnimationFrame = cb => setTimeout(cb, 0);
    w.document.execCommand = () => {
      const tas = [...w.document.querySelectorAll('textarea')];
      const ta = tas[tas.length - 1];
      cap = ta ? ta.value : '';
      tas.forEach(t => t.remove());
      return !forceFail;
    };
    w.fetch = async u => {
      const m = String(u).match(/data\/[\w./-]+\.(json|svg)/);
      if (m) {
        try {
          const t = readFile(m[0]);
          const isSvg = /\.svg$/.test(m[0]);
          return {
            ok: true, status: 200,
            text: async () => (isSvg ? t.replace(/\s*color-scheme:\s*[^;"']*/g, '') : t),
            json: async () => JSON.parse(t),
          };
        } catch (e) {
          return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
        }
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
  },
});

(async () => {
  const w = dom.window, d = w.document;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    if (d.querySelectorAll('#yearList .ol-nav-item').length) break;
  }
  await sleep(500);

  const allCards = () => [...d.querySelectorAll('.question-card')];
  const isBig = c => c.querySelector('.zt-subj-badge') && /大题/.test(c.querySelector('.zt-subj-badge').textContent);
  const pickChoice = () => allCards().find(c => !isBig(c));
  const pickBig = () => allCards().find(c => isBig(c) && !c.classList.contains('zt-daka-card'));
  const pickDaka = () => d.querySelector('.zt-daka-card');
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const copyOf = card => { click(card.querySelector('.zt-copy-btn')); return cap; };

  check('47 张卡片全部带复制按钮', d.querySelectorAll('.zt-copy-btn').length, 47);
  check('选择题卡片有复制按钮', !!pickChoice().querySelector('.zt-copy-btn'), true);
  check('普通大题卡片有复制按钮', !!pickBig().querySelector('.zt-copy-btn'), true);
  check('DS 打卡表大题卡片有复制按钮', !!pickDaka().querySelector('.zt-copy-btn'), true);
  check('复制按钮在工具栏内（与答案/笔记并排）',
    !!pickChoice().querySelector('.question-tools .zt-copy-btn'), true);

  console.log('\n--- 三、做题模式：只复制题干 + 选项，不含答案 ---');
  {
    const t = copyOf(pickChoice());
    check('含题号与科目抬头', /^第 \d+ 题 · /.test(t), true);
    check('含题干正文', /存储空间/.test(t), true);
    check('含四个选项（A./B./C./D.）',
      ['A. ', 'B. ', 'C. ', 'D. '].every(k => t.includes(k)), true);
    check('做题模式不含【答案】', t.includes('【答案】'), false);
    check('做题模式不含【解析】', t.includes('【解析】'), false);
  }

  console.log('\n--- 四、做题模式下的大题：只有题干 ---');
  {
    const t = copyOf(pickBig());
    check('大题抬头带分值', /大题 \d+ 分/.test(t), true);
    check('大题做题模式不含参考答案', t.includes('【参考答案与解析】'), false);
    check('大题题干非空（> 20 字）', t.length > 20, true);
  }
  {
    const t = copyOf(pickDaka());
    check('打卡表大题做题模式含题目正文', /二叉搜索树|算法|函数/.test(t), true);
    check('打卡表大题做题模式不含解法', /【解法/.test(t), false);
  }

  console.log('\n--- 五、非做题模式：复制完整内容 ---');
  w.toggleExamMode();
  await sleep(500);
  {
    const t = copyOf(pickChoice());
    check('选择题含【答案】且为字母', /【答案】[A-D]/.test(t), true);
    check('选择题含【解析】正文', /【解析】[\s\S]{10,}/.test(t), true);
  }
  {
    const t = copyOf(pickBig());
    check('普通大题含【参考答案与解析】', t.includes('【参考答案与解析】'), true);
    check('普通大题答案解析非空（> 100 字）', t.length > 100, true);
  }
  {
    const t = copyOf(pickDaka());
    check('打卡表大题含解法标题（不重复「解法1 · 解法1」）',
      /【解法1 · (?!解法1)/.test(t) || /【[^】]*·[^】]*】/.test(t), true);
    check('打卡表大题含代码块内容', /代码：\ntypedef|代码：\n[\s\S]{10,}/.test(t), true);
    check('打卡表大题不再出现重复的「解法1 · 解法1」', t.includes('解法1 · 解法1'), false);
  }

  console.log('\n--- 六、插图折叠为【图】占位 ---');
  {
    // 2026 卷 26/36/37/43/44/46/47 题干含外置 SVG；注入后 .zt-svgholder 会被替换成 <svg>，
    // 所以两种形态都要认。
    const withSvg = allCards().find(c => {
      const h = c.querySelector('.question-content').innerHTML;
      return /zt-svgholder/.test(h) || /<svg/i.test(h);
    });
    check('找到含 SVG 的题卡', !!withSvg, true);
    if (withSvg) {
      const t = copyOf(withSvg);
      check('SVG 折叠为【图】占位', t.includes('【图】'), true);
      check('不把 SVG 内部文字标签抄进正文（无 svg 标签残留）', /<svg|<text/i.test(t), false);
    }
  }

  console.log('\n--- 七、交互反馈与兜底 ---');
  {
    const card = pickChoice();
    const btn = card.querySelector('.zt-copy-btn');
    click(btn);
    check('复制成功后按钮文案变「已复制 ✓」', btn.textContent.trim(), '已复制 ✓');
    await sleep(1300);
    check('1.2 秒后恢复原文案「复制」', btn.textContent.trim(), '复制');
  }
  {
    forceFail = true;   // execCommand 返回 false 且无 clipboard → 走浮层
    const card = pickChoice();
    click(card.querySelector('.zt-copy-btn'));
    await sleep(50);
    const box = d.getElementById('ztCopyFallbackBox');
    check('同步复制失败时弹出可手动复制的浮层', !!box, true);
    check('浮层内 textarea 承载同一份文本（含抬头）',
      !!box && /^第 \d+ 题/.test(box.querySelector('textarea').value), true);
    if (box) { box.querySelector('button').click(); }
    check('点「关闭」后浮层移除', !!d.getElementById('ztCopyFallbackBox'), false);
    forceFail = false;
  }

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  w.close();
  process.exit(fail ? 1 : 0);
})();
