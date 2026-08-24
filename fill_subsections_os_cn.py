#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fill_subsections_os_cn.py
全面补全 os/cn 题库的 subsection（小节级知识点映射）。
策略：
  1. 笔记小节标题 → 字符 bigram 特征（含去数字编号）
  2. 对每道缺 subsection 的题，在所属节的候选小节里按 bigram 命中打分（稀有度加权 IDF）
  3. top1 显著领先（或唯一命中）才指派；否则留空回落节级
  4. 校验已映射题：subsection 编号前缀必须与 section 一致，不一致报告为疑似错映射
"""
import json, re, os, sys, math
from collections import Counter

if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

ROOT = os.path.dirname(os.path.abspath(__file__))
NOTES_DIR = os.path.join(ROOT, 'pwa', 'data', 'notes')
QDIR = os.path.join(ROOT, 'pwa', 'data')

def strip_html(h):
    return re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', h or ''))

def bigrams(s):
    s = re.sub(r'^[\d.．\s]+', '', s)          # 去编号前缀
    s = re.sub(r'[（）()、，,。：:；;的与和及]', '', s)  # 去虚词/标点
    return {s[i:i+2] for i in range(len(s)-1)} if len(s) > 1 else ({s} if s else set())

def load_notes(sub):
    d = json.load(open(os.path.join(NOTES_DIR, f'{sub}_notes.json'), encoding='utf-8'))
    sec2subs = {}
    for ch in d['chapters']:
        for sec in ch.get('sections', []):
            subs = []
            for sb in sec.get('subsections', []):
                name = sb.get('section', '')
                subs.append({'name': name, 'bg': bigrams(name)})
            sec2subs[sec['section']] = subs
    return sec2subs

def q_text(q):
    parts = [q.get('content',''), q.get('explanation','')]
    for v in (q.get('options') or {}).values():
        parts.append(v)
    return strip_html(''.join(parts))

def fill(sub):
    print(f'\n================ {sub} ================')
    sec2subs = load_notes(sub)
    # idf：bigram 在候选小节中的普遍度（跨全科目小节集合）
    all_bg = Counter()
    for subs in sec2subs.values():
        for sb in subs:
            all_bg.update(sb['bg'])
    total_subs = sum(len(v) for v in sec2subs.values())
    def idf(b):
        return math.log((total_subs + 1) / (sum(1 for subs in sec2subs.values() for sb in subs if b in sb['bg']) + 1))

    qp = os.path.join(QDIR, f'{sub}.json')
    data = json.load(open(qp, encoding='utf-8'))
    qs = data.get('questions', [])
    miss = [q for q in qs if not q.get('subsection')]
    bad_prefix = []
    fixed = 0
    unresolved_by_sec = Counter()
    assigned_by_sub = Counter()

    # 先校验已映射的前缀一致性
    for q in qs:
        ss = q.get('subsection') or ''
        sec = q.get('section') or ''
        m1 = re.match(r'^(\d+\.\d+)\.\d+', ss)
        m2 = re.match(r'^(\d+\.\d+)', sec)
        if ss and m1 and m2 and m1.group(1) != m2.group(1):
            bad_prefix.append((q['id'], sec, ss))

    for q in miss:
        sec = q.get('section') or ''
        cands = sec2subs.get(sec)
        if not cands:
            unresolved_by_sec[sec or '(无节)'] += 1
            continue
        text = q_text(q)
        scored = []
        for sb in cands:
            hits = {b for b in sb['bg'] if b in text}
            sc = sum(idf(b) for b in hits)
            # 完整标题（去空格）出现在正文 → 强信号加成
            if re.sub(r'\s','',sb['name']) in text:
                sc += 6
            scored.append((sc, len(hits), sb['name']))
        scored.sort(reverse=True)
        top = scored[0]
        second = scored[1] if len(scored) > 1 else (0,0,'')
        ok = top[0] > 0 and (second[0] == 0 or top[0] >= second[0] * 1.15)
        if ok:
            q['subsection'] = top[2]
            fixed += 1
            assigned_by_sub[top[2]] += 1
        else:
            unresolved_by_sec[sec] += 1

    # ---- 第二轮（增强）：对仍未指派的题，用小节正文 bigram（取节内区分度最高的前N个）再打分 ----
    def enrich(subs):
        sec_texts = []
        for sb in subs:
            t = strip_html(sb.get('html', ''))
            bg = Counter()
            for i in range(len(t)-1):
                bg[t[i:i+2]] += 1
            sec_texts.append((sb, bg))
        return sec_texts

    def enrich2(subs):
        out = []
        for sb in subs:
            t = strip_html(sb.get('html', ''))
            cnt = Counter(t[i:i+2] for i in range(len(t)-1))
            # 取该小节文本中出现、且在本节其他小节中较少出现的判别性 bigram
            scored = []
            for b, c in cnt.items():
                others = sum(1 for o in subs if o is not sb and (b in o.get('_bgset', set())))
                if others <= len(subs)//2 and not re.match(r'^[\d.]+$', b):
                    scored.append((b, c * (1 + others)))
            scored.sort(key=lambda x: -x[1])
            sb['_feat'] = {b for b, _ in scored[:60]}
            out.append(sb)
        return out

    # 预计算每节候选的 html bigram set
    for sec, subs in sec2subs.items():
        for sb in subs:
            t = strip_html(sb.get('html', ''))
            sb['_bgset'] = {t[i:i+2] for i in range(len(t)-1)}

    fixed2 = 0
    for q in miss:
        if q.get('subsection'):
            continue
        sec = q.get('section') or ''
        cands = sec2subs.get(sec)
        if not cands:
            continue
        text = q_text(q)
        scored = []
        for sb in cands:
            sc_t = sum(idf(b) for b in sb['bg'] if b in text)
            sc_h = sum(1.0 for b in sb.get('_feat', set()) if b in text)
            scored.append((sc_t * 2 + sc_h, sb['name']))
        scored.sort(reverse=True)
        top = scored[0]
        second = scored[1] if len(scored) > 1 else (0, '')
        if top[0] > 3 and top[0] >= second[0] * 1.08:
            q['subsection'] = top[1]
            fixed2 += 1
            assigned_by_sub[top[1]] += 1

    json.dump(data, open(qp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    remain = sum(1 for q in qs if not q.get('subsection'))
    have = sum(1 for q in qs if q.get('subsection'))
    print(f'第二轮增强指派 {fixed2} 题；最终仍缺 {remain}；总覆盖 {have}/{len(qs)}')
    print(f'前缀不一致(疑似错映射): {len(bad_prefix)}')
    for t in bad_prefix[:10]:
        print('   ', t)
    if unresolved_by_sec:
        print('未能自信指派（回落节级）分布:')
        for k, v in sorted(unresolved_by_sec.items()):
            print(f'   {k}: {v}')
    print('新指派分布:')
    for k, v in sorted(assigned_by_sub.items()):
        print(f'   {k}: {v}')

for sub in ['os', 'cn']:
    fill(sub)
