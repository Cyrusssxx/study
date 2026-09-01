# -*- coding: utf-8 -*-
"""v3 单题裁剪子进程：输入 (block_start, block_end, qno, content, options, out)。
用题干题号 regex 在节内块范围定位（绕开 bank↔PDF 文本差异），选项用 A. 行首定位。
输出 JSON {ok, page, size, why}。子进程崩溃父进程仅得非零 rc。"""
import sys, json, re
import pymupdf as fitz
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'

def find_qstart(doc, b0, b1, qno):
    """在 [b0,b1] 页找题号行 'NN.'（行首，零填充），首个匹配即返回（题干页在答案页之前）"""
    pat = re.compile(r'^\s*' + f'{qno:02d}' + r'\.')
    for i in range(b0, b1 + 1):
        try:
            d = doc[i].get_text('dict')
        except Exception:
            continue  # xref 损坏页跳过
        for blk in d['blocks']:
            if blk.get('type') != 0: continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans'])
                if pat.match(t):
                    return i, l['bbox'][1], l['bbox'][3]
    return None, None, None

def find_first_option(doc, pno, after_y, opts):
    """在指定页 after_y 之后找首个选项行 'A.'；返回 y0"""
    pat = re.compile(r'^\s*A[\.、]')
    try:
        d = doc[pno].get_text('dict')
    except Exception:
        return None
    cand = []
    for blk in d['blocks']:
        if blk.get('type') != 0: continue
        for l in blk['lines']:
            y0 = l['bbox'][1]
            if y0 <= after_y + 3: continue
            t = ''.join(s['text'] for s in l['spans'])
            if pat.match(t):
                cand.append(y0)
    return min(cand) if cand else None

def do_crop(pg, y0, y1, out):
    try:
        MAT = 2.0
        pix = pg.get_pixmap(matrix=fitz.Matrix(MAT, MAT))
        from PIL import Image
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        w, h = img.size
        y0p = int(y0 * MAT); y1p = min(int(y1 * MAT), h)
        x0p = int(45 * MAT); x1p = min(int(500 * MAT), w)
        from PIL import ImageFilter, ImageOps
        gray = img.convert('L').point(lambda v: 255 if v >= 240 else 0)
        crop = gray.crop((x0p, y0p, x1p, y1p))
        bb = crop.getbbox()
        if not bb or bb[2] <= bb[0] or bb[3] <= bb[1]:
            return None
        cx0 = max(0, x0p + bb[0] - 3); cy0 = max(0, y0p + bb[1] - 3)
        cx1 = min(w, x0p + bb[2] + 3); cy1 = min(h, y0p + bb[3] + 3)
        if cx1 <= cx0 or cy1 <= cy0:
            return None
        img.crop((cx0, cy0, cx1, cy1)).save(out)
        return (cx1 - cx0, cy1 - cy0)
    except Exception:
        return None

def main():
    j = json.loads(sys.stdin.read())
    b0, b1, qno = j['block0'], j['block1'], j['qno']
    out = j['out']
    doc = fitz.open(PDF)
    pno, qs_y, qs_y1 = find_qstart(doc, b0, b1, qno)
    if pno is None:
        print(json.dumps({'ok': False, 'why': 'qstart_not_found'})); return
    pg = doc[pno]
    opt_y = find_first_option(doc, pno, qs_y, j.get('options') or {})
    cur_pno = pno
    if opt_y is None and pno + 1 < doc.page_count:
        opt_y = find_first_option(doc, pno + 1, -1, j.get('options') or {})
        cur_pno = pno + 1
    if opt_y is None:
        # 兜底：用块尾（下一个题号或块结束）作下界
        print(json.dumps({'ok': False, 'why': 'option_not_found'})); return
    # 题干末行（qs_y 与 opt_y 之间的长文本行）
    pgc = doc[cur_pno]
    lines = []
    try:
        dd = pgc.get_text('dict')
        for blk in dd['blocks']:
            if blk.get('type') != 0: continue
            for l in blk['lines']:
                y0, y1 = l['bbox'][1], l['bbox'][3]
                t = ''.join(s['text'] for s in l['spans']).strip()
                if not t: continue
                if cur_pno == pno:
                    if y0 > qs_y - 2 and y1 < opt_y + 2: lines.append((y0, y1, t))
                else:
                    if y1 < opt_y + 2: lines.append((y0, y1, t))
    except Exception:
        pass
    long = [x for x in lines if len(x[2]) >= 15]
    stem_end = max(x[1] for x in long) if long else qs_y
    zt = stem_end + 1
    if opt_y - zt < 6: zt = qs_y + 1
    # 兜底 no_dark：向下扩大到块尾（下一个题号之前）重试
    size = do_crop(doc[cur_pno], zt, opt_y - 1, out)
    if not size:
        next_pat = re.compile(r'^\s*' + f'{qno+1:02d}' + r'\.')
        nxt_y = None
        try:
            dd = doc[cur_pno].get_text('dict')
            for blk in dd['blocks']:
                if blk.get('type') != 0: continue
                for l in blk['lines']:
                    t = ''.join(s['text'] for s in l['spans'])
                    if next_pat.match(t) and l['bbox'][1] > qs_y + 2:
                        nxt_y = l['bbox'][1]; break
                if nxt_y: break
        except Exception:
            pass
        if nxt_y:
            size = do_crop(doc[cur_pno], zt, nxt_y - 1, out)
    if not size:
        print(json.dumps({'ok': False, 'why': 'no_dark'})); return
    print(json.dumps({'ok': True, 'page': cur_pno + 1, 'size': size, 'zone': [zt, opt_y - 1]}))

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'why': f'exc:{type(e).__name__}:{e}'}))
