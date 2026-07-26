# -*- coding: utf-8 -*-
"""导出指定题目的原文，便于人工确定修复串"""
import json
import io
import os

BASE = r'D:\ai code\408-quiz-app\data\questions'
IDS = ['ds_0022', 'ds_0184', 'ds_0196', 'ds_0205', 'ds_0213', 'ds_0423',
       'co_0023', 'co_0034', 'co_0051', 'co_0053', 'co_0068', 'co_0092', 'co_0107', 'co_0110',
       'co_0116', 'co_0117', 'co_0132', 'co_0142', 'co_0159', 'co_0191', 'co_0210', 'co_0253',
       'co_0257', 'co_0274', 'co_0288', 'co_0292', 'co_0308', 'co_0325', 'co_0459',
       'os_0373', 'os_0376', 'os_0378', 'os_0388', 'os_0426', 'os_0513',
       'cn_0012', 'cn_0013', 'cn_0064', 'cn_0069', 'cn_0145', 'cn_0183', 'cn_0213',
       'cn_0307', 'cn_0343', 'cn_0449']

out = []
for k in ['ds', 'co', 'os', 'cn']:
    d = json.load(io.open(os.path.join(BASE, f'{k}.json'), encoding='utf-8'))
    for q in d['questions']:
        if q['id'] in IDS:
            out.append('=' * 20 + ' ' + q['id'])
            out.append('[content] ' + (q.get('content') or ''))
            for ok_, ov in (q.get('options') or {}).items():
                out.append(f'[opt_{ok_}] {ov}')
            out.append('[explanation] ' + (q.get('explanation') or ''))

with io.open(r'D:\ai code\408-quiz-app\exp_dump.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done', len(out))
