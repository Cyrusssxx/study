/* =====================================================================
 * 通用数组算法可视化演示（code.html 专用）——支持主数组+辅助数组+多指针
 * 每个解法注册为一个 AD_DEMOS[题号][解法] = { init(seed), frames(seed) -> [帧] }
 * 帧 = { rows: { A: {a:[], cls:{}[下标->类], done:Set, ptr:{}} ... }, msg, done:[] }
 * 播放器统一：启动/暂停/重来/换一组/调速；条形图高度按值缩放
 * 用法：AD.mount(el, demoSpec)  el 为容器；demoSpec = { frames:[], cur:[], speed }
 * ===================================================================== */
(function () {
    const AD = {};
    const ROW_ORDER = ['A', 'B', 'C', 'D', 'E'];
    const ROW_LABEL = { A: 'A', B: 'B', C: 'C', D: '辅助', E: '计数' };

    /* ---------- 播放器 ---------- */
    function mount(el, demo) {
        const st = { frames: demo.frames, idx: 0, timer: null, speed: demo.speed || 480, running: false };
        const runBtn = el.querySelector('[data-ad-run]');
        const stage = el.querySelector('[data-ad-stage]');

        function render(f) {
            if (!f || !f.rows) return;
            stage.innerHTML = '';
            for (const key of ROW_ORDER) {
                const row = f.rows[key];
                if (!row || !Array.isArray(row.a)) continue;
                const max = Math.max.apply(null, row.a.concat([1]));
                const line = document.createElement('div');
                line.className = 'ad-row';
                line.innerHTML = `<div class="ad-row-lab">${ROW_LABEL[key] || key}</div>`;
                row.a.forEach((v, idx) => {
                    const bar = document.createElement('div');
                    bar.className = 'ad-bar';
                    const c = (row.cls && row.cls[idx]) || '';
                    if (c) bar.classList.add(c);
                    if (row.done && row.done.has && row.done.has(idx)) bar.classList.add('done');
                    // 指针标签
                    const pi = row.ptr && row.ptr.i === idx, pj = row.ptr && row.ptr.j === idx, pk = row.ptr && row.ptr.k === idx;
                    if (pi || pj || pk) {
                        bar.innerHTML += `<span class="${pi ? 'pli' : ''}${pj ? 'prj' : ''}${pk ? 'pk' : ''}">${pi ? 'i' : ''}${pj ? 'j' : ''}${pk ? 'k' : ''}</span>`;
                    }
                    const h = Math.max(6, Math.round(v / max * 88));
                    bar.innerHTML += `<b>${v}</b><i style="height:${h}px"></i>`;
                    line.appendChild(bar);
                });
                stage.appendChild(line);
            }
            const msg = el.querySelector('[data-ad-msg]');
            if (f.msg) msg.innerHTML = f.msg;
        }
        function tick() {
            if (st.idx >= st.frames.length) {
                st.running = false;
                runBtn.textContent = '▶ 重播';
                runBtn.classList.add('run');
                const m = el.querySelector('[data-ad-msg]');
                m.innerHTML = '🎉 演示结束。可「重来」再看一遍，或「换一组」随机数据重演。';
                return;
            }
            render(st.frames[st.idx++]);
            if (st.idx < st.frames.length) st.timer = setTimeout(tick, st.speed);
            else { st.running = false; runBtn.textContent = '▶ 重播'; runBtn.classList.add('run'); el.querySelector('[data-ad-msg]').innerHTML = '🎉 演示结束。可「重来」再看一遍，或「换一组」随机数据重演。'; }
        }
        function stopTimer() { if (st.timer) { clearTimeout(st.timer); st.timer = null; } }

        runBtn.addEventListener('click', () => {
            if (st.running) {
                stopTimer(); st.running = false;
                runBtn.textContent = '▶ 继续';
                runBtn.classList.add('run');
                el.querySelector('[data-ad-msg]').innerHTML += '（已暂停）';
                return;
            }
            if (st.idx === 0 || st.idx >= st.frames.length) {
                st.frames = demo.frames;
                st.idx = 0;
                if (!stage.children.length) render(st.frames[0]);
            }
            stopTimer(); st.running = true;
            runBtn.textContent = '⏸ 暂停';
            runBtn.classList.remove('run');
            tick();
        });

        el.querySelector('[data-ad-restart]').addEventListener('click', () => {
            stopTimer(); st.running = false;
            st.frames = demo.frames; st.idx = 0;
            runBtn.textContent = '▶ 启动';
            runBtn.classList.add('run');
            render(st.frames[0]);
            el.querySelector('[data-ad-msg]').innerHTML = '已重置到第一步，点「▶ 启动」观看。';
        });

        el.querySelector('[data-ad-shuffle]').addEventListener('click', () => {
            stopTimer(); st.running = false;
            demo.frames = demo.refresh ? demo.refresh() : demo.frames;
            st.frames = demo.frames; st.idx = 0;
            runBtn.textContent = '▶ 启动';
            runBtn.classList.add('run');
            render(st.frames[0]);
            el.querySelector('[data-ad-msg]').innerHTML = '已生成一组新数据，点「▶ 启动」开始。';
        });

        el.querySelectorAll('[data-ad-spd]').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('[data-ad-spd]').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                st.speed = parseInt(btn.dataset.adSpd, 10);
                if (st.running) { stopTimer(); tick(); }
            });
        });

        render(demo.frames[0]);
        el.querySelector('[data-ad-msg]').innerHTML = '准备好，点「▶ 启动」开始。';
    }

    /* ---------- 容器 HTML ---------- */
    function html(title) {
        return `<div class="array-demo" data-ad-demo>
    <div class="ad-title">${title}</div>
    <div class="ad-cap">单步演示：启动/暂停/重来/换一组/调速。条形高度按数值比例，◀定位指针。</div>
    <div class="ad-stage" data-ad-stage></div>
    <div class="ad-legend">
        <s><i style="background:rgba(234,88,12,.85)"></i>基准/选中</s>
        <s><i style="background:rgba(74,122,184,.85)"></i>左指针 i</s>
        <s><i style="background:rgba(8,145,178,.85)"></i>右指针 j</s>
        <s><i style="background:rgba(124,58,237,.55)"></i>比较中</s>
        <s><i style="background:rgba(220,38,38,.8)"></i>交换</s>
        <s><i style="background:rgba(5,150,105,.45)"></i>已确定</s>
    </div>
    <div class="ad-ctrl">
        <button class="qs-btn run" data-ad-run>▶ 启动</button>
        <button class="qs-btn" data-ad-restart>↻ 重来</button>
        <button class="qs-btn" data-ad-shuffle>↺ 换一组</button>
        <span class="qs-spd">速度
            <button data-ad-spd="900" class="on">慢</button>
            <button data-ad-spd="480">中</button>
            <button data-ad-spd="200">快</button>
        </span>
    </div>
    <div class="ad-msg" data-ad-msg></div>
</div>`;
    }

    /* ---------- 帧构造工具 ---------- */
    const F = {
        // 拷贝一份完整 rows 结构
        copy(rows) {
            const out = {};
            for (const k of ROW_ORDER) {
                if (!rows[k]) continue;
                out[k] = {
                    a: rows[k].a.slice(),
                    cls: rows[k].cls ? Object.assign({}, rows[k].cls) : {},
                    done: rows[k].done ? new Set(rows[k].done) : new Set(),
                    ptr: rows[k].ptr ? Object.assign({}, rows[k].ptr) : undefined
                };
            }
            return out;
        },
        setPtr(rows, row, name, idx) {
            const r = rows[row];
            if (!r.ptr) r.ptr = {};
            r.ptr[name] = idx;
        },
        cls(rows, row, idx, c) {
            if (rows[row] && rows[row].cls) rows[row].cls[idx] = c;
        },
        delCls(rows, row, idx) {
            if (rows[row] && rows[row].cls) delete rows[row].cls[idx];
        }
    };

    const AD_DEMOS = {};

    /* 给页面挂载：code.html 渲染完成后调用 */
    window.AD = { mount, html, F, _demos: AD_DEMOS, ROW_ORDER };
})();