#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, os, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

ROOT = os.path.dirname(os.path.abspath(__file__))
# notes 唯一真源现已统一到 pwa/data/notes（见 项目评估/单源改造）
NOTES_DIR = os.path.join(ROOT, 'pwa', 'data', 'notes')
IMG_DIR = os.path.join(NOTES_DIR, 'images')

for subj in ['cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    img_files = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    if not img_files:
        print(f'{subj}: 无图片')
        continue
    
    notes_path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(notes_path, 'r', encoding='utf-8'))
    
    # 按节均匀分配图片
    total_secs = sum(len(c['sections']) for c in data['chapters'])
    imgs_per_sec = max(1, len(img_files) // total_secs)
    
    img_idx = 0
    for ch in data['chapters']:
        for sec in ch['sections']:
            if img_idx < len(img_files):
                img_file = os.path.basename(img_files[img_idx])
                img_tag = f'<img src="data/notes/images/{subj}/{img_file}" alt="{sec["section"]}" style="max-width:100%;margin:12px 0;border-radius:8px;" loading="lazy" />'
                sec['html'] = img_tag + sec['html']
                img_idx += 1
    
    with open(notes_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()}: 插入 {img_idx} 张图片到 {total_secs} 节')
