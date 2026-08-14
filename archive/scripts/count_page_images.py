import os, sys, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]
doc = fitz.open(pdf_path)

print(f'PDF: {len(doc)}页')

# 统计每页图片数量
total_imgs = 0
pages_with_imgs = []

for i, page in enumerate(doc):
    imgs = page.get_images()
    if imgs:
        pages_with_imgs.append((i+1, len(imgs)))
        total_imgs += len(imgs)

doc.close()

print(f'总图片数: {total_imgs}')
print(f'含图片的页面: {len(pages_with_imgs)}')

# 看前20页
for pg, cnt in pages_with_imgs[:20]:
    print(f'  第{pg}页: {cnt}张图')
