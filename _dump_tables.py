# -*- coding: utf-8 -*-
"""dump 指定页 y 区域的所有词（按物理行 y 聚类，行内按 x 排序），供人工定稿表格"""
import io
import os
import fitz

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

# (页号, y_min, y_max, 标签)
REGIONS = [
    (96, 60, 230, "表3.1 跨页(下)完整"),
    (171, 375, 540, "表4.1 寻址方式完整"),
    (187, 200, 340, "表4.2 AT&T/Intel完整"),
    (263, 90, 560, "表5.4/5.5 访存冲突/RAW"),
]

out = []
for page_no, y0, y1, label in REGIONS:
    page = doc[page_no - 1]
    words = [w for w in page.get_text("words") if y0 <= w[1] <= y1]
    words.sort(key=lambda w: (w[1], w[0]))
    # 物理行聚类 gap=5
    rows = []
    cur = None
    for w in words:
        if cur is None or w[1] - cur[0][1] > 5:
            cur = [w]
            rows.append(cur)
        else:
            cur.append(w)
    out.append("==== %s（页%d）====" % (label, page_no))
    for r in rows:
        r.sort(key=lambda w: w[0])
        out.append("  y=%.0f: %s" % (r[0][1], " | ".join("%s(x%.0f)" % (w[4], w[0]) for w in r)))
    out.append("")

io.open("_tables_dump.txt", "w", encoding="utf-8").write("\n".join(out))
print("dumped", len(REGIONS), "regions")
