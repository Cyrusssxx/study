// daka.html 划词高亮 + 卡片级批注回归测试（jsdom + 真实 backend.js/IndexedDB 全链路）
// 覆盖：卡片块锚点(data-blk=q.id) / 批注按钮位于折叠标题旁 / 笔记渲染到卡片顶部 .daka-notes /
//       批注编辑器保存与重载 / 高亮保存与重载重渲染 / cn_daka_* 双 key 路由
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;

// 把 <script src> 内联，加载真实实现的 common.js / background.js / lightbox.js / backend.js / note_richtext.js
function inline(html) {
  return html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    let code = '';
    try { code = fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
    return '<script>' + code + '</script>';
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
// 严格比较：check(名称, 实际值, 期望值)
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
// 元素相对顺序：a 是否在 b 之前
const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));

async function run() {
  const html = inline(fs.readFileSync(path.join(ROOT, 'pwa/daka.html'), 'utf8'));
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.log('JSDOM ERR:', e.message));
  vc.on('error', (...a) => console.log('CONSOLE ERR:', ...a));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/daka.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => {};
      w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data', f), 'utf8'));
      const cache = {};
      const load = f => (cache[f] = cache[f] || read(f));
      w.fetch = async (u) => {
        const s = String(u);
        if (s.includes('ds_daka.json')) return { ok: true, status: 200, json: async () => load('ds_daka.json') };
        if (s.includes('ds_code_extra.json')) return { ok: true, status: 200, json: async () => load('ds_code_extra.json') };
        if (s.includes('ds_code.json')) return { ok: true, status: 200, json: async () => load('ds_code.json') };
        return { ok: true, status: 200, json: async () => ({ questions: [], progress: {} }) };
      };
      w.URL.createObjectURL = () => 'blob:x';
      w.URL.revokeObjectURL = () => {};
      w.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,X';
      w.getSelection = () => ({ isCollapsed: true, rangeCount: 0, removeAllRanges() {}, toString: () => '' });
      w.NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
      // jsdom 的 TreeWalker 行为与浏览器有差异，这里给等价的极简实现（只收集文本节点）
      w.Document.prototype.createTreeWalker = function (root) {
        const nodes = [];
        (function collect(n) {
          if (n.nodeType === 3) nodes.push(n);
          n.childNodes && [...n.childNodes].forEach(collect);
        })(root);
        let i = -1;
        return {
          currentNode: null,
          nextNode() { i++; return i < nodes.length ? nodes[i] : null; },
          get _list() { return nodes; }
        };
      };
    }
  });
  const w = dom.window;
  const d = w.document;

  await sleep(700);
  console.log('--- 卡片块锚点与按钮位置 ---');
  const cards = [...d.querySelectorAll('.daka-card')];
  check('打卡卡片渲染数', cards.length, 62);
  const blks = [...d.querySelectorAll('[data-blk]')];
  check('每张卡片都有 data-blk', blks.length, 62);
  check('块 id = 题目 id（重渲染稳定）', blks.every(el => /^ds_daka_\d/.test(el.dataset.blk)), true);
  check('块 id 唯一', new Set(blks.map(b => b.dataset.blk)).size, 62);

  const notes = [...d.querySelectorAll('.daka-notes')];
  check('每张卡片都有笔记区 .daka-notes', notes.length, 62);
  check('笔记区位于「考点分析·易错点·讲义解法」折叠标题上方',
    cards.every(c => before(c.querySelector('.daka-notes'), c.querySelector('details.daka-answer'))), true);

  check('每张卡片都有「📝 批注」按钮', d.querySelectorAll('button.anno-toggle').length, 62);
  check('批注按钮位于折叠标题 summary 内', d.querySelectorAll('summary button.anno-toggle').length, 62);
  check('批注按钮不在卡片头部', d.querySelectorAll('.daka-card-header button.anno-toggle').length, 0);
  const realCard = d.getElementById('card-ds_daka_6_4_6_8');
  const sum = realCard && realCard.querySelector('summary');
  check('真题卡 summary 内批注按钮与解答原图按钮并排',
    !!(sum && sum.querySelector('button.anno-toggle') && sum.querySelector('button.ansfig-toggle')), true);

  console.log('\n--- 批注：打开编辑器 → 保存 → 渲染到卡片顶部 ---');
  const targetId = blks[0].dataset.blk;
  const card0 = d.getElementById('card-' + targetId);
  card0.querySelector('button.anno-toggle').click();
  await sleep(50);
  const editor = card0.querySelector('.line-anno-editor');
  check('点击批注按钮打开编辑器', !!editor, true);
  check('编辑器挂在卡片顶部笔记区内', !!(editor && editor.closest('.daka-notes')), true);
  check('编辑器含富文本输入区', !!(editor && editor.querySelector('.line-anno-input')), true);
  check('编辑器打开时标题仍在（面板未被牵动展开）', !!card0.querySelector('details.daka-answer summary'), true);
  if (editor) {
    editor.querySelector('.line-anno-input').innerHTML = '这是我的批注<b>重点</b>';
    editor.querySelector('.line-anno-save').click();
    await sleep(450);
    const block = card0.querySelector('.daka-notes .line-anno-block');
    check('保存后笔记渲染在卡片顶部', !!block, true);
    check('笔记内容保留（含加粗标记）', !!(block && block.innerHTML.includes('这是我的批注')), true);
    check('笔记区位于折叠标题上方', before(block, card0.querySelector('details.daka-answer')), true);
    check('笔记块带「改/删」操作', !!(block && block.querySelectorAll('.line-anno-op').length >= 2), true);
  }

  const api = w.api;
  const annoData = await (await api('/api/note/cn_daka_anno')).json();
  check('批注持久化到 cn_daka_anno', !!(annoData.note && annoData.note.includes(targetId)), true);

  console.log('\n--- 高亮：写入 → 重载 → 重渲染 ---');
  const hlText = blks[0].textContent.trim().slice(0, 6);
  check('首卡有文本可高亮（取 6 字符）', hlText.length, 6);
  await api('/api/note/cn_daka_hl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([{ blk: targetId, start: 0, end: 6, color: 'yellow', text: hlText }]), images: [] })
  });
  await w.loadDaka();          // 模拟刷新页面
  await sleep(700);
  const hl = d.querySelector('.note-hl');
  check('已存高亮重渲染（黄色）', !!(hl && /note-hl-yellow/.test(hl.className)), true);
  const annoAgain = d.querySelector('.daka-notes .line-anno-block');
  check('已存笔记重渲染', !!(annoAgain && annoAgain.textContent.includes('这是我的批注')), true);
  check('重载后锚点仍为题目 id', d.querySelector('[data-blk]').dataset.blk, targetId);

  console.log('\n--- 持久化 key 路由 ---');
  const hlData = await (await api('/api/note/cn_daka_hl')).json();
  check('cn_daka_hl 可读回合', !!(hlData.note && hlData.note.includes(targetId)), true);
  check('双 key 互不干扰', annoData.note !== hlData.note, true);

  dom.window.close();
  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
