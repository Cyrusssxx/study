#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
d = json.load(open(r'D:/ai code/408-quiz-app/pwa/data/co.json', 'r', encoding='utf-8'))
print(f"total: {len(d)}")
sections = set()
for q in d:
    s = q.get('section', '')
    if s:
        sections.add(s)
print(f"unique sections: {len(sections)}")
for s in sorted(sections)[:15]:
    print(f"  {s}")
