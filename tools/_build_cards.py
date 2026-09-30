# 一次性工具：从四科考点笔记提取「记忆卡」数据 → pwa/data/cards.json
# 卡片粒度＝笔记的小节（subsection）：
#   正面 = 小节标题（考点名）+ 所属章/节
#   背面 = 该小节的核心要点（<li> 条目去标签去重后取前 5 条）+ 易错点/提示
# 用法：python tools/_build_cards.py
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBS = ['ds', 'os', 'cn', 'co']

def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    s = re.sub(r'&[a-z]+;|&#\d+;', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def cut(s, n):
    return s if len(s) <= n else s[:n] + '…'

def build(subj):
    src = os.path.join(ROOT, 'pwa', 'data', 'notes', f'{subj}_notes.json')
    d = json.load(open(src, encoding='utf-8'))
    cards, idx = [], 0
    for ch in d.get('chapters', []):
        ch_name = ch.get('chapter', '')
        for sec in ch.get('sections', []):
            sec_name = sec.get('section', '')
            for sb in sec.get('subsections', []):
                html = sb.get('html', '') or ''
                title = sb.get('section', '')
                # 要点：<li> 条目
                lis = [clean(x) for x in re.findall(r'<li[^>]*>(.*?)</li>', html, re.S)]
                pts, seen = [], set()
                for t in lis:
                    t = cut(t, 88)
                    if len(t) < 8:
                        continue
                    key = t[:18]
                    if key in seen:
                        continue
                    seen.add(key)
                    pts.append(t)
                    if len(pts) >= 5:
                        break
                if not pts:
                    # 无列表：用段落文本兜底
                    ps = [clean(x) for x in re.findall(r'<p[^>]*>(.*?)</p>', html, re.S)]
                    ps = [cut(p, 88) for p in ps if len(p) >= 15]
                    pts = ps[:3]
                if not pts:
                    continue
                # 易错点/提示：优先 key-callout，其次含"易错/注意/陷阱"的条目
                tip = ''
                callouts = [clean(x) for x in re.findall(r'<div class="key-callout">(.*?)</div>', html, re.S)]
                if callouts:
                    tip = cut(callouts[0], 100)
                if not tip:
                    for t in lis:
                        if re.search(r'易错|注意|陷阱|勿混|别混|不要', t):
                            tip = cut(t, 100)
                            break
                # tip 若与某条要点重复（前 20 字相同）则丢弃，避免背面信息冗余
                if tip and any(tip[:20] == p[:20] for p in pts):
                    tip = ''
                idx += 1
                cards.append({
                    'id': f'{subj}_card_{idx:03d}',
                    'chapter': ch_name,
                    'section': sec_name,
                    'title': title,
                    'points': pts,
                    'tip': tip
                })
    return cards

out = {'subject': 'cards', 'name': '408 记忆卡', 'subjects': SUBS, 'cards': {}}
for s in SUBS:
    out['cards'][s] = build(s)
    print(f'{s}: {len(out["cards"][s])} 张卡')

dst = os.path.join(ROOT, 'pwa', 'data', 'cards.json')
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print('已生成', dst, os.path.getsize(dst) // 1024, 'KB')
