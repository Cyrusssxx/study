import os, sys, glob, re, json
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz
import cv2
import numpy as np

PDF_DIR = r'D:/ai code/408教材'
OUT_DIR = r'D:/ai code/408-quiz-app/data/notes/images'
os.makedirs(OUT_DIR, exist_ok=True)

SUBJECTS = {
    'ds': '数据结构',
    'cn': '计算机网',
    'os': '操作系统'
}

def detect_table_regions(page):
    """用 OpenCV 检测页面中的表格/图片区域"""
    # 渲染页面为图片（低dpi加速）
    mat = fitz.Matrix(1.5, 1.5)
    pix = page.get_pixmap(matrix=mat)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    
    # 转灰度
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 边缘检测
    edges = cv2.Canny(gray, 50, 150)
    
    # 膨胀连接边缘
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated = cv2.dilate(edges, kernel, iterations=2)
    
    # 找轮廓
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    regions = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        # 过滤太小的区域
        if w < 100 or h < 50:
            continue
        # 过滤整页（A4纸比例~0.7，表格通常不是整页宽）
        page_ratio = w / h
        if w > pix.width * 0.9 and h > pix.height * 0.9:
            continue
        regions.append((x, y, w, h))
    
    return regions, img

def extract_figures(subj_key):
    keyword = SUBJECTS[subj_key]
    pdf_path = glob.glob(os.path.join(PDF_DIR, f'*{keyword}*.pdf'))
    if not pdf_path:
        print(f'{subj_key.upper()}: PDF未找到')
        return
    
    pdf_path = pdf_path[0]
    doc = fitz.open(pdf_path)
    out_dir = os.path.join(OUT_DIR, subj_key)
    os.makedirs(out_dir, exist_ok=True)
    
    print(f'{subj_key.upper()}: {os.path.basename(pdf_path)} ({len(doc)}页)')
    
    total = 0
    for i, page in enumerate(doc):
        regions, img = detect_table_regions(page)
        
        for j, (x, y, w, h) in enumerate(regions):
            # 裁剪区域
            cropped = img[y:y+h, x:x+w]
            fname = f'p{i+1}_fig{j}.png'
            cv2.imwrite(os.path.join(out_dir, fname), cropped)
            total += 1
        
        if (i+1) % 50 == 0:
            print(f'  已处理 {i+1}页，提取 {total}个图表')
    
    doc.close()
    print(f'  总计: {total}个图表')

for subj in ['ds', 'cn', 'os']:
    extract_figures(subj)
