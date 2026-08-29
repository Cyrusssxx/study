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
    var BG_SCOPE = 'quiz_bg_scope';              // 应用范围：["*"] 或 文件名数组

    // 可选应用场景（与 pwa 下的页面一一对应）
    var PAGES = [
        { f: 'index.html', n: '首页' },
        { f: 'quiz.html', n: '刷题' },
        { f: 'notes.html', n: '笔记' },
        { f: 'code.html', n: '代码题' },
        { f: 'daka.html', n: '强化打卡' },
        { f: 'dati.html', n: '大题专项' },
        { f: 'wrong.html', n: '错题本' },
        { f: 'favorites.html', n: '收藏夹' },
        { f: 'stats.html', n: '统计' },
        { f: 'search.html', n: '搜题' },
        { f: 'exam.html', n: '模拟考试' },
        { f: 'map.html', n: '思维导图' }
    ];

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

    /* ---------------- 应用范围 ---------------- */
    function currentPage() {
        var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        return f === '' || f === 'study' ? 'index.html' : f;
    }
    function getScope() {
        try {
            var s = JSON.parse(localStorage.getItem(BG_SCOPE));
            return Array.isArray(s) ? s : ['*'];
        } catch (e) { return ['*']; }
    }
    function setScope(arr) {
        localStorage.setItem(BG_SCOPE, JSON.stringify(arr));
        renderScope();
        applyBg();
    }
    function inScope(page) {
        var s = getScope();
        return s.indexOf('*') >= 0 || s.indexOf(page) >= 0;
    }

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
            '    <div class="bg-sec" id="bgScopeSec">' +
            '        <div class="bg-sec-title">应用范围</div>' +
            '        <div class="bg-scope-btns">' +
            '            <button type="button" class="bg-scope-btn" onclick="setBgScopeAll()">全站</button>' +
            '            <button type="button" class="bg-scope-btn" onclick="setBgScopeOnly()">仅本页</button>' +
            '        </div>' +
            '        <div class="bg-scope-list" id="bgScopeList"></div>' +
            '        <div class="bg-hint" id="bgScopeHint"></div>' +
            '    </div>' +
            '    <button class="bg-reset" onclick="resetQuizBg()">重置为默认背景</button>' +
            '</div>';

        var tpl = document.createElement('div');
        tpl.innerHTML = html;
        while (tpl.firstChild) document.body.appendChild(tpl.firstChild);

        // 与页面自带的右下角悬浮按钮（笔记/讲义的「回到开头」、大题页目录 ☰ 等）撞位时自动上移
        shiftFab();
    }

    /* ---------------- 悬浮按钮避让 ----------------
     * 🎨 默认停靠右下角（right:20 / bottom:20）。各页面自己在右下角也常放悬浮按钮，
     * 二者会完全重叠，且页面按钮 z-index 更高会把 🎨 整个盖住。
     * 旧实现靠写死的选择器名单（.ol-nav-fab）+ 固定偏移，笔记页改版后彻底失效。
     * 这里改为实测：谁真的占着 🎨 的停靠位，就把 🎨 抬到它上方；没人占就回默认位。 */
    var FAB_RIGHT = 20, FAB_BOTTOM = 20, FAB_GAP = 12, FAB_ZONE = 240;
    // 候选名单：覆盖现有的右下角悬浮按钮，新增同类按钮时补到这里
    var FAB_SEL = '.notes-top-btn, .ol-nav-fab, .dati-nav-fab, ' +
        '[class*="nav-fab"], [class*="top-btn"], [id$="TopBtn"]';

    /** 右下角区域内、当前可见、且与 🎨 默认停靠位相交的 fixed 元素矩形 */
    function fabColliders() {
        var fab = $('bgFab');
        if (!fab) return [];
        var vw = window.innerWidth, vh = window.innerHeight;
        // 用 CSS 定义的默认停靠位算参考矩形，不读 fab 当前 bottom——
        // 否则抬过一次后再测就会拿“已抬高”的位置判断，误判为无碰撞
        var rest = {
            left: vw - FAB_RIGHT - fab.offsetWidth,
            right: vw - FAB_RIGHT,
            top: vh - FAB_BOTTOM - fab.offsetHeight,
            bottom: vh - FAB_BOTTOM
        };
        var nodes = document.querySelectorAll(FAB_SEL);
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el === fab || fab.contains(el)) continue;
            var cs = getComputedStyle(el);
            if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (r.right < vw - FAB_ZONE || r.bottom < vh - FAB_ZONE) continue;   // 不在右下角
            if (r.right > rest.left && r.left < rest.right &&
                r.bottom > rest.top && r.top < rest.bottom) {
                out.push(r);
            }
        }
        return out;
    }

    /** 有碰撞 → 🎨 抬到最上方那个按钮之上；无碰撞 → 回到默认停靠位 */
    function shiftFab() {
        var fab = $('bgFab');
        if (!fab) return;
        var col = fabColliders();
        if (!col.length) { fab.style.bottom = ''; return; }
        var top = 0;
        for (var i = 0; i < col.length; i++) top = Math.max(top, col[i].top);
        fab.style.bottom = (window.innerHeight - (top - FAB_GAP)) + 'px';
    }

    /** 面板跟随 🎨 实际位置，避免压住按钮 */
    function placePanel() {
        var p = $('bgPanel'), fab = $('bgFab');
        if (!p || !fab) return;
        var b = parseFloat(getComputedStyle(fab).bottom);
        p.style.bottom = (isNaN(b) ? FAB_BOTTOM : b) + fab.offsetHeight + FAB_GAP + 'px';
    }

    var shiftTimer = 0;
    function scheduleShift() {
        if (shiftTimer) return;
        shiftTimer = requestAnimationFrame(function () {
            shiftTimer = 0;
            shiftFab();
            placePanel();
        });
    }

    /* ---------------- 背景应用 ---------------- */
    /** 清除背景，恢复页面默认外观 */
    function clearBg() {
        var body = document.body;
        var overlayEl = $('bgOverlay');
        var ovSec = $('bgOverlaySec');
        body.style.backgroundImage = '';
        body.style.backgroundColor = '';
        body.style.backgroundSize = '';
        body.style.backgroundPosition = '';
        body.style.backgroundAttachment = '';
        body.style.backgroundRepeat = '';
        if (overlayEl) overlayEl.style.display = 'none';
        if (ovSec) ovSec.classList.add('bg-disabled');
    }

    function applyBg() {
        var overlayEl = $('bgOverlay');
        if (!overlayEl) return;

        // 当前页不在应用范围内 → 不应用背景（面板仍可用，可随时改回来）
        if (!inScope(currentPage())) { clearBg(); return; }

        var type = localStorage.getItem(BG_TYPE) || 'none';
        var val = localStorage.getItem(BG_VAL) || '';
        var body = document.body;
        var ovSec = $('bgOverlaySec');

        if (type === 'none' || !val) { clearBg(); return; }
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
        if (open) placePanel();
    };

    /* ---------------- 应用范围交互 ---------------- */
    function renderScope() {
        var list = $('bgScopeList');
        if (!list) return;
        var s = getScope();
        var all = s.indexOf('*') >= 0;
        var cur = currentPage();
        var html = '';
        PAGES.forEach(function (p) {
            var on = all || s.indexOf(p.f) >= 0;
            var isCur = p.f === cur;
            html += '<label class="bg-scope-item' + (isCur ? ' bg-scope-cur' : '') + '">' +
                '<input type="checkbox"' + (on ? ' checked' : '') +
                ' onchange="toggleBgScopePage(\'' + p.f + '\', this.checked)">' +
                '<span>' + p.n + (isCur ? '（本页）' : '') + '</span>' +
                '</label>';
        });
        list.innerHTML = html;

        var hint = $('bgScopeHint');
        if (hint) {
            hint.textContent = inScope(cur)
                ? (all ? '已应用到全站所有页面。' : '仅应用到勾选的页面。')
                : '⚠ 当前页未勾选，背景暂不显示（设置会保留）。';
        }
    }

    window.setBgScopeAll = function () { setScope(['*']); };
    window.setBgScopeOnly = function () { setScope([currentPage()]); };
    window.toggleBgScopePage = function (f, checked) {
        var s = getScope();
        // 从"全站"态展开为逐页全选，便于取消其中某一页
        if (s.indexOf('*') >= 0) {
            s = PAGES.map(function (p) { return p.f; });
        }
        if (checked) {
            if (s.indexOf(f) < 0) s.push(f);
        } else {
            s = s.filter(function (x) { return x !== f; });
        }
        setScope(s);
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

        renderScope();
        applyBg();
        markActive();

        // 暗色模式切换时重算遮罩色
        new MutationObserver(function () { applyBg(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // 🎨 避让：页面按钮多随滚动才显示（如「回到开头」滚过 400px 才出现），
        // 所以滚动/尺寸变化时要重新实测，而不是只在注入时判断一次
        if (document.querySelector(FAB_SEL)) {
            window.addEventListener('scroll', scheduleShift, { passive: true });
        }
        window.addEventListener('resize', scheduleShift);

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
