import os, sys, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]
doc = fitz.open(pdf_path)

print(f'PDF: {len(doc)}页')

# 渲染前100页找含表格的页面
out_dir = r'D:/ai code/408-quiz-app/data/notes/images/co_pages'
os.makedirs(out_dir, exist_ok=True)

for i in range(min(100, len(doc))):
    page = doc[i]
    text = page.get_text()
    
    # 表格特征：含"表" + 数字对齐 或 含"真值""原码"等关键词
    has_table_kw = '表' in text and ('真值' in text or '原码' in text or '补码' in text or 
                   '移码' in text or '阶码' in text or '尾数' in text or
                   'IEEE' in text or 'ASCII' in text or 'BCD' in text)
    
    if has_table_kw:
        # 渲染整页
        mat = fitz.Matrix(2, 2)  # 2x缩放
        pix = page.get_pixmap(matrix=mat)
        fname = f'p{i+1}.png'
        pix.save(os.path.join(out_dir, fname))
        size = os.path.getsize(os.path.join(out_dir, fname)) / 1024
        print(f'  第{i+1}页: {fname} ({size:.0f}KB) - 含表格关键词')
        pix = None

doc.close()
print(f'\n已渲染到 {out_dir}')
