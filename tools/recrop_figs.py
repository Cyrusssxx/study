# -*- coding: utf-8 -*-
"""
题图紧裁剪 v3：对已嵌图的题目重新裁剪，只保留"图区"本身，去掉截图带进来的
题干文字/上一题选项等杂质（v2 是"题首行向上盲扩 280pt + 最小高 320pt"，裁多了）。

原理：扫描版 PDF 有 OCR 文本层，图区内部几乎没有文本行（或只有稀疏的节点标签）。
  1) 定位题首行与选项首行（复用 v2 的定位函数）；
  2) 在 [题首行-280pt, 选项首行] 的搜索窗内，把"密集文本行"（题干/选项/编号行）
     作为分隔，行与行之间的无文本竖向间隙就是图区候选；
  3) 取最大的间隙（≥45pt），上下各留 8pt 余量，即为紧裁剪区；
  4) 找不到大间隙时回退 v2 式裁剪并标记 fallback。

文件名与 <img> 标签都不变——只重写 pwa/data/<subj>_figs/<id>.png。

用法：
    python tools/recrop_figs.py cn --dry
    python tools/recrop_figs.py cn --apply
"""
import json
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_quiz_figs import (  # noqa: E402
    _resolve_pdf, build_cache, build_toc_map, locate_by_number, locate_by_text,
    find_options_line, CLEAN, FIG_RE, ZOOM,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPWARD_EXTEND = 280     # 与 v2 相同的搜索窗
DOWN_FALLBACK = 380
MIN_GAP_H = 38          # 竖向间隙达到该高度才算图区（首选）
MIN_GAP_RELAXED = 25    # 放宽阈值（找不到首选间隙时）
PAD = 2                 # 图区上下余量（pt）
MAX_ZONE_H = 560        # 单个图区上限，防止整页裁
DENSE_LEN = 12          # 文本行字符数 >= 该值视为"密集文本"（图内标签通常很短）


def is_dense(t):
    t = t.strip()
    if len(t) >= DENSE_LEN:
        return True
    if re.match(r'^\d{1,3}[.．]', t):
        return True
    if re.match(r'^[A-D][.．]', t):
        return True
    return False


import re  # noqa: E402  (is_dense 依赖，置于其后亦可)


def find_figure_zone(lines, y_top, y_bottom):
    """在 [y_top, y_bottom] 内找最大的无密集文本竖向间隙。
    间隙边界：上一密集行的"行底 y1"到下一密集行的"行首 y0"——
    用 y0/y0 会把边界文字行的下半截裁进图里。
    返回 (y0, y1, mode) 或 None。"""
    dense = sorted(((y0, y1) for (y0, y1, t) in lines
                    if y_top <= y0 <= y_bottom and is_dense(t)))
    # 间隙 i：从第 i 个密集行的行底（或窗口顶）到第 i+1 个密集行的行首（或窗口底）
    bounds = []
    prev_bottom = y_top
    for (y0, y1) in dense:
        bounds.append((prev_bottom, y0))
        prev_bottom = max(prev_bottom, y1)
    bounds.append((prev_bottom, y_bottom))

    for threshold, mode in ((MIN_GAP_H, 'gap'), (MIN_GAP_RELAXED, 'gap25')):
        best = None
        for a, b in bounds:
            h = b - a
            if h >= threshold and (best is None or h > best[1] - best[0]):
                best = (a, b)
        if best:
            y0 = max(best[0] - PAD, y_top)
            y1 = min(best[1] + PAD, y_bottom)
            if y1 - y0 > MAX_ZONE_H:
                y1 = y0 + MAX_ZONE_H
            return (y0, y1, mode)
    return None


def recrop(doc, page_texts, page_lines_list, toc_map, q, n_info):
    combined = (q.get('content') or '') + ' ' + (q.get('explanation') or '')
    if '<img' not in (q.get('content') or ''):
        return (False, 'no-img-in-content', None)
    if not FIG_RE.search(combined):
        return (False, 'no-figure-ref', None)

    code, n = n_info
    loc = locate_by_number(page_texts, page_lines_list, doc, toc_map, code, n)
    if loc is None:
        p = locate_by_text(page_texts, q)
        if p is None:
            return (False, 'locate-failed', None)
        lines = page_lines_list[p]
        kw_m = FIG_RE.search(combined)
        core = kw_m.group(0) if kw_m else '图'
        qi = next((i for i, (_, _, t) in enumerate(lines) if core in t), None)
        if qi is None:
            return (False, 'anchor-not-found', None)
    else:
        p, qi = loc
        lines = page_lines_list[p]

    oi = find_options_line(lines, q, qi + 1)
    pg = doc[p]
    w, h_pg = pg.rect.width, pg.rect.height
    yq = lines[qi][0]

    y_top = max(yq - UPWARD_EXTEND, 0)
    y_bottom = min(lines[oi][0] - 1, h_pg) if oi is not None else min(yq + DOWN_FALLBACK, h_pg)

    zone = find_figure_zone(lines, y_top, y_bottom)
    mode = 'gap'
    if zone is None:
        # 回退：v2 式窗口，但收窄到题行与选项行之间的区域
        y0 = y_top
        y1 = y_bottom
        if y1 - y0 < 60:
            y1 = min(y0 + 60, h_pg)
        zone = (y0, min(y1, y0 + MAX_ZONE_H))
        mode = 'fallback'
    else:
        y0, y1, mode = zone
    if y1 - y0 < 20:
        return (False, 'too-small', None)

    rect = fitz.Rect(w * 0.04, y0, w * 0.965, y1)
    return (True, f'{mode} page{p+1} y[{y0:.0f},{y1:.0f}] h{rect.height:.0f}', rect)


def main():
    VALID = ('cn', 'ds')
    if len(sys.argv) < 2 or sys.argv[1] not in VALID:
        print('usage: recrop_figs.py <cn|ds> [--dry|--apply]')
        sys.exit(1)
    subj = sys.argv[1]
    apply_mode = '--apply' in sys.argv

    pdf_path = _resolve_pdf(subj)
    data_path = os.path.join(ROOT, 'pwa', 'data', f'{subj}.json')
    fig_dir = os.path.join(ROOT, 'pwa', 'data', f'{subj}_figs')

    print(f'[{subj}] opening PDF...', flush=True)
    doc = fitz.open(pdf_path)
    page_texts, page_lines_list = build_cache(doc)
    toc_map = build_toc_map(doc)
    print(f'[{subj}] cache built ({doc.page_count} pages). loading json...', flush=True)
    data = json.load(open(data_path, encoding='utf-8'))
    qs = data['questions'] if isinstance(data, dict) else data

    sec_counts, qindex = {}, {}
    for q in qs:
        code = (q.get('section') or '').split()[0] if q.get('section') else ''
        sec_counts[code] = sec_counts.get(code, 0) + 1
        qindex[q['id']] = (code, sec_counts[code])

    ok = fallback = skip = fail = 0
    report = []
    for q in qs:
        if '<img' not in (q.get('content') or ''):
            continue   # 只处理已嵌图的题
        try:
            res, reason, rect = recrop(doc, page_texts, page_lines_list, toc_map, q, qindex[q['id']])
        except Exception as e:
            res, reason, rect = False, f'EXC:{type(e).__name__}:{e}', None
        if not res:
            if reason == 'no-figure-ref':
                skip += 1
                continue
            fail += 1
            report.append(f'  FAIL {q["id"]} {q["section"]}: {reason}')
            continue
        if reason.startswith('fallback'):
            fallback += 1
        else:
            ok += 1
        if apply_mode and rect is not None:
            pg_rect = fitz.Rect(rect)
            out = os.path.join(fig_dir, f'{q["id"]}.png')
            doc[0].parent  # noqa: 触发属性（无操作）
            page = doc[0]
            # 重新定位页码：reason 里带了 pageN
            import re as _re
            mm = _re.search(r'page(\d+)', reason)
            page = doc[int(mm.group(1)) - 1]
            page.get_pixmap(clip=pg_rect, matrix=fitz.Matrix(ZOOM, ZOOM)).save(out)
        report.append(f'  {"FB " if reason.startswith("fallback") else "OK "} {q["id"]} {q["section"]}: {reason}')

    print(f'[{subj}] tight={ok} fallback={fallback} skip={skip} fail={fail}')
    print('\n'.join(report))
    if not apply_mode:
        print('(dry run — 加 --apply 覆盖 png)')


if __name__ == '__main__':
    main()
