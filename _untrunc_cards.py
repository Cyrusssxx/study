# -*- coding: utf-8 -*-
"""
把记忆卡要点里被硬截断（以 … 结尾）的句子还原成完整句。

_build_cards.py 抽要点时用 cut_sentence(t, 64) 截断，导致要点读到一半没了。
这里按卡片标题回笔记里找原句，用完整句替换。

用法：python _untrunc_cards.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
DRY = '--dry' in sys.argv


def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    s = re.sub(r'&[a-z]+;|&#\d+;', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def split_sentences(raw):
    raw = re.sub(r'<br\s*/?>', '。', raw)
    parts = [p for p in re.split(r'(?<=[。；;！？])', raw) if p.strip()]
    out = []
    for p in parts:
        t0 = clean(p)
        if t0.count('：') >= 3 and len(t0) > 40:
            for seg in re.split(r'：', t0):
                if seg.strip():
                    out.append(seg.strip() + '：')
        else:
            out.append(p)
    return out


def load_notes(subj):
    d = json.load(open(f'pwa/data/notes/{subj}_notes.json', encoding='utf-8'))
    m = {}
    for ch in d['chapters']:
        for s in ch['sections']:
            for sb in s.get('subsections') or []:
                m[sb.get('section')] = sb.get('html') or ''
    return m


def main():
    data = json.load(open(CARDS, encoding='utf-8'))
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        shutil.copy2(CARDS, f'{BACKUP_DIR}/cards_{ts}_before_untrunc.json')
        print(f'已备份 {BACKUP_DIR}/cards_{ts}_before_untrunc.json')

    fixed = miss = 0
    for subj, cards in data['cards'].items():
        notes = load_notes(subj)
        for c in cards:
            html = notes.get(c.get('title') or '')
            if not html:
                continue
            # 该小节所有候选原句（li + 段落）
            cands = []
            for li in re.findall(r'<li[^>]*>(.*?)</li>', html, re.S):
                cands.extend(split_sentences(li))
            for p in re.findall(r'<p[^>]*>(.*?)</p>', html, re.S):
                cands.extend(split_sentences(p))
            cands = [clean(x) for x in cands if len(clean(x)) >= 12]

            new_pts = []
            for p in c.get('points') or []:
                if not p.rstrip().endswith('…'):
                    new_pts.append(p)
                    continue
                head = p.rstrip()[:-1]                       # 去掉省略号
                plain = re.sub(r'\*\*', '', head)
                hit = next((x for x in cands if clean(x).startswith(plain[:20])), None)
                if hit and len(clean(hit)) > len(plain):
                    # 保留原有的 **重点** 标记位置（按子串重新套回）
                    marks = re.findall(r'\*\*(.+?)\*\*', p)
                    full = clean(hit)
                    for mk in marks:
                        if mk in full and f'**{mk}**' not in full:
                            full = full.replace(mk, f'**{mk}**', 1)
                    new_pts.append(full)
                    fixed += 1
                else:
                    new_pts.append(p)
                    miss += 1
            c['points'] = new_pts
            if c.get('tip') and c['tip'].rstrip().endswith('…'):
                head = re.sub(r'\*\*', '', c['tip'].rstrip()[:-1])
                hit = next((x for x in cands if clean(x).startswith(head[:20])), None)
                if hit and len(clean(hit)) > len(head):
                    c['tip'] = clean(hit)
                    fixed += 1

    if not DRY:
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f'还原 {fixed} 条，仍未找到原句 {miss} 条')


if __name__ == '__main__':
    main()
