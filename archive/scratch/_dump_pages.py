# 临时：dump 样例页文本，看题目/答案版式
import fitz
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PDF = r'd:\ai code\408教材和答案\2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(PDF)

out = []
# 2.2.3 题目区 p31-32，答案区起 p33-35；5.3.3 题目区 p161-162（代码题多）
for p in [31, 32, 33, 34, 161, 162, 169, 170]:
    out.append(f'\n{"="*20} page {p} {"="*20}')
    out.append(doc[p - 1].get_text())

open('_pdf_pages.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('done')
