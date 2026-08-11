#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
import fitz
doc = fitz.open(r'D:/ai code/408教材/计算机组成原理.pdf')
for i in range(min(30, len(doc))):
    p = doc[i]
    t = p.get_text()
    preview = t[:60].strip().replace('\n', ' ') if t else '(empty)'
    print(f'page {i+1}: {len(t)} chars - {preview}')
