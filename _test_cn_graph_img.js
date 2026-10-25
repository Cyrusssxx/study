// cn_graph.html 块级批注「嵌入图片」回归测试
//
// 缺陷背景：cn_graph 的块级批注只存 html，而 sanitizeNoteHtml 的白名单不含 IMG，
// 粘贴进编辑器的 <img> 会在保存时被剥掉；saveAnnos 还硬编码 images: []。
// 结果就是「批注里插图片永远失败」。
//
// 覆盖点：
//   1) 编辑器有图片区 .cg-anno-imgs
//   2) Ctrl+V 粘贴图片 → 缩略图出现（走 images 数组，不进 html）
//   3) 保存后批注卡渲染出 img.cg-anno-img
//   4) 入库 JSON 带 images 数组，且 html 里不含 <img>（两条通道分离）
//   5) 只有图片、没有文字的批注不被 loadAnnos 丢弃
//   6) 点图片打开 lightbox，且不触发「点卡片进编辑」
//   7) 删除图片按钮生效
//   8) 刷新页面（新 DOM、同一 IndexedDB）图片仍在
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_cn_graph_img.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, IDBFactory = null, IDBKeyRange = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }

if (!JSDOM || !IDBFactory) {
  console.log('跳过：需要 jsdom 与 fake-indexeddb（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const ROOT = __dirname;
const SRC = fs.readFileSync(path.resolve(ROOT, 'pwa/cn_graph.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(30);
  }
  return false;
}

// 外部脚本内联（jsdom 不走网络）
function inline(src) {
  return src.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
    const p = path.join(ROOT, 'pwa', s);
    if (!fs.existsSync(p)) return m;
    return '<script>' + fs.readFileSync(p, 'utf8') + '</script>';
  });
}

// 1x1 透明 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FAKE_DATA_URL = 'data:image/jpeg;base64,/9j/FAKEIMG';

function makeDom(html, idb) {
  const dom = new JSDOM(html, {
    url: 'http://localhost/cn_graph.html',
    runScripts: 'dangerously',
    beforeParse(w) {
      w.scrollTo = () => { };
      w.indexedDB = idb;
      w.IDBKeyRange = IDBKeyRange;
      // jsdom 不解码 blob URL 图片：用假 Image 让 onload 立刻触发，压缩逻辑仍真跑一遍
      w.Image = class FakeImage {
        constructor() { this.width = 200; this.height = 100; this._src = ''; }
        set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
      };
      w.URL.createObjectURL = () => 'blob:fake-image';
      w.URL.revokeObjectURL = () => { };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() { }, drawImage() { } });
      w.HTMLCanvasElement.prototype.toDataURL = () => FAKE_DATA_URL;
      w.alert = () => { };
    }
  });
  return dom;
}

// 伪造一次「粘贴图片」事件
function pasteImage(w, input) {
  const file = new w.File([Buffer.from(PNG_B64, 'base64')], 'shot.png', { type: 'image/png' });
  const item = { type: 'image/png', kind: 'file', getAsFile: () => file };
  const ev = new w.Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = { items: [item] };
  input.dispatchEvent(ev);
  return ev;
}

(async () => {
  const idb = new IDBFactory();
  const HTML = inline(SRC);

  console.log('--- 场景 1：打开块批注编辑器，图片区就位 ---');
  const dom = makeDom(HTML, idb);
  const w = dom.window, doc = w.document;
  await waitFor(() => typeof w.cgAnnoToggle === 'function' && doc.querySelectorAll('.cg-block').length > 0);
  await sleep(200);

  const blk = doc.querySelector('.cg-block');
  check('存在 cg-block', !!blk, true);
  check('cgAnnoToggle 可用', typeof w.cgAnnoToggle, 'function');
  check('cgCompressImage 可用', typeof w.cgCompressImage, 'function');
  check('viewCgImage 可用', typeof w.viewCgImage, 'function');

  w.cgAnnoToggle(blk);
  await sleep(50);
  const ed = blk.querySelector(':scope > .cg-anno-editor');
  check('编辑器已插入', !!ed, true);
  check('编辑器含图片区 .cg-anno-imgs', !!ed.querySelector('.cg-anno-imgs'), true);
  const input = ed.querySelector('.note-input');
  check('输入框 placeholder 提示可粘贴截图', /粘贴截图/.test(input.dataset.placeholder || ''), true);

  console.log('\n--- 场景 2：Ctrl+V 粘贴图片 ---');
  const ev = pasteImage(w, input);
  await sleep(120);
  check('粘贴图片被接管（preventDefault）', ev.defaultPrevented, true);
  check('图片区出现 1 张缩略图', ed.querySelectorAll('.cg-anno-imgs .note-img-item').length, 1);
  check('缩略图带删除按钮', ed.querySelectorAll('.cg-anno-imgs .note-img-del').length, 1);
  check('图片没被塞进 contenteditable 的 html', /<img/i.test(input.innerHTML), false);

  console.log('\n--- 场景 3：保存 → 批注卡渲染图片 ---');
  input.innerHTML = '易错点：<b>TCP 三次握手</b>';
  ed.querySelector('.note-actions .btn-primary').click();
  await sleep(600);
  const card = blk.querySelector(':scope > .cg-anno');
  check('批注卡已生成', !!card, true);
  check('批注卡保留文字', /三次握手/.test(card.textContent), true);
  check('批注卡渲染出图片', card.querySelectorAll('img.cg-anno-img').length, 1);
  check('图片 src 为压缩后的 data URL', (card.querySelector('img.cg-anno-img') || {}).src, FAKE_DATA_URL);

  console.log('\n--- 场景 4：入库 JSON 两条通道分离 ---');
  const readStore = async () => {
    const resp = await w.api('/api/note/' + encodeURIComponent('cn_graph_anno'));
    const d = await resp.json();
    return d.note ? JSON.parse(d.note) : [];
  };
  const items = await readStore();
  check('入库 1 条批注', items.length, 1);
  check('入库带 images 数组（长度 1）', (items[0].images || []).length, 1);
  check('入库 html 不含 <img>（图片走 images）', /<img/i.test(items[0].html || ''), false);
  check('入库 html 保留富文本', /<b>/.test(items[0].html || ''), true);

  console.log('\n--- 场景 5：点图放大 / 删除图片 ---');
  const imgEl = card.querySelector('img.cg-anno-img');
  imgEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(60);
  const lb = doc.querySelector('.img-lightbox');
  check('点图弹出 lightbox', !!lb, true);
  check('lightbox 内有同源图片', (lb && lb.querySelector('img') || {}).src, FAKE_DATA_URL);
  check('点图未触发进入编辑（无编辑器）', !!blk.querySelector(':scope > .cg-anno-editor'), false);
  if (lb) lb.remove();

  w.cgAnnoToggle(blk);
  await sleep(50);
  const ed2 = blk.querySelector(':scope > .cg-anno-editor');
  check('重新打开编辑器回填已有图片', ed2.querySelectorAll('.cg-anno-imgs .note-img-item').length, 1);
  ed2.querySelector('.cg-anno-imgs .note-img-del').click();
  await sleep(50);
  check('删除图片后缩略图消失', ed2.querySelectorAll('.cg-anno-imgs .note-img-item').length, 0);

  console.log('\n--- 场景 6：只有图片、没有文字的批注不被丢弃 ---');
  w.cgAnnoToggle(blk);   // 收起当前编辑器
  await sleep(30);
  const blk2 = doc.querySelectorAll('.cg-block')[1];
  w.cgAnnoToggle(blk2);
  await sleep(50);
  const ed3 = blk2.querySelector(':scope > .cg-anno-editor');
  pasteImage(w, ed3.querySelector('.note-input'));
  await sleep(120);
  ed3.querySelector('.note-actions .btn-primary').click();
  await sleep(600);
  const card2 = blk2.querySelector(':scope > .cg-anno');
  check('纯图片批注也生成批注卡', !!card2, true);
  check('纯图片批注卡有图', (card2 ? card2.querySelectorAll('img.cg-anno-img').length : 0), 1);
  const items2 = await readStore();
  const imgOnly = items2.find(x => x.block === blk2.dataset.bid);
  check('纯图片批注 html 为空、images 有值',
    [imgOnly ? (imgOnly.html || '').length : -1, (imgOnly && imgOnly.images || []).length], [0, 1]);

  console.log('\n--- 场景 7：刷新后图片仍在 ---');
  dom.window.close();
  const dom2 = makeDom(HTML, idb);
  const w2 = dom2.window, doc2 = w2.document;
  await waitFor(() => doc2.querySelectorAll('.cg-block').length > 0);
  await sleep(600);
  const restored = [...doc2.querySelectorAll('.cg-anno img.cg-anno-img')];
  check('刷新后批注图片恢复', restored.length, 2);
  check('恢复的图片 src 正确', restored.every(i => i.src === FAKE_DATA_URL), true);
  dom2.window.close();

  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
