#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查 DS/CN/OS 题目 section 名与新笔记的匹配情况
"""
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

for subj in ['ds', 'cn', 'os']:
    # 读取题目
    qs = json.load(open(f'D:/ai code/408-quiz-app/pwa/data/{subj}.json', 'r', encoding='utf-8'))
    questions = qs.get('questions', qs) if isinstance(qs, dict) else qs
    q_secs = set(q.get('section', '') for q in questions if q.get('section'))
    
    # 读取新笔记
    n = json.load(open(f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json', 'r', encoding='utf-8'))
    n_secs = set(s['section'] for c in n['chapters'] for s in c['sections'])
    
    # 匹配
    matched = q_secs & n_secs
    unmatched = q_secs - n_secs
    
    print(f'=== {subj.upper()} ===')
    print(f'题目section: {len(q_secs)}个')
    print(f'笔记section: {len(n_secs)}个')
    print(f'精确匹配: {len(matched)}个')
    print(f'未匹配: {len(unmatched)}个')
    if unmatched:
        print('未匹配的题目section:')
        for s in sorted(unmatched):
            print(f'  - {s}')
    print()
