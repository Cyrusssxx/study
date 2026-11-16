/* 笔记「全文 / 要点 / 只看图」三档视图 + 节级速览 + figs.html 图集页。
 *
 * 背景：OS 大节文字极长却没有「一句话判据」，用户反馈抓不到重点；
 *   又提出「有时候只想看图」。本轮做法：
 *   1) 给 OS 12 个长文字大节加 summary 字段（新增字段，不碰任何已有 <p> 正文）；
 *   2) notes.html 上给 #notesContent 挂 data-view，纯 CSS 过滤，DOM 不动 => 行级批注零漂移；
 *   3) figs.html 聚合四科 254 张图（226 独立 SVG + 28 内联结构图），点标题跳回讲义。
 *
 * 硬指标：OS jsdom .anno-line = 3409（本轮不改 html，由其它测试锁）；
 *   图集页卡片精确 254 张，四科各 60 / 76 / 51 / 39 + 内联 0 / 16 / 11 / 0（OS 含 boot/ctxsw 多类 figure）。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
    const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

const notesHtml = read('pwa/notes.html');
const figsHtml = read('pwa/figs.html');
const css = read('pwa/css/style.css');
const sw = read('pwa/sw.js');
const indexHtml = read('pwa/index.html');
const os = JSON.parse(read('pwa/data/notes/os_notes.json'));

// ---------- 1. OS 节级速览 ----------
const summaries = [];
for (const ch of os.chapters || []) {
    for (const sec of ch.sections || []) {
        for (const x of [sec].concat(sec.subsections || [])) {
            if (x.summary) summaries.push({ num: (x.section || '').split(' ')[0], text: x.summary });
        }
    }
}
check('OS 速览精确 12 条', summaries.length, 12);
check('12 条速览全在节/子节对象上且编号齐全',
    summaries.map(x => x.num).sort().join(','),
    ['1.1.3', '1.3', '1.4', '1.6', '2.3', '3.1', '3.2', '4.1', '4.2', '4.3', '5.1', '5.3.4'].sort().join(','));
check('速览都是纯文本（无 HTML 标签）', summaries.every(x => !/[<>]/.test(x.text)), true);
check('速览长度 60–260 字（一句话抓重点，不写成长段）',
    summaries.every(x => x.text.length >= 60 && x.text.length <= 260), true);
check('1.4 速览点出「两条轴」这一抓重点口径', summaries.some(x => x.num === '1.4' && x.text.includes('两条轴')), true);
check('3.2 速览点出 Belady / CLOCK 高频判据',
    summaries.some(x => x.num === '3.2' && x.text.includes('Belady') && x.text.includes('CLOCK')), true);
for (const s of ['co', 'cn', 'ds']) {
    const d = JSON.parse(read('pwa/data/notes/' + s + '_notes.json'));
    let n = 0;
    for (const ch of d.chapters || []) for (const sec of ch.sections || [])
        for (const x of [sec].concat(sec.subsections || [])) if (x.summary) n++;
    check(s + ' 暂不加速览（本轮只补 OS）', n, 0);
}

// ---------- 2. notes.html 视图切换（静态） ----------
check('三档按钮 data-view 齐全', ['full', 'key', 'fig'].every(v =>
    notesHtml.includes(`data-view="${v}" onclick="setNotesView('${v}')"`)), true);
check('视图状态存 localStorage 且四科通用', notesHtml.includes("const NOTES_VIEW_KEY = 'notes_view_mode';"), true);
check('切换条抽成常量（加载失败也保留）', notesHtml.includes('const NOTES_VIEW_HTML ='), true);
check('加载失败分支也渲染切换条', /暂无考点笔记<\/p>' \+ NOTES_VIEW_HTML/.test(notesHtml), true);
check('图集入口带当前科目', notesHtml.includes('href="figs.html?subject=${SUBJECT}"'), true);
check('notes 页图集入口是按钮外观（不是裸文字链接）',
    /\.notes-view-gallery\s*\{[^}]*border: 1px solid var\(--primary\)[^}]*border-radius: 14px/s.test(css), true);
check('按钮态入口 hover 有反白过渡',
    /\.notes-view-gallery:hover\s*\{[^}]*background: var\(--primary\)[^}]*color: #fff/s.test(css), true);
check('setNotesView 只接受三档，非法值回落全文',
    notesHtml.includes("if (!['full', 'key', 'fig'].includes(mode)) mode = 'full';"), true);
check('节速览渲染在 .notes-body 之外（不进 .anno-line）',
    /\$\{summaryHtml\(sec\)\}\s*<div class="notes-body">/.test(notesHtml), true);
check('子节速览同样渲染在 .notes-sub-body 之外',
    /\$\{summaryHtml\(s\)\}\s*<div class="notes-sub-body">/.test(notesHtml), true);
check('速览用 escAttr 转义（CN 节名带 ASCII 双引号）', notesHtml.includes('escAttr(x.summary)'), true);

// ---------- 3. 视图 CSS（纯过滤，不改 DOM） ----------
check('CSS 有节速览样式', css.includes('.notes-sec-summary {'), true);
check('CSS 有要点视图规则', css.includes('#notesContent[data-view="key"]'), true);
check('CSS 有只看图视图规则', css.includes('#notesContent[data-view="fig"]'), true);
check('只看图会整节隐藏无图小节', css.includes('.notes-section:not(:has(img.fig-img, figure.struct-fig))'), true);
check('只看图放出图题段 / 图片段 / 内联结构图',
    ['> p[data-fig="1"]', '> p:has(> img.fig-img)', '> p:has(+ p > img.fig-img)',
        '> figure.struct-fig', '> p:has(+ figure.struct-fig)'].every(x => css.includes(x)), true);
// .notes-sub 自己就是 .notes-body 的直接子元素，只放 figure 而不放父容器 = 整块空白
check('只看图显式放出「有图子节」容器',
    css.includes('#notesContent[data-view="fig"] .notes-body > .notes-sub:has(img.fig-img, figure.struct-fig)'), true);
check('要点视图保留 <b> 重点词', css.includes(':is(b, strong) {\n    font-size: .88rem'), true);
check('要点视图隐藏无任何重点词的段落', css.includes(':not(:has(b, strong, img, code))'), true);
// 要点视图「去掉例题」：三条规则都必须挂在 data-view="key" 下，全文/只看图不受影响。
check('要点视图整块隐藏 .note-example 例题卡',
    /#notesContent\[data-view="key"\] \.note-example,\s*\n#notesContent\[data-view="key"\] h4:has\(\+ \.note-example\) \{\s*\n\s*display: none;/.test(css), true);
check('要点视图隐藏例题卡前面紧邻的「经典例题」标题',
    css.includes('#notesContent[data-view="key"] h4:has(+ .note-example)'), true);
check('要点视图收掉整列无重点词的 ul/ol 容器',
    css.includes('#notesContent[data-view="key"] :is(.notes-body, .notes-sub-body) :is(ul, ol):not(:has(li:has(b, strong, img, code)))'), true);
check('全文视图没有例题隐藏规则',
    !/#notesContent\[data-view="(?:full|fig)"\][^{]*\.note-example/.test(css), true);
check('要点视图不再隐藏配图（2026-11-16 起要点也显示图）',
    !css.includes('#notesContent[data-view="key"] :is(.notes-body, .notes-sub-body) :is(p:has(img.fig-img), figure.struct-fig, img.fig-img)'), true);
check('配图隐藏 !important 规则已移除（历史内联 display:block 的裸 PNG 也恢复显示）',
    !/:is\(p:has\(img\.fig-img\), figure\.struct-fig, img\.fig-img\) \{\s*\n\s*display: none !important;/.test(css), true);
check('要点视图保留图题索引行（图上方一行小字图注）',
    css.includes('#notesContent[data-view="key"] :is(.notes-body, .notes-sub-body) > p[data-fig="1"]:not(:has(img.fig-img))'), true);
check('图块 data-fig 不参与字号压缩（图题/图片段不被压成 0 字号）',
    css.includes('#notesContent[data-view="key"] :is(.notes-body, .notes-sub-body) :is(p, li):not([data-fig="1"])'), true);
check('要点视图 h4 降权为 400 字重（避免空标题大片留白）',
    /#notesContent\[data-view="key"\] :is\(\.notes-body, \.notes-sub-body\) h4 \{\s*\n\s*font-size: \.8rem; font-weight: 400;/.test(css), true);
check('要点按钮 title 说明配图保留、例题收起',
    notesHtml.includes('title="只留加粗重点、黄框、表格、配图与节速览，例题收起"'), true);
check('视图提示文案说明配图在要点里保留',
    notesHtml.includes('要点 = 只留加粗重点词 / 黄框 / 表格 / 配图 / 节速览，例题收起'), true);
check('视图提示不再声称配图被收起',
    !notesHtml.includes('例题与配图收起'), true);
check('视图规则写在样式表顶层（不落在 @media 里）',
    css.indexOf('.notes-view-switch {') > css.lastIndexOf('@media'), true);

// ---------- 4. 视图函数真实执行 ----------
const vStart = notesHtml.indexOf('        const NOTES_VIEW_KEY');
// 顶层那次调用是 8 空格缩进；setNotesView 内部还有一次 12 空格缩进的调用，
// 不能用裸子串匹配（会从 12 空格行中间截断，eval 报 Unexpected end of input）。
const vEndMark = '\n        syncNotesView();';
const vEnd = notesHtml.indexOf(vEndMark, vStart) + vEndMark.length;
check('能截出视图函数片段', vStart > 0 && vEnd > vStart, true);
const viewDom = new JSDOM(
    // 夹具带上顶栏「视图」下拉：syncNotesView/setNotesView 要同步它（摘要文案、active、收起）
    '<details class="nav-dd" id="navViewDd"><summary class="nav-dd-sum">视图 <span id="navViewState">全文</span></summary>' +
    '<div class="nav-dd-menu" id="navViewMenu">' +
    '<a href="#" data-view="full" onclick="setNotesView(\'full\'); return false;">全文</a>' +
    '<a href="#" data-view="key" onclick="setNotesView(\'key\'); return false;">要点</a>' +
    '<a href="#" data-view="fig" onclick="setNotesView(\'fig\'); return false;">只看图</a>' +
    '</div></details>' +
    '<div id="notesHeader"></div><div class="notes-content" id="notesContent"></div>',
    // 用 dangerously：outside-only 下 jsdom 不执行内联 onclick，测不到按钮点击链路
    { url: 'https://x.test/notes.html?subject=os', runScripts: 'dangerously' });
const vw = viewDom.window;
vw.eval('var SUBJECT = "os";\n' + notesHtml.slice(vStart, vEnd) +
    '\nwindow.__vh = NOTES_VIEW_HTML; window.__set = setNotesView; window.__sync = syncNotesView;');
vw.document.getElementById('notesHeader').innerHTML = vw.__vh;
vw.__sync();
check('初始 data-view = full', vw.document.getElementById('notesContent').getAttribute('data-view'), 'full');
check('初始「全文」按钮 active',
    vw.document.querySelector('button[data-view="full"]').classList.contains('active'), true);
vw.__set('key');
check('切要点：容器 data-view', vw.document.getElementById('notesContent').getAttribute('data-view'), 'key');
check('切要点：localStorage 记住', vw.localStorage.getItem('notes_view_mode'), 'key');
check('切要点：只有要点按钮 active',
    [...vw.document.querySelectorAll('#notesViewSwitch button')].map(b => b.classList.contains('active')),
    [false, true, false]);
check('切要点：aria-pressed 同步',
    vw.document.querySelector('button[data-view="key"]').getAttribute('aria-pressed'), 'true');
vw.__set('fig');
check('切只看图：容器 data-view', vw.document.getElementById('notesContent').getAttribute('data-view'), 'fig');
vw.__set('not-a-mode');
check('非法视图回落全文', vw.document.getElementById('notesContent').getAttribute('data-view'), 'full');
check('按钮 onclick 能调到全局 setNotesView', typeof vw.setNotesView, 'function');
vw.document.querySelector('button[data-view="fig"]').click();
check('点击按钮也能切换', vw.document.getElementById('notesContent').getAttribute('data-view'), 'fig');

// ---------- 4b. 顶栏「视图」下拉（形态同「知识点」下拉，共用 setNotesView） ----------
check('顶栏静态结构：#navViewDd + #navViewState + #navViewMenu',
    ['id="navViewDd"', 'id="navViewState"', 'id="navViewMenu"'].every(x => notesHtml.includes(x)), true);
check('顶栏摘要不带「视图」前缀（只留当前模式词，2026-11-16 用户要求）',
    !/<summary class="nav-link nav-dd-sum"[^>]*>\s*视图\s+<span id="navViewState">/.test(notesHtml), true);
check('当前视图状态词主色加粗（#navViewState）',
    css.includes('#navViewState { color: var(--primary); font-weight: 600; }'), true);
check('顶栏间距节奏统一（nav-dd / nav-links 均 18px，链接 gap 13px）',
    css.includes('margin-left: 18px;   /* 与 brand→链接组同一节奏') &&
    /\.nav-links \{[^}]*gap: 13px;/s.test(css) &&
    /\.nav-links \{[^}]*margin-left: 18px;/s.test(css), true);
check('顶栏菜单三项 onclick 调 setNotesView 并 return false（不跳转）',
    /data-view="full" onclick="setNotesView\('full'\); return false;"/.test(notesHtml) &&
    /data-view="key" onclick="setNotesView\('key'\); return false;"/.test(notesHtml) &&
    /data-view="fig" onclick="setNotesView\('fig'\); return false;"/.test(notesHtml), true);
check('顶栏下拉复用 .nav-dd/.nav-dd-menu 类（与知识点下拉同形态）',
    /<details class="nav-dd" id="navViewDd">[\s\S]*class="nav-dd-menu" id="navViewMenu"/.test(notesHtml), true);
vw.document.getElementById('navViewDd').open = true;
vw.__set('key');
check('切要点：顶栏摘要显示「要点」', vw.document.getElementById('navViewState').textContent, '要点');
check('切要点：顶栏菜单 active 仅要点',
    [...vw.document.querySelectorAll('#navViewMenu a')].map(a => a.classList.contains('active')),
    [false, true, false]);
check('选完顶栏下拉自动收起', vw.document.getElementById('navViewDd').open, false);
vw.document.getElementById('navViewDd').open = true;
vw.__set('fig');
check('切只看图：顶栏摘要同步为「只看图」', vw.document.getElementById('navViewState').textContent, '只看图');
check('顶栏菜单 active 跟随只看图',
    [...vw.document.querySelectorAll('#navViewMenu a')].map(a => a.classList.contains('active')),
    [false, false, true]);
check('顶栏菜单项 click 也能切换（委托到同一函数）',
    (vw.document.querySelector('#navViewMenu a[data-view="key"]').click(),
     vw.document.getElementById('notesContent').getAttribute('data-view')), 'key');

// ---------- 5. figs.html 静态 ----------
check('图集页引入 common.js（img.fig-img 委托放大）', figsHtml.includes('<script src="js/common.js"></script>'), true);
check('图集页引入 lightbox.js（缩放/拖拽）', figsHtml.includes('<script src="js/lightbox.js"></script>'), true);
check('图集页四科数据都取', figsHtml.includes("fetch('data/notes/' + sub.id + '_notes.json')"), true);
check('卡片图片带 fig-img 类（交给全站放大委托）', figsHtml.includes('<img class="fig-img" loading="lazy"'), true);
check('内联结构图转 data SVG', figsHtml.includes('data:image/svg+xml;charset=utf-8,'), true);
check('内联结构图自带着色样式', figsHtml.includes('.struct-svg rect.node'), true);
check('图题取紧邻前一段 <p>', figsHtml.includes('function captionBefore'), true);
check('两类图按 html 出现顺序合并', figsHtml.includes('out.sort((a, b) => a.i - b.i);'), true);
check('跳回讲义带 subject + goto 编号', /notes\.html\?subject=' \+ s\.subj \+\s*'&goto='/.test(figsHtml), true);
check('有科目 tab 与搜索框', ['id="figsTabs"', 'id="figsSearch"', 'id="figsStat"'].every(x => figsHtml.includes(x)), true);
check('空结果提示只插一次', figsHtml.includes("body.querySelectorAll('#figsNoHit').forEach(n => n.remove());"), true);
check('SW APP_PRECACHE 收录 figs.html',
    sw.slice(0, sw.indexOf('const DATA_PRECACHE')).includes("'figs.html',"), true);
check('SW DATA_PRECACHE 已含四科讲义（图集离线可用）',
    ['co', 'os', 'ds', 'cn'].every(s => sw.includes("'data/notes/" + s + "_notes.json',")), true);
check('首页每个科目卡片都有图集入口', indexHtml.includes('href="figs.html?subject=${key}"'), true);
// 图集页密度优化：同一章的小节并排，清洗被当成图题的整段正文
check('章内小节包进并排网格容器', figsHtml.includes('<div class="figs-secs">'), true);
check('并排网格用 auto-fill（隐藏某节自动补位）',
    /\.figs-secs \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(272px/s.test(figsHtml), true);
check('窄屏回落单列', /\.figs-secs \{ grid-template-columns: 1fr/s.test(figsHtml), true);
check('缩略图高度随图片比例走，不再固定 176px 方框',
    /\.figs-thumb \{ min-height: 148px/s.test(figsHtml) && !figsHtml.includes('height: 176px'), true);
check('图题只认 ≤46 字短标题（长正文不再被截成图题）',
    figsHtml.includes('t.length > 46') && !figsHtml.includes('t.length > 170'), true);
check('剥掉「图X：/示意图：/表X：」纯前缀并过滤泛词',
    figsHtml.includes('示意图\\s*[：:]?') && figsHtml.includes('/^(示意图|如下|见图|图示|配图|图|表|说明)$/'), true);
check('无图题时回退「小节名 · 配图 N」',
    /function labelOf\(it, secName, idx\)/.test(figsHtml) && figsHtml.includes("const tail = ' · 配图 '"), true);
// 要点视图可读性：重点词做成清单块 + 表格压紧
check('要点视图把含 <b> 的段落做成清单块',
    css.includes('> :is(p, li):not([data-fig="1"]):has(b, strong) {'), true);
check('要点块有暗色配色', /\.dark #notesContent\[data-view="key"\][^{]*:has\(b, strong\)/s.test(css), true);
check('要点视图压紧表格行距',
    css.includes('#notesContent[data-view="key"] :is(.notes-body, .notes-sub-body) table { font-size: .8rem; }'), true);

// ---------- 6. figs.html 真实渲染（jsdom + 本地 fetch stub） ----------
async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (fn()) return true;
        await new Promise(r => setTimeout(r, 20));
    }
    return false;
}
async function main() {
    const dom = new JSDOM(figsHtml, {
        url: 'https://x.test/figs.html?subject=os', runScripts: 'outside-only'
    });
    const w = dom.window;
    w.fetch = u => Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(read('pwa/' + u)))
    });
    const scripts = [...figsHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    check('图集页有可独立执行的内联脚本', scripts.length >= 2, true);
    w.eval(scripts[scripts.length - 1]);
    const ready = await waitFor(() => w.document.querySelectorAll('.figs-card').length > 0, 5000);
    check('四科 JSON 加载完成并渲染出卡片', ready, true);
    const doc = w.document;
    const cards = [...doc.querySelectorAll('.figs-card')];
    check('卡片精确 254 张（226 独立 SVG + 28 内联结构图）', cards.length, 254);
    check('独立 SVG 226 张', cards.filter(c => /^img\//.test(c.querySelector('img').getAttribute('src'))).length, 226);
    const inlineCards = cards.filter(c => c.querySelector('img').getAttribute('src').startsWith('data:image/svg+xml'));
    check('内联结构图 28 张（data: SVG，含 boot/ctxsw 多类 figure）', inlineCards.length, 28);
    check('内联 data URL 解码后根元素是 <svg>（不能带 <figure> 外壳，否则破图）',
        inlineCards.every(c => {
            const s = decodeURIComponent(c.querySelector('img').getAttribute('src').split(',')[1] || '');
            return s.startsWith('<svg') && !s.includes('<figure') && s.includes('</svg>');
        }), true);
    check('四个科目分组齐全', [...doc.querySelectorAll('.figs-subj')].map(x => x.dataset.subj).join(','), 'ds,co,os,cn');
    check('每个科目分组有章有节',
        doc.querySelectorAll('.figs-chapter').length > 0 && doc.querySelectorAll('.figs-sec').length > 0, true);
    check('跳回讲义链接全部带 goto 编号',
        [...doc.querySelectorAll('.figs-sec-head a')].every(a =>
            /notes\.html\?subject=(ds|co|os|cn)&goto=/.test(a.getAttribute('href')) &&
            /^\d+(\.\d+)*$/.test(decodeURIComponent(a.getAttribute('href').split('goto=')[1]))), true);
    check('每张卡片都有非空图题', cards.every(c => (c.querySelector('figcaption').textContent || '').trim().length > 0), true);
    check('图题统一截到 48 字以内（卡片不被长说明撑爆）',
        cards.every(c => c.querySelector('figcaption').textContent.trim().length <= 48), true);
    check('每个章都有并排网格容器', doc.querySelectorAll('.figs-secs').length,
        doc.querySelectorAll('.figs-chapter').length);
    check('图题不再残留「图：」前缀或「示意图：」这类泛词',
        cards.every(c => !/^(图[：:]|示意图[：:]?|表[：:]|说明[：:]?)/.test(c.querySelector('figcaption').textContent.trim())), true);
    check('无图题的卡片回退成「小节名 · 配图 N」而非裸文件名',
        cards.filter(c => c.querySelector('figcaption').textContent.includes('· 配图 ')).length > 0 &&
        cards.every(c => !/^配图 · [a-z0-9_]+$/i.test(c.querySelector('figcaption').textContent.trim())), true);
    check('figcaption 的 title 保留完整图题',
        cards.filter(c => c.querySelector('figcaption').textContent.includes('…'))
            .every(c => c.querySelector('figcaption').getAttribute('title').length >=
                c.querySelector('figcaption').textContent.length), true);
    check('初始 ?subject=os 只显示 OS 一组',
        [...doc.querySelectorAll('.figs-subj')].filter(x => !x.hidden).map(x => x.dataset.subj).join(','), 'os');
    check('统计文案带总数', doc.getElementById('figsStat').textContent.includes('254'), true);
    check('筛选 OS 时「当前显示」只数可见卡片（92，不是全库 254）',
        /当前显示 92 \/ 254 张/.test(doc.getElementById('figsStat').textContent), true);

    // 切到「全部」
    doc.querySelector('button[data-subj="all"]').click();
    check('点「全部」后四组都显示', [...doc.querySelectorAll('.figs-subj')].filter(x => !x.hidden).length, 4);
    check('切全部后 localStorage 记住', w.localStorage.getItem('figs_subject_filter'), 'all');

    // 搜索
    const search = doc.getElementById('figsSearch');
    search.value = 'DMA';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    const shown = [...doc.querySelectorAll('.figs-card:not([hidden])')];
    check('搜 DMA 有命中', shown.length > 0, true);
    check('搜 DMA 命中都含关键词', shown.every(c => c.dataset.search.includes('dma')), true);
    check('搜索后统计文案显示 当前显示', doc.getElementById('figsStat').textContent.includes('当前显示'), true);

    search.value = '这个关键词一定不存在zzz';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    check('无结果时提示出现且只有一个', doc.querySelectorAll('#figsNoHit').length, 1);
    check('无结果时所有卡片都隐藏', doc.querySelectorAll('.figs-card:not([hidden])').length, 0);
    search.value = '';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    check('清空搜索后提示移除', doc.querySelectorAll('#figsNoHit').length, 0);
    check('清空搜索后 254 张全回来', doc.querySelectorAll('.figs-card:not([hidden])').length, 254);

    console.log((fail ? 'RED' : 'GREEN') + ' _test_notes_view_gallery: ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
