/* ============================================================
 * 全局背景自定义（所有页面共用）
 * ------------------------------------------------------------
 * 自动注入：右下角 🎨 悬浮按钮 + 背景设置面板 + 遮罩层。
 * 页面只需引入本脚本，无需手写任何 HTML。
 *
 * 设置存 localStorage，键名与刷题页一致，全站共用一套：
 *   quiz_bg_type     'none' | 'preset' | 'image'
 *   quiz_bg_value    预设值（颜色/渐变）或图片 dataURL
 *   quiz_bg_overlay  遮罩强度 0~90
 *   quiz_ui_opacity  整体 UI 透明度 0~100（默认 100）
 * ============================================================ */
(function () {
    'use strict';

    var BG_TYPE = 'quiz_bg_type';
    var BG_VAL = 'quiz_bg_value';
    var BG_OV = 'quiz_bg_overlay';
    var BG_OP = 'quiz_ui_opacity';

    var PRESETS = [
        '#f0f2f5', '#e8f0fe', '#f3e8ff', '#e6f4ea', '#fff3e0', '#fde7e9',
        'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
        'linear-gradient(135deg,#d4fc79,#96e6a1)',
        'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
        'linear-gradient(135deg,#84fab0,#8fd3f4)',
        'linear-gradient(135deg,#f6d365,#fda085)',
        'linear-gradient(120deg,#fccb90,#d57eeb)'
    ];

    function $(id) { return document.getElementById(id); }
    function isDark() { return document.documentElement.classList.contains('dark'); }
    function getOverlay() { return parseInt(localStorage.getItem(BG_OV) || '0', 10); }

    /* ---------------- DOM 注入 ---------------- */
    function injectDom() {
        if ($('bgFab')) return;                       // 页面已有则跳过

        var html =
            '<div id="bgOverlay"></div>' +
            '<button class="bg-fab" id="bgFab" title="背景设置" onclick="toggleBgPanel()">🎨</button>' +
            '<div class="bg-panel" id="bgPanel">' +
            '    <h3>背景设置 <button class="bg-close" onclick="toggleBgPanel(false)" title="关闭">✕</button></h3>' +
            '    <div class="bg-sec">' +
            '        <div class="bg-sec-title">预设（纯色 / 渐变）</div>' +
            '        <div class="bg-swatches" id="bgSwatches"></div>' +
            '    </div>' +
            '    <div class="bg-sec">' +
            '        <div class="bg-sec-title">自定义图片</div>' +
            '        <label class="bg-upload-btn">上传图片' +
            '            <input type="file" id="bgFile" accept="image/png,image/jpeg,image/webp">' +
            '        </label>' +
            '        <div class="bg-hint">支持 jpg/png/webp；自动压缩缩放（最长边≤1920px），仅存于本机。</div>' +
            '    </div>' +
            '    <div class="bg-sec" id="bgOverlaySec">' +
            '        <div class="bg-sec-title">遮罩强度（自定义图片时生效）</div>' +
            '        <div class="bg-row">' +
            '            <input type="range" id="bgOverlayRange" min="0" max="90" value="35" oninput="onBgOverlayInput(this.value)">' +
            '            <span class="bg-val" id="bgOverlayVal">35%</span>' +
            '        </div>' +
            '    </div>' +
            '    <div class="bg-sec" id="bgOpacitySec">' +
            '        <div class="bg-sec-title">整体 UI 透明度（顶栏 / 卡片 / 侧栏 / 面板）</div>' +
            '        <div class="bg-hint">仅背景变透明，文字保持清晰；拉低即可透出壁纸。</div>' +
            '        <div class="bg-row">' +
            '            <input type="range" id="bgOpacityRange" min="0" max="100" value="100" oninput="onUiOpacityInput(this.value)">' +
            '            <span class="bg-val" id="bgOpacityVal">100%</span>' +
            '        </div>' +
            '    </div>' +
            '    <button class="bg-reset" onclick="resetQuizBg()">重置为默认背景</button>' +
            '</div>';

        var tpl = document.createElement('div');
        tpl.innerHTML = html;
        while (tpl.firstChild) document.body.appendChild(tpl.firstChild);

        // 与页面已有的右下角悬浮按钮（如目录定位 ☰）错开，避免重叠
        if (document.querySelector('.ol-nav-fab')) {
            $('bgFab').classList.add('bg-fab-shift');
        }
    }

    /* ---------------- 背景应用 ---------------- */
    function applyBg() {
        var type = localStorage.getItem(BG_TYPE) || 'none';
        var val = localStorage.getItem(BG_VAL) || '';
        var body = document.body;
        var overlayEl = $('bgOverlay');
        var ovSec = $('bgOverlaySec');
        if (!overlayEl) return;

        if (type === 'none' || !val) {
            body.style.backgroundImage = '';
            body.style.backgroundColor = '';
            body.style.backgroundSize = '';
            body.style.backgroundPosition = '';
            body.style.backgroundAttachment = '';
            body.style.backgroundRepeat = '';
            overlayEl.style.display = 'none';
            if (ovSec) ovSec.classList.add('bg-disabled');
            return;
        }
        if (type === 'image') {
            body.style.backgroundImage = 'url(' + val + ')';
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            body.style.backgroundAttachment = 'fixed';
            body.style.backgroundRepeat = 'no-repeat';
            var a = getOverlay() / 100;
            overlayEl.style.backgroundColor = isDark()
                ? 'rgba(0,0,0,' + a + ')'
                : 'rgba(255,255,255,' + a + ')';
            overlayEl.style.display = 'block';
            if (ovSec) ovSec.classList.remove('bg-disabled');
        } else {                                        // preset
            var isGrad = val.indexOf('gradient') >= 0;
            body.style.backgroundImage = isGrad ? val : '';
            body.style.backgroundColor = isGrad ? '' : val;
            body.style.backgroundSize = '';
            body.style.backgroundPosition = '';
            body.style.backgroundAttachment = '';
            body.style.backgroundRepeat = '';
            overlayEl.style.display = 'none';
            if (ovSec) ovSec.classList.add('bg-disabled');
        }
    }

    function setBg(type, val) {
        localStorage.setItem(BG_TYPE, type);
        localStorage.setItem(BG_VAL, val);
        applyBg();
        markActive();
    }

    function markActive() {
        var type = localStorage.getItem(BG_TYPE) || 'none';
        var val = localStorage.getItem(BG_VAL) || '';
        var list = document.querySelectorAll('.bg-swatch');
        for (var i = 0; i < list.length; i++) {
            list[i].classList.toggle('active', type === 'preset' && list[i].dataset.val === val);
        }
    }

    function buildSwatches() {
        var wrap = $('bgSwatches');
        if (!wrap) return;
        PRESETS.forEach(function (p) {
            var d = document.createElement('div');
            d.className = 'bg-swatch';
            d.dataset.val = p;
            d.style.background = p;
            d.title = p;
            d.onclick = function () { setBg('preset', p); };
            wrap.appendChild(d);
        });
    }

    function compressImage(file, maxEdge, quality) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    var w = img.width, h = img.height;
                    if (w > maxEdge || h > maxEdge) {
                        var s = Math.min(maxEdge / w, maxEdge / h);
                        w = Math.round(w * s); h = Math.round(h * s);
                    }
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    res(c.toDataURL('image/jpeg', quality));
                };
                img.onerror = rej;
                img.src = e.target.result;
            };
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }

    /* ---------------- 全局回调（供 onclick 使用） ---------------- */
    window.resetQuizBg = function () {
        localStorage.removeItem(BG_TYPE);
        localStorage.removeItem(BG_VAL);
        localStorage.removeItem(BG_OV);
        localStorage.removeItem(BG_OP);
        var ov = $('bgOverlayRange');
        if (ov) { ov.value = 35; $('bgOverlayVal').textContent = '35%'; }
        var op = $('bgOpacityRange');
        if (op) { op.value = 100; $('bgOpacityVal').textContent = '100%'; }
        document.documentElement.style.setProperty('--ui-alpha', 1);
        applyBg();
        markActive();
    };

    window.onBgOverlayInput = function (v) {
        localStorage.setItem(BG_OV, v);
        if ($('bgOverlayVal')) $('bgOverlayVal').textContent = v + '%';
        applyBg();
    };

    window.onUiOpacityInput = function (v) {
        v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
        localStorage.setItem(BG_OP, v);
        if ($('bgOpacityVal')) $('bgOpacityVal').textContent = v + '%';
        document.documentElement.style.setProperty('--ui-alpha', v / 100);
    };

    window.toggleBgPanel = function (force) {
        var p = $('bgPanel');
        if (!p) return;
        var open = force === undefined ? !p.classList.contains('open') : force;
        p.classList.toggle('open', open);
    };

    /* ---------------- 初始化 ---------------- */
    function init() {
        injectDom();

        buildSwatches();

        // 遮罩默认值（无记录时给 35%，避免图片过亮）
        var ov = getOverlay();
        if (!localStorage.getItem(BG_OV)) { ov = 35; localStorage.setItem(BG_OV, '35'); }
        if ($('bgOverlayRange')) {
            $('bgOverlayRange').value = ov;
            $('bgOverlayVal').textContent = ov + '%';
        }

        // 整体 UI 透明度（默认 100 = 不透明）
        var op = parseInt(localStorage.getItem(BG_OP) || '100', 10);
        var opEl = $('bgOpacityRange');
        if (opEl) {
            opEl.value = op;
            $('bgOpacityVal').textContent = op + '%';
        }
        document.documentElement.style.setProperty('--ui-alpha', op / 100);

        var fi = $('bgFile');
        if (fi) {
            fi.onchange = function () {
                var f = fi.files && fi.files[0];
                if (!f) return;
                if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
                    alert('仅支持 jpg / png / webp 图片'); fi.value = ''; return;
                }
                compressImage(f, 1920, 0.8).then(function (dataUrl) {
                    setBg('image', dataUrl);
                    fi.value = '';
                }).catch(function () {
                    alert('图片处理失败，请换一张试试'); fi.value = '';
                });
            };
        }

        applyBg();
        markActive();

        // 暗色模式切换时重算遮罩色
        new MutationObserver(function () { applyBg(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // 点击面板外关闭
        document.addEventListener('click', function (ev) {
            var p = $('bgPanel');
            if (!p || !p.classList.contains('open')) return;
            if (ev.target.closest('#bgPanel') || ev.target.closest('#bgFab')) return;
            p.classList.remove('open');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
