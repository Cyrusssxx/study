# -*- coding: utf-8 -*-
"""
打卡题教材原图截取：复用 extract_daka.py 的节定位，按行坐标切出每题
题面/解答在 PDF 中的原始区域，渲染为 JPG（含图/表格，弥补纯文本提取丢图）。
输出 pwa/data/daka_figs/（已废弃 static/ 镜像，PWA 为唯一真源），
同时给 ds_daka.json 每题追加 figs: {content:[文件名], answer:[文件名]}。
用法：
    python extract_daka_figs.py           # 预览：只写 _preview_figs.txt 报告，不产图
    python extract_daka_figs.py --apply   # 产图 + 回写两份 JSON
"""
import json
import os
import re
import shutil
import sys

import fitz

from extract_daka import PDF, OUT, PWA_OUT, BOOK_HEADER, build_ranges

ROOT = os.path.dirname(os.path.abspath(__file__))
# 直接写 PWA 数据目录（pwa/ 为唯一真源，已废弃 static/ 镜像）
FIG_DIR = os.path.join(ROOT, 'pwa', 'data', 'daka_figs')
PREVIEW = os.path.join(ROOT, '_preview_figs.txt')
ZOOM = 2.0
JPG_QUALITY = 78

Q_END = re.compile(r'^(?:.{0,4}\d+\.\d+\.\d+\s*答案与解析|一、单项选择题)')
A_END = re.compile(r'^(归纳总结|思维拓展|\*?\d+\.\d+\s*[\u4e00-\u9fff])')


def page_lines(doc, pno):
    """页内文本行 [(y0, y1, text)]，按 y 排序（pno 0-based）"""
    lines = []
    for blk in doc[pno].get_text('dict')['blocks']:
        for ln in blk.get('lines', []):
            text = ''.join(s['text'] for s in ln['spans']).strip()
            if text:
                lines.append((ln['bbox'][1], ln['bbox'][3], text))
    lines.sort()
    return lines


def area_lines(doc, p1, p2, is_answer):
    """[p1,p2] 页(1-based)内"二、综合应用题"区域的行：[(page0, y0, y1, text)]"""
    rows = []
    for p in range(p1 - 1, p2):
        for i, (y0, y1, t) in enumerate(page_lines(doc, p)):
            if i < 3 and BOOK_HEADER.match(t):
                continue  # 书眉/页码
            rows.append((p, y0, y1, t))
    start = next((i for i, r in enumerate(rows) if '二、综合应用题' in r[3]), None)
    if start is None:
        return []
    end_pat = A_END if is_answer else Q_END
    body = rows[start + 1:]
    for i, r in enumerate(body):
        if end_pat.match(r[3]):
            return body[:i]
    return body


def split_spans(rows, is_answer):
    """按题号标记切分：{num: [(page0,y0,y1,text), ...]}（同 extract_daka.split_items）"""
    pat = re.compile(r'^(\d{1,2})\.【解答\d?】' if is_answer else r'^(\d{1,2})\.(?!\d)')
    marks = [(i, int(pat.match(r[3]).group(1))) for i, r in enumerate(rows) if pat.match(r[3])]
    spans = {}
    for j, (i, num) in enumerate(marks):
        end = marks[j + 1][0] if j + 1 < len(marks) else len(rows)
        if num not in spans:
            spans[num] = rows[i:end]
    return spans


def crop_images(doc, rows, prefix, apply_mode):
    """把一段行区域按页切成若干裁剪图，返回 [(文件名, 估算高度px)]"""
    if not rows:
        return []
    by_page = {}
    for p, y0, y1, _ in rows:
        lo, hi = by_page.get(p, (y0, y1))
        by_page[p] = (min(lo, y0), max(hi, y1))
    out = []
    for k, p in enumerate(sorted(by_page)):
        y0, y1 = by_page[p]
        page = doc[p]
        w, h = page.rect.width, page.rect.height
        rect = fitz.Rect(w * 0.045, max(y0 - 4, 0), w * 0.955, min(y1 + 6, h))
        if rect.height < 14:
            continue
        name = f'{prefix}_{k}.jpg'
        if apply_mode:
            pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=rect)
            pix.save(os.path.join(FIG_DIR, name), jpg_quality=JPG_QUALITY)
        out.append((name, int(rect.height * ZOOM)))
    return out


def main():
    apply_mode = '--apply' in sys.argv
    data = json.load(open(OUT, encoding='utf-8'))
    secs = sorted({q['id'][len('ds_daka_'):].rsplit('_', 1)[0].replace('_', '.')
                   for q in data['questions']})
    doc = fitz.open(PDF)
    ranges = build_ranges(doc, secs)

    q_spans, a_spans = {}, {}
    for sec in secs:
        qs, qe, as_, ae = ranges[sec]
        q_spans[sec] = split_spans(area_lines(doc, qs, qe, False), False)
        a_spans[sec] = split_spans(area_lines(doc, as_, ae, True), True)

    if apply_mode:
        shutil.rmtree(FIG_DIR, ignore_errors=True)
        os.makedirs(FIG_DIR, exist_ok=True)

    report, warns = [], []
    for q in data['questions']:
        sec, num = q['id'][len('ds_daka_'):].rsplit('_', 1)
        sec, num = sec.replace('_', '.'), int(num)
        cfigs = crop_images(doc, q_spans[sec].get(num, []), f'{q["id"]}_q', apply_mode)
        afigs = crop_images(doc, a_spans[sec].get(num, []), f'{q["id"]}_a', apply_mode)
        if not cfigs:
            warns.append(f'!! {q["id"]}: 题面区域未定位到')
        if not afigs and q['answer']:
            warns.append(f'!! {q["id"]}: 解答区域未定位到')
        q['figs'] = {'content': [n for n, _ in cfigs], 'answer': [n for n, _ in afigs]}
        report.append(f'{q["id"]}: 题面{len(cfigs)}张 解答{len(afigs)}张 '
                      f'({", ".join(f"{n} h={h}" for n, h in cfigs + afigs)})')

    header = [f'共 {len(data["questions"])} 题']
    if warns:
        header.append('--- 警告 ---\n' + '\n'.join(warns))
    open(PREVIEW, 'w', encoding='utf-8').write('\n'.join(header + report))
    print(f'questions: {len(data["questions"])}, warns: {len(warns)}, report -> _preview_figs.txt')

    if apply_mode:
        json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        shutil.copy2(OUT, PWA_OUT)
        total = sum(os.path.getsize(os.path.join(FIG_DIR, f)) for f in os.listdir(FIG_DIR))
        print(f'figs: {len(os.listdir(FIG_DIR))} files, {total / 1024 / 1024:.1f} MB -> {FIG_DIR}')


if __name__ == '__main__':
    main()
