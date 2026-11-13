// 大题专项「真源 = zhenti 全量大题」回归测试（2026-11-13）
//
// 背景：dati.html 原先用 89 道王道章节截图题（data/dati.json），题目/答案与真题套卷页
// 对不上，做题记录和笔记也用了另一套 dati_* id。现改为 data/dati_zt.json —— 从
// data/zt/zt_YYYY.json 抽出的全部大题（2009-2026，126 题），id 与 zhenti.js buildFlat()
// 公式完全一致，笔记经 note_alias.json 归一到规范键 zt{年}_{题号}。
//
// 覆盖点：
//   A. 数据文件本身（题量 / id 公式 / 别名覆盖 / 迁移表 / HTML 题干答案 / SVG 引用）
//   B. 页面真源加载（题卡渲染 HTML 而非图片 / 答案面板 / 折叠控制条 / 常驻题号栏）
//   C. 与 zhenti 同源（笔记写规范键、收藏/标记用同一 iid）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_dati_zt.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PWA = path.join(ROOT, 'pwa');

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
}
function ok(name, cond) { check(name, !!cond, true); }

const readJson = p => JSON.parse(fs.readFileSync(path.join(PWA, p), 'utf8'));
const ZT = readJson('data/dati_zt.json');
const ALIAS = readJson('data/note_alias.json');
const OLD = readJson('data/dati.json');
const IDX = readJson('data/zt/index.json');
const HTML = fs.readFileSync(path.join(PWA, 'dati.html'), 'utf8');
const SW = fs.readFileSync(path.join(PWA, 'sw.js'), 'utf8');

const allQ = () => {
    const out = [];
    for (const s of ZT.subjects) for (const c of s.chapters) for (const sec of c.sections)
        for (const q of sec.questions) out.push(q);
    return out;
};
const QS = allQ();

console.log('=== A. dati_zt.json 数据一致性 ===');
check('题量 = 126（18 年 × 7 大题）', QS.length, 126);
check('输出 total 与题目数一致', ZT.total, QS.length);
check('四科齐全', ZT.subjects.map(s => s.key), ['ds', 'co', 'os', 'cn']);
check('年份范围', [Math.min(...QS.map(q => q.year)), Math.max(...QS.map(q => q.year))],
    [Math.min(...IDX.years), Math.max(...IDX.years)]);
check('题目 id 全局唯一', new Set(QS.map(q => q.id)).size, QS.length);
ok('题干/答案均为 HTML 字符串（不再是截图名数组）',
    QS.every(q => typeof q.q === 'string' && typeof q.a === 'string'));
ok('题干/答案全部非空', QS.every(q => q.q.trim() && q.a.trim()));
check('空 qid / 空 num 的题数', QS.filter(q => !q.id || !q.num).length, 0);

// id 公式必须与 zhenti.js buildFlat() 一致：it.qid || sid + '_zt' + year + '_' + i
{
    const bad = [];
    const seen = new Set();
    for (const y of IDX.years) {
        const paper = readJson(`data/zt/zt_${y}.json`);
        for (const it of paper.items) {
            if (it.t === 1) continue;
            const iid = it.qid || (it.sid + '_zt' + y + '_' + it.i);
            seen.add(iid);
            const hit = QS.find(q => q.id === iid);
            if (!hit) { bad.push(iid); continue; }
            if (hit.year !== y || hit.num !== it.i || hit.sid !== it.sid) bad.push(iid + '(meta)');
            // 题干/答案与真题卷逐字一致（打卡表版本除外）
            if (hit.variant === 'zt' && (hit.q !== (it.q || '') || hit.a !== (it.an || ''))) bad.push(iid + '(html)');
        }
    }
    check('zhenti 全量大题 id 均存在于 dati_zt，且元数据/HTML 同源', bad.slice(0, 5), []);
    check('无多余 id', QS.filter(q => !seen.has(q.id)).length, 0);
}
check('126 个 id 全部被 note_alias 覆盖', QS.filter(q => !ALIAS[q.id]).length, 0);
ok('别名值都是规范键 zt{年}_{题号}', QS.every(q => /^zt\d{4}_\d+$/.test(ALIAS[q.id])));
ok('每道题都声明 real=true', QS.every(q => q.real === true));
ok('分值字段齐全', QS.every(q => typeof q.score === 'number' && q.score > 0));
ok('label 为「年份后两位-卷面题号」', QS.every(q => q.label === `${String(q.year).slice(-2)}-${q.num}`));
{
    // 外置 SVG 引用必须真实存在（否则页面显示「图加载失败」）
    const names = [...new Set(QS.flatMap(q => q.svgs || []))];
    const missing = names.filter(n => !fs.existsSync(path.join(PWA, 'data/zt_svg', n + '.svg')));
    console.log(`     外置 SVG 引用 ${names.length} 个`);
    check('SVG 引用 0 缺失', missing.slice(0, 5), []);
    const declared = [...new Set([...HTML.matchAll(/data\/zt_svg\/|zt-svgholder/g)].map(m => m[0]))];
    ok('页面实现了 SVG 占位注入', HTML.includes('injectDatiSvgs') && HTML.includes('zt-svgholder[data-svg]'));
}
{
    // 打卡表版本（DS 算法题）必须用教材原图 + 讲义解法，与 zhenti dakaBigCard 同口径
    const daka = QS.filter(q => q.variant === 'daka');
    check('打卡表版本覆盖 18 道 DS 算法题', daka.length, 18);
    ok('打卡表版本全部属于 DS', daka.every(q => q.sid === 'ds'));
    // 打卡表有教材原图的题才带 daka_figs；2024/2025/2026-41 三题是纯讲义文字 + 代码块
    ok('有教材原图的题，题干挂着 daka_figs',
        daka.filter(q => q.q.includes('data/daka_figs/')).length >= 15);
    ok('无教材原图的题，题干仍是讲义正文（含代码块或题号）',
        daka.filter(q => !q.q.includes('data/daka_figs/'))
            .every(q => q.q.includes('【') && q.q.length > 80));
    ok('打卡表版本答案含讲义解法', daka.every(q => q.a.includes('sol-wrap') || q.a.includes('code-brute')));
    ok('打卡表版本题干不是真题卷原题（已被讲义替代）',
        daka.every(q => !q.q.startsWith('<p>')));
}
{
    // 迁移表：旧 dati_* id → zhenti iid，必须覆盖备份里已有的已练记录
    const oldIds = new Set();
    for (const s of OLD.subjects) for (const c of s.chapters) for (const sec of c.sections)
        for (const q of sec.questions) oldIds.add(q.id);
    const legacy = ZT.legacy || {};
    ok('迁移表非空', Object.keys(legacy).length > 0);
    ok('迁移表所有旧 id 都存在于旧 dati.json', Object.keys(legacy).every(k => oldIds.has(k)));
    ok('迁移表所有新 id 都在题目集合中', Object.values(legacy).every(v => QS.some(q => q.id === v)));
    console.log(`     迁移表 ${Object.keys(legacy).length} 项`);
}
{
    // 真实做题备份：真题页已存的收藏/不熟/不会必须能被新 id 直接读到，
    // 笔记必须落在规范键上（两页互通）。备份文件不在仓库里，缺失则跳过不算失败。
    const backup = 'D:/cjx/下载/download/408quiz-backup-20261112.json';
    if (fs.existsSync(backup)) {
        const b = JSON.parse(fs.readFileSync(backup, 'utf8'));
        const ids = new Set(QS.map(q => q.id));
        const specs = new Set(QS.map(q => ALIAS[q.id]));
        const ztRe = /zt\d{4}_\d+/;
        for (const st of ['favorites', 'unfamiliar', 'dontknow']) {
            const rows = (b[st] || []).filter(r => ztRe.test(String(r.question_id || '')));
            const miss = rows.filter(r => !ids.has(r.question_id));
            console.log(`     备份 ${st}: ${rows.length} 条真题记录`);
            check(`备份 ${st} 全部命中新 id`, miss.map(r => r.question_id), []);
        }
        const nrows = (b.notes || []).filter(r => ztRe.test(String(r.question_id || '')));
        const badNotes = nrows.filter(r => !specs.has(r.question_id) && !ids.has(r.question_id));
        check('备份真题笔记全部落在规范键或本地 iid（可双向补齐）', badNotes.map(r => r.question_id), []);
        const done = JSON.parse((b.local || {}).datiDone || '[]');
        check('备份已练记录全部可迁移', done.filter(k => !ZT.legacy[k]), []);
    } else {
        console.log('     （未找到做题备份，跳过真实数据命中校验）');
    }
}
{
    // 序列化：本文件是构建产物（LF + 尾换行），不要被手工改成 CRLF
    const buf = fs.readFileSync(path.join(PWA, 'data/dati_zt.json'));
    check('构建产物为 LF（无 CRLF）', buf.includes(Buffer.from('\r\n')), false);
    check('构建产物有尾换行', buf[buf.length - 1], 10);
}

console.log('\n=== B. dati.html 真源接入与 UI ===');
ok('删掉了「📝 大题专项」说明整块', !HTML.includes('📝 大题专项') && !HTML.includes('统考综合应用题真题截图'));
ok('排序/筛选条包成可折叠 details', /<details class="dati-tools" id="datiTools">/.test(HTML) && HTML.includes('id="datiFilters"'));
ok('折叠状态持久化到 datiBarCollapsed', HTML.includes("localStorage.getItem('datiBarCollapsed')") && HTML.includes("localStorage.setItem('datiBarCollapsed'"));
ok('默认折叠（只有显式 0 才展开）', /d\.open = collapsed === '0'/.test(HTML));
ok('真源优先取 data/dati_zt.json', /fetch\('data\/dati_zt\.json'\)/.test(HTML));
ok('保留旧 dati.json 离线回退', /fetch\('data\/dati\.json'\)/.test(HTML));
ok('题卡兼容 HTML 字符串与旧截图数组', HTML.includes('function questionHtml') && HTML.includes('function answerHtml') && HTML.includes('Array.isArray(q.q)'));
ok('题面用 question-content 排版（与真题页同源）', /dati-qbody question-content/.test(HTML));
ok('答案用 explanation-title / explanation-body', /class="explanation-title"/.test(HTML) && /class="explanation-body"/.test(HTML));
ok('题号栏常驻窄条（不再默认隐藏抽屉）', /\.dati-nav:not\(\.open\) \.dati-nav-body \{ display: none; \}/.test(HTML) && HTML.includes('dati-nav-mini'));
ok('窄条按年份横排，一屏看全', HTML.includes('dati-nav-mini-row') && HTML.includes('byYear'));
ok('窄条题号用年份区分，避免 45/46 重复', HTML.includes('dati-nav-mini-y') && HTML.includes('q.label || q.num'));
ok('宽版保留完整 num-group-title（既有测试依赖）', HTML.includes('num-group-title'));
ok('桌面端题目区给常驻窄条让位', /#datiRoot \{ margin-right: 96px; \}/.test(HTML));
ok('窄屏不压题干，回退浮钮宽版', /\.dati-nav:not\(\.open\) \{ display: none; \}/.test(HTML));
ok('切题后自动收起宽版并定位当前题', HTML.includes('setNav(false)') && HTML.includes('dati-nav-mini-btn.current'));
ok('笔记输入防抖自动保存', HTML.includes('function onNoteInput') && HTML.includes('noteTimer[qid] = setTimeout') && HTML.includes("addEventListener('input', () => onNoteInput(el))"));
ok('切页/切题前 flush 未落库笔记', HTML.includes('flushDatiNote') && HTML.includes("visibilitychange"));

console.log('\n=== C. 与 zhenti 做题记录 / 笔记同源 ===');
ok('收藏不再按 dati_ 前缀过滤', /favSet = new Set\(rows\.map\(r => r\.question_id\)\)/.test(HTML));
ok('不熟/不会不再按 dati_ 前缀过滤', /unfamSet = new Set\(u\.map\(r => r\.question_id\)\)/.test(HTML));
ok('笔记真键 = noteKeyOf(qid) 规范键', HTML.includes('noteKeyOf(qid)') && HTML.includes('loadNoteAlias'));
ok('迁移旧 favorites/unfamiliar/dontknow/notes', HTML.includes('migrateLegacyStores') &&
    /\['favorites', 'unfamiliar', 'dontknow', 'notes'\]/.test(HTML));
ok('迁移本地已练/展开/上次所在题', HTML.includes('migrateLegacyLocal') && HTML.includes('datiDone'));
ok('旧记录只补写不删除（备份优先）', !/dbDelete\([^)]*oldId/.test(HTML));
ok('收藏/标记写 subject 科目（与 zhenti 一致）', /subject: activeSubject/.test(HTML) || /subject: subKey/.test(HTML));
{
    // 笔记规范键与 zhenti.js 的 noteKeyOf 口径一致
    const zs = fs.readFileSync(path.join(PWA, 'js/zhenti.js'), 'utf8');
    ok('zhenti.js 也用 note_alias 归一笔记键', zs.includes("const noteKeyOf = k => NOTE_ALIAS[k] || k"));
    const ztAlias = zs.includes("fetch('data/note_alias.json')");
    ok('两页加载同一份 note_alias.json', ztAlias && HTML.includes("fetch('data/note_alias.json')"));
}

console.log('\n=== D. SW 缓存归口 ===');
ok('dati_zt.json 进 LAZY_PREFIXES（828K 不占首屏）', /'data\/dati_zt\.json'/.test(SW));
ok('zt_svg / daka_figs / zt 都在懒加载层',
    SW.includes("'data/zt_svg/'") && SW.includes("'data/daka_figs/'") && SW.includes("'data/zt/'"));
ok('旧 dati.json 仍在 DATA_PRECACHE 供回退', /'data\/dati\.json'/.test(SW));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
