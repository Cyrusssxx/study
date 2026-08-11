#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
插入图片到笔记v2：用简单启发式建立章节-页码映射
"""
import os, sys, json, re, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'
IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

def find_pdf(keyword):
    files = glob.glob(os.path.join(PDF_DIR, f'*{keyword}*.pdf'))
    return files[0] if files else None

def get_ch_page_ranges(pdf_path):
    """扫描PDF获取章节起始页（简化版）"""
    doc = fitz.open(pdf_path)
    total = len(doc)
    
    ch_starts = []
    
    for i, page in enumerate(doc):
        text = page.get_text()
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            m = re.match(r'第?(\d+)章\s+(.+)', line)
            if m and len(line) < 40:
                ch_num = int(m.group(1))
                ch_starts.append((ch_num, i))
    
    doc.close()
    
    ranges = {}
    for idx, (ch_num, start) in enumerate(ch_starts):
        end = ch_starts[idx + 1][1] if idx + 1 < len(ch_starts) else total
        ranges[ch_num] = (start, end)
    
    return ranges

def insert_images(subj_key):
    keyword = '计算机网' if subj_key == 'cn' else '操作系统'
    pdf_path = find_pdf(keyword)
    if not pdf_path:
        print(f'{subj_key}: PDF not found')
        return
    
    ranges = get_ch_page_ranges(pdf_path)
    print(f'{subj_key.upper()} 章节范围: {ranges}')
    
    # 加载图片目录
    img_dir = os.path.join(IMG_DIR, subj_key)
    img_files = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    if not img_files:
        print('No images found')
        return
    
    # 加载笔记
    notes_path = os.path.join(NOTES_DIR, f'{subj_key}_notes.json')
    data = json.load(open(notes_path, 'r', encoding='utf-8'))
    
    total_inserted = 0
    
    for ch in data['chapters']:
        ch_num_match = re.search(r'第(\d+)章', ch['chapter'])
        if not ch_num_match:
            continue
        ch_num = int(ch_num_match.group(1))
        
        if ch_num not in ranges:
            continue
        
        ch_start, ch_end = ranges[ch_num]
        ch_pages = ch_end - ch_start
        
        sections = ch['sections']
        for idx, sec in enumerate(sections):
            # 估算该节在章节中的相对位置
            ratio = idx / max(len(sections), 1)
            pdf_page = ch_start + int(ratio * ch_pages) + 1  # 1-indexed
            
            # 找最近的图片
            best_page = None
            for offset in range(0, ch_pages):
                for sign in [0, 1, -1, 2, -2]:
                    p = pdf_page + sign * offset
                    if 1 <= p <= len(img_files):
                        img_path = os.path.join(img_dir, f'p{p}_i0.png')
                        if os.path.exists(img_path):
                            best_page = p
                            break
                if best_page:
                    break
            
            if best_page:
                img_file = f'p{best_page}_i0.png'
                img_path = os.path.join(img_dir, img_file)
                if not os.path.exists(img_path):
                    # 找最近的实际图片
                    existing = sorted(glob.glob(os.path.join(img_dir, '*.png')))
                    if existing:
                        # 找最近的页码
                        best_idx = min(range(len(existing)), key=lambda i: abs(int(re.search(r'p(\d+)', os.path.basename(existing[i])).group(1)) - best_page))
                        img_file = os.path.basename(existing[best_idx])
                    else:
                        continue
                img_tag = f'<img src="data/notes/images/{subj_key}/{img_file}" alt="{sec["section"]}" style="max-width:100%;margin:12px 0;border:1px solid #ddd;border-radius:8px;" loading="lazy" />'
                sec['html'] = img_tag + '\n' + sec['html']
                total_inserted += 1
    
    with open(notes_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj_key.upper()}: 插入 {total_inserted}/{sum(len(c["sections"]) for c in data["chapters"])} 张图片')

insert_images('cn')
insert_images('os')
