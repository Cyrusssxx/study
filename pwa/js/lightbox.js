/* ============================================================
 * 全局图片放大预览（lightbox）
 * ------------------------------------------------------------
 * 任意 <img> 加 onclick="openFigLightbox(this.src)" 即可。
 * 也支持整页委托（见文件末尾的可选自动绑定）。
 *
 * 交互：
 *   鼠标滚轮      以光标位置为中心缩放
 *   底部胶囊条    ➖ 缩小 / 百分比 / ➕ 放大 / 1:1 重置 / 📋 复制高清图 / ✕ 关闭
 *   拖拽          放大后可拖动查看
 *   双击图片      重置为 1:1
 *   键盘          Esc 关闭 / + - 缩放 / 0 重置
 *
 * ★ 缩放用「内联 width/height」而不是 transform: scale()：
 *   transform 缩放会把 <img> 提升为合成层，浏览器只在初始尺寸栅格化一次，
 *   之后由 GPU 拉伸纹理 —— 对 SVG 来说等于被当成位图放大，越放越糊
 *   （原先 img 上的 will-change: transform 更是把这个行为钉死）。
 *   改成真实布局尺寸后，每放大一档浏览器都按新的像素尺寸重新做矢量渲染，
 *   任意缩放都清晰；平移仍用 translate（单纯平移不触发重新栅格化）。
 * ============================================================ */
(function () {
    'use strict';

    var MIN_SCALE = 0.2, MAX_SCALE = 8;
    var INITIAL_SCALE = 1.4;            // 点开图片时默认放大到 140%（矢量图更清晰、细节更易读）
    var scale = INITIAL_SCALE, tx = 0, ty = 0;
    var baseW = 0, baseH = 0;          // scale = 1 时的基准显示尺寸（由 CSS 适配舞台后量得）
    var box = null, imgEl = null, zoomLabel = null;

    function build() {
        if (box) return box;
        box = document.createElement('div');
        box.id = 'figLightbox';
        box.className = 'fig-lightbox';
        box.innerHTML =
            '<div class="fig-lb-stage"><img alt="放大预览"></div>' +
            '<div class="fig-lb-bar">' +
            '    <button class="fig-lb-btn" data-act="out" title="缩小">➖</button>' +
            '    <span class="fig-lb-zoom" id="figLbZoom">100%</span>' +
            '    <button class="fig-lb-btn" data-act="in" title="放大">➕</button>' +
            '    <button class="fig-lb-btn" data-act="reset" title="重置为 1:1">1:1</button>' +
            '    <button class="fig-lb-btn" data-act="copy" title="复制高清图（3 倍，粘到笔记/Word 都清晰）">📋</button>' +
            '    <button class="fig-lb-btn fig-lb-close" data-act="close" title="关闭（Esc）">✕</button>' +
            '</div>';

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
            else if (act === 'copy') copyImage();
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

        // 窗口尺寸变了要重新量基准，否则倍率会停在旧比例上
        window.addEventListener('resize', function () {
            if (!box || !box.classList.contains('show') || !baseW) return;
            measureFitted();
            apply();
        });

        return box;
    }

    /** 按当前 scale 设置真实宽高；平移只走 translate */
    function apply() {
        if (!imgEl) return;
        if (baseW > 0) {
            imgEl.style.width = (baseW * scale) + 'px';
            imgEl.style.height = (baseH * scale) + 'px';
        }
        imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
        if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    /** 量一次「CSS 把图缩放进舞台后」的显示尺寸，作为 scale = 1 的基准 */
    function measureFitted() {
        if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
        imgEl.style.width = '';
        imgEl.style.height = '';
        imgEl.style.maxWidth = '';
        imgEl.style.maxHeight = '';
        var r = imgEl.getBoundingClientRect();
        var w = r.width, h = r.height;
        // 位图（22 张历史 PNG）100% 时不允许超过原始像素：宁可显示小一点，
        // 也不要默认就拉伸成糊图；要看大就手动放大（那时模糊是位图物理上限）。
        // SVG 是矢量，随便放大都清晰，保持铺满舞台。
        var _src = imgEl.currentSrc || imgEl.src || '';
        // data:image/svg+xml（讲义内联图放大时序列化出来的）也要按矢量处理，
        // 否则会被下面的位图封顶逻辑当作位图压到 naturalWidth，放大后发虚。
        var isVector = /\.svg(\?|#|$)/i.test(_src) || /^data:image\/svg/i.test(_src);
        if (!isVector && w > imgEl.naturalWidth) {
            var k = imgEl.naturalWidth / w;
            w = imgEl.naturalWidth;
            h = h * k;
        }
        if (w > 0 && h > 0) { baseW = w; baseH = h; }
        // 之后要按倍率真正撑大，必须解除 CSS 的 max-width/max-height，否则会被 94vw 卡住
        imgEl.style.maxWidth = 'none';
        imgEl.style.maxHeight = 'none';
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
        imgEl.onload = null;
        imgEl.src = '';
        imgEl.style.width = '';
        imgEl.style.height = '';
        imgEl.style.maxWidth = '';
        imgEl.style.maxHeight = '';
        imgEl.style.transform = '';
        scale = 1; tx = 0; ty = 0; baseW = 0; baseH = 0;
        document.body.style.overflow = '';
    }

    /* ---------- 复制高清图：按 3 倍矢量重绘成 PNG，粘到笔记/Word 不发虚 ---------- */
    function copyImage() {
        var src = imgEl && imgEl.src;
        if (!src) return;
        var probe = new Image();
        probe.onload = function () {            var nw = probe.naturalWidth || 1200;
            var nh = probe.naturalHeight || 900;
            var k = 3;
            while (nw * k > 6000 || nh * k > 6000) k = k / 2;   // 单边封顶 6000px，防爆内存
            var c = document.createElement('canvas');
            c.width = Math.round(nw * k);
            c.height = Math.round(nh * k);
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';           // 导出不透明白底，粘到深色模板上也不发黑
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(probe, 0, 0, c.width, c.height);
            c.toBlob(function (blob) {
                if (!blob) { toast('复制失败'); return; }
                if (navigator.clipboard && window.ClipboardItem) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        .then(function () { toast('已复制 ' + c.width + '×' + c.height); })
                        .catch(function () { downloadPng(blob); });
                } else {
                    downloadPng(blob);
                }
            }, 'image/png');
        };
        probe.onerror = function () { toast('复制失败'); };
        probe.src = src;
    }

    function downloadPng(blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'figure-' + Date.now() + '.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('已下载 PNG');
    }

    function toast(text) {
        if (!box) return;
        var t = document.createElement('div');
        t.className = 'fig-lb-toast';
        t.textContent = text;
        box.appendChild(t);
        setTimeout(function () { t.remove(); }, 1500);
    }

    window.openFigLightbox = function (src) {
        build();
        baseW = 0; baseH = 0; scale = INITIAL_SCALE; tx = 0; ty = 0;
        imgEl.style.width = '';
        imgEl.style.height = '';
        imgEl.style.maxWidth = '';
        imgEl.style.maxHeight = '';
        imgEl.style.transform = '';
        if (zoomLabel) zoomLabel.textContent = Math.round(INITIAL_SCALE * 100) + '%';
        box.classList.add('show');          // 先显示，舞台才有尺寸可量
        document.body.style.overflow = 'hidden';
        imgEl.onload = function () { measureFitted(); apply(); };
        imgEl.src = src;
        if (imgEl.complete && imgEl.naturalWidth) { measureFitted(); apply(); }
    };

    /* ---------- 讲义内联结构图（figure.struct-fig）点击放大 ----------
     * 内联 SVG 在讲义里靠 style.css 的 .struct-svg / .ct-* / .boot-* / .wave-*
     * 规则 + CSS 变量（--text/--primary 等，亮暗不同）着色。放大层是独立 <img>，
     * 拿不到页面 CSS，所以要把「当前计算后的变量值 + 相关规则」一起注入到 SVG 的
     * <style> 里再转 data URL —— 这样亮/暗两态颜色都和讲义里一致，且 SVG 是矢量，
     * 放大任意倍数都清晰（copyImage 也能导出高清 PNG）。
     */
    var INLINE_FIG_RULES = [
        /\.struct-svg/, /\.ct-/, /\.boot-/, /\.wave-/, /\.fig-img/
    ];
    function inlineFigureToSrc(fig) {
        var svg = fig && fig.querySelector && fig.querySelector('svg');
        if (!svg) return '';
        // 只取 <svg>…</svg>：外面 <figure> 是 HTML 标签，塞进 data URL 会让根元素非法 → 破图
        var sm = /<svg[\s\S]*?<\/svg>/.exec(svg.outerHTML || '');
        if (!sm) return '';
        var css = '';
        // 1) 固定亮色变量值：放大层图片底色是白的（CSS .fig-lb-stage img 有 background:#fff），
        //    若跟随 dark 主题注入浅色 --text / 深色 --card-bg，会出现「白底浅字」看不清。
        //    统一用讲义亮色配色，图片内部自洽，亮暗两态放大都清晰（与图集页缩略一致）。
        css += ':root{--text:#333333;--text-light:#666666;--primary:#4a90d9;' +
            '--primary-dark:#357abd;--card-bg:#ffffff;--bg:#f0f2f5;--border:#e0e0e0;}';
        // 2) 页面里命中内联图类的 CSS 规则（.struct-svg/.ct-*/.boot-*/.wave-*）
        //    从 styleSheets 读取，避免维护第二份样式导致亮暗/新增类不同步。
        try {
            for (var i = 0; i < document.styleSheets.length; i++) {
                var sheet = document.styleSheets[i], rules;
                try { rules = sheet.cssRules; } catch (e) { continue; }
                if (!rules) continue;
                for (var j = 0; j < rules.length; j++) {
                    var r = rules[j];
                    if (!r.selectorText) continue;
                    if (INLINE_FIG_RULES.some(function (re) { return re.test(r.selectorText); })) {
                        // 序列化后外层 <figure> 没了，带 .ctxsw-fig/.boot-fig/.wave-fig
                        // 祖先前缀的规则会全部失配（如 .ctxsw-fig .struct-svg rect.ct-th）。
                        // 把祖先前缀剥掉，只留 .struct-svg 起面的部分，让 svg 根（自带
                        // struct-svg 类）能匹配。cssText 里的 selector 部分同步改写。
                        var sel = r.selectorText
                            .replace(/(?:figure\.)?struct-fig(?:\.[a-z-]+)*\s+/g, '')
                            .replace(/\.(?:ctxsw|boot|wave)-fig\s+/g, '');
                        if (!sel || !/^\.struct-svg/.test(sel)) continue; // 剥空或非 svg 规则跳过
                        css += r.cssText.replace(r.selectorText, sel);
                    }
                }
            }
        } catch (e) { /* 跨域样式表读不到就只用变量 + 内联属性兜底 */ }
        // 3) 兜底基础样式（jsdom / 样式表跨域时仍可辨色）
        if (!/struct-svg/.test(css)) {
            css += ':root{--text:#333;--text-light:#666;--primary:#4a90d9;--border:#ddd;--card-bg:#fff}' +
                '.struct-svg text{fill:var(--text);text-anchor:middle}' +
                '.struct-svg rect{fill:var(--card-bg);stroke:var(--primary)}' +
                '.struct-svg line,.struct-svg path{stroke:var(--primary);fill:none}';
        }
        var withCss = sm[0].replace(/<svg[^>]*>/, function (m) { return m + '<style>' + css + '</style>'; });
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withCss);
    }

    /** 点讲义内联结构图放大；返回是否成功接手该点击 */
    window.openInlineFigLightbox = function (fig) {
        var src = inlineFigureToSrc(fig);
        if (!src) return false;
        window.openFigLightbox(src);
        return true;
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
