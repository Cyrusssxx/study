// ==================== 每日一题（首页） ====================
// 规则：每天从四门（数据结构/操作系统/计网/计组）的【收藏】里各抽 1 题，共 4 题；
//      抽题优先取「从未抽过」的收藏题，一门抽完一轮后再从「最久未抽」的题里重新循环；
//      每天首次进入首页生成当天结果并归档到历史，历史保留最近 120 天，可随时回看。
// 存储（localStorage）：
//   daily_pick_v1    —— 今日结果 {date, picks:{ds|os|cn|co: {id,content,chapter,section}}}
//   daily_history_v1 —— 历史数组 [{date, picks}]（最近在前）
//   daily_seen_v1    —— 已抽过记录 {subject: {qid: 上次抽到的日期}}，用于去重与"最久未抽"排序
(function () {
    const TODAY_KEY = 'daily_pick_v1';
    const HISTORY_KEY = 'daily_history_v1';
    const SEEN_KEY = 'daily_seen_v1';
    const SUBJ_ORDER = ['ds', 'os', 'cn', 'co'];
    const HISTORY_LIMIT = 120;

    function todayStr(d) {
        const t = d || new Date();
        const p = n => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }
    function weekdayCn(d) { return '周' + '日一二三四五六'[d.getDay()]; }
    function readJson(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; }
    }
    function writeJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }
    function subName(k) {
        return (typeof SUBJECTS !== 'undefined' && SUBJECTS[k] && SUBJECTS[k].name) || k;
    }
    // 题干摘要：去标签/实体后截断，仅用于列表展示
    function snippet(html, n) {
        const t = String(html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&[a-z]+;|&#\d+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return t.length > (n || 60) ? t.slice(0, n || 60) + '…' : t;
    }

    // 抽 1 题：优先未抽过的；全部抽过则取"最久未抽"（最早日期批次内随机）
    function pickOne(favs, seenSub) {
        if (!favs || !favs.length) return null;
        const seen = seenSub || {};
        const fresh = favs.filter(f => !seen[f.id]);
        if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
        const arr = favs.slice().sort((a, b) => String(seen[a.id] || '').localeCompare(String(seen[b.id] || '')));
        const earliest = seen[arr[0].id] || '';
        const oldest = arr.filter(f => (seen[f.id] || '') === earliest);
        return oldest[Math.floor(Math.random() * oldest.length)];
    }

    async function loadFavs(sub) {
        try {
            const resp = await api('/api/favorites?subject=' + encodeURIComponent(sub));
            const data = await resp.json();
            return (data && data.favorites) || [];
        } catch (e) { return []; }
    }

    function toPick(f) {
        return { id: f.id, content: snippet(f.content, 56), chapter: f.chapter || '', section: f.section || '' };
    }

    // 生成今日抽题（已是今天则直接复用）；返回 {date, picks}
    async function rollToday() {
        const today = todayStr();
        const cur = readJson(TODAY_KEY, null);
        if (cur && cur.date === today && cur.picks) return cur;

        // 上一天的结果归档进历史
        if (cur && cur.date && cur.picks) {
            const hist = readJson(HISTORY_KEY, []);
            if (!hist.some(h => h.date === cur.date)) {
                hist.unshift({ date: cur.date, picks: cur.picks });
                writeJson(HISTORY_KEY, hist.slice(0, HISTORY_LIMIT));
            }
        }

        const seen = readJson(SEEN_KEY, {});
        const picks = {};
        for (const sub of SUBJ_ORDER) {
            const favs = await loadFavs(sub);
            const f = pickOne(favs, seen[sub]);
            if (!f) continue;
            picks[sub] = toPick(f);
            seen[sub] = seen[sub] || {};
            seen[sub][f.id] = today;
        }
        const out = { date: today, picks };
        writeJson(TODAY_KEY, out);
        writeJson(SEEN_KEY, seen);
        return out;
    }

    function quizLink(sub, qid) {
        return `quiz.html?subject=${sub}&mode=favorite&goto=${encodeURIComponent(qid)}`;
    }

    function renderDaily(data) {
        const box = document.getElementById('dailySection');
        if (!box) return;
        const d = data || readJson(TODAY_KEY, null);
        const picks = (d && d.picks) || {};
        const hasAny = Object.keys(picks).length > 0;
        const now = new Date();
        const items = SUBJ_ORDER.map(sub => {
            const p = picks[sub];
            if (!p) {
                return `<div class="daily-item daily-item-empty">
                    <span class="daily-subject">${subName(sub)}</span>
                    <div class="daily-q">暂无收藏题</div>
                    <a class="daily-link" href="quiz.html?subject=${sub}&mode=sequential">去刷题收藏 →</a>
                </div>`;
            }
            const meta = [p.chapter, p.section].filter(Boolean).join(' · ');
            return `<div class="daily-item">
                <span class="daily-subject">${subName(sub)}</span>
                <div class="daily-q">${p.content || '（题目）'}</div>
                ${meta ? `<div class="daily-meta">${meta}</div>` : ''}
                <a class="daily-link" href="${quizLink(sub, p.id)}" title="在收藏模式里打开这道题">去做 →</a>
            </div>`;
        }).join('');

        box.innerHTML = `
            <div class="daily-card">
                <div class="daily-head">
                    <h2 class="daily-title">📅 每日一题</h2>
                    <span class="daily-date">${d && d.date ? d.date : todayStr()} ${weekdayCn(now)}</span>
                    <button class="daily-hist-btn" onclick="showDailyHistory()" title="查看每天抽到的题">历史记录</button>
                </div>
                ${hasAny
                    ? `<div class="daily-grid">${items}</div>
                       <div class="daily-foot">每天从四门收藏里各抽 1 题，优先抽没抽过的</div>`
                    : `<div class="daily-empty">还没有收藏题，先去刷题收藏几道，明天这里就有每日一题了。</div>`}
            </div>`;
    }

    async function initDaily() {
        try {
            const data = await rollToday();
            renderDaily(data);
        } catch (e) { /* 抽题失败不影响首页其余内容 */ }
    }

    // ---------- 历史记录弹层 ----------
    function showDailyHistory() {
        const hist = readJson(HISTORY_KEY, []);
        const cur = readJson(TODAY_KEY, null);
        const all = (cur && cur.date) ? [{ date: cur.date, picks: cur.picks || {}, today: true }].concat(
            hist.filter(h => h.date !== cur.date)) : hist;
        const body = all.length ? all.map(day => `
            <div class="daily-hist-day">
                <div class="daily-hist-date">${day.date}${day.today ? ' · 今天' : ''}</div>
                <div class="daily-hist-list">
                    ${SUBJ_ORDER.map(sub => {
                        const p = day.picks && day.picks[sub];
                        return p
                            ? `<a class="daily-hist-item" href="${quizLink(sub, p.id)}" title="${(p.chapter || '') + (p.section ? ' · ' + p.section : '')}">
                                    <span class="daily-hist-sub">${subName(sub)}</span>
                                    <span class="daily-hist-q">${p.content || '（题目）'}</span>
                               </a>`
                            : `<span class="daily-hist-item muted"><span class="daily-hist-sub">${subName(sub)}</span><span class="daily-hist-q">未抽</span></span>`;
                    }).join('')}
                </div>
            </div>`).join('') : '<div class="daily-hist-empty">还没有历史记录，明天再来抽题吧。</div>';

        let ov = document.getElementById('dailyHistOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'dailyHistOverlay';
            ov.className = 'kb-overlay';
            ov.setAttribute('onclick', 'if(event.target===this)closeDailyHistory()');
            document.body.appendChild(ov);
        }
        ov.innerHTML = `
            <div class="kb-dialog daily-hist-dialog">
                <div class="kb-head">
                    <span>每日一题 · 历史记录</span>
                    <button class="kb-close" onclick="closeDailyHistory()" title="关闭">✕</button>
                </div>
                <div class="daily-hist-body">${body}</div>
                <div class="kb-actions">
                    <button class="btn btn-primary" onclick="closeDailyHistory()">关闭</button>
                </div>
            </div>`;
        ov.hidden = false;
    }

    function closeDailyHistory() {
        const ov = document.getElementById('dailyHistOverlay');
        if (ov) ov.hidden = true;
    }

    // 暴露给页面与测试
    window.initDaily = initDaily;
    window.showDailyHistory = showDailyHistory;
    window.closeDailyHistory = closeDailyHistory;
    window.DailyPick = { rollToday, pickOne, todayStr, renderDaily, snippet, KEYS: { TODAY_KEY, HISTORY_KEY, SEEN_KEY }, SUBJ_ORDER };
})();
