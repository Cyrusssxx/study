# -*- coding: utf-8 -*-
"""
对比《27王道 数据结构·选择部分》与本地题库第 8 章（排序）的题目顺序。

用法：python _diff_ds_ch8_order.py
"""
import fitz
import json
import re
import collections
import difflib

PDF = r'E:\Desktop\做题\408做题\408习题库\【A4紧凑】27王道《数据结构》 - 选择部分.pdf'
BANK = 'pwa/data/ds.json'


def norm(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    s = re.sub(r'【[^】]*】', ' ', s)
    s = re.sub(r'[\s\u3000]+', '', s)
    s = (s.replace('（', '(').replace('）', ')').replace('，', ',')
          .replace('。', '').replace('；', ';').replace('！', '').replace('？', ''))
    return re.sub(r'[^\x00-\x7f\u4e00-\u9fff]', '', s).lower()


def parse_pdf():
    d = fitz.open(PDF)
    lines = []
    for i in range(d.page_count):
        lines.extend(l.strip() for l in d[i].get_text().split('\n'))
    sec_pat = re.compile(r'^(\d+\.\d+)\s*(.+)$')
    q_pat = re.compile(r'^(\d{1,3})\.\s*(.*)$')
    secs = collections.OrderedDict()
    cur, q = None, None
    for l in lines:
        if not l or re.search(r'公众号|做题本集结地|共\s*\d+\s*页|第\s*\d+\s*页|WD·', l):
            continue
        m = sec_pat.match(l)
        if m and len(l) < 40:
            cur = m.group(1)
            secs.setdefault(cur, [])
            q = None
            continue
        if l.startswith(('A.', 'B.', 'C.', 'D.', 'E.')):
            continue
        qm = q_pat.match(l)
        if qm and cur:
            q = {'no': int(qm.group(1)), 't': qm.group(2)}
            secs[cur].append(q)
            continue
        if q is not None:
            q['t'] += l
    return secs


def main():
    secs = parse_pdf()
    bank = json.load(open(BANK, encoding='utf-8'))['questions']
    ch8 = [q for q in bank if (q.get('chapter') or '').startswith('第8章')]

    by_sec = collections.OrderedDict()
    for q in ch8:
        m = re.match(r'^(\d+\.\d+)', q.get('section') or '')
        by_sec.setdefault(m.group(1) if m else '?', []).append(q)

    for no, qs in by_sec.items():
        pq = secs.get(no, [])
        print(f'\n=== {no} {qs[0].get("section")}｜王道 {len(pq)} 题 / 本地 {len(qs)} 题 ===')
        # 本地每道题在王道里的位置
        pos = []
        for q in qs:
            k = norm(q.get('content'))[:70]
            best, bi = 0, None
            for i, item in enumerate(pq):
                r = difflib.SequenceMatcher(None, k, norm(item['t'])[:70]).ratio()
                if r > best:
                    best, bi = r, i
            pos.append(bi + 1 if (bi is not None and best >= 0.5) else 0)
        # 打印本地顺序 vs 王道序号
        line = []
        for q, p in zip(qs, pos):
            line.append(f'Q{q["number"]}({p if p else "—"})')
        for i in range(0, len(line), 8):
            print('   ' + ' '.join(line[i:i + 8]))
        # 乱序检测：匹配上的王道序号是否单调递增
        seq = [p for p in pos if p]
        inv = sum(1 for i in range(len(seq) - 1) if seq[i] > seq[i + 1])
        print(f'   匹配 {len(seq)}/{len(qs)}，顺序逆序对 {inv} 处')


if __name__ == '__main__':
    main()
