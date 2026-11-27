/* ============================================================
 * _test_lightbox_click_close.js
 * 锁住「单击图片关闭放大预览」行为，并保证与既有交互共存：
 *   1. 单击图片 → 240ms 后关闭
 *   2. 双击图片 → 取消关闭，改为 1:1 重置（仍在 show）
 *   3. 拖拽平移后尾随的 click 不触发关闭
 *   4. 点空白处 / ✕ 按钮 / Esc 仍可关闭
 *   5. 图集切图会清掉待执行的关闭定时器（切完不误关）
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const src = fs.readFileSync(path.join(ROOT, 'pwa/js/lightbox.js'), 'utf8');

let pass = 0, fail = 0;
function ck(name, ok) {
    if (ok) { pass++; }
    else { fail++; console.log('FAIL ' + name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeDom() {
    const dom = new JSDOM('<!doctype html><html><body><img class="fig-img" src="a.png"></body></html>',
        { url: 'https://x/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(src);
    return w;
}

(async () => {
    // 1. 单击关闭
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        ck('打开后处于 show', box.classList.contains('show'));
        const img = box.querySelector('.fig-lb-stage img');
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        ck('单击后 240ms 内仍打开', box.classList.contains('show'));
        await sleep(320);
        ck('单击 240ms 后关闭', !box.classList.contains('show'));
    }

    // 2. 双击取消关闭 + 重置
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        const img = box.querySelector('.fig-lb-stage img');
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        img.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
        await sleep(320);
        ck('双击后未被关闭', box.classList.contains('show'));
        ck('双击重置到 100%', box.querySelector('#figLbZoom').textContent === '100%');
    }

    // 3. 拖拽后尾随 click 不关闭
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        const img = box.querySelector('.fig-lb-stage img');
        box.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        w.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 130 }));
        w.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await sleep(320);
        ck('拖拽后尾随 click 不关闭', box.classList.contains('show'));
        // 拖拽抑制是一次性的：下一次纯单击仍能关
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await sleep(320);
        ck('拖拽后再次纯单击能关闭', !box.classList.contains('show'));
    }

    // 4. 空白 / ✕ / Esc 关闭仍有效
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        box.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        ck('点空白处仍关闭', !box.classList.contains('show'));
    }
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        box.querySelector('[data-act="close"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        ck('✕ 按钮仍关闭', !box.classList.contains('show'));
    }
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        ck('Esc 仍关闭', !box.classList.contains('show'));
    }

    // 5. 单击判定窗口内切图 → 旧定时器被清，不误关
    {
        const w = makeDom();
        w.openFigLightbox('a.png');
        const box = w.document.getElementById('figLightbox');
        const img = box.querySelector('.fig-lb-stage img');
        img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        // 模拟图集切图（直接调 openSrc 走公开入口：再开一张）
        w.openFigLightbox('b.png');
        await sleep(320);
        ck('切图后不被旧定时器误关', box.classList.contains('show'));
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
