# -*- coding: utf-8 -*-
"""
题图 v5 紧裁剪：扫描 PDF 全本，按"题号 N. 题文 含图引用"的顺序输出每题
（题号 + 截剪区）。再用题库题文（去标点空格）的前若干字与每题做轻量匹配。
"""
import json
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_quiz_figs import (  # noqa: E402
    _resolve_pdf, build_cache, build_toc_map, find_options_line, CLEAN, FIG_RE, ZOOM,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPWARD_EXTEND = 220
DOWN_FALLBACK = 380
MIN_GAP_H = 32
MIN_GAP_RELAXED = 20
PAD = 2
MAX_ZONE_H = 360       # 收紧上限，避免再截到半个页面
DENSE_LEN = 6          # 6 字以上视为密集行（题文/选项都覆盖）


def is_dense(t):
    t = t.strip()
    if len(t) >= DENSE_LEN:
        return True
    if re.match(r'^\d{1,3}[.．]', t):
        return True
    if re.match(r'^[A-D][.．]', t):
        return True
    return False


def clean_anchor(text):
    return re.sub(r'[\s，。；：、（）()【】\[\]<>《>,.;:!?？！—\-…\u3000]', '', text or '')


def find_figure_zone(lines, y_top, y_bottom):
    dense = sorted(((y0, y1) for (y0, y1, t) in lines
                    if y_top <= y0 <= y_bottom and is_dense(t)))
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


def scan_pdf_fig_qs(doc, page_texts, page_lines_list, toc_map, sec_codes, qid_by_pdfno):
    """sec_codes 集合: 只要扫这些节内含图题。
    返回 [(sec, pdf_n, page, y_q, lines_in_page_until_next_qno)]——只收集"题干含图引用"的 PDF 题。
    节结束边界: 扫到页内含 '答案与解析' 或 '本节答案' 关键词即停。"""
    out = []
    STOP_RE = re.compile(r'(答案与解析|本节答案)')
    FIG_HINT_RE = re.compile(r'(下图.*示|如上图|如图所示|如右图|如下图|见下图|图\s*\d)')
    for sec in sorted(sec_codes):
        if sec not in toc_map:
            continue
        start_p = toc_map[sec] - 1
        end_p = min(start_p + 25, doc.page_count)
        cur_qno = None
        cur_y = None
        cur_page = None
        cur_block_lines = []
        cur_has_fig = False
        stopped = False
        for p in range(start_p, end_p):
            for (y0, y1, t) in page_lines_list[p]:
                if p > start_p and STOP_RE.search(t):
                    stopped = True
                    break
                mm = re.match(r'^(\d{1,3})[.．]', t)
                if mm:
                    if cur_qno is not None and cur_has_fig:
                        out.append((sec, cur_qno, cur_page, cur_y, cur_block_lines))
                    cur_qno = int(mm.group(1))
                    cur_y = y0
                    cur_page = p
                    cur_block_lines = [(y0, y1, t)]
                    cur_has_fig = bool(FIG_HINT_RE.search(t))
                elif cur_qno is not None:
                    cur_block_lines.append((y0, y1, t))
                    if FIG_HINT_RE.search(t):
                        cur_has_fig = True
            if stopped:
                break
        if cur_qno is not None and not stopped and cur_has_fig:
            out.append((sec, cur_qno, cur_page, cur_y, cur_block_lines))
    return out


def main():
    VALID = ('cn', 'ds')
    if len(sys.argv) < 2 or sys.argv[1] not in VALID:
        print('usage: recrop_figs.py <cn|ds> [--apply]'); sys.exit(1)
    subj = sys.argv[1]
    apply_mode = '--apply' in sys.argv

    pdf_path = _resolve_pdf(subj)
    data_path = os.path.join(ROOT, 'pwa', 'data', f'{subj}.json')
    fig_dir = os.path.join(ROOT, 'pwa', 'data', f'{subj}_figs')

    print(f'[{subj}] opening PDF...', flush=True)
    doc = fitz.open(pdf_path)
    page_texts, page_lines_list = build_cache(doc)
    toc_map = build_toc_map(doc)
    print(f'[{subj}] cache built.', flush=True)
    data = json.load(open(data_path, encoding='utf-8'))
    qs = data['questions'] if isinstance(data, dict) else data

    # 1. 取出题库中"题文含图引用"的题（按节计数 +1, 2, 3...）
    from collections import defaultdict
    sec_to_qs = defaultdict(list)   # sec -> [q]
    for q in qs:
        if not FIG_RE.search((q.get('content') or '') + ' ' + (q.get('explanation') or '')):
            continue
        code = (q.get('section') or '').split()[0]
        if code:
            sec_to_qs[code].append(q)
    for code in sec_to_qs:
        sec_to_qs[code].sort(key=lambda q: q.get('number', 0))

    print(f'[{subj}] 题库含图题数: {sum(len(v) for v in sec_to_qs.values())}')

    # 2. 扫 PDF：每个"本节习题精选"内，按题号顺序列出含图引用的题
    sec_codes = set(sec_to_qs.keys())
    pdf_questions = scan_pdf_fig_qs(doc, page_texts, page_lines_list, toc_map, sec_codes, None)
    # pdf_questions: [(sec, pdf_n, page, y_q, lines)]

    # 3. 对每节，按 PDF 题号顺序把 PDF 题与题库题配对
    by_sec = defaultdict(list)   # sec -> sorted [(pdf_n, page, y, lines)]
    for (sec, pdf_n, page, y, lines) in pdf_questions:
        by_sec[sec].append((pdf_n, page, y, lines))
    for sec in by_sec:
        by_sec[sec].sort(key=lambda x: (x[0], x[1]))

    ok = fallback = skip = new_added = fail = 0
    report = []
    for sec, lst in by_sec.items():
        qs_in_sec = sec_to_qs.get(sec, [])
        # 建立 pdf_n -> (page, yq, lines) 索引，便于按 _pdf_qno 字段查
        pdf_idx = {it[0]: it for it in lst}
        for q in qs_in_sec:
            target_pdf = q.get('_pdf_qno')
            if target_pdf is not None and target_pdf in pdf_idx:
                pdf_n, page, yq, lines = pdf_idx[target_pdf]
            else:
                # 回退：题库含图题按顺序与 PDF 含图题按顺序配对
                i = qs_in_sec.index(q)
                if i >= len(lst):
                    fail += 1
                    report.append(f'  FAIL {q["id"]} {q["section"]} no-pdf-match')
                    continue
                pdf_n, page, yq, lines = lst[i]
            pg = doc[page]
            w, h_pg = pg.rect.width, pg.rect.height
            oi = find_options_line(lines, q, 0)  # 在 lines 里找
            # 王道"题 N 的图"实际位于"题 N-1 题首"与"题 N 题首/选项"之间
            prev_pdf_n = (target_pdf or pdf_n) - 1
            prev_rec = pdf_idx.get(prev_pdf_n)
            # 关键：若 prev 真实存在（同一节内），必须 prev 也在同一页（lines 列表同属一页），
            # 否则 prev_yq = yq - UPWARD_EXTEND（防止跨页裁出页眉）
            if prev_rec and prev_rec[1] == page:
                # 强约束：上界=上一题题首（不放大），下界=本题题首之前的 8pt 余量
                y_top = prev_rec[2] + 4   # 上一题题首之下 4pt，避免抓到题首行
            else:
                # 跨页/无 prev：放大到 80pt 上方
                y_top = max(yq - 80, 0)
            y_bottom = min(lines[oi][0] - 1, h_pg) if oi is not None else min(yq + DOWN_FALLBACK, h_pg)
            # 钳制到页面有效范围
            y_top = max(0, min(y_top, h_pg))
            y_bottom = max(0, min(y_bottom, h_pg))
            if y_top >= y_bottom:
                y_bottom = min(y_top + MAX_ZONE_H, h_pg)
            zone = find_figure_zone(lines, y_top, y_bottom)
            if zone is None:
                y0 = y_top
                y1 = y_bottom
                if y1 - y0 < 60:
                    y1 = min(y0 + 60, h_pg)
                zone = (y0, min(y1, y0 + MAX_ZONE_H), 'fallback')
            y0, y1, mode = zone
            # 钳制防 y<0
            y0 = max(0, y0); y1 = max(0, y1)
            if y1 - y0 < 20:
                fail += 1
                report.append(f'  FAIL {q["id"]} {q["section"]} pdf#{pdf_n}: too-small')
                continue
            rect = fitz.Rect(w * 0.04, y0, w * 0.965, y1)
            has_img = '<img' in (q.get('content') or '')
            if mode == 'fallback':
                fallback += 1
                marker = 'FB'
            else:
                ok += 1
                marker = 'OK'
            if apply_mode:
                os.makedirs(fig_dir, exist_ok=True)
                out = os.path.join(fig_dir, f'{q["id"]}.png')
                if not has_img:
                    new_added += 1
                pg.get_pixmap(clip=rect, matrix=fitz.Matrix(ZOOM, ZOOM)).save(out)
            report.append(f'  {marker} {q["id"]} #{q["number"]} {q["section"]} pdf#{pdf_n} p{page+1} y[{y0:.0f},{y1:.0f}] h{rect.height:.0f}')

    # 剩余未配对的（题库有图但 PDF 没扫到）
    for sec, qs_in_sec in sec_to_qs.items():
        n_pdf = len(by_sec.get(sec, []))
        for i in range(n_pdf, len(qs_in_sec)):
            q = qs_in_sec[i]
            fail += 1
            report.append(f'  FAIL {q["id"]} {q["section"]} 题号{i+1}: no-pdf-match')

    print(f'[{subj}] tight={ok} fallback={fallback} new_added={new_added} fail={fail}')
    print('\n'.join(report))
    if not apply_mode:
        print('(dry run — 加 --apply 覆盖 png 并补充缺失图)')


if __name__ == '__main__':
    main()
