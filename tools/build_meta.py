#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 data/meta.json：各科目题库题量 + 打卡表总数。

用途：首页 /api/stats 只需「总题数」来画进度条，但此前为读一个数字
被迫整份下载 4 份题库（~2.1MB）。本文件把题量抽成几百字节的小元数据，
首页只 fetch meta.json 即可，省掉 2.1MB 下载。

同时供首页打卡进度（ds_daka.total）使用，省掉 146KB 的 ds_daka.json 下载。

幂等：每次部署由 pre-commit / 手动调用重建；题量变化会自动反映。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA = os.path.join(ROOT, 'pwa')
DATA = os.path.join(PWA, 'data')


def _total(fname):
    p = os.path.join(DATA, fname)
    if not os.path.exists(p):
        return 0
    d = json.load(open(p, encoding='utf-8'))
    return d.get('total', len(d.get('questions', [])))


def _excluded_ids():
    """数据缺陷题（excluded: true）的 id 列表。

    loadQuestions 会把它们过滤掉（组不进卷、刷题不出现），但模拟考设置页的
    池子统计**不能**为了数一个"可组卷"去加载 2.9MB 题库（首屏性能护栏）。
    把名单抽进 meta.json（几百字节），pool 端点即可用 id 正则 + 本名单
    精确判定可组卷，与 getQuestionById 的解析结果保持一致。
    """
    ids = []
    for k in ('os', 'co', 'ds', 'cn'):
        p = os.path.join(DATA, f'{k}.json')
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding='utf-8'))
        for q in d.get('questions', []):
            if q.get('excluded'):
                ids.append(q['id'])
    return ids


def main():
    subjects = {k: {'total': _total(f'{k}.json')} for k in ('os', 'co', 'ds', 'cn')}
    meta = {
        'subjects': subjects,
        'ds_daka': _total('ds_daka.json'),
        'excluded_ids': _excluded_ids(),
    }
    out = os.path.join(DATA, 'meta.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('[完成] 生成', os.path.relpath(out, ROOT))
    for k, v in subjects.items():
        print(f'        {k}: {v["total"]} 题')
    print(f'        ds_daka: {meta["ds_daka"]} 题')
    print(f'        excluded_ids: {meta["excluded_ids"]}')


if __name__ == '__main__':
    main()
