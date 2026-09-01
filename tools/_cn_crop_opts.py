import re, json, pymupdf as fitz

TB = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
OUT = r'D:/ai code/408-quiz/tools/_crop'
import os
os.makedirs(OUT, exist_ok=True)
doc = fitz.open(TB)

# 习题块起始页（三级编号）
blocks = []
for i in range(doc.page_count):
    for ln in doc[i].get_text().split('\n'):
        m = re.match(r'^(\d+\.\d+)\.\d+\s+本节习题精选$', ln.strip())
        if m:
            blocks.append((i, m.group(1)))
blocks.sort()

def locate(sec_prefix, qno):
    start = next((pg for pg, sec in blocks if sec == sec_prefix), None)
    if start is None:
        return None
    end = doc.page_count
    for pg, sec in blocks:
        if pg > start:
            end = pg
            break
    pats = [re.compile(r'^\s*'+f'{qno:02d}'+r'[\.．、]'),
            re.compile(r'^\s*'+str(qno)+r'[\.．、]')]
    for i in range(start, end):
        dd = doc[i].get_text('dict')
        lines = []
        for blk in dd['blocks']:
            if blk.get('type') != 0:
                continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t:
                    lines.append((round(l['bbox'][1], 1), round(l['bbox'][3], 1), t, l['bbox']))
        lines.sort(key=lambda x: x[0])
        for j, (y0, y1, txt, bb) in enumerate(lines):
            if any(p.match(txt) for p in pats):
                # 找后续 A-D 选项行，确定块下界
                max_y = y1
                x0, x1 = bb[0], bb[2]
                for y0b, y1b, txtb, bbb in lines[j:j+10]:
                    if re.match(r'^[ABCD][\.、]', txtb):
                        max_y = max(max_y, y1b)
                        x0 = min(x0, bbb[0]); x1 = max(x1, bbb[2])
                return i, y0 - 6, max_y + 6, x0 - 6, x1 + 6
    return None

targets = [
    ('1.1', 15, 'cn0015'), ('1.1', 17, 'cn0017'), ('3.4', 16, 'cn0136'),
    ('5.3', 35, 'cn0473'), ('6.4', 2, 'cn0535'), ('5.3', 50, 'cn0488'),
    ('5.3', 60, 'cn0498'),
]
for sec, qno, name in targets:
    r = locate(sec, qno)
    if r is None:
        print(f'{name}: 未找到')
        continue
    i, y0, y1, x0, x1 = r
    page = doc[i]
    clip = fitz.Rect(x0, y0, x1, y1)
    pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(3, 3))
    fn = f'{OUT}/{name}.png'
    pix.save(fn)
    print(f'{name} (教材{sec} Q{qno}): 裁图 -> {fn}  [页{i+1}, y={y0:.0f}-{y1:.0f}]')
