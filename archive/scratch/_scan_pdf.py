# 临时：探查王道PDF结构——目录 + 各节"综合应用题"题目区/答案区定位
import fitz
import re
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PDF = r'd:\ai code\408教材和答案\2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'

doc = fitz.open(PDF)
out = []

# 1. 目录
toc = doc.get_toc()
out.append(f'=== TOC ({len(toc)} entries) ===')
for lvl, title, page in toc:
    out.append(f'{"  "*lvl}{title}  -> p{page}')

# 2. 全文扫描：每页是否含 "综合应用题" / "答案与解析" / 节号标题
out.append('\n=== page scan ===')
targets = ['2.2.3', '2.3.7', '3.2.5', '5.2.3', '5.3.3', '5.5.3', '6.2.6',
           '6.4.6', '7.2.4', '7.5.5', '8.3.3', '8.4.3', '8.5.4', '8.7.6']
for i in range(len(doc)):
    text = doc[i].get_text()
    marks = []
    if '综合应用题' in text:
        marks.append('综合应用题')
    if '答案与解析' in text:
        marks.append('答案与解析')
    for t in targets:
        if t in text:
            marks.append(t)
    if marks:
        out.append(f'p{i+1}: ' + ','.join(marks))

open('_pdf_scan.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('done, pages:', len(doc))
