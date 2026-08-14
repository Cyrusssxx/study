import fitz, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
doc = fitz.open(r'D:/ai code/408教材/2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf')
for i in range(6, 14):
    text = doc[i].get_text()
    print(f'===== PAGE {i+1} =====')
    print(text[:800])
    print()
doc.close()
