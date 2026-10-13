# -*- coding: utf-8 -*-
"""考研冲刺计划页生成管线 v2（2026-10-13 全面重排）

背景：用户改主意 —— 不做 408 真题套卷，改为
  阶段A：先把数据结构打卡表的大题写完（剩 53 张，一天 3-4 张）
  阶段B：一天一章一个科目的「选择题错题」复习（一科推完换下一科）+ 三科（OS/CO/CN）大题复习
  阶段C：考前收口
英语阅读改为「同一年份连排、一天一篇」，每天加一篇完型/新题型（英一小标题通用）。

数据来源（全部只读，不改数据）：
  - 错题分布：用户备份 D:/cjx/下载/download/408quiz-backup-20261013.json
  - 三科大题：pwa/data/dati.json（OS/CO/CN）
  - 打卡表剩余：pwa/data/ds_daka.json 减去备份里 done=1 的卡
外壳：archive/plan_source.html（只取 <style> 与骨架，正文全部重生成）
输出：① E:/Desktop/考研冲刺计划.html  ② pwa/plan.html（带返回首页）
幂等：可重复执行。
"""
import io
import os
import re
import json
import datetime
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA = os.path.join(ROOT, 'pwa')
SRC = os.path.join(ROOT, 'archive', 'plan_source.html')
DESKTOP = r'E:\Desktop\考研冲刺计划.html'
PWA_OUT = os.path.join(PWA, 'plan.html')
BACKUP = r'D:\cjx\下载\download\408quiz-backup-20261013.json'

SUBJ_SHORT = {'os': 'OS', 'co': 'CO', 'ds': 'DS', 'cn': 'CN'}
WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

D_PHASE_A_END = datetime.date(2026, 10, 29)   # 打卡表大题最后一天
D_PHASE_B_END = datetime.date(2026, 12, 12)   # 错题+三科大题最后一天
D_R1_END = datetime.date(2026, 11, 20)        # 错题一刷最后一天

# ============================ 1. 读数据 ============================
BK = json.load(io.open(BACKUP, encoding='utf-8'))

chapters = {}      # sub -> [章名...]（按题库出现顺序）
chap_q = {}        # sub -> Counter(章名 -> 未解决错题数)
qid_index = {}
for sub in ['os', 'co', 'ds', 'cn']:
    d = json.load(io.open(os.path.join(PWA, 'data', '%s.json' % sub), encoding='utf-8'))
    seen = []
    for q in d['questions']:
        qid_index[q['id']] = (sub, q.get('chapter', ''))
        c = q.get('chapter', '')
        if c and c not in seen:
            seen.append(c)
    chapters[sub] = seen
    chap_q[sub] = collections.Counter()

for w in BK['wrong']:
    if w.get('is_resolved'):
        continue
    info = qid_index.get(w['question_id'])
    if info:
        chap_q[info[0]][info[1]] += 1

# 三科大题（OS/CO/CN）
dati = json.load(io.open(os.path.join(PWA, 'data', 'dati.json'), encoding='utf-8'))
big_ch = {}   # sub -> [(章名, 题数)]
for s in dati['subjects']:
    lst = []
    for ch in s['chapters']:
        n = sum(len(sec['questions']) for sec in ch['sections'])
        if n:
            lst.append((ch['name'], n))
    big_ch[s['key']] = lst

# 打卡表剩余卡片
daka = json.load(io.open(os.path.join(PWA, 'data', 'ds_daka.json'), encoding='utf-8'))['questions']
done_ids = set(x['question_id'] for x in BK['daka'] if x.get('done'))
PR_RANK = {'必做': 0, '高优先级': 1, '中优先级': 2, '基本功': 3, '低优先级': 4}
MOD_RANK = {'顺序表': 0, '链表': 1, '树': 2, '图': 3, '真题': 4}


def mod_rank(m):
    for k, v in MOD_RANK.items():
        if k in (m or ''):
            return v
    return 9


rem_daka = [q for q in daka if q['id'] not in done_ids]
rem_daka.sort(key=lambda q: (PR_RANK.get(q['priority_label'], 9), mod_rank(q['module']), q['id']))
N_DAKA = len(rem_daka)
N_WRONG = sum(sum(c.values()) for c in chap_q.values())
N_BIG = sum(n for lst in big_ch.values() for _, n in lst)
# ============================ 2. 队列 ============================
# —— 英语 ——
READ_ER = [  # 英二低正确率篇目（沿用旧计划挑出的 17 篇）
    ('2011', ['T4']), ('2012', ['T4']), ('2014', ['T2', 'T4']), ('2015', ['T1', 'T2', 'T3']),
    ('2016', ['T3']), ('2017', ['T3', 'T4']), ('2018', ['T3']), ('2019', ['T1', 'T3']),
    ('2020', ['T1', 'T3']), ('2021', ['T3']),
]
READ_Y1 = ['2011', '2012', '2016', '2018', '2019', '2020', '2022', '2024']
N_READ_ER = sum(len(ts) for _, ts in READ_ER)
N_READ_Y1 = len(READ_Y1) * 4
read_queue = [('', y, t) for y, ts in READ_ER for t in ts] + \
             [('英一', y, t) for y in READ_Y1 for t in ['T1', 'T2', 'T3', 'T4']]
cloze_queue = [('', str(y)) for y in range(2010, 2027)] + \
              [('英一', y) for y in ['2007', '2016', '2020', '2021']]
newt_queue = [('', str(y)) for y in range(2010, 2027)]
trans_queue = []
for y in list(range(2015, 2027)) + list(range(2010, 2015)):
    trans_queue.append('译 %d（第 1–3 句）' % y)
    trans_queue.append('译 %d（第 4–5 句）' % y)
SMALL_YEARS = [str(y) for y in range(2010, 2027)]              # 小作文 17 篇
BIG_YEARS = [str(y) for y in range(2010, 2027) if y != 2012]   # 大作文 16 篇（2012 放弃）

# ============================ 3. 408 选择题错题：按章分组 ============================
# (科目, [章序号...], 备注)  —— 顺序即推进顺序；同组多章＝当天连做
T1_GROUPS = [
    ('os', [0], ''), ('os', [1], '前 34 题'), ('os', [1], '后 34 题'),
    ('os', [2], ''), ('os', [3], ''), ('os', [4], ''),
    ('co', [0], ''), ('co', [1], ''), ('co', [2], ''),
    ('co', [3], ''), ('co', [4], ''), ('co', [5, 6], ''),
    ('ds', [0, 1, 2], ''), ('ds', [3, 4, 5], ''), ('ds', [6, 7], ''),
    ('cn', [0, 1], ''), ('cn', [2], '前 30 题'), ('cn', [2], '后 30 题'),
    ('cn', [3], '前 28 题'), ('cn', [3], '后 27 题'), ('cn', [4], ''), ('cn', [5], ''),
]


def t1_day_label(sub, idxs, extra):
    names = []
    for i in idxs:
        ch = chapters[sub][i]
        names.append(re.sub(r'^第\d+章\s*', '', ch))
    m = re.search(r'(\d+)\s*题', extra or '')
    if m:                       # 拆天：以 extra 里的题数为准
        cnt = int(m.group(1))
    else:
        cnt = sum(chap_q[sub][chapters[sub][i]] for i in idxs)
    lab = '＋'.join(names)
    if extra:
        lab += '（%s）' % extra
    return cnt, '%s %s' % (SUBJ_SHORT[sub], lab)


# ============================ 4. 三科大题：按 ~6 题/天 摊 ============================
big_items = []   # (sub, 章名, 题内序号)
for sub in ['os', 'co', 'cn']:
    for chname, n in big_ch[sub]:
        for i in range(n):
            big_items.append((sub, chname, i + 1))
DAO_B_DAYS = 44      # 10/30 – 12/12
base = N_BIG // DAO_B_DAYS
extra = N_BIG - base * DAO_B_DAYS
big_days = []
pos = 0
for i in range(DAO_B_DAYS):
    k = base + (1 if i < extra else 0)
    chunk = big_items[pos:pos + k]
    pos += k
    # 归并成「章：起–止」
    parts = []
    for sub, chname, no in chunk:
        if parts and parts[-1][0] == sub and parts[-1][1] == chname:
            parts[-1][2].append(no)
        else:
            parts.append([sub, chname, [no]])
    segs = []
    for sub, chname, nos in parts:
        short = re.sub(r'^第\d+章\s*', '', chname)
        rng = str(min(nos)) if min(nos) == max(nos) else '%d–%d' % (min(nos), max(nos))
        segs.append('%s %s %s' % (SUBJ_SHORT[sub], short, rng))
    big_days.append((len(chunk), ' ／ '.join(segs)))


# ============================ 5. 逐日排 ============================
START = datetime.date(2026, 10, 13)
END = datetime.date(2026, 12, 18)

# 打卡表分天：53 张 → 前 11 天 4 张、后 3 天 3 张（10/16–10/29）
daka_days = []
_i = 0
for k in [4] * 11 + [3] * 3:
    batch = rem_daka[_i:_i + k]
    _i += k
    if not batch:
        break
    grp = collections.Counter('%s·%s' % (q['priority_label'], re.sub(r'^基于“|”的算法训练$', '', q['module']))
                              for q in batch)
    daka_days.append((len(batch), _i - len(batch) + 1, _i,
                      '、'.join('%s×%d' % (g, n) for g, n in grp.items())))

rows = []
read_i = cloze_i = newt_i = trans_i = small_i = big_i = en_day = 0
for d in [START + datetime.timedelta(days=i) for i in range((END - START).days + 1)]:
    key = '%d/%d' % (d.month, d.day)
    wd = WD[d.weekday()]
    row = {'key': key, 'cls': '', 'cw': '—', 'cb': '—', 'math': '—', 'en': '—', 'nt': ''}

    # ---- 实习日志 10/13–10/15 ----
    if d <= datetime.date(2026, 10, 15):
        row['cls'] = 'it'
        row['cw'] = '实习日志'
        row['cb'] = '实习日志'
        row['math'] = '实习日志'
        row['nt'] = '实习日志（10/11–15，不排 408/数学）'
        rows.append(row)
        continue

    # ---- 英语（从 10/16 起每天） ----
    en_day += 1
    en = []
    if read_i < len(read_queue):
        pre, y, t = read_queue[read_i]
        read_i += 1
        en.append('阅读 %s%s·%s' % (pre, y, t))
    # 完型 / 新题型 交替（一侧用完则另一侧顶上）
    if en_day % 2 == 1 and cloze_i < len(cloze_queue):
        pre, y = cloze_queue[cloze_i]
        cloze_i += 1
        en.append('完型 %s%s' % (pre, y))
    elif newt_i < len(newt_queue):
        pre, y = newt_queue[newt_i]
        newt_i += 1
        en.append('新题型 %s%s' % (pre, y))
    elif cloze_i < len(cloze_queue):
        pre, y = cloze_queue[cloze_i]
        cloze_i += 1
        en.append('完型 %s%s' % (pre, y))
    if trans_i < len(trans_queue):
        en.append(trans_queue[trans_i])
        trans_i += 1
    # 作文：小 一三五（11/2 起），大 二四六（11/10 起）
    if d >= datetime.date(2026, 11, 2) and d.weekday() in (0, 2, 4) and small_i < len(SMALL_YEARS):
        en.append('作文·小 %s' % SMALL_YEARS[small_i])
        small_i += 1
    if d >= datetime.date(2026, 11, 10) and d.weekday() in (1, 3, 5) and big_i < len(BIG_YEARS):
        en.append('作文·大 %s' % BIG_YEARS[big_i])
        big_i += 1
    row['en'] = ' ＋ '.join(en) if en else '—'

    # ---- 阶段 A：10/16–10/29 打卡表大题 ----
    if d <= D_PHASE_A_END:
        k = (d - datetime.date(2026, 10, 16)).days
        if k < len(daka_days):
            n, a, b, grp = daka_days[k]
            row['cb'] = '打卡表 %d 题（第 %d–%d 张）<br><span class="s">%s</span>' % (n, a, b, grp)
        row['math'] = '30题'
        if d == datetime.date(2026, 10, 16):
            row['cls'] = 'ms'
            row['nt'] = '◆ 阶段 A 启动：先啃打卡表大题（必做 + 高优先级置顶）'
        elif d == D_PHASE_A_END:
            row['cls'] = 'ms'
            row['nt'] = '◆ 打卡表收官（%d 张）' % N_DAKA
        elif d.weekday() == 6:
            row['cls'] = 'wk'
            row['nt'] = '周结算：统计完成度，调下周节奏；晚上半休'
        rows.append(row)
        continue

    # ---- 阶段 B：10/30–12/12 ----
    if d <= D_PHASE_B_END:
        bi = (d - datetime.date(2026, 10, 30)).days
        # 错题
        if d <= D_R1_END:
            k = (d - datetime.date(2026, 10, 30)).days
            if k < len(T1_GROUPS):
                sub, idxs, extra = T1_GROUPS[k]
                cnt, lab = t1_day_label(sub, idxs, extra)
                row['cw'] = '错题 %d 题｜%s' % (cnt, lab)
        else:
            # 二刷：按科目分配（天数据一刷错题量），只重做仍错的
            R2 = [('os', 7), ('co', 6), ('ds', 3), ('cn', 6)]
            k = (d - datetime.date(2026, 11, 21)).days
            acc = 0
            for sub, nd in R2:
                if k < acc + nd:
                    row['cw'] = '错题二刷｜%s 全科（只重做一刷仍错的）' % SUBJ_SHORT[sub]
                    break
                acc += nd
        # 大题
        if bi < len(big_days):
            n, lab = big_days[bi]
            row['cb'] = '大题 %d 题｜%s' % (n, lab)
        # 数学
        mi = (d - datetime.date(2026, 10, 16)).days
        if mi < 25:
            row['math'] = '30题'
        else:
            row['math'] = '模拟卷 1 套（限时）' if mi % 2 else '错题回炉（≥2h）'

        # 备注 / 里程碑
        if d == datetime.date(2026, 10, 30):
            row['cls'] = 'ms'
            row['nt'] = '◆ 阶段 B 启动：错题一刷（按章）+ 三科大题 并行'
        elif d == datetime.date(2026, 11, 9):
            row['cls'] = 'ms'
            row['nt'] = '◆ 数学 747 题收官 → 转模拟卷 / 错题回炉'
        elif d == datetime.date(2026, 11, 2):
            row['cls'] = 'ms'
            row['nt'] = '◆ 小作文启动（每周一/三/五 各 1 篇）'
        elif d == datetime.date(2026, 11, 10):
            row['nt'] = '◆ 大作文启动（每周二/四/六 各 1 篇，2012 大作文放弃）'
        elif d == datetime.date(2026, 11, 21):
            row['cls'] = 'ms'
            row['nt'] = '◆ 错题一刷（26 章）完成 → 进入二刷'
        elif d.weekday() == 6:
            row['cls'] = 'wk'
            row['nt'] = '周结算：统计完成度，调下周节奏；晚上半休'
        elif d.weekday() == 5:
            row['nt'] = '下午留 1h 机动（补欠账 / 休息）'
        rows.append(row)
        continue

    # ---- 阶段 C：12/13–12/18 收口 ----
    row['cw'] = '错题总扫：高频错题 + 易错点清单'
    row['cb'] = '四科框架速览（笔记 / 导图）'
    row['math'] = '错题重做（一刷遗留）'
    if d == datetime.date(2026, 12, 13):
        row['cls'] = 'ms'
        row['nt'] = '◆ 收口期启动：只看错题与框架，不做新题'
    elif d == datetime.date(2026, 12, 18):
        row['cls'] = 'ms'
        row['nt'] = '考前 Day：易错点清单 + 早睡，不动笔'
    elif d == datetime.date(2026, 12, 16):
        row['cls'] = 'fx'
        row['cw'] = '机动'
        row['cb'] = '机动'
        row['math'] = '机动'
        row['nt'] = '机动日：应对突发 / 补欠账（没欠账就休息）'
    rows.append(row)

# ============================ 6. 渲染 ============================
CK_TD = ('<td class="ck"><input type="checkbox" class="sprint-ck" aria-label="完成打卡">'
         '<div class="mynote" contenteditable="true" data-ph="备注…"></div></td>')
CK_TH = '<th class="ck">✓ 打卡 / 我的备注</th>'
HEAD = ('<thead><tr><th>日期</th><th>408 · 选择题错题</th><th>408 · 大题</th>'
        '<th>数学</th><th>英语</th><th>备注</th>' + CK_TH + '</tr></thead>')

# 按周（周一起）分组
weeks = []
cur = None
for r in rows:
    dd = datetime.date(2026, int(r['key'].split('/')[0]), int(r['key'].split('/')[1]))
    wstart = dd - datetime.timedelta(days=dd.weekday())
    if cur is None or cur[0] != wstart:
        cur = (wstart, [])
        weeks.append(cur)
    cur[1].append(r)


def week_phase(rws):
    """按本周第一天定阶段色。"""
    k0 = rws[0]['key']
    d0 = datetime.date(2026, int(k0.split('/')[0]), int(k0.split('/')[1]))
    if d0 <= datetime.date(2026, 10, 15):
        return 'K', '实习期'
    if d0 <= datetime.date(2026, 10, 16):
        return 'A', '阶段A · 打卡表大题'
    if d0 <= D_PHASE_A_END:
        return 'A', '阶段A · 打卡表大题'
    if d0 <= D_PHASE_B_END:
        return 'B', '阶段B · 错题 + 三科大题'
    return 'C', '阶段C · 收口'


main = ['<main>']
for wi, (wstart, rws) in enumerate(weeks, 1):
    ph, tag = week_phase(rws)
    k0, k1 = rws[0]['key'], rws[-1]['key']
    rng = '第 %d 周 · %s – %s' % (wi, k0, k1)
    main.append('<section class="week ph-%s"><h3>%s<span class="tag">%s</span></h3><table>%s<tbody>'
                % (ph, rng, tag, HEAD))
    for r in rws:
        dt = datetime.date(2026, int(r['key'].split('/')[0]), int(r['key'].split('/')[1]))
        cls = (' class="%s"' % r['cls']) if r['cls'] else ''
        main.append(
            '<tr%s data-key="%s"><td class="dt"><b>%s</b><span>%s</span></td>'
            '<td class="cw">%s</td><td class="cb">%s</td>'
            '<td class="cma">%s</td><td class="cen">%s</td><td class="nt">%s</td>%s</tr>'
            % (cls, r['key'], r['key'], WD[dt.weekday()], r['cw'], r['cb'],
               r['math'], r['en'], r['nt'], CK_TD))
    main.append('</tbody></table></section>')
main.append('</main>')
MAIN = ''.join(main)

# ============================ 7. 外壳替换 ============================
src = io.open(SRC, encoding='utf-8').read()

src = re.sub(r'<title>.*?</title>', '<title>考研冲刺计划 · 10/13 – 12/18</title>', src, flags=re.S)
src = re.sub(
    r'<p class="sub">.*?</p>',
    '<p class="sub">2026-10-13 → 2026-12-18（67 天）· 初试 12/19–20 · 不出真题套卷：'
    '先清打卡表大题 → 再选择题错题 + 三科大题 · 实习日志 10/13–15</p>', src, flags=re.S)
src = re.sub(
    r'<div class="legend">[\s\S]*?</div>',
    '''<div class="legend">
      <span>阶段 A · 打卡表大题（10/16–10/29）</span>
      <span class="b">阶段 B · 选择题错题 + 三科大题（10/30–12/12）</span>
      <span class="c">阶段 C · 收口（12/13–12/18）</span>
      <span class="m">◆ 里程碑日：任务切换 / 收尾节点</span>
      <span class="it">实习日志 10/13–15</span>
      <span class="fx">机动日：12/16</span>
    </div>''', src, flags=re.S)
src = re.sub(
    r'<section class="guide">[\s\S]*?</section>',
    '''<section class="guide">
    <div class="gcard">
      <h4>每日时间模板（10/16 起生效）</h4>
      <ul>
        <li>上午 <b>8:00–10:30 数学</b>（对齐考场 8:30–11:30 的脑力段）</li>
        <li>下午 <b>14:00–17:00 408</b>（错题 + 大题两轨）</li>
        <li>晚上 <b>19:00–20:30 英语</b>；20:30 起复盘 + 机动</li>
        <li>打卡表大题按「必做 → 高优先级 → 中优先级 → 基本功」顺序推</li>
      </ul>
    </div>
    <div class="gcard">
      <h4>408 三步走</h4>
      <ul>
        <li><b>阶段 A（10/16–10/29）</b>：数据结构打卡表大题 %d 张，一天 3–4 张</li>
        <li><b>阶段 B（10/30–12/12）</b>：选择题错题一天一章（一科推完换下一科，按 OS→CO→DS→CN，共 %d 题）；
            同时三科大题（OS/CO/CN 共 %d 题）一天约 6 题</li>
        <li><b>阶段 C（12/13–12/18）</b>：只过错题与框架，不做新题</li>
      </ul>
    </div>
    <div class="gcard">
      <h4>英语节奏（一天：阅读 1 篇 + 完型/新题型 1 篇）</h4>
      <ul>
        <li>阅读<b>同一年份连排</b>、一天一篇：英二低正确率 %d 篇 + 英一指定 8 年 %d 篇</li>
        <li>完型 / 新题型交替：完型 英二 17 篇 + 英一 4 年；新题型 英二 17 篇（英一小标题通用）</li>
        <li>翻译细水长流：2015–2026，每年 5 句拆两天（3 句 + 2 句）</li>
        <li>作文：小作文 11/2 起（一/三/五，17 篇）；大作文 11/10 起（二/四/六，16 篇，2012 放弃）</li>
      </ul>
    </div>
  </section>''' % (N_DAKA, N_WRONG, N_BIG, N_READ_ER, N_READ_Y1), src, flags=re.S)
src = re.sub(r'<main>[\s\S]*?</main>', lambda m: MAIN, src, flags=re.S)

assert '<main>' in src and 'data-key="10/16"' in src

# ============================ 8. 列宽 / 打卡样式 ============================
EXTRA_CSS = """  /* v2 版式：408 拆「选择题错题 / 大题」两列 */
  .cw { width: 172px; }
  .cb { width: 166px; }
  .cma { width: 96px; }
  .cen { width: 236px; }
  td.cb .s { color: var(--muted); font-size: 12px; }
  /* 打卡列：勾选 + 我的备注（localStorage 持久化；桌面版与站内版各自独立存储） */
  th.ck, td.ck { width: 132px; }
  td.ck { white-space: normal; }
  .sprint-ck { width: 15px; height: 15px; cursor: pointer; accent-color: var(--phB); vertical-align: middle; }
  .mynote { margin-top: 6px; min-height: 20px; font-size: 12.5px; line-height: 1.5;
            color: var(--muted); border-bottom: 1px dashed var(--line); outline: none;
            word-break: break-word; transition: color .15s ease, border-color .15s ease; }
  .mynote:hover, .mynote:focus { color: var(--text); border-bottom-color: var(--primary); }
  .mynote:empty::before { content: attr(data-ph); color: var(--muted); opacity: .55; }
  .mynote:focus:empty::before { content: none; }
  tr.done td:not(.ck) { opacity: .5; }
  tr.done .dt b::after { content: " ✓"; color: var(--phB); }
  .sprint-progress { margin-top: 12px; font-size: 13.5px; color: var(--muted); }
  .sprint-progress b { color: var(--phB); font-size: 15px; }
  .sprint-progress .reset { margin-left: 12px; font-size: 12px; color: var(--muted);
                            text-decoration: underline; cursor: pointer; }
  @media (max-width: 760px) {
    td.cw::before { content: "错题："; color: var(--muted); }
    td.cb::before { content: "大题："; color: var(--muted); }
    td.ck::before { content: "打卡："; color: var(--muted); }
  }
  @media print { .mynote { border-bottom: none; } .sprint-progress .reset { display: none; } }
"""
src = src.replace('</style>', EXTRA_CSS + '</style>')

n_rows = len(rows)
src = src.replace(
    '</header>',
    '    <div class="sprint-progress" id="sprintProgress">已完成 <b>0</b> / %d 天</div>\n  </header>' % n_rows, 1)

# ============================ 9. 打卡 / 备注 JS ============================
CK_JS = """<script>
/* 打卡 + 我的备注：localStorage 持久化（sprint_done / sprint_notes；清空按钮带确认） */
(function () {
  var DK = 'sprint_done', NK = 'sprint_notes';
  var done = {}, notes = {};
  try { done = JSON.parse(localStorage.getItem(DK) || '{}') || {}; } catch (e) { done = {}; }
  try { notes = JSON.parse(localStorage.getItem(NK) || '{}') || {}; } catch (e) { notes = {}; }
  var save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-key]'));
  function prog() {
    var n = rows.filter(function (r) { return r.classList.contains('done'); }).length;
    var el = document.getElementById('sprintProgress');
    if (!el) return;
    el.innerHTML = '已完成 <b>' + n + '</b> / ' + rows.length + ' 天'
      + '　<span class="reset" id="sprintReset">清空勾选与备注</span>';
    document.getElementById('sprintReset').onclick = function () {
      if (!confirm('清空全部勾选与我的备注？')) return;
      done = {}; notes = {};
      save(DK, done); save(NK, notes);
      rows.forEach(function (r) {
        r.classList.remove('done');
        var c = r.querySelector('.sprint-ck'); if (c) c.checked = false;
        var n2 = r.querySelector('.mynote'); if (n2) n2.textContent = '';
      });
      prog();
    };
  }
  rows.forEach(function (tr) {
    var k = tr.dataset.key;
    var cb = tr.querySelector('.sprint-ck');
    var nt = tr.querySelector('.mynote');
    if (cb) {
      cb.checked = !!done[k];
      tr.classList.toggle('done', cb.checked);
      cb.addEventListener('change', function () {
        if (cb.checked) done[k] = 1; else delete done[k];
        tr.classList.toggle('done', cb.checked);
        save(DK, done); prog();
      });
    }
    if (nt) {
      nt.textContent = notes[k] || '';
      var t = null;
      var flush = function () {
        if (nt.innerHTML === '<br>') nt.innerHTML = '';
        var v = (nt.textContent || '').replace(/\\s+/g, ' ').trim();
        if (v) notes[k] = v; else delete notes[k];
        save(NK, notes);
      };
      nt.addEventListener('input', function () { clearTimeout(t); t = setTimeout(flush, 300); });
      nt.addEventListener('blur', function () { clearTimeout(t); flush(); });
      nt.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nt.blur(); } });
    }
  });
  prog();
})();
</script>
"""

# ============================ 10. 落地 ============================
desktop_out = src.replace('</body>', CK_JS + '</body>')
io.open(DESKTOP, 'w', encoding='utf-8', newline='').write(desktop_out)

pwa = desktop_out
pwa = pwa.replace(
    '<h1>考研冲刺计划</h1>',
    '<h1>考研冲刺计划 <a id="backHome" href="index.html" style="display:none;font-size:14px;font-weight:400;color:var(--primary);text-decoration:none;margin-left:8px">← 返回首页</a></h1>')
pwa = pwa.replace(
    '</body>',
    "<script>if (location.protocol === 'http:' || location.protocol === 'https:') { var bh = document.getElementById('backHome'); if (bh) bh.style.display = 'inline'; }</script>\n</body>")
io.open(PWA_OUT, 'w', encoding='utf-8', newline='').write(pwa)

print('rows=%d  weeks=%d' % (n_rows, len(weeks)))
print('打卡表剩余 %d 张 / 错题 %d 题 / 三科大题 %d 题' % (N_DAKA, N_WRONG, N_BIG))
print('英语队列：阅读 %d 篇（英二 %d + 英一 %d）｜完型 %d｜新题型 %d｜翻译 %d 天｜作文 小 %d + 大 %d'
      % (len(read_queue), sum(len(ts) for _, ts in READ_ER), len(READ_Y1) * 4,
         len(cloze_queue), len(newt_queue), len(trans_queue), len(SMALL_YEARS), len(BIG_YEARS)))
