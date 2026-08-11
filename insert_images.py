#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从PDF提取章节-页码映射，然后插入图片到笔记
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

def extract_ch_pages(pdf_path):
    """扫描PDF获取章节页码"""
    doc = fitz.open(pdf_path)
    ch_pages = {}  # ch_num -> (start, end)
    sec_pages = {}  # full_num -> (start, end)
    
    current_ch = None
    current_sec = None
    
    for i, page in enumerate(doc):
        text = page.get_text()
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            # 匹配章标题（王道格式：第X章 标题 或 X 标题）
            m = re.match(r'第?(\d+)章\s*(.+)', line)
            if m and len(line) < 50:
                ch_num = int(m.group(1))
                if current_ch is not None:
                    ch_pages[current_ch] = (ch_pages[current_ch][0], i)
                current_ch = ch_num
                ch_pages[ch_num] = (i, None)
                current_sec = None
                continue
            
            # 匹配小节标题（X.Y 格式）
            m2 = re.match(r'^(\d+\.\d+)\s+(.+)', line)
            if m2 and current_ch and len(line) < 60:
                full_num = m2.group(1)
                if current_sec:
                    sec_pages[current_sec] = (sec_pages[current_sec][0], i)
                current_sec = full_num
                sec_pages[full_num] = (i, None)
    
    # 收尾
    if current_ch is not None:
        ch_pages[current_ch] = (ch_pages[current_ch][0], len(doc))
    if current_sec:
        sec_pages[current_sec] = (sec_pages[current_sec][0], len(doc))
    
    doc.close()
    return ch_pages, sec_pages

def insert_images(subj_key):
    """插入图片到笔记"""
    pdf_path = find_pdf('计算机网' if subj_key == 'cn' else '操作系统')
    if not pdf_path:
        print(f'{subj_key}: PDF not found')
        return
    
    # 获取章节页码
    ch_pages, sec_pages = extract_ch_pages(pdf_path)
    print(f'{subj_key.upper()} 章节页码: {ch_pages}')
    print(f'{subj_key.upper()} 小节页码(前3): {dict(list(sec_pages.items())[:3])}')
    
    # 加载图片映射
    img_json = os.path.join(IMG_DIR, subj_key, 'images.json')
    if not os.path.exists(img_json):
        print('No image mapping')
        return
    img_mapping = json.load(open(img_json, 'r', encoding='utf-8'))
    
    # 建立页码到图片的映射
    page_to_img = {img['page']: img for img in img_mapping}
    
    # 加载笔记
    notes_path = os.path.join(NOTES_DIR, f'{subj_key}_notes.json')
    data = json.load(open(notes_path, 'r', encoding='utf-8'))
    
    # 为每个小节找图片
    for ch in data['chapters']:
        for sec in ch['sections']:
            sec_name = sec['section']
            # 匹配小节号
            m = re.match(r'(\d+\.\d+)', sec_name)
            if not m:
                continue
            full_num = m.group(1)
            
            if full_num in sec_pages:
                start, end = sec_pages[full_num]
                # 取中间页的图片
                mid_page = (start + end) // 2 + 1  # 1-indexed
                # 找最近的图片
                best_page = None
                for p in range(mid_page, start, -1):
                    if p in page_to_img:
                        best_page = p
                        break
                if not best_page:
                    for p in range(mid_page, end + 1):
                        if p in page_to_img:
                            best_page = p
                            break
                
                if best_page:
                    img = page_to_img[best_page]
                    img_tag = f'<img src="data/notes/images/{subj_key}/{img["file"]}" alt="{sec_name}" style="max-width:100%;margin:12px 0;border-radius:8px;" />'
                    # 插入到HTML开头
                    sec['html'] = img_tag + '\n' + sec['html']
                    print(f'  {sec_name}: 插入图片 p{best_page}')
                else:
                    print(f'  {sec_name}: 无图片 ({start}-{end})')
    
    # 保存
    with open(notes_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'{subj_key.upper()} 图片插入完成')

insert_images('cn')
insert_images('os')
