// algo.html 划词高亮 + 行级批注回归测试（jsdom 加载真实页面与脚本）
// 覆盖：块锚点分配 / 高亮保存与重载重渲染 / 批注保存与渲染 / key 路由合法性
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const ROOT = __dirname;

// 把 <script src> 内联，加载真实实现的 backend.js / note_richtext.js / common.js / background.js / lightbox.js
function inline(html) {
  return html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
    const p = path.join(ROOT, 'pwa', src);
    let code = '';
    try { code = fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
    return '<script>' + code + '</script>';
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}

async function run() {
  const html = inline(fs.readFileSync(path.join(ROOT, 'pwa/algo.html'), 'utf8'));
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.log('JSDOM ERR:', e.message));
  vc.on('error', (...a) => console.log('CONSOLE ERR:', ...a));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/algo.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory();
      w.IDBKeyRange = IDBKeyRange;
      w.alert = () => {};
      w.confirm = () => true;
      w.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };
      w.fetch = async (u) => {
        const s = String(u);
        if (s.includes('data/algo_notes.json')) {
          return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/algo_notes.json'), 'utf8')) };
        }
        return { ok: true, status: 200, json: async () => ({ questions: [], chapters: [] }) };
      };
      w.URL.createObjectURL = () => 'blob:x';
      w.URL.revokeObjectURL = () => {};
      w.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,X';
      w.getSelection = () => ({ isCollapsed: true, rangeCount: 0, removeAllRanges() {}, toString: () => '' });
      w.NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
      w.Document.prototype.createTreeWalker = function (root, what, filter) {
        // 极简 walker：只遍历 root 下直接文本节点（jsdom 无 TreeWalker，测逻辑用序列化路径替代）
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

  // 等加载完成（loadAlgo 异步）
  await sleep(600);
  const body = w.document.getElementById('algoBody');
  check('讲义加载完成', (body.innerHTML || '').length > 2000, String((body.innerHTML || '').length));

  // 等 initAlgoAnno 完成块分配
  await sleep(300);
  const blks = [...w.document.querySelectorAll('[data-blk]')];
  check('块锚点已分配', blks.length > 20, String(blks.length));
  check('块 id 格式正确', blks.every(el => /^algo-blk-\d+$/.test(el.dataset.blk)), 'algo-blk-N');
  const uniq = new Set(blks.map(b => b.dataset.blk));
  check('块 id 唯一', uniq.size === blks.length, `${uniq.size}/${blks.length}`);

  // 通过 api 直接写一条高亮/批注（模拟用户操作后的持久化数据），再重新加载验证渲染
  const api = w.api;
  // 取第一个块的真实文本前 6 字符作为高亮 text（真实浏览器为 range.toString()）
  const firstBlkEl = w.document.querySelector('[data-blk]');
  const blkTxt = firstBlkEl ? firstBlkEl.textContent.trim() : '';
  const hlText = blkTxt.slice(0, 6);
  check('首块有文本可高亮', hlText.length === 6, JSON.stringify(hlText));
  await api('/api/note/cn_algo_hl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([{ blk: blks[0].dataset.blk, start: 0, end: 6, color: 'yellow', text: hlText }]), images: [] })
  });
  await api('/api/note/cn_algo_anno', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify([{ blk: blks[0].dataset.blk, text: '这里是批注<b>加粗</b>', images: [] }]), images: [] })
  });

  // 重新执行加载流程验证持久化数据能渲染：清 DOM 后重跑 loadAlgo + initAlgoAnno（重建块锚点）
  if (typeof w.loadAlgo === 'function') {
    body.innerHTML = '<div class="loading">加载中...</div>';
    await w.loadAlgo();
    if (typeof w.initAlgoAnno === 'function') w.initAlgoAnno();
    await sleep(500);
    const hl = w.document.querySelector('.note-hl');
    check('已存高亮重渲染（黄色）', !!hl && /note-hl-yellow/.test(hl.className), hl ? hl.className : 'null');
    const anno = w.document.querySelector('.line-anno-block');
    check('已存批注重渲染', !!anno && /这里是批注/.test(anno.textContent), anno ? anno.textContent.slice(0, 30) : 'null');
  }

  // key 路由合法性：note 接口能 GET 回这两个合成 key
  const hlResp = await api('/api/note/cn_algo_hl');
  const hlData = await hlResp.json();
  check('cn_algo_hl 可读回合', hlData.note.includes('algo-blk-'), String(hlData.note ? hlData.note.length : 0));

  dom.window.close();
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });