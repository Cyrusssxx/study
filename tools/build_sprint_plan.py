# -*- coding: utf-8 -*-
"""考研冲刺计划页生成管线 v2（2026-10-13 全面重排）

背景：用户改主意 —— 不做 408 真题套卷，改为
  阶段A：先把数据结构打卡表的大题写完（剩 53 张，一天 3-4 张）
  阶段B：一天一章一个科目的「选择题错题」复习（一科推完换下一科）+ 三科（OS/CO/CN）大题复习
  阶段C：考前收口
英语阅读改为「同一年份连排、一天一篇」，第二篇按下面的队列推进：
  ① 完型（英二 14 年 + 英一 4 年）优先；
  ② 英一「小标题」三年（2007 / 2016 / 2020，据历年题型统计；2017–2019 排序、2021–2023 七选五不计入）；
  ③ 英二新题型一刷已完成（除 22–24 封存年）→ 11/1 起安排二刷（低分年份优先）。
机动日：12 月前每周日，但**第一周（10/13–10/18）不排机动日**。

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

# —— 全真模拟日：最后三周每周一天，一天三套（数学 + 408 + 英语）——
# 英语用留存的 2022 / 2023 / 2024 三年整套（此前一律不碰）
SIM_DAYS = [(datetime.date(2026, 12, 6), '2022'),
            (datetime.date(2026, 12, 13), '2023'),
            (datetime.date(2026, 12, 16), '2024')]
SIM_MAP = {d: y for d, y in SIM_DAYS}
EN_SIM_YEARS = [y for _, y in SIM_DAYS]      # ['2022','2023','2024'] 封存年份

# —— 机动日：12 月之前的每周日（每周一次）——
# 第一周（10/13–10/18）不安排机动日 → 从 10/19 起取周日
FX_DAYS = set()
_d = datetime.date(2026, 10, 19)
while _d < datetime.date(2026, 12, 1):
    if _d.weekday() == 6:
        FX_DAYS.add(_d)
    _d += datetime.timedelta(days=1)
FX_LIST = sorted(FX_DAYS)


def day_cat(d):
    """it=实习 / sim=全真模拟 / fx=机动 / n=正常推进"""
    if d <= datetime.date(2026, 10, 15):
        return 'it'
    if d in SIM_MAP:
        return 'sim'
    if d in FX_DAYS:
        return 'fx'
    return 'n'


def split_days(total, k):
    """把 total 件事尽量均分到 k 天"""
    if k <= 0:
        return []
    base, extra = divmod(total, k)
    return [base + (1 if i < extra else 0) for i in range(k)]


def alloc_days(total_days, weights):
    """按权重把天数分配给各科（每科至少 1 天，总和对齐）"""
    ks = list(weights.keys())
    tot = sum(weights.values()) or 1
    out = {k: max(1, int(round(total_days * weights[k] / float(tot)))) for k in ks}
    diff = total_days - sum(out.values())
    order = sorted(ks, key=lambda k: -weights[k])
    i = 0
    while diff != 0 and i < 500:
        k = order[i % len(order)]
        if diff > 0:
            out[k] += 1
            diff -= 1
        elif out[k] > 1:
            out[k] -= 1
            diff += 1
        i += 1
    return out

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

# 收藏题 ∪ 未解决错题 = 阶段 A 并行推进的「选择题池」
qid_set = set(qid_index.keys())
fav_ids = set(f['question_id'] for f in BK['favorites']) & qid_set
wrong_ids = set(w['question_id'] for w in BK['wrong'] if not w.get('is_resolved')) & qid_set
choice_cnt = {s: collections.Counter() for s in ['os', 'co', 'ds', 'cn']}
for qid in (fav_ids | wrong_ids):
    s, c = qid_index[qid]
    choice_cnt[s][c] += 1
N_CHOICE = len(fav_ids | wrong_ids)
N_FAV = len(fav_ids)
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
SKIP_Y = set(EN_SIM_YEARS)      # 22/23/24 三年整套封存 → 只在全真模拟日拆封


def keep(y):
    return str(y) not in SKIP_Y


cloze_queue = [('', str(y)) for y in range(2010, 2027) if keep(y)] + \
              [('英一', y) for y in ['2007', '2016', '2020', '2021']]

# 英语一「小标题」年份（据历年题型统计：小标题只考过 2007 / 2016 / 2020；
#   2017–2019 = 排序、2021–2023 = 七选五、2024 = 信息匹配、2025 = 排序，均不计入）
Y1_HEADING = ['2007', '2016', '2020']

# 英语二新题型：2010–2021 + 2025 / 2026 均已一刷（22–24 封存留作模拟）
#   → 按用户要求「下个月再安排复习」：11/1 起二刷，低分年份优先（2021 2/5 → 2020 → 2018 → 2016 → 2025）
NEWT_REVIEW_FROM = datetime.date(2026, 11, 1)
NEWT_ER_REVIEW = ['2021', '2020', '2018', '2016', '2025',
                  '2010', '2011', '2012', '2013', '2014', '2015', '2017', '2019', '2026']
# (显示名, 年份, 起始日闸门)  —— 闸门未到则该项不消费
newt_queue = [('英一小标题', y, None) for y in Y1_HEADING] + \
             [('英二新题型二刷', y, NEWT_REVIEW_FROM) for y in NEWT_ER_REVIEW]
trans_queue = []
for y in list(range(2015, 2027)) + list(range(2010, 2015)):
    if not keep(y):
        continue
    trans_queue.append('译 %d（第 1–3 句）' % y)
    trans_queue.append('译 %d（第 4–5 句）' % y)
SMALL_YEARS = [str(y) for y in range(2010, 2027) if keep(y)]            # 小作文
BIG_YEARS = [str(y) for y in range(2010, 2027) if y != 2012 and keep(y)]  # 大作文（2012 放弃）

# 英语收口队列：常规队列全部跑完后的最后几个推进日（阅读 48 篇用完后接上）
# 顺序即使用顺序，末项刻意是"考前速背"（落在 12/18）
EN_FINISH = [
    '作文成篇默写（纸质答题卡：小作文 1 篇 + 大作文 1 篇，限时）',
    '作文成篇默写（再练 1 组真题，写工整不涂改）',
    '翻译错题回看 + 长难句再译（挑错得最多的 2 句）',
    '阅读错题回看 + 生词 / 长难句本过一遍',
    '作文模板默写（小作文 5 类框架 + 大作文图表描述句）',
    '英语错题 / 生词本总扫（只看标记项）',
    '考前：作文模板 + 通用理由速背（不动笔，22:30 前睡）',
]

# ============================ 3. 408 选择题错题：按章分组 ============================
# (科目, [章序号...], 备注)  —— 顺序即推进顺序；同组多章＝当天连做
# extra: '' = 整章一天；'前'/'后' = 大章拆两天（题数按当天实际数据对半算，不硬编码）
T1_GROUPS = [
    ('os', [0], ''), ('os', [1], '前'), ('os', [1], '后'),
    ('os', [2], ''), ('os', [3], ''), ('os', [4], ''),
    ('co', [0], ''), ('co', [1], ''), ('co', [2], ''),
    ('co', [3], ''), ('co', [4], ''), ('co', [5, 6], ''),
    ('ds', [0, 1, 2], ''), ('ds', [3, 4, 5], ''), ('ds', [6, 7], ''),
    ('cn', [0, 1], ''), ('cn', [2], '前'), ('cn', [2], '后'),
    ('cn', [3], '前'), ('cn', [3], '后'), ('cn', [4], ''), ('cn', [5], ''),
]


def t1_day_label(sub, idxs, extra):
    names = []
    for i in idxs:
        ch = chapters[sub][i]
        names.append(re.sub(r'^第\d+章\s*', '', ch))
    total = sum(chap_q[sub][chapters[sub][i]] for i in idxs)
    lab = '＋'.join(names)
    if extra == '前':
        cnt = (total + 1) // 2          # 前半天多担 1 题（55 → 28 + 27）
        lab += '（前 %d 题）' % cnt
    elif extra == '后':
        cnt = total // 2
        lab += '（后 %d 题）' % cnt
    else:
        cnt = total
    return cnt, '%s %s' % (SUBJ_SHORT[sub], lab)


# ============================ 3.5 阶段 A 的选择题：四科轮转按章，约 30–45 题/天 =====
CAP = 42     # 单章单份上限，超过则拆成前半/后半（或上/中/下）


def split_chunk(n, cap=CAP):
    if n <= cap:
        return [(n, '')]
    k = min(3, -(-n // cap))
    tag = {2: ['前半', '后半'], 3: ['上', '中', '下']}[k]
    base, extra = divmod(n, k)
    out = []
    for i in range(k):
        out.append((base + (1 if i < extra else 0), tag[i]))
    return out


_seq = []
_maxch = max(len(chapters[s]) for s in ['os', 'co', 'ds', 'cn'])
for r in range(_maxch):
    for s in ['os', 'co', 'ds', 'cn']:
        if r >= len(chapters[s]):
            continue
        c = chapters[s][r]
        n = choice_cnt[s][c]
        if not n:
            continue
        for sz, lab in split_chunk(n):
            _seq.append((s, c, sz, lab))

A_CH_DAYS = []       # [(总题数, [(sub, 章名, 题数, 分段标签)...])]
_cur = []
_cn = 0
for it in _seq:
    _cur.append(it)
    _cn += it[2]
    if _cn >= 30:
        A_CH_DAYS.append((_cn, _cur))
        _cur = []
        _cn = 0
if _cur:
    A_CH_DAYS.append((_cn, _cur))


def a_ch_label(items):
    """同章的分段合并显示（前半+后半 → 整章）"""
    segs = []
    for s, c, sz, lab in items:
        short = re.sub(r'^第\d+章\s*', '', c)
        if segs and segs[-1][0] == (s, c):
            segs[-1][2] += sz
            segs[-1][3] = ''
        else:
            segs.append([(s, c), short, sz, lab])
    # 一行一个科目（用户要求：多科目分行，不挤在一行用「＋」连）
    return ''.join('<span class="s2">%s %s%s %d 题</span>'
                   % (SUBJ_SHORT[t[0][0]], t[1], ('·' + t[3]) if t[3] else '', t[2])
                   for t in segs)


# ============================ 4. 日期骨架与三科大题 ============================
START = datetime.date(2026, 10, 13)
END = datetime.date(2026, 12, 18)
DAYS = [START + datetime.timedelta(days=i) for i in range((END - START).days + 1)]
A_NORMAL = [d for d in DAYS
            if datetime.date(2026, 10, 16) <= d <= D_PHASE_A_END and day_cat(d) == 'n']
B_NORMAL = [d for d in DAYS
            if D_PHASE_A_END < d <= D_PHASE_B_END and day_cat(d) == 'n']

big_items = []   # (sub, 章名, 题内序号)
for sub in ['os', 'co', 'cn']:
    for chname, n in big_ch[sub]:
        for i in range(n):
            big_items.append((sub, chname, i + 1))
DAO_B_DAYS = len(B_NORMAL)      # 阶段 B 的「正常推进日」（已扣除机动日 / 模拟日）
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
N_CH_A = sum(A_CH_DAYS[i][0] for i in range(min(len(A_CH_DAYS), len(A_NORMAL))))  # 阶段 A 覆盖题量

# 打卡表分天：N_DAKA 张均分到阶段 A 的「正常推进日」（已扣除机动日）
daka_days = []
_i = 0
for k in split_days(N_DAKA, len(A_NORMAL)):
    batch = rem_daka[_i:_i + k]
    _i += k
    if not batch:
        break
    grp = collections.Counter('%s·%s' % (q['priority_label'], re.sub(r'^基于“|”的算法训练$', '', q['module']))
                              for q in batch)
    daka_days.append((len(batch), _i - len(batch) + 1, _i,
                      '、'.join('%s×%d' % (g, n) for g, n in grp.items())))

# 阶段 B 错题二刷天数：按各科错题量加权分配到剩余推进日
R2_TOTAL = max(0, len(B_NORMAL) - len(T1_GROUPS))
R2_ALLOC = alloc_days(R2_TOTAL, {s: sum(chap_q[s].values()) for s in ['os', 'co', 'ds', 'cn']})

rows = []
read_i = cloze_i = newt_i = trans_i = small_i = big_i = en_day = en_fin_i = 0
n_math = 0      # 数学「30 题」推进计数（只在正常推进日累加）
n_daka = 0      # 阶段 A 打卡表天索引
n_ch = 0        # 阶段 A 选择题（收藏/错题）天索引
n_t1 = 0        # 错题一刷索引
n_r2 = 0        # 错题二刷索引
n_big = 0       # 三科大题天索引

for d in DAYS:
    key = '%d/%d' % (d.month, d.day)
    wd = WD[d.weekday()]
    row = {'key': key, 'cls': '', 'cw': '—', 'cb': '—', 'math': '—', 'en': '—', 'nt': ''}
    cat = day_cat(d)

    # ---- 实习日志 10/13–10/15 ----
    if cat == 'it':
        row['cls'] = 'it'
        row['cw'] = '实习日志'
        row['cb'] = '实习日志'
        row['math'] = '实习日志'
        row['nt'] = '实习日志（10/11–15，不排 408/数学）'
        rows.append(row)
        continue

    # ---- 全真模拟日（最后三周每周一天）：一天三套，红色强调 ----
    if cat == 'sim':
        y = SIM_MAP[d]
        row['cls'] = 'sim'
        row['math'] = '全套模拟 · 数学二 1 套（8:30–11:30 限时）'
        row['cw'] = '全套模拟 · 408 1 套（14:00–17:00 限时）'
        row['cb'] = '↳ 随套卷一起批阅，不单列'
        row['en'] = '全套模拟 · 英语二 %s 整套（19:00–22:00 限时）' % y
        row['nt'] = '◆ 全真模拟日：一天三套（数学 / 408 / 英语）· 英语 %s 年整套首次拆封' % y
        rows.append(row)
        continue

    # ---- 机动日（12 月前每周日）：复习型保底任务 + 补欠账 ----
    if cat == 'fx':
        row['cls'] = 'fx'
        row['cw'] = '知识点复习｜本周错题章节回看 + 笔记 / 导图'
        row['cb'] = '知识点复习｜易错点清单 + 算法 / 公式模板过一遍'
        row['math'] = '讲义 + 错题复习（不做新题）'
        row['en'] = '作文背诵（模板 + 通用理由）＋ 本周阅读生词 / 长难句复盘'
        row['nt'] = '机动日：先补本周欠账，再按左侧保底量复习；没欠账就休息'
        rows.append(row)
        continue

    # ---- 正常推进日 ----
    en_day += 1
    en = []
    if read_i < len(read_queue):
        pre, y, t = read_queue[read_i]
        read_i += 1
        en.append('阅读 %s%s·%s' % (pre, y, t))
    # 第二篇：完型 与 「英一小标题 → 11 月起英二新题型二刷」交替（一侧用完另一侧顶上）
    if en_day % 2 == 1 and cloze_i < len(cloze_queue):
        pre, y = cloze_queue[cloze_i]
        cloze_i += 1
        en.append('完型 %s%s' % (pre, y))
    elif newt_i < len(newt_queue) and (newt_queue[newt_i][2] is None or d >= newt_queue[newt_i][2]):
        kind, y, _gate = newt_queue[newt_i]
        newt_i += 1
        en.append('%s %s' % (kind, y))
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
    # 常规队列全跑完后，用收口队列兜底（避免最后几天英语列空白）
    if not en and en_fin_i < len(EN_FINISH):
        en.append(EN_FINISH[en_fin_i])
        en_fin_i += 1
    row['en'] = ' ＋ '.join(en) if en else '—'

    # ---- 数学 ----
    n_math += 1
    if n_math <= 25:
        row['math'] = '30题'
    else:
        row['math'] = '模拟卷 1 套（限时）' if n_math % 2 else '错题回炉（≥2h）'

    # ---- 阶段 A：10/16–10/29 打卡表大题 + 选择题收藏/错题 并行 ----
    if d <= D_PHASE_A_END:
        if n_ch < len(A_CH_DAYS):
            cnt, items = A_CH_DAYS[n_ch]
            n_ch += 1
            row['cw'] = '收藏 / 错题 %d 题<br>%s' % (cnt, a_ch_label(items))
        else:
            row['cw'] = ('收藏 / 错题（池剩余 %d 题）<br><span class="s2">按章快刷，优先薄弱章</span>'
                         % (N_CHOICE - N_CH_A))
        if n_daka < len(daka_days):
            n, a, b, grp = daka_days[n_daka]
            n_daka += 1
            row['cb'] = '打卡表 %d 题（第 %d–%d 张）<br><span class="s">%s</span>' % (n, a, b, grp)
        if d == datetime.date(2026, 10, 16):
            row['cls'] = 'ms'
            row['nt'] = '◆ 阶段 A 启动：打卡表大题（必做 + 高优先级置顶）+ 选择题收藏/错题 并行'
        elif d == D_PHASE_A_END:
            row['cls'] = 'ms'
            row['nt'] = '◆ 打卡表收官（%d 张）→ 次日转阶段 B' % N_DAKA
        rows.append(row)
        continue

    # ---- 阶段 B：10/30–12/12 ----
    if d <= D_PHASE_B_END:
        # 错题一刷（按章）→ 二刷（按科）
        if n_t1 < len(T1_GROUPS):
            sub, idxs, extra = T1_GROUPS[n_t1]
            cnt, lab = t1_day_label(sub, idxs, extra)
            n_t1 += 1
            row['cw'] = '错题 %d 题｜%s' % (cnt, lab)
        else:
            k = n_r2
            n_r2 += 1
            acc = 0
            for sub in ['os', 'co', 'ds', 'cn']:
                nd = R2_ALLOC[sub]
                if k < acc + nd:
                    row['cw'] = '错题二刷｜%s 全科（只重做一刷仍错的）' % SUBJ_SHORT[sub]
                    break
                acc += nd
        # 三科大题
        if n_big < len(big_days):
            n, lab = big_days[n_big]
            n_big += 1
            row['cb'] = '大题 %d 题｜%s' % (n, lab)

        # 备注 / 里程碑
        if d == datetime.date(2026, 10, 30):
            row['cls'] = 'ms'
            row['nt'] = ('◆ 阶段 B 启动：错题一刷（按章）+ 三科大题 并行'
                         '（阶段 A 已快刷 %d 题收藏/错题，此处按章系统刷，算二轮巩固）' % N_CH_A)
        elif n_math == 25:
            row['cls'] = 'ms'
            row['nt'] = '◆ 数学 747 题收官 → 转模拟卷 / 错题回炉'
        elif d == datetime.date(2026, 11, 2):
            row['cls'] = 'ms'
            row['nt'] = '◆ 小作文启动（每周一/三/五 各 1 篇）'
        elif d == datetime.date(2026, 11, 10):
            row['nt'] = '◆ 大作文启动（每周二/四/六 各 1 篇，2012 大作文放弃）'
        elif n_t1 == len(T1_GROUPS) and n_r2 == 0:
            row['cls'] = 'ms'
            row['nt'] = '◆ 错题一刷（26 章）完成 → 次日进入二刷'
        elif n_r2 == 1:
            row['nt'] = '◆ 错题二刷启动：只重做一刷仍错的'
        elif d.weekday() == 5:
            row['nt'] = '下午留 1h 机动（补欠账 / 休息）'
        rows.append(row)
        continue

    # ---- 阶段 C：12/13–12/18 收口 ----
    row['cw'] = '错题总扫：高频错题 + 易错点清单'
    row['cb'] = '四科框架速览（笔记 / 导图）'
    row['math'] = '错题重做（一刷遗留）'
    if d == datetime.date(2026, 12, 14):
        row['cls'] = 'ms'
        row['nt'] = '◆ 收口期：只看错题与框架，不做新题'
    elif d == datetime.date(2026, 12, 18):
        row['cls'] = 'ms'
        row['nt'] = '考前 Day：易错点清单 + 早睡，不动笔'
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


PH_TAG = {'K': '实习期', 'A': '阶段A · 打卡表大题', 'B': '阶段B · 错题 + 三科大题', 'C': '阶段C · 收口'}
PH_SHORT = {'K': '实习期', 'A': '阶段A', 'B': '阶段B', 'C': '阶段C'}


def week_phase(rws):
    """按本周实际覆盖的阶段出标签：跨阶段 / 含模拟日的周明确标注（避免标题与内容不符）。"""
    ds = [datetime.date(2026, int(r['key'].split('/')[0]), int(r['key'].split('/')[1])) for r in rws]

    def ph_of(d):
        if d <= datetime.date(2026, 10, 15):
            return 'K'
        if d <= D_PHASE_A_END:
            return 'A'
        if d <= D_PHASE_B_END:
            return 'B'
        return 'C'

    phs = []
    for d in ds:
        p = ph_of(d)
        if p not in phs:
            phs.append(p)
    if len(phs) == 1:
        tag = PH_TAG[phs[0]]
    else:
        tag = ' → '.join(PH_SHORT[p] for p in phs)
    if any(r['cls'] == 'sim' for r in rws):
        tag += ' ＋ 全真模拟'
    return phs[0], tag


# —— 悬浮周目录：默认只露出左侧 8px 半透明细条（不占正文空间），悬停 / 点击展开 ——
PTOC = ['<nav class="plan-toc" id="planToc" aria-label="周目录">',
        '<button class="ptoc-tab" id="ptocTab" type="button" aria-label="展开 / 收起周目录"></button>',
        '<div class="ptoc-body"><div class="ptoc-head">周目录</div>']
for wi, (_ws, rws) in enumerate(weeks, 1):
    k0, k1 = rws[0]['key'], rws[-1]['key']
    PTOC.append('<a class="ptoc-item" href="#w%d" data-w="%d"><b>第 %d 周</b>'
                '<span>%s – %s</span></a>' % (wi, wi, wi, k0, k1))
PTOC.append('</div></nav>')
PTOC_HTML = ''.join(PTOC)

main = ['<main>']
for wi, (wstart, rws) in enumerate(weeks, 1):
    ph, tag = week_phase(rws)
    k0, k1 = rws[0]['key'], rws[-1]['key']
    rng = '第 %d 周 · %s – %s' % (wi, k0, k1)
    main.append('<section class="week ph-%s" id="w%d"><h3>%s<span class="tag">%s</span></h3><table>%s<tbody>'
                % (ph, wi, rng, tag, HEAD))
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
MAIN = PTOC_HTML + ''.join(main)

# ============================ 7. 外壳替换 ============================
src = io.open(SRC, encoding='utf-8').read()

src = re.sub(r'<title>.*?</title>', '<title>考研冲刺计划 · 10/13 – 12/18</title>', src, flags=re.S)
src = re.sub(
    r'<p class="sub">.*?</p>',
    '<p class="sub">2026-10-13 → 2026-12-18（67 天）· 初试 12/19–20 · 不出真题套卷：'
    '阶段A 打卡表大题 + 选择题收藏/错题并行 → 阶段B 错题 + 三科大题 → 阶段C 收口；'
    '<b style="color:#b3261e">最后三周每周一天全真模拟（数学 + 408 + 英语 三套）</b>；'
    '实习日志 10/13–15；机动日 = 12 月前每周日（第一周 10/13–10/18 不排）</p>', src, flags=re.S)
src = re.sub(
    r'<div class="legend">[\s\S]*?</div>',
    '''<div class="legend">
      <span>阶段 A · 打卡表大题（10/16–10/29）</span>
      <span class="b">阶段 B · 选择题错题 + 三科大题（10/30–12/12）</span>
      <span class="c">阶段 C · 收口（12/14–12/18；12/13 为全真模拟）</span>
      <span class="m">◆ 里程碑日：任务切换 / 收尾节点</span>
      <span class="it">实习日志 10/13–15</span>
      <span class="fx">机动日：12 月前每周日（%s，共 %d 天）</span>
      <span class="sim">全真模拟日：%s（数学 + 408 + 英语 一天三套）</span>
    </div>''' % ('、'.join('%d/%d' % (x.month, x.day) for x in FX_LIST), len(FX_LIST),
                 ' · '.join('%d/%d' % (x.month, x.day) for x, _ in SIM_DAYS)), src, flags=re.S)
src = re.sub(
    r'<section class="guide">[\s\S]*?</section>',
    '''<section class="guide">
    <div class="gcard">
      <h4>每日时间模板（10/16 起生效）</h4>
      <ul>
        <li>上午 <b>8:00–10:30 数学</b>（对齐考场 8:30–11:30 的脑力段）</li>
        <li>下午 <b>14:00–17:00 408</b>（选择题 + 大题两轨）</li>
        <li>晚上 <b>19:00–20:30 英语</b>；20:30 起复盘 + 机动</li>
        <li>打卡表大题按「必做 → 高优先级 → 中优先级 → 基本功」顺序推</li>
      </ul>
    </div>
    <div class="gcard">
      <h4>408 三步走</h4>
      <ul>
        <li><b>阶段 A（10/16–10/29）</b>：打卡表大题 %d 张（一天 4–5 张）
            ＋ <b>选择题收藏 / 错题并行</b>（池共 %d 题 ＝ 收藏 %d ∪ 错题 %d 去重；四科轮转按章，
            约 30–46 题/天，阶段 A 覆盖 %d 题；其余收藏题在错题清完后自选）</li>
        <li><b>阶段 B（10/30–12/12）</b>：错题一刷一天一章（一科推完换下一科，按 OS→CO→DS→CN，共 %d 题）→ 二刷；
            同时三科大题（OS/CO/CN 共 %d 题）一天约 %d 题</li>
        <li><b>阶段 C（12/14–12/18）</b>：只过错题与框架，不做新题</li>
      </ul>
    </div>
    <div class="gcard sim">
      <h4>最后三周 · 全真模拟（一天三套）</h4>
      <ul>
        <li><b>12/6 · 12/13 · 12/16</b> 三天：上午数学、下午 408、晚上英语，各一整套，严格限时</li>
        <li>英语用<b>封存的 2022 / 2023 / 2024</b> 三年整套 —— 这三年此前一律不碰</li>
        <li>卷子提前备好：数学二自选 3 套没做过的预测卷；408 用 zhenti.html 的 <b>2024 / 2025 / 2026</b> 三套；英语已定为 2022 / 2023 / 2024</li>
        <li>当晚只批阅不复盘，复盘挪到次日；<b>12/16 是最后一次，其后 12/17–18 只做复盘</b></li>
      </ul>
    </div>
    <div class="gcard fx">
      <h4>机动日（12 月前每周日，共 %d 天；第一周不排）</h4>
      <ul>
        <li>英语：作文背诵（模板 + 通用理由）+ 本周生词 / 长难句复盘</li>
        <li>数学：讲义 + 错题复习（不做新题）</li>
        <li>408：本周错题章节回看 + 笔记 / 导图 + 易错点清单</li>
        <li>先补本周欠账，再按上面保底量复习；没欠账就休息</li>
      </ul>
    </div>
    <div class="gcard">
      <h4>英语节奏（一天：阅读 1 篇 + 完型 / 新题型 1 篇）</h4>
      <ul>
        <li>阅读<b>同一年份连排</b>、一天一篇：英二低正确率 %d 篇 + 英一指定 8 年 %d 篇</li>
        <li><b>完型</b>优先排：英二 14 年 + 英一 4 年（2007 / 2016 / 2020 / 2021）</li>
        <li><b>英一小标题</b> = %s 三年（历年统计只考过这三年；2017–2019 排序、2021–2023 七选五、
            2024 信息匹配、2025 排序，均不计入）</li>
        <li><b>英二新题型</b>已一刷完（除 22–24）→ <b>11/1 起二刷</b>，低分年份优先：%s，其余年份快过</li>
        <li>翻译细水长流：2015–2026 + 补 2010–2014，每年 5 句拆两天（3 句 + 2 句）</li>
        <li>作文：小作文 11/2 起（一/三/五）；大作文 11/10 起（二/四/六，2012 放弃）</li>
        <li><b style="color:#b3261e">2022–2024 整套封存</b>，只在全真模拟日拆封</li>
        <li>末段（12/10 起）转收口：作文成篇默写 → 错题 / 生词总扫 → 考前速背</li>
      </ul>
    </div>
  </section>''' % (N_DAKA, N_CHOICE, N_FAV, N_WRONG, N_CH_A, N_WRONG, N_BIG, -(-N_BIG // max(1, DAO_B_DAYS)),
                   len(FX_LIST), N_READ_ER, N_READ_Y1,
                   ' / '.join(Y1_HEADING), '、'.join(NEWT_ER_REVIEW[:5])), src, flags=re.S)
src = re.sub(r'<main>[\s\S]*?</main>', lambda m: MAIN, src, flags=re.S)

assert '<main>' in src and 'data-key="10/16"' in src

# ============================ 8. 列宽 / 打卡样式 ============================
EXTRA_CSS = """  /* v2 版式：408 拆「选择题错题 / 大题」两列 */
  .cw { width: 172px; }
  .cb { width: 166px; }
  .cma { width: 96px; }
  .cen { width: 236px; }
  td.cb .s { color: var(--muted); font-size: 12px; }
  /* 阶段A 选择题：题数与科目列表分行，科目一行一个（细左导轨，不挤成一行用「＋」连） */
  .cw .s2 { display: block; margin-top: 3px; padding-left: 7px; font-size: 12.5px;
            border-left: 2px solid var(--line); }
  /* 悬浮周目录：默认只露出左侧 8px 半透明细条，不占正文空间；悬停 / 点击展开为毛玻璃面板 */
  .plan-toc { position: fixed; left: 0; top: 50%; transform: translateY(-50%);
              z-index: 60; display: flex; align-items: stretch; height: min(58vh, 520px); }
  .plan-toc .ptoc-tab { width: 8px; flex: 0 0 8px; border: none; padding: 0; cursor: pointer;
                        background: linear-gradient(180deg, var(--primary), var(--phB));
                        opacity: .26; border-radius: 0 6px 6px 0;
                        transition: opacity .18s ease; }
  .plan-toc:hover .ptoc-tab, .plan-toc.pinned .ptoc-tab { opacity: .72; }
  .plan-toc .ptoc-body { width: 0; opacity: 0; pointer-events: none; padding: 0;
                         max-height: 100%; overflow-x: hidden; overflow-y: auto;
                         border-radius: 0 10px 10px 0; background: rgba(255,255,255,.88);
                         backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                         border: 1px solid var(--line); border-left: none;
                         box-shadow: 0 8px 22px rgba(0,0,0,.10);
                         transition: width .18s ease, opacity .18s ease, padding .18s ease;
                         scrollbar-width: thin; }
  .plan-toc .ptoc-body::-webkit-scrollbar { width: 6px; }
  .plan-toc .ptoc-body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
  .plan-toc:hover .ptoc-body, .plan-toc.pinned .ptoc-body { width: 176px; opacity: 1;
                         pointer-events: auto; padding: 8px 6px; }
  .plan-toc .ptoc-head { font-size: 11.5px; color: var(--muted); letter-spacing: .5px;
                         padding: 2px 8px 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  .plan-toc .ptoc-item { display: block; padding: 4px 8px; border-radius: 6px; font-size: 12.5px;
                         line-height: 1.35; color: var(--muted); text-decoration: none; }
  .plan-toc .ptoc-item b { font-weight: 600; }
  .plan-toc .ptoc-item span { display: block; font-size: 11px; }
  .plan-toc .ptoc-item:hover { background: var(--primary-soft); color: var(--text); }
  .plan-toc .ptoc-item.active { color: var(--primary); font-weight: 600; background: var(--primary-soft); }
  @media (prefers-color-scheme: dark) {
    .plan-toc .ptoc-body { background: rgba(36,44,54,.90); }
  }
  @media (max-width: 760px) { .plan-toc { display: none; } }
  @media print { .plan-toc { display: none; } }
  /* 打卡列：勾选 + 我的备注（localStorage 持久化；桌面版与站内版各自独立存储） */
  th.ck, td.ck { width: 148px; }
  td.ck { white-space: normal; }
  .sprint-ck { width: 15px; height: 15px; cursor: pointer; accent-color: var(--phB); vertical-align: middle; }
  .mynote { margin-top: 6px; min-height: 26px; font-size: 12.5px; line-height: 1.5;
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
  /* 全真模拟日：一天三套，红色强调（语义色，不做淡化处理） */
  tr.sim td { background: rgba(220,38,38,.10); }
  tr.sim .dt { border-left-color: #b3261e; }
  tr.sim .dt b { color: #b3261e; }
  tr.sim .cw, tr.sim .cb, tr.sim .cma, tr.sim .cen { color: #b3261e; font-weight: 700; }
  tr.sim .nt { font-weight: 700; color: #b3261e; text-decoration: underline;
               text-underline-offset: 3px; }
  .legend .sim { background: rgba(220,38,38,.12); border-left-color: #b3261e;
                 font-weight: 700; color: #b3261e; }
  .gcard.sim { border-color: rgba(220,38,38,.35); background: rgba(220,38,38,.05); }
  .gcard.sim h4 { color: #b3261e; }
  .gcard.fx { border-left: 3px solid var(--phB); }
  @media (prefers-color-scheme: dark) {
    tr.sim td { background: rgba(220,38,38,.18); }
    tr.sim .dt { border-left-color: #ef8f89; }
    tr.sim .dt b, tr.sim .cw, tr.sim .cb, tr.sim .cma, tr.sim .cen, tr.sim .nt { color: #f2a29c; }
    .legend .sim { background: rgba(220,38,38,.20); color: #f2a29c; }
    .gcard.sim { background: rgba(220,38,38,.10); }
    .gcard.sim h4 { color: #f2a29c; }
  }
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
/* 悬浮周目录：细条悬停展开（点击细条可钉住），点击条目平滑跳转并高亮当前周 */
(function () {
  var toc = document.getElementById('planToc');
  if (!toc) return;
  var tab = document.getElementById('ptocTab');
  tab.addEventListener('click', function () { toc.classList.toggle('pinned'); });
  document.addEventListener('click', function (e) {
    if (!toc.contains(e.target)) toc.classList.remove('pinned');
  });
  Array.prototype.forEach.call(toc.querySelectorAll('.ptoc-item'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var el = document.getElementById((a.getAttribute('href') || '').slice(1));
      if (!el) return;
      var y = el.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      if (window.innerWidth <= 900) toc.classList.remove('pinned');
    });
  });
  var secs = Array.prototype.slice.call(document.querySelectorAll('section.week'));
  var items = Array.prototype.slice.call(toc.querySelectorAll('.ptoc-item'));
  function sync() {
    var best = 0, line = window.scrollY + 140;
    secs.forEach(function (s, i) { if (s.offsetTop <= line) best = i; });
    items.forEach(function (a, i) { a.classList.toggle('active', i === best); });
  }
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
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
print('英语队列：阅读 %d 篇（英二 %d + 英一 %d）｜完型 %d｜英一小标题 %d 年｜英二新题型二刷 %d 年'
      '｜翻译 %d 天｜作文 小 %d + 大 %d｜收口 %d'
      % (len(read_queue), sum(len(ts) for _, ts in READ_ER), len(READ_Y1) * 4,
         len(cloze_queue), len(Y1_HEADING), len(NEWT_ER_REVIEW),
         len(trans_queue), len(SMALL_YEARS), len(BIG_YEARS), len(EN_FINISH)))
print('机动日 %d 天：%s（第一周不排）'
      % (len(FX_LIST), '、'.join('%d/%d' % (x.month, x.day) for x in FX_LIST)))
