/* ============================================================
 * 全局图片放大预览（lightbox）
 * ------------------------------------------------------------
 * 任意 <img> 加 onclick="openFigLightbox(this.src)" 即可。
 * 也支持整页委托（见文件末尾的可选自动绑定）。
 *
 * 交互：
 *   鼠标滚轮      以光标位置为中心缩放
 *   工具栏        ➖ 缩小 / 百分比 / ➕ 放大 / 1:1 重置 / ✕ 关闭
 *   拖拽          放大后可拖动查看
 *   双击图片      重置为 1:1
 *   键盘          Esc 关闭 / + - 缩放 / 0 重置
 * ============================================================ */
(function () {
    'use strict';

    var MIN_SCALE = 0.2, MAX_SCALE = 8;
    var scale = 1, tx = 0, ty = 0;
    var box = null, imgEl = null, zoomLabel = null;

    function build() {
        if (box) return box;
        box = document.createElement('div');
        box.id = 'figLightbox';
        box.className = 'fig-lightbox';
        box.innerHTML =
            '<div class="fig-lb-bar">' +
            '    <button class="fig-lb-btn" data-act="out" title="缩小">➖</button>' +
            '    <span class="fig-lb-zoom" id="figLbZoom">100%</span>' +
            '    <button class="fig-lb-btn" data-act="in" title="放大">➕</button>' +
            '    <button class="fig-lb-btn" data-act="reset" title="重置为 1:1">1:1</button>' +
            '    <button class="fig-lb-btn fig-lb-close" data-act="close" title="关闭（Esc）">✕</button>' +
            '</div>' +
            '<div class="fig-lb-stage"><img alt="放大预览"></div>' +
            '<div class="fig-lb-tip">滚轮缩放 · 拖动移动 · 双击复位 · Esc 关闭</div>';

        document.body.appendChild(box);
        imgEl = box.querySelector('img');
        zoomLabel = box.querySelector('.fig-lb-zoom');

        // 工具栏
        box.querySelector('.fig-lb-bar').addEventListener('click', function (e) {
            var btn = e.target.closest('.fig-lb-btn');
            if (!btn) return;
            var act = btn.dataset.act;
            if (act === 'in') zoomCenter(1.25);
            else if (act === 'out') zoomCenter(1 / 1.25);
            else if (act === 'reset') reset();
            else if (act === 'close') close();
        });

        // 滚轮缩放（以光标为中心）
        box.addEventListener('wheel', function (e) {
            if (!box.classList.contains('show')) return;
            e.preventDefault();
            var rect = box.getBoundingClientRect();
            var cx = e.clientX - rect.left - rect.width / 2;
            var cy = e.clientY - rect.top - rect.height / 2;
            zoomAt(cx, cy, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        }, { passive: false });

        // 拖拽平移
        var dragging = false, sx = 0, sy = 0;
        box.addEventListener('mousedown', function (e) {
            if (!box.classList.contains('show')) return;
            if (e.target.closest('.fig-lb-bar')) return;
            dragging = true; sx = e.clientX; sy = e.clientY;
            box.classList.add('dragging');
            e.preventDefault();
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            tx += e.clientX - sx; ty += e.clientY - sy;
            sx = e.clientX; sy = e.clientY;
            apply();
        });
        window.addEventListener('mouseup', function () {
            dragging = false;
            if (box) box.classList.remove('dragging');
        });

        // 双击重置
        imgEl.addEventListener('dblclick', reset);

        // 点击空白处关闭（不含图片与工具栏）
        box.addEventListener('click', function (e) {
            if (e.target === box || e.target.classList.contains('fig-lb-stage')) close();
        });

        return box;
    }

    function apply() {
        if (!imgEl) return;
        imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
        if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    /** 以相对视口中心的点 (cx,cy) 为锚点缩放 */
    function zoomAt(cx, cy, factor) {
        var next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
        var k = next / scale;
        tx = cx - k * (cx - tx);
        ty = cy - k * (cy - ty);
        scale = next;
        apply();
    }

    /** 以画面中心缩放（工具栏按钮 / 键盘） */
    function zoomCenter(factor) { zoomAt(0, 0, factor); }

    function reset() {
        scale = 1; tx = 0; ty = 0;
        apply();
    }

    function close() {
        if (!box) return;
        box.classList.remove('show');
        imgEl.src = '';
        reset();
        document.body.style.overflow = '';
    }

    window.openFigLightbox = function (src) {
        build();
        imgEl.src = src;
        reset();
        box.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    window.closeFigLightbox = close;

    // 键盘：Esc 关闭 / +- 缩放 / 0 重置
    document.addEventListener('keydown', function (e) {
        if (!box || !box.classList.contains('show')) return;
        if (e.key === 'Escape') close();
        else if (e.key === '+' || e.key === '=') zoomCenter(1.25);
        else if (e.key === '-' || e.key === '_') zoomCenter(1 / 1.25);
        else if (e.key === '0') reset();
    });
})();
