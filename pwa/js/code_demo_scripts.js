/* =====================================================================
 * 顺序表类解法预演脚本（code.html 专用）
 * 每个解法 = { title, seed(), frames(seed) }
 * 模型：实时 rows（A/B/C 数组 + cls 标记 + done 集合 + ptr 指针）→ 每帧深拷贝快照
 * 统一挂到 window.AD._demos[题id][解法index]
 * ===================================================================== */
(function () {
    const F = window.AD ? window.AD.F : null;
    if (!F) return;

    /* ---- 工具 ---- */
    const snap = (rows, msg) => ({ rows: F.copy(rows), msg });

    /* 空行：主数组 + 可选辅助行 */
    function baseRow(A, withB) {
        const rows = { A: { a: A.slice(), cls: {}, done: new Set(), ptr: {} } };
        if (withB) {
            rows.B = { a: new Array(A.length).fill('·'), cls: {}, done: new Set(), ptr: {} };
            if (withB === 2) rows.C = { a: new Array(A.length).fill('·'), cls: {}, done: new Set(), ptr: {} };
        }
        if (withB === 3) rows.B = { a: [], cls: {}, done: new Set(), ptr: {} }; // B:联表
        return rows;
    }
    const R = (rows, name) => rows[name];
    const pt = (rows, name, p, val) => { const r = rows[name]; if (!r.ptr) r.ptr = {}; r.ptr[p] = val; };
    const cl = (rows, name, idx, c) => { const r = rows[name]; r.cls[idx] = c; };
    const dcl = (rows, name, idx) => { const r = rows[name]; delete r.cls[idx]; };
    const done = (rows, name, idx) => { rows[name].done.add(idx); };
    const sw = (rows, name, i, j) => { const r = rows[name]; [r.a[i], r.a[j]] = [r.a[j], r.a[i]]; r.cls = {}; if (r.done) r.done = new Set(); };

    const D = {};
    const demo = (k, s) => { D[k] = s; };

    /* ============ 2010 循环左移 p 位 ============ */
    demo('2010-1', {
        title: '解法1 · 辅助数组 B（时间 O(n) 空间 O(n)）',
        seed() { return { A: [1, 2, 3, 4, 5, 6, 7, 8], p: 3 }; },
        frames(s) {
            const { A, p } = s, n = A.length;
            const rows = baseRow(A, 1);
            const B = rows.B.a;
            const out = [];
            out.push(snap(rows, `原数组 A（左移 p=${p} 位）→ 目标 [${A.slice(p).join(',')} | ${A.slice(0, p).join(',')}]。开辅助数组 B。`));
            for (let i = 0; i < p; i++) {
                B[n - p + i] = A[i];
                out.push(snap(rows, `B[${n - p + i}] ← A[${i}]（${A[i]}）：把前 ${p} 个元素搬到 B 的末尾段`));
            }
            for (let i = p; i < n; i++) {
                B[i - p] = A[i];
                out.push(snap(rows, `B[${i - p}] ← A[${i}]（${A[i]}）：余下元素顺序搬到 B 开头段`));
            }
            out.push(snap(rows, `完成：B = [${B.join(', ')}]。代价：额外 O(n) 空间（不推荐，但思路直观）。`));
            return out;
        }
    });
    demo('2010-2', {
        title: '解法2 · 三次翻转（时间 O(n) 空间 O(1)）',
        seed() { return { A: [1, 2, 3, 4, 5, 6, 7, 8], p: 3 }; },
        frames(s) {
            const { A, p } = s, n = A.length;
            let a = A.slice();
            const rowsOf = () => ({ A: { a: a.slice(), cls: {}, done: new Set(), ptr: {} } });
            const out = [];
            const rev = (L, R, tag) => {
                out.push(snap(rowsOf(), `${tag} 翻转 [${L}, ${R}]（头尾对称交换）`));
                while (L < R) {
                    [a[L], a[R]] = [a[R], a[L]];
                    const rr = rowsOf(); rr.A.cls[L] = 'usw'; rr.A.cls[R] = 'usw';
                    out.push(snap(rr, `${tag} 交换 A[${L}]↔A[${R}] → ${a.join(', ')}`));
                    L++; R--;
                }
            };
            out.push(snap(rowsOf(), `思路：左移 p 位 ⇔ 先逆置 [0,p-1]，再逆置 [p,n-1]，最后整体逆置。只需 O(1) 空间。`));
            rev(0, p - 1, '①');
            rev(p, n - 1, '②');
            rev(0, n - 1, '③');
            out.push(snap(rowsOf(), `结果：A = [${a.join(', ')}] ✅ 这就是左移 ${p} 位（时间 O(n)、空间 O(1)）。`));
            return out;
        }
    });
    window.AD._demos['ds_code_2010'] = { 0: D['2010-1'], 1: D['2010-2'] };
})();