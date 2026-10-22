# -*- coding: utf-8 -*-
"""
按《27王道 数据结构·选择部分》的题目顺序重排本地题库。

背景：本地题库由 25 版王道 + 历年真题补充而成，同一节内的题目顺序与王道不一致
（全书共 46 处逆序对，第 8 章最明显）。

做法：
  1) 解析 PDF，拿到每节的题目顺序
  2) 把本地每题匹配到王道第几题（相似度 ≥ 0.55 才认）
  3) 节内按王道顺序排；王道里没有的题（本地补充题）排在该节末尾，保持原有相对顺序
  4) 重新编号 number = 1..N（id 不变）

用法：python _reorder_ds_by_pdf.py [--dry]
"""
import fitz
import json
import re
import sys
import shutil
import collections
import difflib
from datetime import datetime

PDF = r'E:\Desktop\做题\408做题\408习题库\【A4紧凑】27王道《数据结构》 - 选择部分.pdf'
FILES = ['pwa/data/ds.json', 'data/questions/ds.json']
BACKUP_DIR = 'archive/backups_questions'
DRY = '--dry' in sys.argv
THRESHOLD = 0.55


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


def match_pos(q, pq):
    """返回 (王道序号 1-based, 相似度)，没匹配上返回 (0, 0)。"""
    k = norm(q.get('content'))[:70]
    best, bi = 0, None
    for i, item in enumerate(pq):
        r = difflib.SequenceMatcher(None, k, norm(item['t'])[:70]).ratio()
        if r > best:
            best, bi = r, i
    if bi is None or best < THRESHOLD:
        return 0, best
    return bi + 1, best


def main():
    secs = parse_pdf()
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        for p in FILES:
            shutil.copy2(p, f'{BACKUP_DIR}/ds_{ts}_before_reorder.json')
        print(f'已备份 {BACKUP_DIR}/ds_{ts}_before_reorder.json')

    for path in FILES:
        data = json.load(open(path, encoding='utf-8'))
        by_sec = collections.OrderedDict()
        for q in data['questions']:
            m = re.match(r'^(\d+\.\d+)', q.get('section') or '')
            by_sec.setdefault(m.group(1) if m else '?', []).append(q)

        low = []
        unmatched = []
        for no, qs in by_sec.items():
            pq = secs.get(no, [])
            info = []
            for idx, q in enumerate(qs):
                pos, score = match_pos(q, pq)
                info.append((q, pos, score, idx))
                if pos and score < 0.75:
                    low.append((no, q['number'], q.get('content', '')[:50], round(score, 2)))
                if not pos:
                    unmatched.append((no, q['number'], q.get('content', '')[:50]))
            # 王道顺序优先，未匹配的按原顺序排末尾
            info.sort(key=lambda x: (0, x[1]) if x[1] else (1, x[3]))
            by_sec[no] = [x[0] for x in info]

        # 按章号重排节，再拼回
        def sec_key(no):
            a, b = (no.split('.') + ['0'])[:2]
            return (int(a), int(b))

        ordered = []
        for no in sorted(by_sec, key=sec_key):
            ordered.extend(by_sec[no])
        for i, q in enumerate(ordered, 1):
            q['number'] = i
        data['questions'] = ordered
        data['total'] = len(ordered)

        if not DRY:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write('\n')
        print(f'{path}: {len(ordered)} 题')

    # 校验（dry 模式下同样用内存里刚排好的结果）
    data = json.loads(json.dumps(data))
    by_sec = collections.OrderedDict()
    for q in data['questions']:
        m = re.match(r'^(\d+\.\d+)', q.get('section') or '')
        by_sec.setdefault(m.group(1) if m else '?', []).append(q)

    print('\n=== 重排后校验 ===')
    inv_total = 0
    sub_scatter = []
    for no, qs in by_sec.items():
        pq = secs.get(no, [])
        pos = [match_pos(q, pq)[0] for q in qs]
        seq = [p for p in pos if p]
        inv = sum(1 for i in range(len(seq) - 1) if seq[i] > seq[i + 1])
        inv_total += inv
        # 小节是否连续
        subs = [q.get('subsection') or '' for q in qs]
        seen, scatter = set(), 0
        for s in subs:
            if s in seen and s != prev:
                scatter += 1
            seen.add(s)
            prev = s
        if scatter:
            sub_scatter.append((no, scatter))
    print(f'逆序对：{inv_total}（重排前 46）')
    print('小节不连续的节：', sub_scatter or '无')

    print(f'\n低置信匹配（<0.75）{len(low)} 条：')
    for x in low[:12]:
        print('   ', x)
    print(f'\n王道里没有的本地题 {len(unmatched)} 条：')
    for x in unmatched[:12]:
        print('   ', x)


if __name__ == '__main__':
    main()
