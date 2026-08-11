# -*- coding: utf-8 -*-
"""阶段1：盘点王道计组 PDF 全书表格，区分 A 类（文字表）与 B 类（图片表）"""
import io
import os
import re
import fitz

# 定位计组 PDF（339 页）
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
B = "\u8868"  # 表

pat = re.compile(B + r"\s*(\d+)\.(\d+)")

for i in range(len(doc)):
    page = doc[i]
    words = page.get_text("words")
    imgs = len(page.get_images(full=True))
    # 表号词：词文本以 表x.y 开头（可能带后缀）
    cands = []
    for w in words:
        t = w[4]
        m = pat.match(t)
        if m:
            cands.append((w, int(m.group(1)), int(m.group(2))))
    if not cands:
        continue
    # 按表号去重（一个表号可能拆成 表 + 5.3 两个词，取词文本最长的）
    seen = set()
    for w, ch, no in cands:
        key = (ch, no)
        if key in seen:
            continue
        seen.add(key)
        y0, x0 = w[1], w[0]
        # 下方区域词（y0+8 到 y0+260），排除表号词本身
        region = [ww for ww in words if y0 + 6 <= ww[1] <= y0 + 260 and ww[4] != w[4]]
        region.sort(key=lambda ww: (ww[1], ww[0]))
        # 聚类前几行看结构
        preview = " / ".join(ww[4] for ww in region[:40])
        out.append("page %d | 表%d.%d (y=%.0f x=%.0f) | imgs=%d | region_words=%d | %s" % (
            i + 1, ch, no, y0, x0, imgs, len(region), preview[:600]))

io.open("_tables_inventory.txt", "w", encoding="utf-8").write("\n".join(out))
print("total table refs:", len(out))
