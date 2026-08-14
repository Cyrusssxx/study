#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, json, re, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

os.makedirs(os.path.join(IMG_DIR, 'cn'), exist_ok=True)
os.makedirs(os.path.join(IMG_DIR, 'os'), exist_ok=True)

def find_pdf(keyword):
    """用 glob 查找 PDF 文件"""
    files = glob.glob(os.path.join(PDF_DIR, f'*{keyword}*.pdf'))
    if files:
        return files[0]
    return None

SUBJECTS = {
    'cn': {'keyword': '计算机网', 'img_dir': 'cn'},
    'os': {'keyword': '操作系统', 'img_dir': 'os'}
}

def extract_images(subj_key):
    cfg = SUBJECTS[subj_key]
    pdf_path = find_pdf(cfg['keyword'])
    if not pdf_path:
        print(f'{subj_key.upper()}: PDF未找到')
        return []
    
    out_dir = os.path.join(IMG_DIR, subj_key)
    doc = fitz.open(pdf_path)
    print(f'{subj_key.upper()}: {os.path.basename(pdf_path)}')
    print(f'  {len(doc)}页')
    
    all_images = []
    
    for i, page in enumerate(doc):
        img_list = page.get_images(full=True)
        
        for j, img in enumerate(img_list):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            
            if pix.width < 100 or pix.height < 100:
                pix = None
                continue
            
            if pix.n - pix.alpha > 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            
            fname = f'p{i+1}_i{j}.png'
            pix.save(os.path.join(out_dir, fname))
            all_images.append({'page': i+1, 'file': fname, 'w': pix.width, 'h': pix.height})
            pix = None
        
        if (i+1) % 50 == 0:
            print(f'  已处理 {i+1}页，图片 {len(all_images)}张')
    
    print(f'  总计: {len(all_images)}张图片')
    
    with open(os.path.join(out_dir, 'images.json'), 'w', encoding='utf-8') as f:
        json.dump(all_images, f, ensure_ascii=False, indent=2)
    
    doc.close()
    return all_images

for subj in ['cn', 'os']:
    extract_images(subj)
