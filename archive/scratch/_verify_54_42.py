# -*- coding: utf-8 -*-
"""验证表5.4（页262下部）+ 表4.2 lea 行（页187）+ OCR 复核"""
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

# 1) 页262 下部：找表5.4
page = doc[261]
words = [w for w in page.get_text("words") if 400 <= w[1] <= 720]
words.sort(key=lambda w: (w[1], w[0]))
rows = []
cur = None
for w in words:
    if cur is None or w[1] - cur[0][1] > 5:
        cur = [w]
        rows.append(cur)
    else:
        cur.append(w)
out.append("==== 页262 下部（找表5.4）====")
for r in rows:
    r.sort(key=lambda w: w[0])
    out.append("  y=%.0f: %s" % (r[0][1], " | ".join("%s(x%.0f)" % (w[4], w[0]) for w in r)))

# 2) 渲染页187 lea 行区域（y=283-315）
page = doc[186]
mat = fitz.Matrix(3.0, 3.0)
clip = fitz.Rect(60, 283, 500, 315)
pix = page.get_pixmap(matrix=mat, clip=clip)
pix.save("_t42_lea.png")
out.append("==== 页187 lea 行渲染完成 _t42_lea.png ====")

io.open("_verify_54_42.txt", "w", encoding="utf-8").write("\n".join(out))
print("dump done")

# 3) OCR 复核 lea 行
ocr = RapidOCR()
res, _ = ocr("_t42_lea.png")
print("==== OCR 页187 lea 行 ====")
for box, text, score in res:
    print("  x=%.0f y=%.0f: %s" % (box[0][0], box[0][1], text))
