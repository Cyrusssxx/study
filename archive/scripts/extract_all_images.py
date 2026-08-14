#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
OUT_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

os.makedirs(os.path.join(OUT_DIR, 'ds'), exist_ok=True)
os.makedirs(os.path.join(OUT_DIR, 'cn'), exist_ok=True)
os.makedirs(os.path.join(OUT_DIR, 'os'), exist_ok=True)

SUBJECTS = {
    'ds': '数据结构',
    'cn': '计算机网',
    'os': '操作系统'
}

def extract_images(subj_key):
    keyword = SUBJECTS[subj_key]
    pdf_path = glob.glob(os.path.join(PDF_DIR, f'*{keyword}*.pdf'))
    if not pdf_path:
        print(f'{subj_key.upper()}: PDF未找到')
        return
    
    pdf_path = pdf_path[0]
    doc = fitz.open(pdf_path)
    out_dir = os.path.join(OUT_DIR, subj_key)
    
    print(f'{subj_key.upper()}: {os.path.basename(pdf_path)} ({len(doc)}页)')
    
    total = 0
    for i, page in enumerate(doc):
        imgs = page.get_images(full=True)
        for j, img in enumerate(imgs):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            
            # 过滤小图
            if pix.width < 80 or pix.height < 80:
                pix = None
                continue
            
            # 转RGB
            if pix.n - pix.alpha > 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            
            fname = f'p{i+1}_i{j}.png'
            pix.save(os.path.join(out_dir, fname))
            total += 1
            pix = None
        
        if (i+1) % 50 == 0:
            print(f'  已处理 {i+1}页，提取 {total}张')
    
    doc.close()
    print(f'  总计: {total}张图片')

for subj in ['ds', 'cn', 'os']:
    extract_images(subj)
