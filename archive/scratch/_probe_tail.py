# 临时：排查缺失解答的版式（6.4.6 答案区末尾、5.3.3 答案区末尾）
import fitz
import re

PDF = r'd:\ai code\408教材和答案\2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(PDF)
out = []
# 6.4.6 答案区 p264-273（找 10/11/12 解答）；5.3.3 答案区 p169-179（找 16/17 解答）
for p in list(range(269, 275)) + list(range(176, 180)):
    t = doc[p - 1].get_text()
    out.append(f'\n{"="*20} page {p} {"="*20}')
    out.append(t)

open('_pdf_tail.txt', 'w', encoding='utf-8').write('\n'.join(out))
# 顺带：全文找 "11.【解答】" 类似样式
for p in range(263, 275):
    t = doc[p - 1].get_text()
    for m in re.finditer(r'(?m)^.{0,6}【解答】', t):
        print(p, repr(m.group(0)))
