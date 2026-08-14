#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

def textbook_to_pdf_page(textbook_page, offset):
    return textbook_page + offset

def extract_toc_with_pages(doc):
    """提取目录，获取章节页码"""
    # 简化：扫描前10页找目录
    toc_pages = []
    for i in range(min(10, len(doc))):
        text = doc[i].get_text()
        if '目 录' in text or '目录' in text:
            toc_pages.append(i)
    
    if not toc_pages:
        return [], []
    
    # 从目录页提取章节信息
    chapters = []
    sections = []
    
    for pg in toc_pages:
        text = doc[pg].get_text()
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            # 匹配 "第X章 标题" 或 "X.Y 标题"
            m = re.match(r'第(\d+)章\s+(.+)', line)
            if m:
                ch_num = int(m.group(1))
                title = m.group(2).strip()
                # 清理页码
                title = re.sub(r'\s*\.+\s*\d+\s*$', '', title)
                chapters.append({'num': ch_num, 'title': title, 'textbook_page': None})
            
            m2 = re.match(r'(\d+\.\d+)\s+(.+)', line)
            if m2:
                full_num = m2.group(1)
                ch_num = int(full_num.split('.')[0])
                title = m2.group(2).strip()
                title = re.sub(r'\s*\.+\s*\d+\s*$', '', title)
                sections.append({'full_num': full_num, 'ch_num': ch_num, 'title': title, 'textbook_page': None})
    
    return chapters, sections

def get_section_pages(subj_key):
    """获取每个章节的PDF页码范围"""
    pdf_path = find_pdf('计算机网' if subj_key == 'cn' else '操作系统')
    if not pdf_path:
        return {}
    
    doc = fitz.open(pdf_path)
    
    # 扫描每一页找章节标题
    ch_pattern = re.compile(r'第(\d+)\章\s+(.+)')
    sec_pattern = re.compile(r'(\d+\.\d+)\s+(.+)')
    
    ch_pages = {}  # ch_num -> (start_pdf_page, end_pdf_page)
    sec_pages = {}  # full_num -> (start_pdf_page, end_pdf_page)
    
    current_ch = None
    current_sec = None
    
    for i, page in enumerate(doc):
        text = page.get_text()
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # 章标题
            m = ch_pattern.match(line)
            if m:
                ch_num = int(m.group(1))
                if current_ch:
                    ch_pages[current_ch] = (ch_pages[current_ch][0], i)
                current_ch = ch_num
                ch_pages[ch_num] = (i, None)
                
                # 同一页可能还有子节
                continue
            
            # 节标题
            m2 = sec_pattern.match(line)
            if m2 and current_ch:
                full_num = m2.group(1)
                if current_sec:
                    sec_pages[current_sec] = (sec_pages[current_sec][0], i)
                current_sec = full_num
                sec_pages[full_num] = (i, None)
    
    # 最后一个
    if current_ch:
        ch_pages[current_ch] = (ch_pages[current_ch][0], len(doc))
    if current_sec:
        sec_pages[current_sec] = (sec_pages[current_sec][0], len(doc))
    
    doc.close()
    return ch_pages, sec_pages

for subj in ['cn', 'os']:
    ch_pages, sec_pages = get_section_pages(subj)
    print(f'=== {subj.upper()} ===')
    print(f'章节页码: {ch_pages}')
    print(f'小节页码(前5): {dict(list(sec_pages.items())[:5])}')
