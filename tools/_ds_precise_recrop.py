# -*- coding: utf-8 -*-
"""
ds 选择题题图精准重裁 v7（OCR 掩膜法）：
  1. 题干文本（去标点/空白/HTML实体）在 PDF 行级定位——限「本节试题精选→答案与解析」范围，
     优先习题区；锚点变体（JSON 把 PDF『右图』规范化成『下图』）+ 唯一性兜底 + 全书兜底；
  2. 窗口 = [题首上方最近文本行底, 选项首/下一题题首]；
  3. 渲染窗口 → 把窗口内所有「密集 OCR 文本行」bbox 涂白 → 剩余墨迹即图形/表格（文字被掩掉，
     树/图/网格线保留）→ 对剩余墨迹求 bbox → 按原始像素渲染成图（四周留 10px）；
  4. 题干在页底、图在次页顶部时，自动改用下一页 页眉下界→首个边界行；
  5. 题干本身无图/表引用的题（旧 v2 误加 <img>）不产图，单独列 NOFIG 清单供人工确认删除。

用法：
    python tools/_ds_precise_recrop.py            # 预览：图写 _ds_recrop_preview/，打印报告
    python tools/_ds_precise_recrop.py --apply    # 覆盖 pwa/data/ds_figs/
"""
import glob
import html
import json
import os
import re
import sys

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = sorted(glob.glob('D:/ai code/408教材/*数据结构*'))[0]
DATA = os.path.join(ROOT, 'pwa', 'data', 'ds.json')
FIG_DIR = os.path.join(ROOT, 'pwa', 'data', 'ds_figs')
PREVIEW = os.path.join(ROOT, '_ds_recrop_preview')
ZOOM = 2.6          # 与旧图一致
INK_THR = 225       # 灰度 < 225 视为墨迹
PAD_PX = 10         # 成图四周留白（px）
MIN_INK = 150       # 掩膜后剩余墨迹 < 该像素数视为无图
MIN_SIDE = 24       # 剩余墨迹 bbox 最小边长（px）
MAX_OUT_H = 1150    # 成图最大高度（px），超过告警
# 连通块+聚簇（v9）：掩膜后对剩余墨迹做连通块，再把相近连通块聚成一个『图形』，
# 取最贴近题干的那个，避免把多图拼在一起的整块误裁成一个。
CC_STEP = 3         # 连通块分析降采样步长（px）
GAP_C = 4           # 聚簇间隙（降采样格）：扩展 bbox 后相交即视为同一图形
MIN_CLUSTER = 12    # 图形簇最小面积（降采样格），≈108 全分辨率像素
MIN_SIDE_C = 4      # 图形簇最小边长（降采样格），≈12 全分辨率像素（允许扁长图/表）

CLEAN = lambda t: re.sub(r'[^\w\u4e00-\u9fff]+', '', t or '')
OPT_RE = re.compile(r'^([A-D][.．、]|[（(][A-D][)）]|[\u2460-\u2473])')
QNO_RE = re.compile(r'^(\d{1,3})[.．]')
# 题干里的真实图/表引用（决定是否该有图）
# 注意：『表中』（如"有序表中"）是行文『在表里』之意，非图引用，排除以免误报。
FIG_CONTENT_RE = re.compile(r'(下图|右图|上图|如图|如下表|下表所示|表所示|树形如|结构如)')


def build_page_lines(doc):
    """每页文本行 [(y0, y1, text, x0, x1)] 按 y 排序"""
    out = []
    for p in range(doc.page_count):
        lines = []
        for blk in doc[p].get_text('dict')['blocks']:
            for ln in blk.get('lines', []):
                t = ''.join(s['text'] for s in ln['spans']).strip()
                if t:
                    bx = ln['bbox']
                    lines.append((bx[1], bx[3], t, bx[0], bx[2]))
        lines.sort(key=lambda r: (r[0], r[3]))
        out.append(lines)
    return out


def build_toc_sections(doc):
    """节代码(如 '2.3') -> 「本节试题精选」起始页(1-based)"""
    m = {}
    for level, title, page in doc.get_toc():
        if '试题精选' in title and level >= 3:
            head = title.split()[0]
            code = '.'.join(head.split('.')[:2])
            m.setdefault(code, page)
    return m


def strip_content_html(c):
    c = c or ''
    for _ in range(3):                   # 内容存在双重转义（&amp;lt;），循环还原到稳定
        u = html.unescape(c)
        if u == c:
            break
        c = u
    c = re.sub(r'<img[^>]*>', '', c)
    c = re.sub(r'<[^>]+>', '', c)
    return c


_SRC_RE = re.compile(r'<img[^>]*src="([^"]+)"')
_KNOWN_EXT = ('.png', '.jpeg', '.jpg')


def ref_fig_ext(content, fid):
    """内容 <img src> 实际引用的扩展名；缺省 .png。题图文件名即 {fid}{ext}。"""
    m = _SRC_RE.search(content or '')
    if m:
        ext = os.path.splitext(m.group(1))[1].lower()
        if ext in _KNOWN_EXT:
            return ext
    return '.png'


def anchor_of(q):
    """题干锚点：去标签/实体/标点空白；『丨』是 JSON 侧竖线转写，PDF 侧 '|' 会被清掉"""
    return CLEAN(strip_content_html(q.get('content'))).replace('丨', '')


def _anchor_variants(anchor):
    out = [anchor]
    for a, b in (('下图', '右图'), ('下图', '上图'), ('如图', '如右图')):
        v = anchor.replace(a, b)
        if v != anchor and v not in out:
            out.append(v)
    return out


def _match_tier(lines_all, anchor, p_lo, p_hi, a_len, need_tail=True):
    """单档锚点匹配；返回 [(priority, page, idx)]，idx=题干真正首行"""
    hits = []
    a_head = anchor[:a_len]
    a_tail = anchor[:a_len + 10] if need_tail else None
    passed_ans = False
    for p in range(p_lo, p_hi):
        L = lines_all[p]
        n = len(L)
        for i in range(n):
            if '答案与解析' in L[i][2]:
                passed_ans = True
            joined = CLEAN(L[i][2])
            for k in (1, 2, 3):
                if i + k < n:
                    joined += CLEAN(L[i + k][2])
            if a_head in joined and (a_tail is None or a_tail in joined):
                start = i
                for k in range(i, min(i + 4, n)):        # 单行命中
                    if a_head in CLEAN(L[k][2]):
                        start = k
                        break
                if start == i:                            # 跨行命中：头须真从该行开始
                    for k in range(i, min(i + 3, n)):
                        c2 = CLEAN(L[k][2]) + CLEAN(L[k + 1][2]) if k + 1 < n else ''
                        if (c2 and a_head in c2
                                and a_head not in CLEAN(L[k + 1][2])
                                and a_head[:2] in CLEAN(L[k][2])):
                            start = k
                            break
                hits.append((1 if passed_ans else 0, p, start))
                break  # 本页记首个命中
    hits.sort()
    return hits


def find_candidates(lines_all, anchor, p_lo, p_hi):
    """行级定位题干。长→短分级（带尾验）→ 变体 → 短头唯一 → 全书唯一。"""
    for a_len in (16, 12, 9):
        for anch in _anchor_variants(anchor):
            hits = _match_tier(lines_all, anch, p_lo, p_hi, a_len)
            if hits:
                return hits
    for a_len in (12, 9, 7):
        for anch in _anchor_variants(anchor):
            hits = _match_tier(lines_all, anch, p_lo, p_hi, a_len, need_tail=False)
            if len(hits) == 1:
                return hits
    for a_len in (16, 12, 9):
        for anch in _anchor_variants(anchor):
            hits = _match_tier(lines_all, anch, 0, len(lines_all), a_len)
            if 1 <= len(hits) <= 2:
                return hits
    return []


def is_dense(t):
    tc = CLEAN(t)
    return len(tc) >= 6 or bool(QNO_RE.match(t) or OPT_RE.match(t))


def page_top_margin(L):
    """页眉以下的安全上界（王道页眉/页码 y<65）"""
    top = 0.0
    for row in L:
        if row[1] < 65:
            top = max(top, row[1])
        else:
            break
    return top + 2


def question_window(L, p, i, h_pg):
    """窗口 = [题首上方最近密集行底, 选项首/下一题/节边界行顶]；返回 (y_top, y_bottom)"""
    stem_y = L[i][0]
    y_bottom = None
    for j in range(i + 1, len(L)):
        t = L[j][2]
        if OPT_RE.match(t) or QNO_RE.match(t) or '答案与解析' in t or '综合应用题' in t:
            y_bottom = L[j][0] - 2
            break
    if y_bottom is None:
        y_bottom = min(stem_y + 420, h_pg - 10)

    y_top = None
    for j in range(i - 1, -1, -1):            # 题首上方最近的密集文本行底
        if is_dense(L[j][2]) and L[j][1] <= stem_y + 2:
            y_top = L[j][1] + 3
            break
    if y_top is None:
        y_top = page_top_margin(L)
    y_top = max(page_top_margin(L), y_top, stem_y - 320)
    y_top = max(0.0, y_top)
    y_bottom = min(h_pg, max(y_bottom, y_top + 20))
    return y_top, y_bottom


def next_question_bottom(L, i, h_pg):
    """从题干行 i 往下找『下一题起始』：首个题号行(数字.)/答案与解析/综合应用题。
    用于把窗口下界延伸到下一题，以捕获『选项之下』的插图。"""
    for j in range(i + 1, len(L)):
        t = L[j][2]
        if R_QNO_NEXT.match(t) or '答案与解析' in t or '综合应用题' in t:
            return max(L[j][0] - 2, L[i][0] + 30)
    return h_pg - 10


# 仅匹配『下一题』题号（行首 数字. 且非选项字母），区别于当前题（已在 i 之上）
R_QNO_NEXT = re.compile(r'^(\d{1,3})[.．]\s*\S')


def figure_band(doc, p, L, i, h_pg):
    """构造题干窗口 band；先窄窗，失败则延伸到下一题。返回 (band, used_extended)"""
    y0, y1 = question_window(L, p, i, h_pg)
    band = fitz.Rect(doc[p].rect.width * 0.02, y0, doc[p].rect.width * 0.985, y1)
    rect, ink = figure_bbox(doc, p, band, L, stem_y=L[i][0])
    if rect is not None:
        return band, False
    yb2 = next_question_bottom(L, i, h_pg)
    band2 = fitz.Rect(doc[p].rect.width * 0.02, y0, doc[p].rect.width * 0.985, yb2)
    rect2, ink2 = figure_bbox(doc, p, band2, L, stem_y=L[i][0])
    if rect2 is not None:
        return band2, True
    return band, False


def figure_bbox(doc, p, band, L, stem_y=None):
    """渲染 band，掩掉密集 OCR 文本行后，对剩余墨迹做连通块+聚簇，取最贴近题干的图形。
    返回 (rect_pt, ink_px) 或 (None, 0)。stem_y 用于优先贴近题干的图形。"""
    pix = doc[p].get_pixmap(clip=band, matrix=fitz.Matrix(ZOOM, ZOOM),
                            colorspace=fitz.csGRAY)
    w, h = pix.width, pix.height
    img = bytearray(pix.samples)

    # 掩膜：窗口内所有密集文本行 bbox（略外扩）涂白
    for (ly0, ly1, t, lx0, lx1) in L:
        if ly1 < band.y0 or ly0 > band.y1 or not is_dense(t):
            continue
        px0 = max(0, int((lx0 - 1 - band.x0) * ZOOM))
        px1 = min(w, int((lx1 + 1 - band.x0) * ZOOM))
        py0 = max(0, int((ly0 - 1 - band.y0) * ZOOM))
        py1 = min(h, int((ly1 + 1 - band.y0) * ZOOM))
        for r in range(py0, py1):
            img[r * w + px0:r * w + px1] = b'\xff' * (px1 - px0)

    # 降采样墨迹掩膜
    step = CC_STEP
    cw = (w + step - 1) // step
    ch = (h + step - 1) // step
    mask = bytearray(cw * ch)
    for ry in range(ch):
        yy = min(h - 1, ry * step + step // 2)
        base = yy * w
        for rx in range(cw):
            xx = min(w - 1, rx * step + step // 2)
            if img[base + xx] < INK_THR:
                mask[ry * cw + rx] = 1

    # 4-连通 flood fill，收集所有连通块
    visited = bytearray(cw * ch)
    comps = []
    for seed in range(cw * ch):
        if not mask[seed] or visited[seed]:
            continue
        stack = [seed]
        visited[seed] = 1
        pts = []
        while stack:
            idx = stack.pop()
            pts.append(idx)
            cr, cc = idx // cw, idx % cw
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = cr + dr, cc + dc
                if 0 <= nr < ch and 0 <= nc < cw:
                    nidx = nr * cw + nc
                    if mask[nidx] and not visited[nidx]:
                        visited[nidx] = 1
                        stack.append(nidx)
        ys = [v // cw for v in pts]
        xs = [v % cw for v in pts]
        comps.append((min(xs), min(ys), max(xs), max(ys), len(pts)))

    if not comps:
        return None, 0

    # 聚簇：扩展 bbox 后相交的连通块合并为同一图形（处理线描图被拆成多块的情况）
    parent = list(range(len(comps)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    g = GAP_C
    for a in range(len(comps)):
        ax0, ay0, ax1, ay1, _ = comps[a]
        for b in range(a + 1, len(comps)):
            bx0, by0, bx1, by1, _ = comps[b]
            if (ax0 - g <= bx1 + g and bx0 - g <= ax1 + g
                    and ay0 - g <= by1 + g and by0 - g <= ay1 + g):
                union(a, b)
    clusters = {}
    for i, c in enumerate(comps):
        r = find(i)
        if r not in clusters:
            clusters[r] = [c[0], c[1], c[2], c[3], c[4]]
        else:
            cl = clusters[r]
            cl[0] = min(cl[0], c[0]); cl[1] = min(cl[1], c[1])
            cl[2] = max(cl[2], c[2]); cl[3] = max(cl[3], c[3])
            cl[4] += c[4]

    stem_py = (stem_y - band.y0) * ZOOM if stem_y is not None else None
    best = None
    best_score = -1.0
    for cl in clusters.values():
        x0c, y0c, x1c, y1c, area = cl
        if area < MIN_CLUSTER:
            continue
        if (x1c - x0c) < MIN_SIDE_C or (y1c - y0c) < MIN_SIDE_C:
            continue
        cy = (y0c + y1c) * step / 2.0
        score = area / (1.0 + (abs(cy - stem_py) / 220.0 if stem_py is not None else 0.0))
        if score > best_score:
            best_score = score
            best = (x0c, y0c, x1c, y1c, area)
    if best is None:
        return None, sum(c[4] for c in comps)
    x0c, y0c, x1c, y1c, area = best
    px0 = max(0, x0c * step - PAD_PX)
    px1 = min(w - 1, (x1c + 1) * step + PAD_PX)
    py0 = max(0, y0c * step - PAD_PX)
    py1 = min(h - 1, (y1c + 1) * step + PAD_PX)
    rect = fitz.Rect(band.x0 + px0 / ZOOM, band.y0 + py0 / ZOOM,
                     band.x0 + px1 / ZOOM, band.y0 + py1 / ZOOM)
    return rect, area * step * step



def main():
    apply_mode = '--apply' in sys.argv
    out_dir = FIG_DIR if apply_mode else PREVIEW
    os.makedirs(out_dir, exist_ok=True)

    print(f'[ds] opening PDF: {os.path.basename(PDF)}', flush=True)
    doc = fitz.open(PDF)
    lines_all = build_page_lines(doc)
    toc = build_toc_sections(doc)
    print(f'[ds] {doc.page_count} pages, {len(toc)} sections with 试题精选', flush=True)

    data = json.load(open(DATA, encoding='utf-8'))
    qs = data['questions'] if isinstance(data, dict) else data
    img_qs = [q for q in qs if '<img' in (q.get('content') or '')]
    print(f'[ds] 含图题 {len(img_qs)} 道', flush=True)

    sec_pages = sorted(((pg, code) for code, pg in toc.items()))
    next_start = {}
    # 王道常把本节最后 1~2 道选择题/插图挤到下一节起始页（如 7.3 的 B 树题落到 p321，
    # 而 7.4 试题精选从 p320 起），故上界多留 5 页余量，避免节尾题被排除在区间外而错配他题。
    SPIN_MARGIN = 5
    for idx, (pg, code) in enumerate(sec_pages):
        top = sec_pages[idx + 1][0] if idx + 1 < len(sec_pages) else pg + 45
        next_start[code] = top + SPIN_MARGIN

    ok = nofig = fail = 0
    report = []
    stale_to_clean = []          # --apply 时清理「同 fid 异扩展名」的孤儿旧文件
    for q in img_qs:
        fid = q['id']
        ext = ref_fig_ext(q.get('content'), fid)
        old_path = os.path.join(FIG_DIR, f'{fid}{ext}')
        old_wh = None
        if os.path.exists(old_path):
            with fitz.open(old_path) as d0:
                old_wh = (d0[0].rect.width, d0[0].rect.height)
        old_s = f'{old_wh[0]:.0f}x{old_wh[1]:.0f}' if old_wh else '无旧图'

        content_txt = strip_content_html(q.get('content'))
        has_ref = bool(FIG_CONTENT_RE.search(content_txt))

        anchor = anchor_of(q)
        if not anchor:
            if has_ref:
                fail += 1
                report.append(f'  FAIL {fid}: 空题干')
            else:
                nofig += 1
                report.append(f'  NOFIG {fid} #{q["number"]} {q["section"]} 旧{old_s} '
                              f'题干无图/表引用: {content_txt[:36]}')
            continue
        code = (q.get('section') or '').split()[0]
        if code not in toc:
            if has_ref:
                fail += 1
                report.append(f'  FAIL {fid}: 节 {code} 不在目录')
            else:
                nofig += 1
                report.append(f'  NOFIG {fid} #{q["number"]} {q["section"]} 旧{old_s} '
                              f'题干无图/表引用: {content_txt[:36]}')
            continue
        cands = find_candidates(lines_all, anchor, toc[code] - 1, next_start[code])
        if not cands:
            if has_ref:
                fail += 1
                report.append(f'  FAIL {fid} {q["section"]}: 题干未定位到 PDF')
            else:
                nofig += 1
                report.append(f'  NOFIG {fid} #{q["number"]} {q["section"]} 旧{old_s} '
                              f'题干无图/表引用: {content_txt[:36]}')
            continue
        pri, p, i = cands[0]
        L = lines_all[p]
        h_pg = doc[p].rect.height
        band, extended = figure_band(doc, p, L, i, h_pg)
        rect, ink = figure_bbox(doc, p, band, L, stem_y=L[i][0])
        p_used, mode = p, ('mask+extend' if extended else 'mask')
        if rect is None and p + 1 < doc.page_count:
            # 题干在页底、图在下一页顶部
            L2 = lines_all[p + 1]
            top2 = page_top_margin(L2)
            yb2 = None
            for (yy0, yy1, t, _, _) in L2:
                if yy0 > top2 and (OPT_RE.match(t) or QNO_RE.match(t) or '答案与解析' in t):
                    yb2 = yy0 - 2
                    break
            if yb2 is None:
                yb2 = doc[p + 1].rect.height - 40
            band2 = fitz.Rect(doc[p + 1].rect.width * 0.02, top2,
                              doc[p + 1].rect.width * 0.985, yb2)
            rect, ink = figure_bbox(doc, p + 1, band2, L2, stem_y=top2)
            if rect is not None:
                p_used, mode = p + 1, 'mask+nextpage'
        if rect is None:
            if has_ref:
                fail += 1
                report.append(f'  FAIL {fid} {q["section"]} pdf#? p{p+1}: 掩膜后无图形(ink={ink})')
            else:
                nofig += 1
                report.append(f'  NOFIG {fid} #{q["number"]} {q["section"]} 旧{old_s} '
                              f'题干无图/表引用且PDF题区无图形: {content_txt[:30]}')
            continue

        th = rect.height * ZOOM
        tw = rect.width * ZOOM
        warn = ''
        if th > MAX_OUT_H:
            warn = ' ⚠过大'
        out = os.path.join(out_dir, f'{fid}{ext}')
        doc[p_used].get_pixmap(clip=rect, matrix=fitz.Matrix(ZOOM, ZOOM)).save(out)
        if apply_mode:                 # 记录同 fid 其他扩展名的孤儿旧文件，循环末统一清理
            for e2 in _KNOWN_EXT:
                if e2 != ext:
                    sib = os.path.join(FIG_DIR, f'{fid}{e2}')
                    if os.path.exists(sib):
                        stale_to_clean.append(sib)

        ok += 1
        zone = '习题区' if pri == 0 else '解析区'
        note = '' if has_ref else ' [无关键词但有图]'
        report.append(f'  OK {fid} #{q["number"]} {q["section"]} p{p_used+1} '
                      f'[{zone}] {mode} ink={ink} 旧{old_s}→新{tw:.0f}x{th:.0f}'
                      f' pdfY={rect.y0:.0f}-{rect.y1:.0f}{note}{warn}')

    if apply_mode and stale_to_clean:
        for sib in dict.fromkeys(stale_to_clean):   # 去重
            try:
                os.remove(sib)
                report.append(f'  CLEAN 删除孤儿旧图 {os.path.basename(sib)}')
            except OSError as e:
                report.append(f'  CLEAN 删除失败 {os.path.basename(sib)}: {e}')

    print(f'[ds] 成图 {ok} / 无图题 {nofig} / 失败 {fail}')
    print('\n'.join(report))
    if not apply_mode:
        print(f'(预览模式 — 成图在 {PREVIEW}，加 --apply 覆盖正式目录)')


if __name__ == '__main__':
    main()
