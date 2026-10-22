# -*- coding: utf-8 -*-
"""
按新的「王道章节结构」重新生成《数据结构题库知识点归纳.md》。

数据源：pwa/data/ds.json（633 题，section/subsection 已按王道节名归一，
number 已按 章→节→小节 重排）。

内容组织：
  章（题数 + Q 区间）→ 节（题数 + Q 区间）→ 小节
  每个小节按题号列出考点句（取自解析首句，即该题的结论），真题标注年份。
  文末附「统考真题年份索引」与「各节题量总表」。

用法：python _gen_ds_notes_md.py
"""
import json
import re
import collections

BANK = 'pwa/data/ds.json'
OUT = '数据结构题库知识点归纳.md'


def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    s = re.sub(r'&[a-z]+;|&#\d+;', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def conclusion(q):
    """解析首句作为该题的结论/考点句。"""
    e = clean(q.get('explanation'))
    e = re.sub(r'^(解析|答案|详解)\s*[:：]\s*', '', e)
    if not e:
        return ''
    m = re.split(r'(?<=[。；!？])', e)
    first = next((x for x in m if len(x.strip()) >= 8), e)
    return first.strip()[:96]


def year_of(q):
    m = re.search(r'【\s*(2\d{3})\s*年?\s*统\s*考\s*真\s*题\s*】', q.get('content') or '')
    return int(m.group(1)) if m else None


def main():
    d = json.load(open(BANK, encoding='utf-8'))
    qs = d['questions']
    assert [q['number'] for q in qs] == list(range(1, len(qs) + 1)), '题号不连续，先跑 _renumber_ds.py'

    chapters = collections.OrderedDict()
    for q in qs:
        ch = q.get('chapter') or '未分类'
        chapters.setdefault(ch, collections.OrderedDict())
        sec = q.get('section') or '未分节'
        chapters[ch].setdefault(sec, collections.OrderedDict())
        sub = q.get('subsection') or ''
        chapters[ch][sec].setdefault(sub, []).append(q)

    L = []
    L.append('# 数据结构题库知识点归纳')
    L.append('')
    L.append(f'> 数据来源：`pwa/data/ds.json` 全部 {len(qs)} 题（section/subsection 按王道教材节名归一，'
             f'number 按 章→节→小节 连续编号）。')
    L.append('> 每个小节点位句取自该题**解析首句**（即结论），真题题目标注年份；'
             '按小节筛题时与右侧章节树一一对应。')
    L.append('')

    # 各节题量总表
    L.append('## 各节题量总表')
    L.append('')
    L.append('| 章 | 节 | 题数 | Q 区间 |')
    L.append('|---|---|---:|---|')
    for ch, secs in chapters.items():
        first = True
        for sec, subs in secs.items():
            lo = min(q['number'] for sl in subs.values() for q in sl)
            hi = max(q['number'] for sl in subs.values() for q in sl)
            L.append(f'| {ch if first else ""} | {sec} | {hi - lo + 1} | Q{lo}–Q{hi} |')
            first = False
    L.append('')

    # 逐章逐节
    for ch, secs in chapters.items():
        chn = sum(len(sl) for subs in secs.values() for sl in subs.values())
        clo = min(q['number'] for subs in secs.values() for sl in subs.values() for q in sl)
        chi = max(q['number'] for subs in secs.values() for sl in subs.values() for q in sl)
        L.append(f'## {ch}（{chn} 题，Q{clo}–Q{chi}）')
        L.append('')
        for sec, subs in secs.items():
            slo = min(q['number'] for sl in subs.values() for q in sl)
            shi = max(q['number'] for sl in subs.values() for q in sl)
            L.append(f'### {sec}（{shi - slo + 1} 题，Q{slo}–Q{shi}）')
            L.append('')
            for sub, sl in subs.items():
                if sub:
                    L.append(f'**{sub}**（{len(sl)} 题）')
                    L.append('')
                for q in sorted(sl, key=lambda x: x['number']):
                    y = year_of(q)
                    tag = f'【{y}统考真题】' if y else ''
                    c = conclusion(q)
                    L.append(f'- Q{q["number"]}{tag} {c}')
                L.append('')

    # 真题年份索引
    by_year = collections.defaultdict(list)
    for q in qs:
        y = year_of(q)
        if y:
            by_year[y].append(q)
    L.append('## 统考真题年份索引')
    L.append('')
    L.append(f'共 {sum(len(v) for v in by_year.values())} 道统考真题，按年份分布：')
    L.append('')
    L.append('| 年份 | 题数 | 题号 |')
    L.append('|---|---:|---|')
    for y in sorted(by_year, reverse=True):
        ids = '、'.join(f'Q{q["number"]}' for q in by_year[y])
        L.append(f'| {y} | {len(by_year[y])} | {ids} |')
    L.append('')

    open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'已生成 {OUT}：{len(L)} 行，覆盖 {len(qs)} 题 / '
          f'{sum(len(s) for c in chapters.values() for s in c.values())} 节')


if __name__ == '__main__':
    main()
