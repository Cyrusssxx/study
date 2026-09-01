# -*- coding: utf-8 -*-
"""整题完整裁剪：把每个真题从题号行到下一题号行（或答案头）整块裁成一张图，
保存 cn_figs/cn_XXXX_full.png，并把 content 替换为 <img>。跨页自动拼接。"""
import json, re, os, sys, subprocess
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
IMG_STYLE = 'max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;'
doc = fitz.open(PDF)

# 块范围
blocks = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    for ln in t.split('\n'):
        s = ln.strip()
        m = re.match(r'^(\d\.\d+\.\d+)\s+(本节习题精选|答案与解析)$', s)
        if m: blocks.append((i, m.group(1), m.group(2)))
blocks.sort()
exer = {}
for idx, (pg, sec, typ) in enumerate(blocks):
    if typ == '本节习题精选':
        end = None
        for j in range(idx + 1, len(blocks)):
            if blocks[j][2] == '答案与解析' and blocks[j][1].startswith(sec.rsplit('.', 1)[0]):
                end = blocks[j][0]; break
        exer[sec.rsplit('.', 1)[0]] = (pg, end)

def find_y(page, pats, after=None):
    try:
        d = page.get_text('dict')
    except Exception:
        return None
    for blk in d['blocks']:
        if blk.get('type') != 0: continue
        for l in blk['lines']:
            t = ''.join(s['text'] for s in l['spans'])
            if after is not None and l['bbox'][1] <= after + 2: continue
            if any(p.match(t) for p in pats):
                return l['bbox'][1]
            if '答案与解析' in t:
                return l['bbox'][1]
    return None

def crop_range(pno, y0, y1, out):
    """裁 [y0, y1]（页面坐标）到 out"""
    try:
        from PIL import Image
        MAT = 2.0
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(MAT, MAT))
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        h = img.size[1]
        y0p = max(0, int(y0 * MAT)); y1p = min(h, int(y1 * MAT))
        x0p = int(40 * MAT); x1p = min(pix.width, int(505 * MAT))
        crop = img.crop((x0p, y0p, x1p, y1p))
        crop.save(out)
        return crop.size
    except Exception as e:
        return None

def main():
    d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
    qs = d['questions']
    targets = [q for q in qs if q.get('chapter') == '第1章 计算机网络体系结构' and '统考真题' in (q.get('content') or '')]
    print('目标真题数:', len(targets), flush=True)
    ok = []; fail = []
    for q in targets:
        sec = q['section']; m = re.match(r'^(\d)\.(\d+)', sec)
        key = f'{m.group(1)}.{m.group(2)}' if m else None
        blk = exer.get(key)
        qno = q.get('_pdf_qno')
        out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}_full.png")
        if not blk or not qno:
            fail.append((q['id'], f'no_block {key}')); continue
        b0, b1 = blk[0], blk[1]
        # 找题号行（含答案页，页内遇答案头停）
        pats = [re.compile(r'^\s*' + f'{qno:02d}' + r'[\.．、]'), re.compile(r'^\s*' + str(qno) + r'[\.．、]')]
        found = None
        for i in range(b0, b1 + 1):
            y = find_y(doc[i], pats)
            if y is not None:
                found = (i, y); break
        if not found:
            fail.append((q['id'], 'qstart_not_found')); continue
        pno, qs_y = found
        # 下一题号行
        npats = [re.compile(r'^\s*' + f'{qno+1:02d}' + r'[\.．、]'), re.compile(r'^\s*' + str(qno+1) + r'[\.．、]')]
        nxt = None
        # 同页
        nxt_y = find_y(doc[pno], npats, after=qs_y)
        if nxt_y is not None:
            nxt = (pno, nxt_y)
        else:
            # 下一页
            for i in range(pno + 1, min(b1 + 1, pno + 3)):
                y = find_y(doc[i], npats)
                if y is not None:
                    nxt = (i, y); break
        if nxt is None:
            # 兜底：页尾或答案头
            nxt = (pno, doc[pno].rect.height - 5)
        nxt_pno, nxt_y = nxt
        size = None
        if nxt_pno == pno:
            size = crop_range(pno, qs_y - 3, nxt_y - 3, out)
        else:
            # 跨页拼接
            try:
                from PIL import Image
                MAT = 2.0
                p1 = doc[pno].get_pixmap(matrix=fitz.Matrix(MAT, MAT))
                im1 = Image.frombytes('RGB', (p1.width, p1.height), p1.samples)
                p2 = doc[nxt_pno].get_pixmap(matrix=fitz.Matrix(MAT, MAT))
                im2 = Image.frombytes('RGB', (p2.width, p2.height), p2.samples)
                x0p = int(40 * MAT); x1p = min(p1.width, int(505 * MAT))
                part1 = im1.crop((x0p, max(0, int((qs_y - 3) * MAT)), x1p, p1.height))
                part2 = im2.crop((x0p, int(45 * MAT), x1p, min(p2.height, int((nxt_y - 3) * MAT))))
                full = Image.new('RGB', (max(part1.width, part2.width), part1.height + part2.height), 'white')
                full.paste(part1, (0, 0)); full.paste(part2, (0, part1.height))
                full.save(out)
                size = full.size
            except Exception as e:
                fail.append((q['id'], f'stitch:{e}')); continue
        if not size:
            fail.append((q['id'], 'crop_failed')); continue
        # 替换 content
        img_tag = f'<img src="data/cn_figs/cn_{q["number"]:04d}_full.png" alt="真题原题" style="{IMG_STYLE}" />'
        q['content'] = img_tag
        ok.append((q['id'], pno + 1, size))
        print(f'[{q["id"]}] 页{pno+1}' + (f'+{nxt_pno+1}' if nxt_pno != pno else '') + f' {size[0]}x{size[1]} OK', flush=True)
    out_json = json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n'
    open(os.path.join(ROOT, 'pwa/data/cn.json'), 'w', encoding='utf-8', newline='\n').write(out_json)
    print(f'\n成功 {len(ok)} / 失败 {len(fail)}')
    for r in fail: print('  FAIL', r)

if __name__ == '__main__':
    main()
