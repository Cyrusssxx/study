/* ==================== 富文本笔记工具（全站共享：quiz 刷题笔记 / notes 考点笔记批注 / map 导图批注） ====================
 * 定位：白名单 sanitize + 工具栏绑定（加粗/斜体/标题/高亮/字体染色/清除格式）+ 装载/序列化。
 * 由 quiz.html 内联实现抽取而来，三页共用同一套实现，保证"刷题笔记 ↔ 批注"富文本能力一致。
 * 任何页面引入后即可使用 window 上的这些函数。
 * 依赖：无（运行期只用 document/window）。页面自身负责提供工具栏容器与 contenteditable 输入区。
 */
(function () {
    // 旧格式是纯文本（不带 HTML 标签），新格式可能含 <strong><em><h1><h2><span class="hl-*"> 等
    // 装载时通过白名单 sanitizer 防御性过滤，避免渲染任意 HTML（XSS）
    const NOTE_ALLOWED_TAGS = new Set(['B', 'I', 'U', 'STRONG', 'EM', 'H1', 'H2', 'H3', 'P', 'BR', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
    const NOTE_ALLOWED_CLASS_RE = /^(hl-|note-hl-)?(yellow|green|blue|pink)$/;
    // class 属性白名单:允许 "hl"、"hl-yellow/note-hl-yellow" 等 token(applyNoteHighlight 手动后备产生 class="hl hl-yellow" 双 token)
    function classAllowed(v) {
        if (!v) return false;
        return v.split(/\s+/).every(tok => tok === 'hl' || NOTE_ALLOWED_CLASS_RE.test(tok));
    }

    window.sanitizeNoteHtml = function (html) {
        if (!html) return '';
        // 极速判定：不含 '<' 即安全纯文本，原样返回（无标签无法构造 HTML/XSS）
        if (html.indexOf('<') < 0) return html;
        const t = document.createElement('template');
        t.innerHTML = html;
        (function walk(node) {
            const children = [...node.childNodes];
            for (const c of children) {
                if (c.nodeType === 1) {
                    if (!NOTE_ALLOWED_TAGS.has(c.tagName)) {
                        // 非法标签：把子节点提到父节点，再移除自己
                        while (c.firstChild) node.insertBefore(c.firstChild, c);
                        node.removeChild(c);
                    } else {
                        // 清掉危险属性，只保留 style.color/style.backgroundColor
                        for (const a of [...c.attributes]) {
                            if (a.name === 'style') {
                                const ok = a.value.split(';').map(s => s.trim()).filter(s => {
                                    const m = s.match(/^([a-z-]+):/);
                                    return m && (m[1] === 'color' || m[1] === 'background-color' || m[1] === 'background');
                                });
                                if (ok.length) c.setAttribute('style', ok.join('; '));
                                else c.removeAttribute('style');
                            } else if (a.name === 'class') {
                                if (!classAllowed(a.value)) c.removeAttribute('class');
                            } else {
                                c.removeAttribute(a.name);
                            }
                        }
                        walk(c);
                    }
                } else if (c.nodeType === 8) {
                    c.remove();
                }
            }
        })(t.content);
        return t.innerHTML;
    };

    window.isHtmlNote = function (s) {
        // 含白名单标签或高亮类才视为富文本；否则走纯文本路径
        return /<(b|i|u|strong|em|h[1-3]|p|br|div|span|ul|ol|li|blockquote)\b/i.test(s);
    };

    window.loadNoteIntoEditor = function (el, raw) {
        if (!el) return;
        el.innerHTML = '';
        if (!raw) { window.updateNotePlaceholder(el); return; }
        if (window.isHtmlNote(raw)) {
            el.innerHTML = window.sanitizeNoteHtml(raw);
        } else {
            // 纯文本：换行转 <br>，整体白名单化（仍防 HTML 注入）
            el.innerHTML = window.sanitizeNoteHtml(raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'));
        }
        window.updateNotePlaceholder(el);
    };

    window.serializeNote = function (el) {
        if (!el) return '';
        // 内容为空（含只有空标签/空 <br>）时返回空串——使用 stripTags 等价判断，避免"<br><br><br>" 等空气笔记被存为非空
        const text = el.textContent.replace(/\u00a0/g, ' ').trim();
        if (!text) return '';
        return el.innerHTML;
    };

    window.updateNotePlaceholder = function (el) {
        // contenteditable 不支持原生 placeholder，手动按子内容判断
        if (!el) return;
        const text = el.textContent.trim();
        el.classList.toggle('is-empty', !text);
    };

    // 工具栏 HTML（quiz 笔记面板 / notes/map 批注编辑器共用同一组按钮）
    window.noteToolbarHtml = function () {
        return `<div class="note-toolbar" id="noteToolbar">
            <button type="button" data-cmd="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
            <button type="button" data-cmd="italic" title="斜体 (Ctrl+I)"><i>I</i></button>
            <span class="note-toolbar-sep"></span>
            <button type="button" data-cmd="h1" title="大标题">H1</button>
            <button type="button" data-cmd="h2" title="中标题">H2</button>
            <span class="note-toolbar-sep"></span>
            <span class="note-hl-dot" data-cmd="hl" data-color="yellow" title="黄高亮" style="background:#fff3a3"></span>
            <span class="note-hl-dot" data-cmd="hl" data-color="green" title="绿高亮" style="background:#b8e6c0"></span>
            <span class="note-hl-dot" data-cmd="hl" data-color="blue" title="蓝高亮" style="background:#b3d9f2"></span>
            <span class="note-hl-dot" data-cmd="hl" data-color="pink" title="粉高亮" style="background:#f5c2d5"></span>
            <span class="note-toolbar-sep"></span>
            <span class="note-color-dot" data-cmd="color" data-color="#d93025" title="红色字" style="color:#d93025">A</span>
            <span class="note-color-dot" data-cmd="color" data-color="#e8710a" title="橙色字" style="color:#e8710a">A</span>
            <span class="note-color-dot" data-cmd="color" data-color="#188038" title="绿色字" style="color:#188038">A</span>
            <span class="note-color-dot" data-cmd="color" data-color="#1a73e8" title="蓝色字" style="color:#1a73e8">A</span>
            <span class="note-color-dot" data-cmd="color" data-color="#8430ce" title="紫色字" style="color:#8430ce">A</span>
            <span class="note-color-dot" data-cmd="color" data-color="#5f6368" title="灰字" style="color:#5f6368">A</span>
            <span class="note-toolbar-sep"></span>
            <button type="button" data-cmd="painter" title="格式刷：先选中带格式的文字点此按钮，再选中目标文字，即可复制颜色/加粗/高亮等格式">🖌 格式刷</button>
            <button type="button" data-cmd="clear" title="清除格式">⌫ 清除</button>
        </div>`;
    };

    window.bindNoteToolbar = function (el) {
        // 工具条只对当前 input 元素绑一次（renderQuestion 多次创建会复用；用 dataset 标记防重复）
        if (!el) return;
        // 兼容三种容器：quiz 笔记面板 .note-panel / notes-map 批注编辑器 .line-anno-editor
        const panel = el.closest('.note-panel, .line-anno-editor, .note-editor');
        if (!panel) return;
        const tb = panel.querySelector('.note-toolbar');
        if (!tb || tb.dataset.bound) return;
        tb.dataset.bound = '1';
        tb.addEventListener('mousedown', e => e.preventDefault());   // 按下不丢选区
        tb.addEventListener('click', e => {
            const btn = e.target.closest('[data-cmd]');
            if (!btn) return;
            // 不调用 el.focus():mousedown preventDefault 已保住编辑器选区
            // (contenteditable 失焦后 focus 会折叠选区,导致 execCommand 空转)
            const cmd = btn.dataset.cmd;
            if (cmd === 'bold') document.execCommand('bold');
            else if (cmd === 'italic') document.execCommand('italic');
            else if (cmd === 'h1') document.execCommand('formatBlock', false, 'H1');
            else if (cmd === 'h2') document.execCommand('formatBlock', false, 'H2');
            else if (cmd === 'hl') window.applyNoteHighlight(el, btn.dataset.color);
            else if (cmd === 'color') window.applyNoteForeColor(el, btn.dataset.color);
            else if (cmd === 'painter') window.toggleFormatPainter(el, btn);
            else if (cmd === 'clear') window.clearNoteFormat(el);
            // 页面可选回调（quiz 用于刷新保存按钮状态；notes/map 批注无需）
            if (typeof onNoteInput === 'function') onNoteInput();
        });
        // 键盘快捷键 Ctrl/Cmd + B/I
        el.addEventListener('keydown', e => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'b' || e.key === 'B') { e.preventDefault(); document.execCommand('bold'); if (typeof onNoteInput === 'function') onNoteInput(); }
            else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); document.execCommand('italic'); if (typeof onNoteInput === 'function') onNoteInput(); }
        });
        // 占位符：输入/失焦时刷新
        el.addEventListener('input', () => updateNotePlaceholder(el));
        el.addEventListener('blur', () => updateNotePlaceholder(el));
    };

    window.applyNoteHighlight = function (el, color) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        // 选区必须在 el 内
        if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
        // 用 execCommand 的 hiliteColor 作为后备（兼容性最好）
        const ok = document.execCommand('hiliteColor', false, ({
            yellow: '#fff3a3', green: '#b8e6c0', blue: '#b3d9f2', pink: '#f5c2d5'
        })[color]);
        if (ok) return;
        // 后备失败：手动包 span
        try {
            const span = document.createElement('span');
            span.className = 'hl hl-' + color;
            span.appendChild(range.extractContents());
            range.insertNode(span);
        } catch (e) { /* 选区越界，忽略 */ }
    };

    window.applyNoteForeColor = function (el, color) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        // 选区必须在 el 内
        if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
        // 用 execCommand('foreColor') 优先（选区/嵌套处理比手动 span 更稳），
        // 但 Firefox 会生成 <font color>，而 font 标签不在保存白名单里，会被 sanitizer 剥掉——统一转成 span style.color
        const ok = document.execCommand('foreColor', false, color);
        if (ok) {
            el.querySelectorAll('font[color]').forEach(f => {
                const sp = document.createElement('span');
                sp.style.color = f.getAttribute('color');
                while (f.firstChild) sp.appendChild(f.firstChild);
                f.replaceWith(sp);
            });
            return;
        }
        // 后备失败：手动包 span（style.color 在白名单中会被保留）
        try {
            const span = document.createElement('span');
            span.style.color = color;
            span.appendChild(range.extractContents());
            range.insertNode(span);
        } catch (e) { /* 选区越界，忽略 */ }
    };

    // 「清除格式」：撤销 行内(粗体/斜体/颜色/字体) + 块级(H1/H2/H3/引用) + 高亮
    // 关键：removeFormat 只能清行内标签，清不掉 formatBlock 产生的 H1/H2，也剥不掉
    // class 化高亮 span(后备路径) 与内联 background；三者必须分别处理，否则清除「不生效」
    window.clearNoteFormat = function (el) {
        // 不调用 el.focus():contenteditable 失焦后 focus 会折叠选区(jsdom 亦然),导致剥色范围失效
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { if (typeof onNoteInput === 'function') onNoteInput(); return; }
        // 1) 行内格式
        document.execCommand('removeFormat');
        // 2) 块级格式：H1/H2/H3/blockquote → 普通段落 P（removeFormat 对 formatBlock 无效）
        try { document.execCommand('formatBlock', false, 'P'); } catch (e) {}
        // 3) 高亮：剥掉 class 化 span 与内联 background（removeFormat 不处理这两类）
        window.stripNoteHighlight(sel.getRangeAt(0), el);
        if (typeof onNoteInput === 'function') onNoteInput();
    };

    // ==================== 格式刷（Format Painter） ====================
    // 用法：① 选中一段带格式的文字（颜色/加粗/斜体/高亮）→ 点「🖌 格式刷」
    //       ② 再选中目标文字，格式自动套用（一次性的，用完自动解除）
    // 实现：从选区元素里读取内联样式与标签，目标选区用 execCommand 回放。
    // 兼容三种编辑器容器（quiz 笔记 / notes-map 批注），格式刷按钮由工具栏事件委托触发。
    let _painterFmt = null;          // 捕获到的格式 {bold, italic, hl, color}
    let _painterBtn = null;          // 当前高亮的格式刷按钮
    let _painterEl = null;           // 当前绑定的编辑器元素
    let _painterListening = false;   // 是否已挂 selectionchange 监听（全局只挂一次）

    window.toggleFormatPainter = function (el, btn) {
        // 已武装：再次点击 = 取消
        if (_painterFmt) { window.cancelFormatPainter(); return; }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;

        // 采集格式：克隆选区内容遍历元素（cloneContents 比 TreeWalker+intersectsNode 兼容性好，
        // jsdom 与各浏览器均支持；无需依赖 intersectsNode 的实现差异）
        const fmt = { bold: false, italic: false, hl: null, color: null };
        const frag = range.cloneContents();
        frag.querySelectorAll('*').forEach(n => {
            const t = n.tagName;
            if (t === 'B' || t === 'STRONG') fmt.bold = true;
            if (t === 'I' || t === 'EM') fmt.italic = true;
            if (!fmt.color && n.style && n.style.color) fmt.color = n.style.color;
            if (!fmt.hl && n.classList && (n.classList.contains('hl') || /^hl-/.test(n.className))) {
                fmt.hl = [...n.classList].find(c => /^hl-/.test(c)) || 'hl-yellow';
            }
        });
        // 选区起止文本节点上浮一层再扫一次，覆盖"样式在文本节点父级"的情况
        const scan = (node) => {
            let n = node && node.nodeType === 3 ? node.parentElement : node;
            while (n && n !== el) {
                if (n.style && n.style.color && !fmt.color) fmt.color = n.style.color;
                if (n.classList && n.classList.contains('hl') && !fmt.hl) fmt.hl = [...n.classList].find(c => /^hl-/.test(c)) || 'hl-yellow';
                if ((n.tagName === 'B' || n.tagName === 'STRONG') && !fmt.bold) fmt.bold = true;
                if ((n.tagName === 'I' || n.tagName === 'EM') && !fmt.italic) fmt.italic = true;
                n = n.parentElement;
            }
        };
        scan(range.startContainer); scan(range.endContainer);

        if (!fmt.bold && !fmt.italic && !fmt.hl && !fmt.color) {
            // 源选区没有可复制的格式，给出轻提示
            const hint = document.querySelector('#noteHint, .anno-hint');
            if (hint) { hint.textContent = '源文字没有可复制的格式（颜色/加粗/斜体/高亮）'; setTimeout(() => { hint.textContent = ''; }, 1800); }
            return;
        }
        _painterFmt = fmt;
        _painterEl = el;
        _painterBtn = btn || null;
        if (btn) btn.classList.add('painter-active');
        if (!_painterListening) {
            document.addEventListener('selectionchange', () => {
                if (!_painterFmt || !_painterEl) return;
                const s = window.getSelection();
                if (!s || s.isCollapsed || !s.rangeCount) return;
                const r = s.getRangeAt(0);
                // 要求新选区在编辑器内且不是源选区本身
                if (!_painterEl.contains(r.startContainer) || !_painterEl.contains(r.endContainer)) return;
                const sameAsSource = r.toString() === '' && r.collapsed;
                if (sameAsSource) return;
                window.applyFormatPainter();
            });
            _painterListening = true;
        }
    };

    window.cancelFormatPainter = function () {
        _painterFmt = null;
        _painterEl = null;
        if (_painterBtn) { _painterBtn.classList.remove('painter-active'); _painterBtn = null; }
    };

    // 把捕获到的格式回放到当前选区
    window.applyFormatPainter = function () {
        const el = _painterEl;
        const fmt = _painterFmt;
        window.cancelFormatPainter();
        if (!el || !fmt) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
        // 高亮/颜色先恢复选区（execCommand 依赖当前选区），按"颜色→加粗→斜体→高亮"顺序回放
        if (fmt.color) window.applyNoteForeColor(el, fmt.color);
        if (fmt.bold) document.execCommand('bold');
        if (fmt.italic) document.execCommand('italic');
        if (fmt.hl) window.applyNoteHighlight(el, fmt.hl.replace(/^hl-/, ''));
        // 回放可能改变了选区；无需恢复，用户可继续输入
        if (typeof onNoteInput === 'function') onNoteInput();
    };

    window.stripNoteHighlight = function (range, root) {
        root.querySelectorAll('*').forEach(s => {
            if (!range.intersectsNode(s)) return;
            // 内联背景高亮（execCommand('hiliteColor') 在某些浏览器产物）
            if (s.style && (s.style.backgroundColor || s.style.background)) {
                s.style.backgroundColor = '';
                s.style.background = '';
                if (s.getAttribute('style') === '') s.removeAttribute('style');
            }
            // 字体染色（applyNoteForeColor 手动 span 后备路径产生 <span style="color:...">）
            if (s.style && s.style.color) {
                s.style.color = '';
                if (s.getAttribute('style') === '') s.removeAttribute('style');
            }
            // class 化高亮 span（applyNoteHighlight 后备路径产生 <span class="hl hl-x">）
            if (s.classList && s.classList.contains('hl')) {
                const p = s.parentNode;
                while (s.firstChild) p.insertBefore(s.firstChild, s);
                p.removeChild(s);
            }
        });
    }
})();