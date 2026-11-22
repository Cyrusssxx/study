/* 题目图解分页共享模块（dati.html / zhenti.html 共用）
 * 图解 HTML 内联在 JS 里（网络优先），不写回题目数据：
 *   - dati_zt.json 走 LAZY 缓存优先，曾导致刷新看不到新图解；
 *   - q.a / it.an 必须与真题卷同源，不能塞补充内容。
 * 选择状态按 qid 存 localStorage，默认图片页（刷新即见）。 */
(function () {
    'use strict';

    const FIG_HTML = {
        co_zt2024_44: `
        <figure class="dati-explain-fig"><figcaption>图 1 · 执行全景：四条指令各在干嘛、寄存器分工、三个易混概念</figcaption><img class="fig-img" src="data/zt_svg/zt_2024_44_explain_1.svg?v=2" alt="图 1 · 执行全景：四条指令各在干嘛、寄存器分工、三个易混概念" loading="lazy" style="display:block;max-width:100%;border:1px solid var(--border);border-radius:6px;cursor:zoom-in"></figure>
        <figure class="dati-explain-fig"><figcaption>图 2 · 数值推演：从 i=5 到地址 / 小端机器数 / sum / 页号 / 跨页</figcaption><img class="fig-img" src="data/zt_svg/zt_2024_44_explain_2.svg?v=2" alt="图 2 · 数值推演：从 i=5 到地址 / 小端机器数 / sum / 页号 / 跨页" loading="lazy" style="display:block;max-width:100%;border:1px solid var(--border);border-radius:6px;cursor:zoom-in"></figure>
        <figure class="dati-explain-fig"><figcaption>图 3 · 机器码：32 位字段拼接、funct3=010 陷阱、short 变体</figcaption><img class="fig-img" src="data/zt_svg/zt_2024_44_explain_3.svg?v=2" alt="图 3 · 机器码：32 位字段拼接、funct3=010 陷阱、short 变体" loading="lazy" style="display:block;max-width:100%;border:1px solid var(--border);border-radius:6px;cursor:zoom-in"></figure>`
    };

    function tabOf(qid) {
        try { return localStorage.getItem('explainTab_' + qid) === 'text' ? 'text' : 'fig'; }
        catch (e) { return 'fig'; }
    }

    // 返回「切换条 + 文字页 + 图片页」完整 HTML；bodyHtml 是原解析正文。
    function tabsHtml(qid, bodyHtml) {
        const figs = FIG_HTML[qid];
        if (!figs) return bodyHtml;
        const onText = tabOf(qid) === 'text';
        const id = ` data-explain-id="${qid}"`;
        return `<div class="explain-switch" role="tablist" aria-label="解析切换"${id}>
                <button type="button" class="explain-switch-btn${onText ? ' active' : ''}"${id} data-explain-tab="text" aria-selected="${onText}" onclick="switchExplainPane('${qid}','text')">文字解析</button>
                <button type="button" class="explain-switch-btn${onText ? '' : ' active'}"${id} data-explain-tab="fig" aria-selected="${!onText}" onclick="switchExplainPane('${qid}','fig')">图片解析</button>
            </div>
            <div class="explanation-body explain-pane"${id} data-explain-pane="text"${onText ? '' : ' hidden'}>${bodyHtml}</div>
            <div class="explain-figs explain-pane"${id} data-explain-pane="fig"${onText ? ' hidden' : ''}>${figs}</div>`;
    }

    // 两页共用一个入口；用 data-explain-id 限定范围，避免同屏多题互相影响。
    function switchPane(qid, tab) {
        if (tab !== 'text' && tab !== 'fig') return;
        const all = document.querySelectorAll('[data-explain-id="' + qid + '"]');
        all.forEach(el => {
            if (el.classList.contains('explain-switch-btn')) {
                const on = el.dataset.explainTab === tab;
                el.classList.toggle('active', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
            } else if (el.dataset.explainPane) {
                el.hidden = el.dataset.explainPane !== tab;
            }
        });
        try { localStorage.setItem('explainTab_' + qid, tab); } catch (e) { }
    }

    window.EXPLAIN_FIGS = FIG_HTML;
    window.explainTabsHtml = tabsHtml;
    window.switchExplainPane = switchPane;
})();
