# -*- coding: utf-8 -*-
"""
对比《27王道 数据结构·选择部分》PDF 与本地题库，找出缺题。

PDF 有文字层，可直接抽题号+题干；题库在 pwa/data/ds.json。
用法：python _diff_ds_vs_pdf.py
"""
import fitz
import json
import re
import collections
import sys

PDF = r'E:\Desktop\做题\408做题\408习题库\【A4紧凑】27王道《数据结构》 - 选择部分.pdf'
BANK = 'pwa/data/ds.json'


def norm(s):
    """归一化题干：去标签/空白/年份真题标记/全角括号，只留可比较的字符。"""
    s = re.sub(r'<[^>]+>', '', s or '')
    s = re.sub(r'【[^】]*】', '', s)
    s = re.sub(r'[\s\u3000]+', '', s)
    s = s.replace('（', '(').replace('）', ')').replace('，', ',').replace('。', '')
    s = re.sub(r'[^\x00-\x7f\u4e00-\u9fff]', '', s)
    return s.lower()


def parse_pdf():
    d = fitz.open(PDF)
    lines = []
    for i in range(d.page_count):
        lines.extend(l.strip() for l in d[i].get_text().split('\n'))

    sec_pat = re.compile(r'^(\d+\.\d+)\s*(.+)$')
    q_pat = re.compile(r'^(\d{1,3})\.\s*(.*)$')
    sections = collections.OrderedDict()
    cur = None
    q = None          # {'no':, 'text': []}
    for l in lines:
        if not l:
            continue
        # 去掉页眉页脚/水印（做题本模板带公众号和页码）
        if re.search(r'公众号|做题本集结地|共\s*\d+\s*页|第\s*\d+\s*页|WD·|·\s*\d+\.', l):
            continue
        m = sec_pat.match(l)
        if m and len(l) < 40:
            cur = (m.group(1), m.group(2).strip())
            sections.setdefault(cur, [])
            q = None
            continue
        if l.startswith(('A.', 'B.', 'C.', 'D.', 'E.')) or l in ('一、单项选择题（答案见P', '答案'):
            continue
        qm = q_pat.match(l)
        if qm and cur is not None:
            q = {'no': int(qm.group(1)), 'text': [qm.group(2)]}
            sections[cur].append(q)
            continue
        if q is not None and cur is not None and len(l) > 1:
            # 题干续行（选项行已在上面过滤）
            if not re.match(r'^[A-E]\.', l):
                q['text'].append(l)
    out = {}
    for sec, qs in sections.items():
        out[sec] = [{'no': q['no'], 'stem': ''.join(q['text'])} for q in qs]
    return out


def main():
    pdf = parse_pdf()
    bank = json.load(open(BANK, encoding='utf-8'))['questions']

    bank_sec = collections.defaultdict(list)
    for q in bank:
        m = re.match(r'^(\d+\.\d+)', q.get('section') or '')
        if m:
            bank_sec[m.group(1)].append(q)

    print('=== 各节题量对比（27版王道 vs 本地题库）===')
    print('%-6s %-24s %6s %6s %5s' % ('节', '名称', '王道', '本地', '差'))
    tot_p = tot_b = 0
    for (no, name), qs in pdf.items():
        bp = bank_sec.get(no, [])
        tot_p += len(qs)
        tot_b += len(bp)
        diff = len(bp) - len(qs)
        flag = '' if diff == 0 else ('  ← 少 %d' % (-diff) if diff < 0 else '  ← 多 %d' % diff)
        print('%-6s %-24s %6d %6d %5d%s' % (no, name.replace(' ​', ''), len(qs), len(bp), diff, flag))
    print('%-6s %-24s %6d %6d %5d' % ('合计', '', tot_p, tot_b, tot_b - tot_p))

    # 逐题比对：找出本地没有的王道题
    print('\n=== 本地题库缺失的题目 ===')
    bank_keys = collections.defaultdict(set)
    for q in bank:
        m = re.match(r'^(\d+\.\d+)', q.get('section') or '')
        if m:
            bank_keys[m.group(1)].add(norm(q.get('content'))[:60])

    missing_total = 0
    for (no, name), qs in pdf.items():
        miss = []
        for q in qs:
            k = norm(q['stem'])[:60]
            if not k:
                continue
            hit = any(k[:18] in b or b[:18] in k for b in bank_keys.get(no, []))
            if not hit:
                miss.append(q)
        if miss:
            missing_total += len(miss)
            print(f'\n[{no} {name}] 缺 {len(miss)} 题：')
            for q in miss:
                print(f'   {no}-{q["no"]}: {q["stem"][:70]}')
    print(f'\n合计缺失 {missing_total} 题')


if __name__ == '__main__':
    main()
