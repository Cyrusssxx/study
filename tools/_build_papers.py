# -*- coding: utf-8 -*-
"""生成 pwa/data/papers.json —— 真题套卷索引。

数据源：
  - 四科选择题题库 ds/co/os/cn.json：题干前缀【YYYY 提取年份
  - 数据结构代码题 ds_code.json：year 字段
  - 大题专项 dati.json：subjects → chapters → sections → questions，year 字段

输出结构：
  { "years": [...], "papers": { "2025": {
      "choice": {"ds": [id], "co": [...], "os": [...], "cn": [...]},
      "code": [id], "dati": {"co": [id], ...},
      "choice_total": N, "big_total": N } } }

运行：python tools/_build_papers.py   （题库更新后重建一次）
"""
import collections
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'pwa', 'data')

YEARS = list(range(2009, 2026))


def load(name):
    return json.load(io.open(os.path.join(DATA, name), encoding='utf-8'))


def main():
    papers = collections.defaultdict(lambda: {
        'choice': {'ds': [], 'co': [], 'os': [], 'cn': []},
        'code': [],
        'dati': {},
    })

    # 1) 四科选择题：题干前缀【YYYY（统考真题）
    for subj in ('ds', 'co', 'os', 'cn'):
        for q in load(subj + '.json')['questions']:
            m = re.match(r'\s*【(\d{4})', q.get('content', ''))
            if not m:
                continue
            y = int(m.group(1))
            if y in YEARS:
                papers[y]['choice'][subj].append(q['id'])

    # 2) 数据结构代码题（每年 1 题，year 字段）
    for q in load('ds_code.json')['questions']:
        y = q.get('year')
        if y and int(y) in YEARS:
            papers[int(y)]['code'].append(q['id'])

    # 3) 大题专项（按科目分组，year 字段）
    for s in load('dati.json')['subjects']:
        for ch in s['chapters']:
            for sec in ch.get('sections', []):
                for q in sec.get('questions', []):
                    y = q.get('year')
                    if not y or int(y) not in YEARS:
                        continue
                    papers[int(y)]['dati'].setdefault(s['key'], []).append(q['id'])

    years = sorted(y for y in papers if papers[y]['choice']['ds'] or
                   papers[y]['choice']['co'] or papers[y]['choice']['os'] or
                   papers[y]['choice']['cn'] or papers[y]['code'] or papers[y]['dati'])

    out = {'years': years, 'papers': {}}
    for y in years:
        p = papers[y]
        choice_total = sum(len(p['choice'][k]) for k in ('ds', 'co', 'os', 'cn'))
        big_total = len(p['code']) + sum(len(v) for v in p['dati'].values())
        out['papers'][str(y)] = {
            'choice': p['choice'],
            'code': p['code'],
            'dati': p['dati'],
            'total': choice_total + big_total,
            'choice_total': choice_total,
            'big_total': big_total,
        }

    text = json.dumps(out, ensure_ascii=False, indent=1)
    with io.open(os.path.join(DATA, 'papers.json'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('OK: %d years -> pwa/data/papers.json' % len(years))
    for y in years:
        print('  %d: 选择 %d + 大题 %d' % (y, out['papers'][str(y)]['choice_total'],
                                          out['papers'][str(y)]['big_total']))


if __name__ == '__main__':
    main()
