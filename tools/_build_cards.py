# 一次性工具：从四科考点笔记提取「记忆卡」数据 → pwa/data/cards.json
# 卡片粒度＝笔记的小节（subsection）：
#   正面 = 小节标题（考点名）+ 所属章/节
#   背面 = 该小节的核心要点（<li> 条目按句拆分、评分排序取前 5 条）+ 易错点/提示
# 考纲约束：
#   - DROP：明确超纲 / 纯背景章节直接剔除（计组机器级表示、发展史等）
#   - MERGE：同类碎卡合并为一张（图卡速记、TCP 疑难辨析、组播/移动 IP）
# 用法：python tools/_build_cards.py
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBS = ['ds', 'os', 'cn', 'co']

# ---------------- 考纲过滤配置（408 统考大纲 2024-2026） ----------------
# 标题前缀匹配 → 整卡删除（考纲外 / 纯背景 / 发展史流水账）
DROP_PREFIX = {
    'co': [
        '1.1.1 计算机硬件的发展',       # 发展历程：年代/型号流水账，非考点
        '1.1.2 计算机软件的发展',
        '1.2.5 计算机系统的不同用户',     # 背景知识
        '4.3.1 常用汇编指令介绍',        # 程序的机器级表示 → 不在 408 考纲（仅指令格式/寻址/CISC/RISC）
        '4.3.2 选择语句的机器级表示',
        '4.3.3 循环语句的机器级表示',
        '4.3.4 过程调用的机器级表示',
    ],
    'os': [
        '1.2.1 手工操作阶段',           # 纯背景（批处理/分时/实时特征在考纲内，保留）
        '1.2.6 微机操作系统',            # 发展史流水账
    ],
    'cn': [], 'ds': [],
}

# 标题前缀匹配 → 合并为一张卡（同类碎卡收敛，抓重点）
MERGE_GROUPS = {
    'cn': [
        # (新卡标题, [来源标题前缀...])
        ('三种典型帧格式对比（以太网 MAC / PPP / HDLC）',
         ['以太网 V2 MAC 帧结构图', 'PPP 帧结构图', 'HDLC 帧结构图', '三种帧差异速记']),
        ('IPv4 与 IPv6 数据报首部对比',
         ['IPv4 数据报首部结构图', 'IPv6 数据报首部结构图', 'IPv4 与 IPv6 首部速记']),
        ('UDP 与 TCP 报文段首部对比',
         ['UDP 报文段结构图', 'TCP 首部结构图', 'UDP 与 TCP 首部速记']),
        ('IP 组播（多播）要点',
         ['4.5.1 多播的概念', '4.5.2 IP多播地址', '4.5.3 在局域网上进行硬件多播', '4.5.4 IGMP与多播路由协议']),
        ('移动 IP 要点',
         ['4.6.1 移动IP的概念', '4.6.2 移动IP通信过程']),
        ('TCP 疑难辨析：MSS 与可靠交付',
         ['5.4.1 MSS 设置过大或过小的影响', '5.4.2 TCP 是后退 N 帧还是选择重传？', '5.4.6 链路无差错时']),
        ('TCP 疑难辨析：连接建立与拥塞控制',
         ['5.4.3 为何超时置 cwnd=1', '5.4.4 为什么不用', '5.4.5 为什么初始序号']),
    ],
    'ds': [], 'os': [], 'co': [],
}

# 套话开头（要点过滤）
SKIP_START = ('本章地位', '本节地位', '本章考点', '本节考点', '复习建议',
              '考点追踪', '本节是', '本章是', '这一节', '做题时')


def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    s = re.sub(r'&[a-z]+;|&#\d+;', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def cut_sentence(s, n):
    """截断到 n 字以内，尽量停在句内分隔处，避免硬切碎结论。"""
    if len(s) <= n:
        return s
    head = s[:n]
    for sep in ('；', '，', '：', '、'):
        i = head.rfind(sep)
        if i > 18:
            return head[:i + 1] + '…'
    return head + '…'


def split_sentences(raw):
    """按 <br>、句末标点把一个 HTML 片段拆成若干候选句。"""
    raw = re.sub(r'<br\s*/?>', '。', raw)
    parts = [p for p in re.split(r'(?<=[。；;！？])', raw) if p.strip()]
    out = []
    for p in parts:
        t0 = clean(p)
        # 表格被拍平的行：一句里多个「：」且无句读 → 按冒号再拆，避免一整行平铺
        if t0.count('：') >= 3 and len(t0) > 40:
            for seg in re.split(r'：', t0):
                if seg.strip():
                    out.append(seg.strip() + '：')
        else:
            out.append(p)
    return out


def score(t, bold):
    sc = 0
    if bold:
        sc += 2
    if re.search(r'易错|注意|必须|必背|关键|核心|本质|区别|口诀|公式|结论|唯一|恒定|无关|最', t):
        sc += 1
    n = len(t)
    if 12 <= n <= 48:
        sc += 1
    elif n > 70:
        sc -= 1
    return sc


def extract_points(html):
    """从小节 HTML 提取 ≤5 条核心要点：li 拆句 → 评分排序 → 去重。"""
    lis = re.findall(r'<li[^>]*>(.*?)</li>', html, re.S)
    cands, seen = [], set()
    for li in lis:
        if any(k in li for k in ('<svg', '<img', '<figure', '<table',
                                 '<line ', '<rect ', '<text ', 'marker-end')):
            continue        # 图形/表格/内联 SVG 的 li 无有效文字要点，跳过
        bold = '<b>' in li or '<strong>' in li
        for seg in split_sentences(li):
            t = clean(seg)
            if len(t) < 12:
                continue
            if any(t.startswith(k) for k in SKIP_START):
                continue
            key = t[:12]
            if key in seen:
                continue
            seen.add(key)
            t = cut_sentence(t, 64)
            cands.append((score(t, bold), t))
    if cands:
        cands.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in cands[:5]]
    # 无列表：用段落文本兜底
    ps = [clean(x) for x in re.findall(r'<p[^>]*>(.*?)</p>', html, re.S)]
    ps = [cut_sentence(p, 64) for p in ps if len(p) >= 15]
    return ps[:3]


def extract_tip(html, pts):
    """提取 ≤80 字易错提示：优先 key-callout 内的易错/结论句。"""
    callouts = re.findall(r'<div class="key-callout">(.*?)</div>', html, re.S)
    for co in callouts:
        for seg in split_sentences(co):
            t = clean(seg)
            if len(t) >= 10 and re.search(r'易错|注意|陷阱|区别|牢记|结论|必须|勿|别|最', t):
                t = cut_sentence(t, 80)
                if not any(t[:14] == p[:14] for p in pts):
                    return t
    if callouts:
        t = cut_sentence(clean(callouts[0]), 80)
        if not any(t[:14] == p[:14] for p in pts):
            return t
    # 兜底：li 里的易错/考点句
    for li in re.findall(r'<li[^>]*>(.*?)</li>', html, re.S):
        if any(k in li for k in ('<svg', '<img', '<figure', '<table', '<line ', '<rect ', '<text ')):
            continue
        t = clean(li)
        if len(t) >= 12 and re.search(r'易错|注意|陷阱|切记|必背|考点：|口诀|勿混|别混|最', t):
            t = cut_sentence(t, 80)
            if not any(t[:14] == p[:14] for p in pts):
                return t
    return ''


def collect(html):
    """小节 HTML → (points, tip)。"""
    pts = extract_points(html)
    if not pts:
        return None, None
    return pts, extract_tip(html, pts)


def build(subj):
    src = os.path.join(ROOT, 'pwa', 'data', 'notes', f'{subj}_notes.json')
    d = json.load(open(src, encoding='utf-8'))
    drops = DROP_PREFIX.get(subj, [])
    groups = MERGE_GROUPS.get(subj, [])

    cards, idx = [], 0
    pool = []          # 全部小节（含合并组成员）
    for ch in d.get('chapters', []):
        ch_name = ch.get('chapter', '')
        for sec in ch.get('sections', []):
            sec_name = sec.get('section', '')
            for sb in sec.get('subsections', []):
                title = sb.get('section', '')
                if any(title.startswith(p) for p in drops):
                    print(f'  [删] {subj}: {title}')
                    continue
                pool.append({
                    'chapter': ch_name, 'section': sec_name, 'title': title,
                    'html': sb.get('html', '') or ''
                })

    # 普通卡
    used_titles = set()
    for item in pool:
        if any(item['title'].startswith(p) for _, ps in groups for p in ps):
            continue                     # 属于合并组，稍后处理
        pts, tip = collect(item['html'])
        if not pts:
            continue
        used_titles.add(item['title'])
        idx += 1
        cards.append({'id': f'{subj}_card_{idx:03d}', 'chapter': item['chapter'],
                      'section': item['section'], 'title': item['title'],
                      'points': pts, 'tip': tip})

    # 合并卡
    for new_title, prefixes in groups:
        members = [it for it in pool if any(it['title'].startswith(p) for p in prefixes)]
        if not members:
            print(f'  [!] 合并组无成员: {new_title}')
            continue
        pts, seen = [], set()
        for m in members:
            mp, _ = collect(m['html'])
            for p in (mp or []):
                if p[:12] in seen:
                    continue
                seen.add(p[:12])
                pts.append(p)
        tip = ''
        for m in members:
            _, mt = collect(m['html'])
            if mt and len(mt) > len(tip):
                tip = mt
        if not pts:
            continue
        idx += 1
        cards.append({'id': f'{subj}_card_{idx:03d}', 'chapter': members[0]['chapter'],
                      'section': members[0]['section'], 'title': new_title,
                      'points': pts[:5], 'tip': tip})
        print(f'  [合] {subj}: {" + ".join(m["title"] for m in members)} → {new_title}')

    return cards


out = {'subject': 'cards', 'name': '408 记忆卡', 'subjects': SUBS, 'cards': {}}
for s in SUBS:
    out['cards'][s] = build(s)
    print(f'{s}: {len(out["cards"][s])} 张卡')

total = sum(len(v) for v in out['cards'].values())
print(f'总计: {total} 张卡')

dst = os.path.join(ROOT, 'pwa', 'data', 'cards.json')
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print('已生成', dst, os.path.getsize(dst) // 1024, 'KB | 尾换行:',
      open(dst, 'rb').read().endswith(b'\n'))
