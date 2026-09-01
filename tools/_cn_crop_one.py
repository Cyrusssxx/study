# -*- coding: utf-8 -*-
"""单题：find_zone + crop 全在子进程。父进程通过 argv 传 id/keyword/options/页候选，
子进程输出 JSON {ok, page, pno, zt, zb, out_path} 或 {ok:false, why}。
子进程崩溃父进程仅获非零 return code。"""
import sys, json, os, pymupdf as fitz
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'

def pick_kw(content):
    import re
    s = re.sub(r'<[^>]+>', '', content or '').strip()
    s = re.sub(r'^【[^】]+】\s*', '', s)  # 先剥【year统考真题】前缀
    s = re.sub(r'^(在下图所示|如下图所示|如图所示|如下图|如图|右图所示|上图中|如下列图所示|某网络拓扑及各链路带宽如下)\s*', '', s)
    m = re.search(r'[\u4e00-\u9fa5A-Za-z0-9]', s)
    if not m: return None
    s2 = s[m.start():]
    return s2[:12] if len(s2) >= 4 else None

def opt_kw(opts):
    import re
    for k in ['A','B','C','D']:
        v = (opts or {}).get(k) or ''
        v = re.sub(r'^(如下图|如图|下图所示|如右图)[^A-Za-z0-9\u4e00-\u9fa5]*', '', v).strip()
        if len(v) >= 6: return v[:10]
    return None

def main():
    j = json.loads(sys.stdin.read())
    qid, content, opts, out_path = j['id'], j['content'], j['options'], j['out']
    doc = fitz.open(PDF)
    kw = pick_kw(content)
    if not kw:
        print(json.dumps({'ok': False, 'why': 'no_kw'})); return
    pno = None
    for i in range(doc.page_count):
        if kw in doc[i].get_text().replace('\n', ''):
            pno = i
    if pno is None:
        print(json.dumps({'ok': False, 'why': 'page_not_found'})); return
    pg = doc[pno]
    okw = opt_kw(opts)
    def fy(p, n, after=None):
        h = p.search_for(n)
        if after is not None: h = [r for r in h if r.y0 > after + 3]
        if not h: return None
        return min(r.y0 for r in h)
    kw_y0 = fy(pg, kw)
    opt_y0 = fy(pg, okw, after=kw_y0) if okw else None
    cur = pg; cur_pno = pno
    if opt_y0 is None and pno + 1 < doc.page_count:
        pg2 = doc[pno+1]
        opt_y0 = fy(pg2, okw)
        if opt_y0 is not None:
            cur = pg2; cur_pno = pno + 1
            zt, zb, info = 60, opt_y0 - 1, 'cross_page'
            return do_crop(cur, cur_pno, zt, zb, info, out_path)
    if opt_y0 is None or kw_y0 is None:
        print(json.dumps({'ok': False, 'why': 'opt_or_kw'})); return
    lines=[]
    for b in cur.get_text('dict')['blocks']:
        if b.get('type')!=0: continue
        for l in b['lines']:
            y0,y1 = l['bbox'][1], l['bbox'][3]
            if y0 > kw_y0 - 2 and y1 < opt_y0 + 2:
                t=''.join(s['text'] for s in l['spans']).strip()
                if t: lines.append((y0,y1,t))
    long=[x for x in lines if len(x[2])>=20]
    stem_end = max(x[1] for x in long) if long else kw_y0
    zt = stem_end + 1
    if opt_y0 - zt < 6: zt = kw_y0 + 1
    return do_crop(cur, cur_pno, zt, opt_y0 - 1, 'same', out_path)

def do_crop(pg, pno, y0, y1, info, out):
    MAT = 2.0
    pix = pg.get_pixmap(matrix=fitz.Matrix(MAT, MAT))
    w, h, n, s = pix.width, pix.height, pix.n, pix.stride
    samp = pix.samples
    y0p = int(y0*MAT); y1p = min(int(y1*MAT), h)
    x0p = int(45*MAT); x1p = min(int(500*MAT), w)
    min_x=w; max_x=-1; min_y=h; max_y=-1
    for y in range(y0p, y1p):
        base = y*s
        for x in range(x0p, x1p):
            o = base + x*n
            if samp[o]<240 and samp[o+1]<240 and samp[o+2]<240:
                if x<min_x: min_x=x
                if x>max_x: max_x=x
                if y<min_y: min_y=y
                if y>max_y: max_y=y
    if max_x < 0:
        print(json.dumps({'ok': False, 'why': 'no_dark'})); return
    cx0=max(0,min_x-3); cy0=max(0,min_y-3)
    cx1=min(w,max_x+3); cy1=min(h,max_y+3)
    sub = fitz.Pixmap(pix, fitz.IRect(cx0,cy0,cx1,cy1))
    sub.save(out)
    print(json.dumps({'ok': True, 'page': pno+1, 'size': [sub.width, sub.height], 'info': info, 'out': out}))

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        import json
        print(json.dumps({'ok': False, 'why': f'subprocess_exc:{type(e).__name__}:{e}'}))
