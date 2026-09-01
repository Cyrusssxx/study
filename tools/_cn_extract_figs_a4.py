# -*- coding: utf-8 -*-
"""从【A4有留白】PDF（重新排版、图是 XObject 嵌入）提取原题图，替换/补齐 cn.json 配图。
- 39 个 content 图目标（26 已有 <img> 重提 + 13 缺失补 <img>）
- 答案图不在此 PDF（无答案内容），留待后续
"""
import json, re, os, sys
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
A4 = r'E:\夸克\Download\【A4有留白】王道计算机网络选择题.pdf'
IMG_STYLE = 'max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;'
doc_a4 = fitz.open(A4)
doc_a4_len = doc_a4.page_count
total_lines_log = []  # 收集各页文本行

# 提取所有页的文本行（带 y 坐标）—— 全局缓存便于节头/题号定位
PAGES = []  # [page_idx] -> [(y0, y1, text)]
for i in range(doc_a4_len):
    rows = []
    try:
        d = doc_a4[i].get_text('dict')
    except Exception:
        PAGES.append([]); continue
    for blk in d['blocks']:
        if blk.get('type') != 0: continue
        for l in blk['lines']:
            y0, y1 = l['bbox'][1], l['bbox'][3]
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t: rows.append((y0, y1, t))
    rows.sort()
    PAGES.append(rows)

# 提取每页的图片 rect（full=True）
def page_images(i):
    try: return doc_a4[i].get_image_info(xrefs=True)
    except Exception: return []

# 找最近的节头（用于 mapping 验证 / 边界）—— 兼容 "1.1 标题" / "1.1标题" / "4.2IPv4" 等
sec_re = re.compile(r'^(\d)\.(\d)\s*([\u4e00-\u9fa5A-Za-z].+)$')
SEC_FIRST_PAGE = {}  # sec_key '1.1' -> first page of 习题精选
for i, rows in enumerate(PAGES):
    for y0, y1, t in rows:
        m = sec_re.match(t)
        if m and len(t) < 25 and '本节' not in t and '习题' not in t and '答案' not in t and '真题' not in t:
            key = f'{m.group(1)}.{m.group(2)}'
            if key not in SEC_FIRST_PAGE:
                SEC_FIRST_PAGE[key] = i

def find_question_page(sec_key, qno):
    """在 A4 PDF 找题 'NN.' 的 (page, y0, y1)—— 兼容零填充和单数字"""
    pats = [re.compile(r'^\s*' + f'{qno:02d}' + r'[\.．、]'),
            re.compile(r'^\s*' + str(qno) + r'[\.．、]')]
    if sec_key not in SEC_FIRST_PAGE:
        return None, None, None
    start = SEC_FIRST_PAGE[sec_key]
    keys = sorted(SEC_FIRST_PAGE.keys(), key=lambda k: (int(k.split('.')[0]), int(k.split('.')[1])))
    idx = keys.index(sec_key)
    if idx + 1 < len(keys):
        end = SEC_FIRST_PAGE[keys[idx + 1]]
    else:
        end = doc_a4_len
    for i in range(start, end):
        for y0, y1, t in PAGES[i]:
            for p in pats:
                if p.match(t):
                    return i, y0, y1
    return None, None, None

def find_next_question_y(pno, qno):
    npats = [re.compile(r'^\s*' + f'{qno+1:02d}' + r'[\.．、]'),
             re.compile(r'^\s*' + str(qno+1) + r'[\.．、]')]
    for y0, y1, t in PAGES[pno]:
        for p in npats:
            if p.match(t):
                return y0
    return None

def extract_image_in_zone(pno, y_lo, y_hi):
    """找页 [pno] 上 y 在 (y_lo, y_hi) 内的图，返回 (xref, ext, bytes) 或 None"""
    ims = page_images(pno)
    for im in ims:
        b = im['bbox']
        cy = (b[1] + b[3]) / 2
        if y_lo + 2 < cy < y_hi - 2:
            xref = im.get('xref')
            if not xref: continue
            try:
                info = doc_a4.extract_image(xref)
                return info['ext'], info['image']
            except Exception:
                continue
    return None, None

def main():
    d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
    qs = d['questions']
    # 目标：content 有 <img> (26 张) + content 有 下图/如图 但无 <img> (13 张)
    targets = [q for q in qs if 'data/cn_figs/' in (q.get('content') or '')
               or ('下图' in (q.get('content') or '') or '如图' in (q.get('content') or ''))]
    print('总目标题数:', len(targets), flush=True)
    print('A4 节映射 (前10个):', list(SEC_FIRST_PAGE.items())[:10], flush=True)
    ok = []; fail = []
    for idx, q in enumerate(targets):
        m = re.match(r'^(\d)\.(\d+)', q.get('section', ''))
        if not m:
            fail.append((q['id'], 'no_sec')); continue
        sec_key = f'{m.group(1)}.{m.group(2)}'
        qno = q.get('_pdf_qno')
        out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
        pno, ys, ye = find_question_page(sec_key, qno)
        if pno is None:
            fail.append((q['id'], f'A4_not_found sec={sec_key} qno={qno}'))
            print(f'[{idx+1}/{len(targets)}] {q["id"]} FAIL A4_not_found', flush=True)
            continue
        nxt_y = find_next_question_y(pno, qno)
        zone_hi = nxt_y - 1 if nxt_y else doc_a4[pno].rect.height - 5
        ext, img_bytes = extract_image_in_zone(pno, ye, zone_hi)
        if not img_bytes:
            fail.append((q['id'], f'no_img_in_zone p{pno+1} y={ye:.0f}..{zone_hi:.0f}'))
            print(f'[{idx+1}/{len(targets)}] {q["id"]} FAIL no_img', flush=True)
            continue
        with open(out, 'wb') as f: f.write(img_bytes)
        # 缺失题：接 <img>
        if 'data/cn_figs/' not in (q.get('content') or ''):
            for marker in ['在下图所示的', '在下图所示，', '在下图所示。', '在下图所示', '在下图中', '下图为', '下图是', '下图中', '右图描述', '右图是', '右图', '如下图所示，', '如下图所示。', '如下图所示', '如下图，', '如下图。', '如下图', '如图下所示', '如图所示，', '如图所示。', '如图所示', '如图，', '如图。', '如图']:
                if marker in q['content']:
                    img = f'<br><img src="data/cn_figs/cn_{q["number"]:04d}.png" alt="题图" style="{IMG_STYLE}" />'
                    q['content'] = q['content'].replace(marker, marker + img, 1)
                    break
        ok.append((q['id'], pno + 1, ext))
        print(f'[{idx+1}/{len(targets)}] {q["id"]} OK p{pno+1} .{ext} {len(img_bytes)}B', flush=True)
    out_json = json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n'
    open(os.path.join(ROOT, 'pwa/data/cn.json'), 'w', encoding='utf-8', newline='\n').write(out_json)
    print(f'\n成功 {len(ok)} / 失败 {len(fail)}')
    for r in fail: print('  FAIL', r)

if __name__ == '__main__':
    main()
