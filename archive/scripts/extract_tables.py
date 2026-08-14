#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, json, re, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]

doc = fitz.open(pdf_path)
print(f'PDF: {os.path.basename(pdf_path)} ({len(doc)}页)')

# 扫描所有页面找表格
for i, page in enumerate(doc):
    text = page.get_text()
    
    # 找含表格特征的行（多列对齐、含|或空格分隔）
    lines = text.split('\n')
    table_lines = []
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # 表格特征：含多个空格对齐 或 | 分隔
        if '  ' in stripped or '|' in stripped or '｜' in stripped:
            cells = [c.strip() for c in re.split(r'\s{2,}|[|｜]', stripped) if c.strip()]
            if len(cells) >= 3:
                table_lines.append(stripped)
    
    if table_lines:
        print(f'\n=== 第{i+1}页 ({len(table_lines)}行表格) ===')
        for line in table_lines[:10]:
            print(f'  {line}')
        if len(table_lines) > 10:
            print(f'  ... 共{len(table_lines)}行')

doc.close()
