import os, sys, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]
doc = fitz.open(pdf_path)

print(f'PDF: {len(doc)}页')

# 扫描所有页面，找含表格的页
table_pages = []
for i, page in enumerate(doc):
    text = page.get_text()
    # 表格特征：含"表"字 + 多列数据
    if '表' in text:
        lines = text.split('\n')
        # 找含表格线的行
        table_lines = []
        for line in lines:
            # 含多个空格对齐（表格列）
            if '  ' in line and len(line) > 20:
                cells = [c.strip() for c in line.split('  ') if c.strip()]
                if len(cells) >= 3:
                    table_lines.append(line)
        if table_lines:
            table_pages.append((i+1, len(table_lines)))

doc.close()

print(f'含表格的页面: {len(table_pages)}页')
for pg, cnt in table_pages[:20]:
    print(f'  第{pg}页: {cnt}行')
