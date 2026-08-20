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


def main():
    subjects = {k: {'total': _total(f'{k}.json')} for k in ('os', 'co', 'ds', 'cn')}
    meta = {
        'subjects': subjects,
        'ds_daka': _total('ds_daka.json'),
    }
    out = os.path.join(DATA, 'meta.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('[完成] 生成', os.path.relpath(out, ROOT))
    for k, v in subjects.items():
        print(f'        {k}: {v["total"]} 题')
    print(f'        ds_daka: {meta["ds_daka"]} 题')


if __name__ == '__main__':
    main()
