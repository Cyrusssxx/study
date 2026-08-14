import os, sys, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]
doc = fitz.open(pdf_path)

print(f'PDF: {len(doc)}页')

# 用pymupdf的find_tables找表格
for i in range(min(100, len(doc))):
    page = doc[i]
    tables = page.find_tables()
    if tables and len(tables.tables) > 0:
        print(f'第{i+1}页: {len(tables.tables)}个表格')
        for j, t in enumerate(tables.tables):
            print(f'  表{j+1}: {len(t.rows)}行 x {len(t.columns)}列')
            # 提取第一行
            if t.rows:
                first_row = [c if c else '' for c in t.rows[0]]
                print(f'    表头: {first_row[:6]}')

doc.close()
