import os, sys, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import fitz

PDF_DIR = r'D:/ai code/408教材'
pdf_path = glob.glob(os.path.join(PDF_DIR, '*计算机组成原理*.pdf'))[0]
doc = fitz.open(pdf_path)

print(f'PDF: {len(doc)}页')

# 找含"真值"和"原码"的页面（王道第2章数据表示）
for i, page in enumerate(doc):
    text = page.get_text()
    if '真值' in text and ('原码' in text or '补码' in text or '移码' in text):
        print(f'\n=== 第{i+1}页 ===')
        # 提取包含真值的行
        lines = text.split('\n')
        for j, line in enumerate(lines):
            stripped = line.strip()
            if stripped and ('真值' in stripped or '原码' in stripped or '补码' in stripped or re.match(r'^-?\d', stripped)):
                print(f'  {stripped}')

doc.close()
