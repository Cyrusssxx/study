# -*- coding: utf-8 -*-
"""阶段2v2：A 类文字表坐标重建（表格行判据：词数>=4 且平均相邻间隙>4pt）"""
import io
import os
import re
import json
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
B = "\u8868"  # 表

A_TABLES = [
    (37, 2.1), (66, 2.3),
    (96, 3.1), (144, 3.3),
    (171, 4.1), (187, 4.2), (203, 4.3),
    (219, 5.1), (245, 5.2), (262, 5.3), (262, 5.4),
    (263, 5.5), (263, 5.6), (264, 5.7), (264, 5.8), (265, 5.9),
    (315, 7.1),
]

def cluster_rows(words, gap=12):
    ws = sorted(words, key=lambda w: (w[1], w[0]))
    rows = []
    cur_y = None
    cur = []
    for w in ws:
        if cur_y is None or w[1] - cur_y <= gap:
            cur.append(w)
            cur_y = max(cur_y or 0, w[1])
        else:
            rows.append((cur_y, cur))
            cur = [w]
            cur_y = w[1]
    if cur:
        rows.append((cur_y, cur))
    return rows

def is_table_row(rws):
    """表格行判据：词数>=3 且相邻词平均间隙>4pt（3 列表的行只有 3 个词）"""
    if len(rws) < 3:
        return False
    rws = sorted(rws, key=lambda w: w[0])
    gaps = [b[0] - a[2] for a, b in zip(rws, rws[1:])]
    return (sum(gaps) / len(gaps)) > 4

def cluster_cols(words, gap=9):
    xs = sorted(w[0] + (w[2] - w[0]) / 2 for w in words)
    cols = []
    for x in xs:
        if not cols or x - cols[-1][1] > gap:
            cols.append([x, x])
        else:
            cols[-1][1] = x
    return [(c[0] - 6, c[1] + 6) for c in cols]

def build_table(page_no, tno, y_lo=None, y_hi=None):
    page = doc[page_no - 1]
    words = page.get_text("words")
    pat = re.compile(B + r"\s*%d\.%d" % (int(tno), round((tno % 1) * 10)))
    marks = [w for w in words if pat.match(w[4])]
    if not marks:
        return None
    mark = marks[-1]  # 取最下方的表号词（最接近表格）
    x0, y0 = mark[0], mark[1]
    # 从表号行往下聚类所有行（可限定 y 范围）
    ws = [w for w in words if w[1] >= y0 - 2]
    if y_lo is not None:
        ws = [w for w in ws if y_lo <= w[1] <= y_hi]
    rows = cluster_rows(ws)
    # 标题行：表号词之后第一个短行（词数 2-6 且非表格行），或表号词所在行本身
    title = ""
    start_idx = None
    for i, (y, rws) in enumerate(rows):
        if y < y0 - 2:
            continue
        if is_table_row(rws):
            start_idx = i
            break
        if 2 <= len(rws) <= 6:
            title = "".join(w[4] for w in sorted(rws, key=lambda w: w[0]))
    if start_idx is None:
        return {"page": page_no, "no": tno, "title": title, "error": "no table rows"}
    # 表格主体：从 start_idx 起，连续表格行，遇到连续 2 个非表格行停止
    body = []
    skip = 0
    for y, rws in rows[start_idx:]:
        if is_table_row(rws):
            body.append((y, rws))
            skip = 0
        else:
            skip += 1
            if skip >= 2:
                break
    allw = [w for _, rws in body for w in rws]
    cols = cluster_cols(allw, gap=9)
    grid = []
    for y, rws in body:
        cells = [""] * len(cols)
        for w in sorted(rws, key=lambda w: w[0]):
            cx = w[0] + (w[2] - w[0]) / 2
            for i, (a, b) in enumerate(cols):
                if a <= cx <= b:
                    cells[i] += w[4]
                    break
        grid.append([c.strip() for c in cells])
    return {"page": page_no, "no": tno, "title": title,
            "cols": [round((a + b) / 2, 1) for a, b in cols],
            "rows_y": [round(y, 1) for y, _ in body],
            "grid": grid}

out = []
for page_no, tno in A_TABLES:
    t = build_table(page_no, tno)
    if t is None or t.get("error"):
        out.append("MISS %s page %d : %s" % (tno, page_no, t.get("error") if t else "no mark"))
        continue
    out.append("==== 表%s（页%d）%s" % (tno, page_no, t["title"]))
    out.append("cols: %s" % t["cols"])
    for i, row in enumerate(t["grid"]):
        out.append("  R%d %s" % (i, " | ".join(c if c else "·" for c in row)))

io.open("_tables_a_review.txt", "w", encoding="utf-8").write("\n".join(out))
tables = {}
for page_no, tno in A_TABLES:
    t = build_table(page_no, tno)
    if t and not t.get("error"):
        tables["%s" % tno] = t
io.open("_tables_a.json", "w", encoding="utf-8").write(
    json.dumps(tables, ensure_ascii=False, indent=1))
print("built:", len(tables), "of", len(A_TABLES))
