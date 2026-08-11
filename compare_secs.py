#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

for subj in ['ds', 'cn', 'os']:
    # 旧笔记
    old=json.load(open(f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json','r',encoding='utf-8'))
    old_secs = [s['section'] for c in old['chapters'] for s in c['sections']]
    # 新提取
    new=json.load(open(f'D:/ai code/408-quiz-app/data/ocr_cache/wangdao_{subj}_full.json','r',encoding='utf-8'))
    new_secs = [s['section'] for c in new for s in c['sections']]
    print(f'=== {subj.upper()} ===')
    print(f'旧: {len(old_secs)}节, 新: {len(new_secs)}节')
    print()
