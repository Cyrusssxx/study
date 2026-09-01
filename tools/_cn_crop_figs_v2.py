# -*- coding: utf-8 -*-
"""计网题图裁剪 v2（扫描版 PDF：每页=整页位图+OCR文本层）
定位：题干长句末行 y1 → 首选项 y0 之间的区域渲染后按暗像素收紧。
支持：同页图 / 跨页图（选项在下一页时用下一页页首区域）/ 图在前（marker 后紧跟图）。
"""
import json, re, os, sys
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(PDF)
MAT = fitz.Matrix(3, 3)
HDR_H = 60   # 页眉（页码/书名）高度，跨页时跳过

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s or '').strip()

def pick_kw(content):
    s = strip_tags(content)
    s = re.sub(r'^(【[^】]+】)?\s*(在下图所示|如下图所示|如图所示|如下图|如图|右图所示|上图中|如下列图所示|某网络拓扑及各链路带宽如下)', '', s)
    m = re.search(r'[\u4e00-\u9fa5A-Za-z0-9]', s)
    if not m: return None
    s2 = s[m.start():]
    return s2[:12] if len(s2) >= 4 else None

def opt_kw(q):
    for k in ['A', 'B', 'C', 'D']:
        v = (q.get('options') or {}).get(k) or ''
        v = re.sub(r'^(如下图|如图|下图所示|如右图)[^A-Za-z0-9\u4e00-\u9fa5]*', '', v).strip()
        if len(v) >= 6: return v[:10]
    return None

def lines_between(pg, y_lo, y_hi):
    """返回该页 y 在 (y_lo,y_hi) 内的文本行 [(y0,y1,text)]，按 y0 排序"""
    out = []
    for b in pg.get_text('dict')['blocks']:
        if b.get('type') != 0: continue
        for l in b['lines']:
            y0, y1 = l['bbox'][1], l['bbox'][3]
            if y0 >= y_lo - 2 and y1 <= y_hi + 2:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t: out.append((y0, y1, t))
    out.sort()
    return out

def dark_bbox(pix, thr=240):
    """扫描渲染结果，返回暗像素 (col0,row0,col1,row1)（页面坐标，已除缩放）"""
    w, h, n = pix.width, pix.height, pix.n
    stride, samples = pix.stride, pix.samples
    col_dark = [False] * w; row_dark = [False] * h
    for y in range(h):
        base = y * stride
        for x in range(w):
            o = base + x * n
            if samples[o] < thr and samples[o+1] < thr and samples[o+2] < thr:
                row_dark[y] = True; col_dark[x] = True
    ys = [y for y in range(h) if row_dark[y]]
    xs = [x for x in range(w) if col_dark[x]]
    if not ys or not xs: return None
    s = 1.0 / MAT.a
    return (xs[0] * s, ys[0] * s, xs[-1] * s, ys[-1] * s)

def crop_and_save(pg, y0, y1, path, x0=45, x1=500):
    if y1 - y0 < 4: return False, 'zone_too_small'
    clip = fitz.Rect(x0, y0, x1, y1)
    pix = pg.get_pixmap(matrix=MAT, clip=clip)
    bb = dark_bbox(pix)
    if not bb: return False, 'no_dark'
    # 从暗像素 bbox 再裁（保证贴边）
    clip2 = fitz.Rect(x0 + bb[0] - 3, y0 + bb[1] - 3, x0 + bb[2] + 3, y0 + bb[3] + 3)
    pix2 = pg.get_pixmap(matrix=MAT, clip=clip2)
    pix2.save(path)
    return True, (pix2.width, pix2.height)

def find_zone(q):
    """返回 (page, zone_top, zone_bot, info) 或 (None,None,None,原因)"""
    content = q.get('content') or ''
    kw = pick_kw(content)
    if not kw: return None, None, None, 'no_kw'
    pno = None
    for i in range(doc.page_count):
        if kw in doc[i].get_text().replace('\n', ''):
            pno = i
    if pno is None: return None, None, None, 'page_not_found'
    pg = doc[pno]
    okw = opt_kw(q)
    # 找 kw_y0 与 opt_y0（同一页）
    def find_y(page, needle, after=None):
        hits = page.search_for(needle)
        if after is not None:
            hits = [r for r in hits if r.y0 > after + 3]
        if not hits: return None
        return min(r.y0 for r in hits)
    kw_y0 = find_y(pg, kw)
    opt_y0 = find_y(pg, okw, after=kw_y0 if kw_y0 else None) if okw else None
    cur_pg = pg
    # 同页找不到选项 → 看下一页（跨页图）
    if opt_y0 is None and pno + 1 < doc.page_count:
        pg2 = doc[pno + 1]
        opt_y0 = find_y(pg2, okw) if okw else None
        if opt_y0 is not None:
            cur_pg = pg2
            # 图在下一页页首：从页眉下到选项
            return cur_pg, HDR_H, opt_y0 - 1, 'cross_page'
    if opt_y0 is None:
        return None, None, None, 'options_not_found'
    # 同页：题干长句末行 → 选项
    if kw_y0 is None:
        return None, None, None, 'kw_not_on_page'
    lines = [x for x in lines_between(cur_pg, kw_y0, opt_y0) if len(x[2]) >= 20]
    if lines:
        stem_end = max(x[1] for x in lines)
    else:
        stem_end = kw_y0  # 无长句（图紧跟 marker）
    zone_top = stem_end + 1
    if opt_y0 - zone_top < 6:
        zone_top = kw_y0 + 1   # 兜底：整段
    return cur_pg, zone_top, opt_y0 - 1, 'same_page'

def main(ids):
    d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
    qs = d['questions']
    ok = []; fail = []
    for q in qs:
        if ids and q['id'] not in ids: continue
        if 'data/cn_figs/' not in (q.get('content') or ''): continue
        pg, zt, zb, info = find_zone(q)
        out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
        if pg is None:
            fail.append((q['id'], info)); continue
        succ, res = crop_and_save(pg, zt, zb, out)
        if succ: ok.append((q['id'], info, res))
        else: fail.append((q['id'], f'{info}|{res}'))
    print(f'成功 {len(ok)} / 失败 {len(fail)}')
    for qid, info, size in ok: print(f'  OK {qid}  {info}  {size}')
    for qid, why in fail: print(f'  FAIL {qid}  {why}')

if __name__ == '__main__':
    main(sys.argv[1].split(',') if len(sys.argv) > 1 else None)
