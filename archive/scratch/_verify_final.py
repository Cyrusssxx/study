# -*- coding: utf-8 -*-
"""最终确认：表5.1(页219)、表5.2尾行(页245)、表4.3/5.2表头、表4.2注、表5.3表头"""
import io
import os
import fitz
from rapidocr_onnxruntime import RapidOCR

base = r"D:\ai code"
pdf_path = None
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith(".pdf") and "z-library.sk" in f:
            d = fitz.open(os.path.join(root, f))
            if len(d) == 339:
                pdf_path = os.path.join(root, f)
                d.close()
                break
    if pdf_path:
        break

doc = fitz.open(pdf_path)
out = []

def dump_region(page_no, y0, y1, label):
    page = doc[page_no - 1]
    words = [w for w in page.get_text("words") if y0 <= w[1] <= y1]
    words.sort(key=lambda w: (w[1], w[0]))
    rows = []
    cur = None
    for w in words:
        if cur is None or w[1] - cur[0][1] > 5:
            cur = [w]
            rows.append(cur)
        else:
            cur.append(w)
    out.append("==== %s（页%d y=%d-%d）====" % (label, page_no, y0, y1))
    for r in rows:
        r.sort(key=lambda w: w[0])
        out.append("  y=%.0f: %s" % (r[0][1], " | ".join("%s(x%.0f)" % (w[4], w[0]) for w in r)))
    out.append("")

dump_region(219, 150, 500, "表5.1 总线式/专用（整页扫描找表）")
dump_region(245, 250, 330, "表5.2 尾行")

io.open("_verify_final.txt", "w", encoding="utf-8").write("\n".join(out))
print("dump done")

ocr = RapidOCR()
# 表4.3 表头 + 表5.2 表头 + 表4.2 注 + 表5.3 表头
for page_no, y0, y1, label, fname in [
    (203, 190, 240, "表4.3 表头", "_t43_head.png"),
    (245, 190, 240, "表5.2 表头", "_t52_head.png"),
    (187, 312, 340, "表4.2 注", "_t42_note.png"),
    (262, 295, 405, "表5.3 全表", "_t53_full.png"),
]:
    page = doc[page_no - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(3.0, 3.0), clip=fitz.Rect(50, y0, 510, y1))
    pix.save(fname)
    print("==== OCR %s ====" % label)
    res, _ = ocr(fname)
    for box, text, score in res:
        print("  x=%.0f y=%.0f: %s" % (box[0][0] / 3 + 50, box[0][1] / 3 + y0, text))
