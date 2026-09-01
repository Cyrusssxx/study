import re, json, pymupdf as fitz

TB = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(TB)

def recon(spans):
    """spans: list of (text,size,y0,y1) sorted by x. Reconstruct sub/sup HTML."""
    if not spans:
        return ''
    sizes = [s[1] for s in spans]
    base = max(sizes)
    base_ys = [(s[2]+s[3])/2 for s in spans if abs(s[1]-base) < 0.5]
    base_y = sum(base_ys)/len(base_ys) if base_ys else (spans[0][2]+spans[0][3])/2
    out = ''
    for t, size, y0, y1 in spans:
        cy = (y0+y1)/2
        if size < base*0.93:
            if cy < base_y - 1.0:
                out += f'<sup>{t}</sup>'
            else:
                out += f'<sub>{t}</sub>'
        else:
            out += t
    return out

def get_line_spans(page, y0, y1):
    dd = doc[page].get_text('dict')
    res = []
    for blk in dd['blocks']:
        if blk.get('type') != 0:
            continue
        for l in blk['lines']:
            if y0 <= l['bbox'][1] <= y1 or y0 <= l['bbox'][3] <= y1:
                spans = [(s['text'], s['size'], s['bbox'][1], s['bbox'][3])
                         for s in l['spans'] if s['text'].strip()]
                if spans:
                    res.append(spans)
    return res

# 定位每节习题块起始页（教材为三级编号 X.Y.Z）
blocks = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    for ln in t.split('\n'):
        s = ln.strip()
        m = re.match(r'^(\d+\.\d+)\.\d+\s+本节习题精选$', s)
        if m:
            blocks.append((i, m.group(1)))  # 存前两级 X.Y
blocks.sort()

def find_options(sec_prefix, qno):
    # sec_prefix like '3.4', '1.1'
    start = None
    for pg, sec in blocks:
        if sec == sec_prefix:
            start = pg
            break
    if start is None:
        return None
    # 搜索范围：到下一个习题块或答案块
    end = doc.page_count
    for pg, sec in blocks:
        if pg > start:
            end = pg
            break
    pats = [re.compile(r'^\s*'+f'{qno:02d}'+r'[\.．、]'),
            re.compile(r'^\s*'+str(qno)+r'[\.．、]')]
    for i in range(start, min(end, doc.page_count)):
        try:
            dd = doc[i].get_text('dict')
        except Exception:
            continue
        lines = []
        for blk in dd['blocks']:
            if blk.get('type') != 0:
                continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t:
                    lines.append((round(l['bbox'][1], 1), round(l['bbox'][3], 1), t, l['spans']))
        lines.sort(key=lambda x: x[0])
        for j, (y0, y1, txt, spans) in enumerate(lines):
            if any(p.match(txt) for p in pats):
                # 收集后续明确以 A./B./C./D. 开头的行
                opts = {}
                for y0b, y1b, txtb, spansb in lines[j:j+8]:
                    m = re.match(r'^([ABCD])[\.、]\s*(.*)$', txtb)
                    if m:
                        opts[m.group(1)] = (y0b, y1b, m.group(2), spansb)
                if len(opts) >= 2:
                    out = {}
                    for k in 'ABCD':
                        if k in opts:
                            y0b, y1b, txtb, spansb = opts[k]
                            sp = [(s['text'], s['size'], s['bbox'][1], s['bbox'][3])
                                  for s in spansb if s['text'].strip()]
                            # 只保留该选项行的 span（可能含题干残留，过滤）
                            out[k] = recon(sp)
                    return out, i+1
    return None

targets = [
    ('1.1', 15), ('1.1', 17), ('3.4', 16), ('5.3', 35),
    ('6.4', 2), ('5.3', 50), ('5.3', 60),
]
for sec, qno in targets:
    r = find_options(sec, qno)
    print(f'=== 教材 {sec} Q{qno} ===')
    if r is None:
        print('   未找到')
    else:
        opts, pg = r
        print(f'   教材页{pg}:')
        for k in 'ABCD':
            if k in opts:
                print(f'     {k}. {opts[k]!r}')
    print()
