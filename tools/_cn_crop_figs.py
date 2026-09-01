# -*- coding: utf-8 -*-
"""按"题干末行 y1 → 选项首行 y0"定位每道题图区，渲染并覆盖到 pwa/data/cn_figs/cn_XXXX.png。

用法：node 不需要，python tools/_cn_crop_figs.py
"""
import json, re, os, pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(PDF)
MAT = fitz.Matrix(3, 3)  # 3x DPI

d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
qs = d['questions']

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s or '').strip()

def pick_kw(content):
    """取题干中 12 字符实词作为定位关键字（跳过'下图/如图/如下图所示'开头）"""
    s = strip_tags(content)
    s = re.sub(r'^(【[^】]+】)?\s*(在下图所示|如下图|如图所示|如图|右图所示|上图中|如下列图所示)', '', s)
    # 找第一个中文字符开始的位置
    m = re.search(r'[\u4e00-\u9fa5A-Za-z0-9]', s)
    if not m: return None
    s2 = s[m.start():]
    return s2[:12].strip() if len(s2) >= 12 else s2

def first_option_text(q):
    opts = q.get('options') or {}
    for k in ['A', 'B', 'C', 'D']:
        v = opts.get(k)
        if v: return f"{k}. {v[:8]}"  # 短前缀匹配
    return None

def first_option_kw(q):
    """取首个选项的实质子串（去掉 A. 前缀，跳过图题'如下图'选项），用作定位关键字"""
    opts = q.get('options') or {}
    for k in ['A', 'B', 'C', 'D']:
        v = opts.get(k) or ''
        # 去掉常见前缀 "下图" / "如图"
        v = re.sub(r'^(如下图|如图|下图所示|如右图)[^A-Za-z0-9\u4e00-\u9fa5]*', '', v)
        v = v.strip()
        if len(v) >= 6: return v[:10]
    return None

def find_figure_rect(q):
    content = q.get('content') or ''
    if 'data/cn_figs/' not in content:
        return None, 'no_content_img'
    kw = pick_kw(content)
    if not kw or len(kw) < 4: return None, 'no_kw'
    # 1) 找题干页（取含关键字且非答案块的最后页前几页）
    pno = None
    for i in range(doc.page_count):
        t = doc[i].get_text().replace('\n', '')
        if kw in t:
            pno = i
            # 继续往后找（题干可能在答案页被复述），但前几页优先
    if pno is None: return None, 'page_not_found'
    pg = doc[pno]
    # 2) 关键字 y0（取最后一个匹配）
    hits = pg.search_for(kw)
    if not hits: return None, 'kw_not_on_page'
    kw_y0 = min(r.y0 for r in hits)
    # 3) 首选项的实质子串 y0（在该关键字之后）
    opt_kw = first_option_kw(q)
    if not opt_kw: return None, 'no_options'
    opt_hits = [r for r in pg.search_for(opt_kw) if r.y0 > kw_y0 + 3]
    if not opt_hits: return None, 'options_not_found'
    opt_y0 = min(r.y0 for r in opt_hits)
    # 4) 题干末行 y1（在 kw_y0 与 opt_y0 之间最近的文本行）
    blocks = pg.get_text('dict')['blocks']
    stem_lines = []
    for b in blocks:
        if b.get('type') != 0: continue
        for l in b['lines']:
            y0, y1 = l['bbox'][1], l['bbox'][3]
            if y0 > kw_y0 - 3 and y1 < opt_y0 - 2:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t: stem_lines.append((y0, y1, t))
    if not stem_lines: return None, 'no_stem_lines'
    stem_end_y = max(y1 for _, y1, _ in stem_lines)
    # 5) 图区 = [stem_end_y + 1, opt_y0 - 1]；x 按该区段文本 x 范围（外扩 6pt）
    band = [(l['bbox'][0], l['bbox'][2]) for b in blocks if b.get('type')==0
            for l in b['lines']
            if l['bbox'][3] >= stem_end_y and l['bbox'][1] <= opt_y0]
    if band:
        x0 = min(b[0] for b in band) - 6
        x1 = max(b[1] for b in band) + 6
    else:
        x0, x1 = 200, 490
    x0 = max(0, x0); x1 = min(pg.rect.width, x1)
    # 区域高度太矮（<8pt）说明定位错，放弃
    if opt_y0 - stem_end_y < 8: return None, 'band_too_thin'
    return (x0, stem_end_y + 1, x1, opt_y0 - 1), pno

# 处理 26 张已挂图（题面）
wired = []
for q in qs:
    if 'data/cn_figs/' in (q.get('content') or ''):
        wired.append(q)

ok = []; fail = []
for q in wired:
    rect, info = find_figure_rect(q)
    if rect is None:
        fail.append((q['id'], q.get('content','')[:30], info))
        continue
    pix = doc[info].get_pixmap(matrix=MAT, clip=fitz.Rect(*rect))
    out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
    pix.save(out)
    ok.append((q['id'], info, pix.width, pix.height))

print(f'裁剪完成：成功 {len(ok)} / 失败 {len(fail)}（共 {len(wired)} 张）')
print('--- 失败清单（需手工/调整）---')
for qid, stem, why in fail:
    print(f'  {qid}  {why}  stem={stem!r}')
print('--- 成功清单 ---')
for qid, pno, w, h in ok:
    print(f'  {qid}  PDF页{pno+1}  {w}x{h}')
