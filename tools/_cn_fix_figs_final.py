# -*- coding: utf-8 -*-
"""配图终修复：
1) 从 A4 重排版 PDF 按 (节, 教材题号) 精确提取每题原图 → cn_figs/cn_{number}.png
2) 重写所有 content 的 <img src> → 指向该题自身编号的图（修复阶段1重编号漏改引用）
3) A4 无图的题：移除 <img>，保留文字（宁缺勿错）
"""
import json, re, os
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
A4 = r'E:\夸克\Download\【A4有留白】王道计算机网络选择题.pdf'
IMG_STYLE = 'max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;'
doc = fitz.open(A4)

# 0-based 页索引（扫描所得 —— 勿再 -1）
SEC = {'1.1':1,'1.2':5,'2.1':11,'2.2':15,'2.3':17,'3.1':19,'3.2':19,'3.3':20,
       '3.4':21,'3.5':26,'3.6':29,'3.7':37,'3.8':39,'4.1':44,'4.2':47,'4.3':60,
       '4.4':61,'4.5':66,'4.6':67,'4.7':67,'5.1':71,'5.2':72,'5.3':75,
       '6.1':86,'6.2':87,'6.3':89,'6.4':91,'6.5':93}
keys = sorted(SEC.keys(), key=lambda k: (int(k.split('.')[0]), int(k.split('.')[1])))
q_re = re.compile(r'^\s*(\d{1,2})[\.．、]')

# 预取每页文本行
ROWS = []
for i in range(doc.page_count):
    rows = []
    try:
        d = doc[i].get_text('dict')
        for blk in d['blocks']:
            if blk.get('type') != 0: continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t: rows.append((l['bbox'][1], l['bbox'][3], t))
        rows.sort()
    except Exception:
        pass
    ROWS.append(rows)

def sec_of(i):
    cur = None
    for k in keys:
        if SEC[k] <= i: cur = k
    return cur

# 建立 (节, 上方题号) -> (页, xref)
by_sec_qno = {}
for i in range(doc.page_count):
    for im in doc[i].get_image_info(xrefs=True):
        b = im['bbox']; y0 = b[1]
        above = None
        for ry0, ry1, t in ROWS[i]:
            if ry1 <= y0 + 2:
                m = q_re.match(t)
                if m: above = int(m.group(1))
        s = sec_of(i)
        if s and above and (s, above) not in by_sec_qno:
            by_sec_qno[(s, above)] = (i, im.get('xref'))

d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
qs = d['questions']

# 需要配图的题：content 已有 <img> 的(26) + content 含"下图/如图"的(14)
need = [q for q in qs if 'data/cn_figs/' in (q.get('content') or '')
        or ('下图' in (q.get('content') or '') or '如图' in (q.get('content') or ''))]

got = []; nofig = []
for q in need:
    m = re.match(r'^(\d)\.(\d+)', q.get('section', ''))
    sec = f'{m.group(1)}.{m.group(2)}' if m else None
    qno = q.get('_pdf_qno')
    hit = by_sec_qno.get((sec, qno)) if sec else None
    out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
    if hit and hit[1]:
        try:
            info = doc.extract_image(hit[1])
            open(out, 'wb').write(info['image'])
            got.append((q['id'], sec, qno, hit[0] + 1, info['ext']))
        except Exception as e:
            nofig.append((q['id'], f'extract:{e}'))
    else:
        nofig.append((q['id'], f'no_fig sec={sec} qno={qno}'))
        if os.path.exists(out): os.remove(out)   # 清掉此前可能写错的图

# 统一重写所有 content 的 <img src> → 自身编号
rewritten = 0
for q in qs:
    c = q.get('content') or ''
    if 'data/cn_figs/' not in c: continue
    own = f'cn_{q["number"]:04d}.png'
    own_path = os.path.join(ROOT, f'pwa/data/cn_figs/{own}')
    if os.path.exists(own_path):
        # 有属于本题的图 → 指向它
        new = re.sub(r'src="data/cn_figs/[^"]+"', f'src="data/cn_figs/{own}"', c)
        if new != c: rewritten += 1
        q['content'] = new
    else:
        # 无图 → 移除 <img>（保留文字）
        new = re.sub(r'<br>\s*<img src="data/cn_figs/[^"]+"[^>]*>', '', c)
        new = re.sub(r'<img src="data/cn_figs/[^"]+"[^>]*>', '', new)
        if new != c: rewritten += 1
        q['content'] = new

open(os.path.join(ROOT, 'pwa/data/cn.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n')

print(f'提取成功 {len(got)} / 无图 {len(nofig)}；content 引用重写 {rewritten} 处')
print('--- 无图（保留文字，已移除/未生成图）---')
for r in nofig: print('  ', r)
print('--- 前 10 个提取 ---')
for r in got[:10]: print('  ', r)
