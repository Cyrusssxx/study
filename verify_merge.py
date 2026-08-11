#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
d = json.load(open(r'D:/ai code/408-quiz-app/data/notes/co_notes.json', 'r', encoding='utf-8'))
print(f"subject: {d['subject']}")
print(f"version: {d['version']}")
print(f"chapters: {len(d['chapters'])}")
for c in d['chapters']:
    print(f"  {c['chapter']}: {len(c['sections'])} sections")
    for s in c['sections']:
        html_len = len(s['html'])
        print(f"    - {s['section'][:30]}: {html_len} chars")
