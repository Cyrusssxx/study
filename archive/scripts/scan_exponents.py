# -*- coding: utf-8 -*-
"""扫描题库中疑似『2的幂被压平』的残留错误，输出到 exp_scan_report.txt 供人工确认"""
import json
import io
import os
import re

BASE = r'D:\ai code\408-quiz-app\data\questions'

# 各类可疑形态（宽松匹配，允许误报，人工筛）
PATTERNS = [
    ('flat_eq',    r'[^⁰¹²³⁴⁵⁶⁷⁸⁹0-9.]\d+(?:\.\d+)?[KMGT]?B?\s*=\s*2\d{1,3}(?![0-9⁰¹²³⁴⁵⁶⁷⁸⁹])'),  # N=2d
    ('eq_flat',    r'2\d{1,3}[KMGT]?B?\s*=\s*\d+(?:\.\d+)?[KMGT]B'),   # 2d=N单位
    ('unit_eq_2b', r'\d[KMGT]B\s*=\s*2B'),                             # 4KB=2B 指数全丢
    ('weird_sym',  r'2[°”“\'’+]'),                                     # 2° 2” 2' 2+
    ('ten_deg',    r'10[°”]'),                                         # 10° (10的幂被压平)
    ('mul_eq',     r'\d+\s*[x×]\s*\d+\s*=\s*2\d{1,3}(?![0-9⁰¹²³⁴⁵⁶⁷⁸⁹])'),  # 1024x16=214
    ('two_add',    r'2\d{1,3}\s*[+\-]\s*[（(]?-?[01]{4,}'),             # 27+01111111
    ('pow_pair',   r'2\d{2}-2\d{2}'),                                  # 232-215
    ('log_flat',   r'[l1]og\s*2\s*\d'),                                # log2N 残留
    ('flat_bits',  r'(\d+)位.{0,12}为2\d{0,3}B(?![0-9⁰¹²³⁴⁵⁶⁷⁸⁹])'),   # …24位…最大段长为22B
]

out = []
for k in ['ds', 'co', 'os', 'cn']:
    d = json.load(io.open(os.path.join(BASE, f'{k}.json'), encoding='utf-8'))
    for q in d['questions']:
        fields = {'content': q.get('content'), 'explanation': q.get('explanation')}
        for ok_, ov in (q.get('options') or {}).items():
            fields[f'opt_{ok_}'] = ov
        for fn, txt in fields.items():
            if not txt:
                continue
            hits = []
            for name, pat in PATTERNS:
                for m in re.finditer(pat, txt):
                    s = max(0, m.start() - 25)
                    hits.append(f'    [{name}] …{txt[s:m.end()+25]}…')
            if hits:
                out.append(f"{q['id']} [{fn}]")
                out.extend(hits)

with io.open(r'D:\ai code\408-quiz-app\exp_scan_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('lines:', len(out))
