#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
OUT_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

SUBJECTS = {
    'ds': '数据结构',
    'cn': '计算机网',
    'os': '操作系统'
}

def extract_figure_pages(subj_key):
    """找含"图"关键词的页面，渲染为图片"""
    keyword = SUBJECTS[subj_key]
    pdf_path = glob.glob(os.path.join(PDF_DIR, f'*{keyword}*.pdf'))
    if not pdf_path:
        print(f'{subj_key.upper()}: PDF未找到')
        return 0
    
    pdf_path = pdf_path[0]
    doc = fitz.open(pdf_path)
    out_dir = os.path.join(OUT_DIR, subj_key)
    os.makedirs(out_dir, exist_ok=True)
    
    print(f'{subj_key.upper()}: {os.path.basename(pdf_path)} ({len(doc)}页)')
    
    total = 0
    for i, page in enumerate(doc):
        text = page.get_text()
        
        # 含"图"关键词（但排除正文描述中的"图"字）
        # 更精确：找"图X-X"格式 或 "如图所示" 或 含"图"且页面有大图片
        has_figure_ref = bool(re.search(r'图\s*\d+[－\-]', text))  # 图1-1, 图2-1等
        has_figure_desc = '如图所示' in text or '如下图所示' in text
        
        # 找页面中的非整页图片
        imgs = page.get_images(full=True)
        has_large_img = any(
            fitz.Pixmap(doc, img[0]).width > 200 
            for img in imgs 
            if img[0] < len(doc) * 100  # 粗略xref过滤
        ) if imgs else False
        
        if has_figure_ref or has_figure_desc:
            mat = fitz.Matrix(2, 2)  # 2x
            pix = page.get_pixmap(matrix=mat)
            fname = f'p{i+1}.png'
            pix.save(os.path.join(out_dir, fname))
            total += 1
            pix = None
        
        if (i+1) % 50 == 0:
            print(f'  已处理 {i+1}页，找到 {total}个含图页面')
    
    doc.close()
    print(f'  总计: {total}个含图页面')
    return total

for subj in ['ds', 'cn', 'os']:
    extract_figure_pages(subj)
