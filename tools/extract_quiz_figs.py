# -*- coding: utf-8 -*-
"""
题库选择题配图补全 v2：从王道2027 扫描版 PDF 按题号定位并截取题目+图区域，
嵌入 pwa/data/<subj>.json 题干 content（<img> 标签）。

v2 改进（修复 v1 ~47% 裁剪为细条垃圾的问题）：
  - 裁剪区域向上扩展 280pt（题首行上方），捕获出现在题目上方的插图；
  - 最小裁剪高度 320pt，避免截到只有一两行文字的细条；
  - 收紧 FIG_RE：去掉 [图型] 宽泛匹配（"结构型"/"状态型" 等误命中），
    仅保留明确含"图"字的模式（"结构图"/"示意图"等）；
  - 最大裁剪高度 540pt，防止一页截太多道题。

定位原理（不变）：
  扫描版 PDF 整页为大图、无矢量绘图。
  王道每节习题("X.Y.Z 本节试题精选")内 MCQ 按 1.,2.,3.… 顺序编号，
  与题库 JSON 同节内题目顺序一致（第 N 道 = 习题区第 N 题）。

用法：
    python tools/extract_quiz_figs.py ds --dry
    python tools/extract_quiz_figs.py ds --apply
    python tools/extract_quiz_figs.py cn --apply
跳过已含 <img> 的题；只处理题干/解析引用"图"且当前无图的题。
"""
import json
import os
import re
import sys

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDFS = {
    'ds': "D:/ai code/408教材/2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
    # CN path uses 《》 which may have encoding issues; resolve via glob
}
PDF_DIR = "D:/ai code/408教材"


def _resolve_pdf(subj):
    """Resolve PDF path: use dict or fallback to glob in PDF_DIR."""
    if subj in PDFS and os.path.exists(PDFS[subj]):
        return PDFS[subj]
    import glob as _glob
    hints = {'ds': '数据结构', 'cn': '计算机网络'}
    pattern = os.path.join(PDF_DIR, f"*{hints.get(subj, subj)}*")
    matches = _glob.glob(pattern)
    if matches:
        return matches[0]
    raise FileNotFoundError(f"Cannot find {subj} PDF in {PDF_DIR}")
ZOOM = 2.6
# 向上扩展（pt）：题首行上方留多少空间捕获"如右图所示"类出现在题上方的图
UPWARD_EXTEND = 280
# 最小/最大裁剪高度（pt）
MIN_CROP_H = 320
MAX_CROP_H = 540
# 收紧后的图引用正则：仅匹配明确含"图"字的关键词，不含"型"字（避免"结构型"等误命中）
FIG_RE = re.compile(
    r'(下图.*示|如上图|如图所示|如图\s*[0-9图]|图\s*\d\s*[-－]\s*\d|图\s*\d+\s*所|'
    r'示意图|结构图|状态图|流程图|拓扑图|如右图|如左图|如下图)'
)
CLEAN = lambda t: re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', t or ''))


def build_cache(doc):
    page_texts, page_lines_list = [], []
    for p in range(doc.page_count):
        page_texts.append(CLEAN(doc[p].get_text()))
        lines = []
        for blk in doc[p].get_text('dict')['blocks']:
            for ln in blk.get('lines', []):
                t = ''.join(s['text'] for s in ln['spans']).strip()
                if t:
                    lines.append((ln['bbox'][1], ln['bbox'][3], t))
        lines.sort()
        page_lines_list.append(lines)
    return page_texts, page_lines_list


def build_toc_map(doc):
    """节代码(如 '2.3') -> 该节'本节习题精选'起始页(1-based)
    王道 PDF 目录：1.1=章、1.1.1=节、1.1.7=本节习题精选（标题号重号）
    用 toc 的 level 区分：含"习题精选"且 level>=3 才是目标。
    """
    toc = doc.get_toc()
    m = {}
    for level, title, page in toc:
        if '习题精选' in title and level >= 3:
            head = title.split()[0]
            code = '.'.join(head.split('.')[:2])
            m[code] = page
    return m


def locate_by_number(page_texts, page_lines_list, doc, toc_map, code, n):
    """题号定位：返回 (page0, line_idx) 或 None"""
    if code not in toc_map:
        return None
    ex_p = toc_map[code] - 1  # 0-based
    for p in range(ex_p, min(ex_p + 45, doc.page_count)):
        for i, (y0, y1, t) in enumerate(page_lines_list[p]):
            mm = re.match(r'^(\d{1,3})[.．]', t)
            if mm and int(mm.group(1)) == n:
                return p, i
    return None


def locate_by_text(page_texts, q):
    c = CLEAN(q['content'])
    cands = []
    m = re.search(r'(\d{4})统考真题', q['content'])
    if m:
        tail = c[len(m.group(0)):len(m.group(0)) + 12]
        cands.append(m.group(1) + '统考真题' + tail)
    for L in (46, 32, 20):
        if c[:L]:
            cands.append(c[:L])
    for a in cands:
        if not a:
            continue
        for p, pt in enumerate(page_texts):
            if a in pt:
                return p
    return None


def find_options_line(lines, q, after_idx):
    """在 after_idx 之后找选项首行"""
    opts = q.get('options') or {}
    vals = [CLEAN(v) for v in opts.values() if CLEAN(v)]
    cands = [v[:18] for v in vals]
    for i in range(after_idx, len(lines)):
        t = lines[i][2]
        for c in cands:
            if c and c in t:
                if re.search(r'[A-D][.．]', t):
                    return i
                break
    for i in range(after_idx, len(lines)):
        if re.search(r'\bA[.．]', lines[i][2]):
            return i
    return None


def crop_figure(doc, page_texts, page_lines_list, toc_map, q, n_info, out_dir, apply_mode):
    if '<img' in (q.get('content') or ''):
        return (False, 'already-has-img', None)
    combined = (q.get('content') or '') + ' ' + (q.get('explanation') or '')
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
        ai = next((i for i, (_, _, t) in enumerate(lines) if core in t), None)
        if ai is None:
            return (False, 'anchor-not-found', None)
        qi = ai
    else:
        p, qi = loc
        lines = page_lines_list[p]

    oi = find_options_line(lines, q, qi + 1)
    pg = doc[p]
    w, h_pg = pg.rect.width, pg.rect.height
    yq = lines[qi][0]

    # v2: 向上扩展 + 最小/最大高度
    y0 = max(yq - UPWARD_EXTEND, 0)
    if oi is not None:
        y1 = min(lines[oi][0] - 1, h_pg)
    else:
        y1 = min(yq + 380, h_pg)

    # 强制最小高度
    if y1 - y0 < MIN_CROP_H:
        y1 = min(y0 + MIN_CROP_H, h_pg)
    # 限制最大高度
    if y1 - y0 > MAX_CROP_H:
        y1 = y0 + MAX_CROP_H

    if y1 - y0 < 20:
        return (False, 'too-small', None)

    rect = fitz.Rect(w * 0.04, y0, w * 0.965, y1)
    name = f"{q['id']}.png"
    path = os.path.join(out_dir, name)
    if apply_mode:
        pg.get_pixmap(clip=rect, matrix=fitz.Matrix(ZOOM, ZOOM)).save(path)
    return (True, f'page{p+1} y[{y0:.0f},{y1:.0f}] h{rect.height:.0f}', path if apply_mode else name)


def main():
    VALID_SUBJECTS = ('ds', 'cn')
    if len(sys.argv) < 2 or sys.argv[1] not in VALID_SUBJECTS:
        print('usage: extract_quiz_figs.py <ds|cn> [--dry|--apply]')
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
    print(f'[{subj}] cache built ({doc.page_count} pages, {len(toc_map)} sections). loading json...', flush=True)
    data = json.load(open(data_path, encoding='utf-8'))
    qs = data['questions'] if isinstance(data, dict) else data
    if apply_mode:
        os.makedirs(fig_dir, exist_ok=True)

    sec_counts, qindex = {}, {}
    for q in qs:
        code = (q.get('section') or '').split()[0] if q.get('section') else ''
        sec_counts[code] = sec_counts.get(code, 0) + 1
        qindex[q['id']] = (code, sec_counts[code])

    ok = skip = fail = 0
    report = []
    for q in qs:
        n_info = qindex[q['id']]
        try:
            res, reason, path = crop_figure(doc, page_texts, page_lines_list, toc_map, q, n_info, fig_dir, apply_mode)
        except Exception as e:
            res, reason, path = False, f'EXC:{type(e).__name__}:{e}', None
        if not res:
            if reason in ('already-has-img', 'no-figure-ref'):
                skip += 1
                continue
            fail += 1
            report.append(f'  FAIL {q["id"]} {q["section"]}: {reason}')
            continue
        ok += 1
        if apply_mode:
            c = q.get('content') or ''
            img = (f'<br><img src="data/{subj}_figs/{q["id"]}.png" alt="{subj}题图" '
                   f'style="max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;" />')
            km = FIG_RE.search(c)
            c = (c[:km.end()] + img + c[km.end():]) if km else (c + img)
            q['content'] = c
        report.append(f'  OK {q["id"]} {q["section"]}: {reason}')

    if apply_mode:
        json.dump(data, open(data_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        total = sum(os.path.getsize(os.path.join(fig_dir, f)) for f in os.listdir(fig_dir))
        print(f'[{subj}] embedded {ok}, skipped {skip}, failed {fail}; '
              f'{len(os.listdir(fig_dir))} files, {total/1024/1024:.1f} MB -> {fig_dir}')
    print(f'[{subj}] OK={ok} skip={skip} fail={fail}')
    if fail:
        print('--- failures ---')
        print('\n'.join(report))


if __name__ == '__main__':
    main()
