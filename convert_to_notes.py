#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 wangdao_xxx_full.json 转换为 xxx_notes.json 格式
"""
import json, sys, os
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

OUT_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'
NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

def convert(subj):
    src = os.path.join(OUT_DIR, f'wangdao_{subj}_full.json')
    dst = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    
    data = json.load(open(src, 'r', encoding='utf-8'))
    
    # 转换为笔记格式
    notes = {'chapters': []}
    for ch in data:
        ch_data = {
            'chapter': ch['chapter'],
            'sections': []
        }
        for sec in ch['sections']:
            ch_data['sections'].append({
                'section': sec['section'],
                'html': sec['html'],
            })
        notes['chapters'].append(ch_data)
    
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)
    
    # 统计
    ch_count = len(notes['chapters'])
    sec_count = sum(len(c['sections']) for c in notes['chapters'])
    size = os.path.getsize(dst)
    print(f'{subj.upper()}: {ch_count}章 {sec_count}节 -> {dst} ({size} bytes)')

if __name__ == '__main__':
    for subj in ['ds', 'cn', 'os']:
        convert(subj)
