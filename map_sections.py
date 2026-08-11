#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 读取题目数据
q_data = json.load(open(r'D:/ai code/408-quiz-app/pwa/data/co.json', 'r', encoding='utf-8'))
questions = q_data.get('questions', q_data) if isinstance(q_data, dict) else q_data

# 读取笔记数据
n_data = json.load(open(r'D:/ai code/408-quiz-app/pwa/data/notes/co_notes.json', 'r', encoding='utf-8'))

# 收集题目中的所有 section
q_sections = set()
for q in questions:
    s = q.get('section', '')
    if s:
        q_sections.add(s)

# 收集笔记中的所有 section
n_sections = set()
for c in n_data['chapters']:
    for s in c['sections']:
        n_sections.add(s['section'])

print("=== 题目中的 section（旧名）===")
for s in sorted(q_sections):
    print(f"  {s}")

print(f"\n=== 笔记中的 section（新名）===")
for s in sorted(n_sections):
    print(f"  {s}")

print(f"\n=== 无法匹配的 section ===")
for s in sorted(q_sections):
    if s not in n_sections:
        print(f"  [题目] {s}")
        # 尝试模糊匹配
        for ns in sorted(n_sections):
            if ns[:4] == s[:4]:
                print(f"    -> 可能匹配: {ns}")
