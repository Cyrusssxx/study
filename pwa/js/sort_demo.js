/* 排序可视化演示引擎（algo.html 与 notes.html 共用）
 * 由 algo.html 内联块抽离，保持函数签名与帧结构不变；
 * - qsDemoHtml/qsDemoInner 生成容器；builders 按 data-qs-kind 选帧构建器；
 * - initQsDemos(root) 支持局部初始化（笔记分片渲染后逐节挂载）；
 * - 新增 is(直接插入) / ss(简单选择) 两个帧构建器与对应图例。
 */

    /* 排序可视化演示容器（可指定标题/提示/图例绑定的排序算法） */
    function qsDemoHtml(opts) {
        const o = opts || {};
        /* 各算法的图例（沿用同一套 CSS 色块，不新增样式） */
        const QS_LEGEND = {
            qs: `
                    <s><i class="pv"></i>基准 pivot</s>
                    <s><i class="li"></i>左指针 i</s>
                    <s><i class="rj"></i>右指针 j</s>
                    <s><i class="sw"></i>交换</s>
                    <s><i class="dn"></i>已归位</s>`,
            bs: `
                    <s><i class="li"></i>比较位 j</s>
                    <s><i class="rj"></i>相邻位 j+1</s>
                    <s><i class="sw"></i>逆序交换</s>
                    <s><i class="dn"></i>已冒到末尾</s>`,
            is: `
                    <s><i class="li"></i>待插元素 A[i]</s>
                    <s><i class="rj"></i>比较位 j</s>
                    <s><i class="sw"></i>元素后移</s>
                    <s><i class="dn"></i>已排好前缀</s>`,
            ss: `
                    <s><i class="pv"></i>当前最小 min</s>
                    <s><i class="li"></i>趟首 i</s>
                    <s><i class="rj"></i>扫描位 j</s>
                    <s><i class="sw"></i>交换</s>
                    <s><i class="dn"></i>已定序前缀</s>`
        };
        const legend = o.legend || QS_LEGEND[o.kind || 'qs'] || QS_LEGEND.qs;
        return `<div class="qs-demo" data-qs-demo data-qs-kind="${o.kind || 'qs'}">
            <div class="qs-demo-title">${o.title || '排序 · 可视化演示'}</div>
            <div class="qs-demo-cap">${o.cap || '单步演示：启动/暂停/重来/换一组/调速。条形高度按数值比例。'}</div>
            <div class="qs-stage" data-qs-stage></div>
            <div class="qs-legend">${legend}</div>
            <div class="qs-ctrl">
                <button class="qs-btn run" data-qs-run>▶ 启动</button>
                <button class="qs-btn step" data-qs-prev disabled title="回到上一帧（会暂停自动播放）">◀ 上一步</button>
                <button class="qs-btn step" data-qs-next title="前进一帧（会暂停自动播放）">下一步 ▶</button>
                <button class="qs-btn" data-qs-restart>↻ 重来</button>
                <button class="qs-btn" data-qs-shuffle>↺ 换一组</button>
                <span class="qs-spd">速度
                    <button data-qs-spd="1800" class="on">慢</button>
                    <button data-qs-spd="960">中</button>
                    <button data-qs-spd="400">快</button>
                </span>
            </div>
            <div class="qs-msg" data-qs-msg>准备好，点「▶ 启动」开始。</div>
        </div>`;
    }

    /* ------------------------------------------------------------------
     * 快速排序可视化演示引擎
     * 预演快排（记录每一步的数组快照与指针状态），按间隔逐步播放，可暂停/继续/换组/调速
     * ------------------------------------------------------------------ */
    function qsBuildFrames(arr0) {
        const frames = [];
        const push = (a, pi, li, rj, swp, fixed, lo, hi, msg) => {
            frames.push({ a: a.slice(), pi, li, rj, swp: swp ? [swp[0], swp[1]] : null, fixed: new Set(fixed), lo, hi, msg });
        };
        const qs = (a, L, R, fixed) => {
            if (L > R) return;
            if (L === R) { fixed.add(L); push(a, L, -1, -1, null, fixed, L, R, `区间只剩一个元素 A[${L}]=${a[L]}，天然有序，直接归位`); return; }
            const pivot = a[L];
            push(a, L, -1, -1, null, fixed, L, R, `进入区间 [${L}, ${R}]：选基准 pivot = A[${L}] = ${pivot}`);
            let i = L, j = R;
            while (i < j) {
                push(a, L, i, j, null, fixed, L, R, `i=${i}、j=${j} 开始双向扫描：先让 j 向左找 < ${pivot} 的元素`);
                while (i < j && a[j] >= pivot) { j--; push(a, L, i, j, null, fixed, L, R, `A[${j}]=${a[j]} ≥ ${pivot}，j 继续左移 → j=${j}`); }
                while (i < j && a[i] <= pivot) { i++; push(a, L, i, j, null, fixed, L, R, `A[${i}]=${a[i]} ≤ ${pivot}，i 继续右移 → i=${i}`); }
                if (i < j) {
                    [a[i], a[j]] = [a[j], a[i]];
                    push(a, L, i, j, [i, j], fixed, L, R, `A[${i}] 与 A[${j}] 互换：${a[i]} ⇌ ${a[j]}`);
                }
            }
            [a[L], a[i]] = [a[i], a[L]];
            fixed.add(i);
            push(a, L, i, i, null, fixed, L, R, `基准 ${pivot} 归位到 A[${i}] ✅（左侧都 ≤ 它，右侧都 ≥ 它）`);
            qs(a, L, i - 1, fixed);
            qs(a, i + 1, R, fixed);
        };
        qs(arr0.slice(), 0, arr0.length - 1, new Set());
        return frames;
    }

    /* 冒泡排序帧构建器：每趟冒出一个最大值到右端（fixed 右端已排序） */
    function bsBuildFrames(arr0) {
        const frames = [];
        const push = (a, li, rj, swp, fixed, msg, pi) => {
            frames.push({ a: a.slice(), pi: pi || -1, li, rj, swp: swp ? [swp[0], swp[1]] : null, fixed: new Set(fixed), lo: 0, hi: a.length - 1, msg });
        };
        const a = arr0.slice(), n = a.length;
        const fixed = new Set();
        push(a, -1, -1, null, fixed, `冒泡排序开始：每趟从前往后相邻比较，把当前最大值「冒」到末尾，末尾区间逐个固定。`);
        for (let i = n - 1; i > 0; i--) {
            let swapped = false;
            for (let j = 0; j < i; j++) {
                push(a, j, j + 1, null, fixed, `比较相邻 A[${j}]=${a[j]} 与 A[${j + 1}]=${a[j + 1]}`);
                if (a[j] > a[j + 1]) {
                    [a[j], a[j + 1]] = [a[j + 1], a[j]];
                    swapped = true;
                    push(a, j, j + 1, [j, j + 1], fixed, `逆序 → 交换：${a[j]} ⇌ ${a[j + 1]}`);
                }
            }
            fixed.add(i);
            push(a, -1, -1, null, fixed, `第 ${n - i} 趟完成：最大值 ${a[i]} 已冒到 A[${i}] ✅（右侧 ${fixed.size} 个已定序）`);
            if (!swapped) break;   // 一趟无交换 → 已有序
        }
        if (fixed.size < n) {
            for (let k = 0; k < n; k++) fixed.add(k);
            push(a, -1, -1, null, fixed, `中途已全部有序，提前结束 ✅ 最终序列：[${a.join(', ')}]`);
        }
        return frames;
    }

    /* 直接插入排序帧构建器：前段已排好，把当前元素插入到合适位置 */
    function isBuildFrames(arr0) {
        const frames = [];
        const push = (a, li, rj, swp, fixed, msg) => {
            frames.push({ a: a.slice(), pi: -1, li, rj, swp: swp ? [swp[0], swp[1]] : null, fixed: new Set(fixed), lo: 0, hi: a.length - 1, msg });
        };
        const a = arr0.slice(), n = a.length;
        const fixed = new Set();
        fixed.add(0);
        push(a, -1, -1, null, fixed, `直接插入排序开始：A[0] 视为已排好前缀（绿色）。`);
        for (let i = 1; i < n; i++) {
            const tmp = a[i];
            let j = i - 1;
            push(a, i, j, null, fixed, `取当前元素 A[${i}]=${tmp}（蓝），与已排好前缀比较（绿），找插入位置`);
            while (j >= 0 && a[j] > tmp) {
                a[j + 1] = a[j];
                push(a, i, j, [j, j + 1], fixed, `A[${j}]=${a[j]} > ${tmp} → 右移 A[${j + 1}] ← A[${j}]`);
                j--;
            }
            a[j + 1] = tmp;
            fixed.add(i);
            push(a, i, j + 1, null, fixed, `${tmp} 插入到 A[${j + 1}] ✅ → [${a.slice(0, i + 1).join(', ')}]（前缀已有序）`);
        }
        for (let k = 0; k < n; k++) fixed.add(k);
        push(a, -1, -1, null, fixed, `排序完成 ✅ 最终序列：[${a.join(', ')}]`);
        return frames;
    }

    /* 简单选择排序帧构建器：每趟选最小值放前缀 */
    function ssBuildFrames(arr0) {
        const frames = [];
        const push = (a, li, rj, swp, fixed, msg, pi) => {
            frames.push({ a: a.slice(), pi: pi || -1, li, rj, swp: swp ? [swp[0], swp[1]] : null, fixed: new Set(fixed), lo: 0, hi: a.length - 1, msg });
        };
        const a = arr0.slice(), n = a.length;
        const fixed = new Set();
        push(a, -1, -1, null, fixed, `简单选择排序开始：每趟在未定前缀中找最小值，与当前首位交换。`);
        for (let i = 0; i < n - 1; i++) {
            let min = i;
            for (let j = i + 1; j < n; j++) {
                push(a, i, j, null, fixed, `扫描找最小：当前候选 A[${min}]=${a[min]}（橙），比较 A[${j}]=${a[j]}`, min);
                if (a[j] < a[min]) { min = j; push(a, i, j, null, fixed, `A[${j}]=${a[j]} 更小 → 更新候选为下标 ${j}`, min); }
            }
            if (min !== i) {
                [a[i], a[min]] = [a[min], a[i]];
                push(a, i, min, [i, min], fixed, `最小值 ${a[i]} 与 A[${i}] 交换`);
            }
            fixed.add(i);
            push(a, i, -1, null, fixed, `第 ${i + 1} 趟：A[${i}]=${a[i]} 就位 ✅（前缀 ${fixed.size} 个已定序）`);
        }
        fixed.add(n - 1);
        push(a, -1, -1, null, fixed, `排序完成 ✅ 最终序列：[${a.join(', ')}]`);
        return frames;
    }

    function qsRenderFrame(dm, f) {
        const stage = dm.querySelector('[data-qs-stage]');
        const max = Math.max.apply(null, f.a);
        stage.innerHTML = '';
        f.a.forEach((v, idx) => {
            const bar = document.createElement('div');
            bar.className = 'qs-bar';
            const cls = f.fixed.has(idx) ? 'done'
                : (f.swp && (idx === f.swp[0] || idx === f.swp[1])) ? 'swp'
                : (idx === f.li) ? (idx === f.rj ? 'swp' : 'li')
                : (idx === f.rj) ? 'rj'
                : (idx === f.pi) ? 'pivot' : '';
            if (cls) bar.classList.add(cls);
            const h = Math.max(8, Math.round(v / max * 118));
            // 柱顶指针行（固定占位对齐）：被指针位指向的元素顶部显示彩色箭头
            let tipTxt = '', tipCls = '';
            if (f.swp && (idx === f.swp[0] || idx === f.swp[1])) { tipTxt = '⇄'; tipCls = 'swp'; }
            else if (idx === f.pi) { tipTxt = 'P'; tipCls = 'pivot'; }
            else if (idx === f.li && idx === f.rj) { tipTxt = 'i j'; tipCls = 'both'; }
            else if (idx === f.li) { tipTxt = 'i'; tipCls = 'li'; }
            else if (idx === f.rj) { tipTxt = 'j'; tipCls = 'rj'; }
            bar.innerHTML = `<s class="qs-tip${tipCls ? ' tip-' + tipCls : ''}">${tipTxt}</s><b>${v}</b><i style="height:${h}px"></i>`;
            stage.appendChild(bar);
        });
        const msg = dm.querySelector('[data-qs-msg]');
        msg.innerHTML = `<b>[${f.lo},${f.hi}]</b>　${f.msg}`;
    }

    function qsInitDemo(dm) {
        const kind = dm.dataset.qsKind || 'qs';
        const builders = {
            qs: qsBuildFrames,
            bs: bsBuildFrames,
            is: isBuildFrames,
            ss: ssBuildFrames
        };
        const build = builders[kind] || qsBuildFrames;
        const state = { cur: [], frames: [], idx: 0, timer: null, speed: 480, running: false };
        const runBtn = dm.querySelector('[data-qs-run]');
        const stage = dm.querySelector('[data-qs-stage]');
        const prevBtn = dm.querySelector('[data-qs-prev]');
        const nextBtn = dm.querySelector('[data-qs-next]');

        function fresh() {
            state.cur = [];
            const n = 8;
            while (state.cur.length < n) {
                const v = 5 + Math.floor(Math.random() * 95);
                if (state.cur.indexOf(v) === -1) state.cur.push(v);
            }
            state.frames = build(state.cur);
            state.idx = 0;
        }
        function tick() {
            if (state.idx >= state.frames.length) {
                state.running = false;
                runBtn.textContent = '▶ 重播';
                runBtn.classList.add('run');
                updateStepBtns();
                dm.querySelector('[data-qs-msg]').innerHTML = '🎉 排序完成！可点「换一组」再来一轮，或「重播」再看一遍。';
                return;
            }
            qsRenderFrame(dm, state.frames[state.idx++]);
            if (state.idx < state.frames.length) state.timer = setTimeout(tick, state.speed);
            else { state.running = false; runBtn.textContent = '▶ 重播'; runBtn.classList.add('run'); dm.querySelector('[data-qs-msg]').innerHTML = '🎉 排序完成！可点「换一组」再来一轮，或「重播」再看一遍。'; }
        }
        function stopTimer() { if (state.timer) { clearTimeout(state.timer); state.timer = null; } }

        /* 单步导航：state.idx = 下一个待渲染帧的下标（已渲染 0..idx-1） */
        function updateStepBtns() {
            if (prevBtn) prevBtn.disabled = state.idx <= 1;
            if (nextBtn) nextBtn.disabled = state.idx >= state.frames.length;
        }
        function renderAt(i) {
            if (i < 0 || i >= state.frames.length) return;
            state.idx = i + 1;
            qsRenderFrame(dm, state.frames[i]);
            updateStepBtns();
        }
        function pauseAuto() {
            stopTimer();
            state.running = false;
            runBtn.textContent = '▶ 继续';
            runBtn.classList.add('run');
        }
        if (prevBtn) prevBtn.addEventListener('click', () => {
            if (state.running) pauseAuto();          // 手动单步时先停下自动播放
            if (state.idx <= 1) return;              // 已在第一帧
            renderAt(state.idx - 2);                 // 回退一帧
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            if (state.running) pauseAuto();
            if (state.idx >= state.frames.length) return;
            renderAt(state.idx);                     // 前进一帧
        });

        runBtn.addEventListener('click', () => {
            if (state.running) {                       // 运行中 → 暂停
                stopTimer(); state.running = false;
                runBtn.textContent = '▶ 继续';
                runBtn.classList.add('run');
                dm.querySelector('[data-qs-msg]').innerHTML += '（已暂停）';
                return;
            }
            if (state.idx === 0 || state.idx >= state.frames.length) {   // 首帧或播完 → 从头/重播
                fresh();
                renderAt(0);
            }
            stopTimer(); state.running = true;
            runBtn.textContent = '⏸ 暂停';
            runBtn.classList.remove('run');
            tick();
        });

        dm.querySelector('[data-qs-restart]').addEventListener('click', () => {
            stopTimer(); state.running = false;
            runBtn.textContent = '▶ 启动';
            runBtn.classList.add('run');
            renderAt(0);
            dm.querySelector('[data-qs-msg]').innerHTML = '已重置到第一帧，点「▶ 启动」自动播放，或用「上一步 / 下一步」单步看。';
        });

        dm.querySelector('[data-qs-shuffle]').addEventListener('click', () => {
            stopTimer(); state.running = false;
            fresh();
            runBtn.textContent = '▶ 启动';
            runBtn.classList.add('run');
            renderAt(0);
            dm.querySelector('[data-qs-msg]').innerHTML = '已生成一组新数据，点「▶ 启动」开始，或直接「下一步」单步看。';
        });

        dm.querySelectorAll('[data-qs-spd]').forEach(btn => {
            btn.addEventListener('click', () => {
                dm.querySelectorAll('[data-qs-spd]').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                state.speed = parseInt(btn.dataset.qsSpd, 10);
                if (state.running) { stopTimer(); tick(); }
            });
        });

        fresh();
        renderAt(0);
        dm.querySelector('[data-qs-msg]').innerHTML = '准备好：点「▶ 启动」自动播放，或用「下一步 ▶」一帧一帧看。';
    }

    /* root 可选：笔记分片渲染后只初始化该节新插入的演示，避免重复绑定 */
    function initQsDemos(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-qs-demo]').forEach(dm => qsInitDemo(dm));
    }
