# -*- coding: utf-8 -*-
"""OCR 27王道试题册/解析册的指定套卷页，输出带坐标的行文本。

用法：D:/python/python.exe tools/ocr_mock_vols.py [q|a] [3|5]
输出：archive/_pdf_probe/{q|a}_v{N}.json
格式：[{'p': 页序号, 'lines': [{'x0','y0','x1','y1','t','s'}, ...]}, ...]
"""
import os, sys, json
import fitz
import numpy as np
from rapidocr_onnxruntime import RapidOCR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QPDF = r'E:/夸克/Download/27王道试题册.pdf'
APDF = r'E:/夸克/Download/27王道解析册.pdf'
OUT = os.path.join(ROOT, 'archive', '_pdf_probe')

# 试题册每套 8 页；解析册卷三 p26-38、卷五 p50-60
QPAGES = {3: range(18, 26), 5: range(34, 42)}
APAGES = {3: range(26, 39), 5: range(50, 61)}


def ocr_pdf(pdf, pages, scale=2.0):
    ocr = RapidOCR()
    doc = fitz.open(pdf)
    out = []
    for p in pages:
        pg = doc[p]
        pix = pg.get_pixmap(matrix=fitz.Matrix(scale, scale))
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        res, _ = ocr(img)
        lines = []
        for box, txt, score in (res or []):
            xs = [pt[0] for pt in box]; ys = [pt[1] for pt in box]
            lines.append({
                'x0': round(min(xs), 1), 'y0': round(min(ys), 1),
                'x1': round(max(xs), 1), 'y1': round(max(ys), 1),
                't': txt, 's': round(float(score), 3),
            })
        lines.sort(key=lambda l: (l['y0'], l['x0']))
        out.append({'p': p, 'lines': lines})
        print('  page %d: %d lines' % (p, len(lines)), flush=True)
    return out


def main():
    kind = sys.argv[1] if len(sys.argv) > 1 else 'q'
    vol = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    pdf, pages = (QPDF, QPAGES[vol]) if kind == 'q' else (APDF, APAGES[vol])
    data = ocr_pdf(pdf, pages)
    out = os.path.join(OUT, '%s_v%d.json' % (kind, vol))
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('saved', out, 'pages', len(data), flush=True)


if __name__ == '__main__':
    main()
