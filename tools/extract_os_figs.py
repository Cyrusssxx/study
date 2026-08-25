# -*- coding: utf-8 -*-
"""
OS 笔记必看图：从王道《操作系统》扫描版 PDF 按「图x.y」题注定位并裁剪原图。
PDF 每页为整页扫描图（有对齐文本层），无法用矢量元素定位。
策略：题注在图正下方；裁剪上界 = 题注上方最近的「正文宽行」底部 或 同页更早的
题注底部（处理一页多图），下界 = 题注底部；左右取文本栏宽。
用法：
    python tools/extract_os_figs.py          # 预览：打印裁剪框与空白检测
    python tools/extract_os_figs.py --apply  # 输出 PNG 到 pwa/img/
"""
import os
import re
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(r"D:\ai code\408教材",
                   "2027王道《操作系统》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf")
OUT_DIR = os.path.join(ROOT, "pwa", "img")
ZOOM = 2.0

# (输出名, 页码1-based, 题注前缀)
FIGS = [
    ("os_fig_2_1_mem",      52,  "图2.1 一个典型进程在内存中的映像"),
    ("os_fig_2_2_state",    53,  "图2.2 5种进程状态的转换"),
    ("os_fig_3_8_paging",   195, "图3.8 分页存储管理系统中的地址变换机构"),
    ("os_fig_3_9_tlb",      197, "图3.9 具有快表的地址变换机构"),
    ("os_fig_3_15_seg",     200, "图3.15 分段系统的地址变换过程"),
    ("os_fig_3_18_segpaged",202, "图3.18 段页式系统的地址变换机构"),
    ("os_fig_3_20_pagereq", 225, "图3.20 请求分页中的地址变换过程"),
    ("os_fig_4_1_fslevel",  264, "图4.1 一个合理的文件系统层次结构", (316, 246, 508, 382)),
    ("os_fig_4_6_dir1",     269, "图4.6 单级目录结构"),
    ("os_fig_4_7_dir2",     270, "图4.7 两级目录结构"),
    ("os_fig_4_8_tree",     270, "图4.8 树形目录结构"),
    ("os_fig_4_9_dag",      271, "图4.9 无环图目录结构", (293, 260, 500, 386)),
    ("os_fig_4_11_link",    273, "图4.11 隐式链接方式"),
    ("os_fig_4_12_fat",     274, "图4.12 磁盘的文件分配表"),
    ("os_fig_5_15_spool",   337, "图5.15 SPOOLing系统的组成"),
    ("os_fig_5_22_fcfs",    354, "图5.22 FCFS算法"),
    ("os_fig_5_23_sstf",    354, "图5.23 SSTF算法"),
    ("os_fig_5_24_scan",    355, "图5.24 SCAN算法"),
    ("os_fig_5_25_cscan",   355, "图5.25 C-SCAN算法"),
    ("os_fig_5_26_look",    355, "图5.26 LOOK调度"),
    ("os_fig_5_27_clook",   356, "图5.27 C-LOOK 调度"),
]

WIN_UP = 520
CAP_PAT = re.compile(r"^图\s*\d+\.\d+\s*\S")


def norm(s):
    return re.sub(r"\s+", "", s)


def page_lines(page):
    """[(y0,y1,x0,x1,text)]"""
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for ln in blk.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).strip()
            if t:
                b = ln["bbox"]
                out.append((b[1], b[3], b[0], b[2], t))
    out.sort()
    return out


def find_caption(lines, prefix):
    want = norm(prefix)
    for y0, y1, x0, x1, t in lines:
        if norm(t).startswith(want):
            return (y0, y1, x0, x1)
    return None


def crop_rect(page, cap):
    """裁剪框：上界=题注上方最近正文行底/同页更早题注底，下界=题注底
    cap=(y0,y1,x0,x1)"""
    W = page.rect.width
    cy0, cy1 = cap[0], cap[1]          # 题注顶部/底部
    lines = page_lines(page)
    # 正文宽行：行宽 > 栏宽 55%（图内标签都是短行）
    widths = sorted((x1 - x0) for _, _, x0, x1, _ in lines)
    colw = widths[int(len(widths) * 0.9)] if widths else W * 0.8
    tops = [max(50, cy0 - WIN_UP)]
    for ly0, ly1, lx0, lx1, t in lines:
        # 正文行 = 宽且字多（层次图的宽文本框标签字数少，借此区分）
        if ly1 <= cy0 + 2 and (lx1 - lx0) > colw * 0.55 and len(t) >= 12:
            tops.append(ly1 + 4)
        elif CAP_PAT.match(t) and ly1 <= cy0 - 10:            # 同页更早的题注（一页多图）
            tops.append(ly1 + 6)
    y_top = max(tops)
    # 左右：优先用图区内短标签行的范围，兜底文本栏
    xs0, xs1 = [], []
    for ly0, ly1, lx0, lx1, t in lines:
        if ly0 >= y_top - 4 and ly1 <= cy0:
            xs0.append(lx0)
            xs1.append(lx1)
    x_left = max(36, (min(xs0) - 10) if xs0 else 40)
    x_right = min(W - 30, (max(xs1) + 10) if xs1 else W - 40)
    return pymupdf.Rect(x_left, y_top, x_right, cy1 + 4)


def main(apply_mode):
    doc = pymupdf.open(PDF)
    ok, fail = 0, []
    for item in FIGS:
        key, pno, prefix = item[0], item[1], item[2]
        manual = item[3] if len(item) > 3 else None   # 图文绕排页手动指定裁剪框
        page = doc[pno - 1]
        if manual:
            rect = pymupdf.Rect(*manual)
        else:
            cap = find_caption(page_lines(page), prefix)
            if not cap:
                fail.append((key, f"未找到题注 {prefix}"))
                continue
            rect = crop_rect(page, cap)
        if not rect or rect.width < 80 or rect.height < 50:
            fail.append((key, f"裁剪框异常 {rect}"))
            continue
        pix = page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=rect)
        samp = pix.samples
        step = max(1, len(samp) // 30000)
        vals = samp[::step][:30000]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        status = "OK" if var >= 200 else "疑似空白!"
        print(f"{key}: P{pno} clip={tuple(round(v) for v in rect)} "
              f"{pix.width}x{pix.height}px var={var:.0f} {status}")
        if apply_mode and status == "OK":
            os.makedirs(OUT_DIR, exist_ok=True)
            pix.save(os.path.join(OUT_DIR, key + ".png"))
            ok += 1
    print(f"\n{'已写出 ' + str(ok) + '/' + str(len(FIGS)) + ' 张' if apply_mode else '预览完成'}")
    if fail:
        print("失败:")
        for k, why in fail:
            print("  ", k, why)
    return 0 if not fail else 1


if __name__ == "__main__":
    main("--apply" in sys.argv)
