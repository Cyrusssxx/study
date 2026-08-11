#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证并合并所有章节笔记为最终的 co_notes.json"""
import json
import os
import re
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'
OUTPUT_FILE = r'D:/ai code/408-quiz-app/data/notes/co_notes.json'

# 读取所有章节文件
chapter_files = [
    ('expand_co_ch1.json', 1, '计算机系统概述'),
    ('expand_co_ch2.json', 2, '数据的机器级表示'),
    ('expand_co_ch3.json', 3, '运算方法和运算部件'),
    ('expand_co_ch4.json', 4, '指令系统'),
    ('expand_co_ch5.json', 5, '中央处理器'),
    ('expand_co_ch6.json', 6, '指令流水线'),
    ('expand_co_ch7.json', 7, '存储器层次结构'),
    ('expand_co_ch8.json', 8, '系统互连及输入输出组织'),
    ('expand_co_ch9.json', 9, '并行处理系统'),
]

final_data = {
    'subject': '计算机组成原理',
    'source': '袁春风《计算机组成原理》为主 + 王道《计算机组成原理》为辅',
    'version': '2.0',
    'chapters': []
}

total_sections = 0
for fname, ch_num, ch_title in chapter_files:
    fpath = os.path.join(NOTES_DIR, fname)
    if not os.path.exists(fpath):
        print(f"WARNING: {fname} not found, skipping")
        continue
    
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    sections = data.get('sections', [])
    print(f"{fname}: {len(sections)} sections")
    total_sections += len(sections)
    
    chapter_data = {
        'chapter': f'第{ch_num}章',
        'title': f'第{ch_num}章 {ch_title}',
        'sections': []
    }
    
    for sec in sections:
        chapter_data['sections'].append({
            'section': sec['section'],
            'html': sec['html']
        })
    
    final_data['chapters'].append(chapter_data)

# 保存
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(final_data, f, ensure_ascii=False, indent=2)

print(f"\n=== 合并完成 ===")
print(f"总章数: {len(final_data['chapters'])}")
print(f"总小节数: {total_sections}")
print(f"输出文件: {OUTPUT_FILE}")
print(f"文件大小: {os.path.getsize(OUTPUT_FILE)} bytes")
