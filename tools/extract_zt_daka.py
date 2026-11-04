#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从真题套卷（zt_*.json）抽取 DS 大题，补进打卡表（ds_daka.json）。

    ds_daka 的卡片是「教材原图 + 任务清单」，zt 的题是 HTML 富文本，
    这里用 Chromium 渲染成 2x JPG 存进 data/daka_figs/，再按应用题卡片结构入库。

用法：python tools/extract_zt_daka.py [--dry-run]
"""
import json
import re
import subprocess
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PWA = ROOT / "pwa"
DRY = "--dry-run" in sys.argv

# 缺口（zt 有、daka 无）：2025 第 42 题（AOE 关键路径）、2026 第 42 题（栈的出栈序列）
PLAN = [
    (2025, 42, "AOE 网关键路径"),
    (2026, 42, "栈的出栈序列"),
]

CSS = """
html,body{margin:0;padding:0;background:#fff}
#box{padding:18px 24px;box-sizing:border-box}
#box .svg-container{width:100%!important}
#box svg{max-width:100%!important;height:auto!important}
#box .question-content,#box .analysis-content{max-width:100%;overflow-wrap:anywhere}
#box table{width:100%!important;table-layout:auto!important}
#box img{max-width:100%;height:auto}
#box pre,#box code{white-space:pre-wrap;word-break:break-word}
#box .katex{overflow-wrap:normal}
"""

FIT_JS = """() => {
    const box = document.getElementById('box');
    box.style.width = 'max-content';
    box.style.maxWidth = 'none';
    let w = box.scrollWidth;
    box.querySelectorAll('*').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.right > w) w = r.right;
    });
    box.style.width = Math.ceil(Math.max(760, w) + 8) + 'px';
}"""


def inline_svg(html: str) -> str:
    def rep(m):
        f = PWA / f"data/zt_svg/{m.group(1)}.svg"
        t = f.read_text(encoding="utf-8") if f.exists() else "<span>[图缺失]</span>"
        return f'<div class="zt-svg-wrap">{t}</div>'
    return re.sub(r'<div class="zt-svgholder" data-svg="([^"]+)"></div>', rep, html)


def build_html(year: int, qno: int, out: pathlib.Path):
    z = json.loads((PWA / f"data/zt/zt_{year}.json").read_text(encoding="utf-8"))
    it = [x for x in z["items"] if x["i"] == qno and x["sid"] == "ds"][0]
    q, an = inline_svg(it["q"]), inline_svg(it.get("an") or "")
    out.write_text(
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="../pwa/vendor/katex/katex.min.css">'
        '<link rel="stylesheet" href="../pwa/css/style.css">'
        f"<style>{CSS}</style></head><body><div id=\"box\">"
        f'<div class="part" id="q"><div class="question-content">{q}</div></div>'
        f'<div class="part" id="a"><div class="analysis-content">{an}</div></div>'
        "</div></body></html>",
        encoding="utf-8",
    )
    return it


def main():
    p = PWA / "data/ds_daka.json"
    raw = p.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    qs = data["questions"]
    existing = {x["id"] for x in qs}
    have = set()
    for x in qs:
        m = re.search(r"(\d{4})年408真题第(\d+)题", x.get("real") or "")
        if m:
            have.add((int(m.group(1)), int(m.group(2))))

    jobs = []
    for year, qno, desc in PLAN:
        if (year, qno) in have:
            print(f"[跳过] {year}-{qno} 已在打卡表中")
            continue
        cid = f"ds_daka_zhenti_{year}_{qno}"
        if cid in existing:
            print(f"[跳过] id 已存在 {cid}")
            continue
        jobs.append(dict(year=year, qno=qno, cid=cid, desc=desc))

    for j in jobs:
        print(f"{j['year']} 第 {j['qno']} 题 → 新卡 {j['cid']}  ({j['desc']})")
    if DRY or not jobs:
        return

    tmp = ROOT / "_tmp_render"
    tmp.mkdir(exist_ok=True)
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p2:
        browser = p2.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000}, device_scale_factor=2)
        for j in jobs:
            html_file = tmp / f"d_{j['year']}_{j['qno']}.html"
            build_html(j["year"], j["qno"], html_file)
            page.goto(html_file.as_uri(), wait_until="load")
            page.wait_for_timeout(600)
            page.evaluate(FIT_JS)
            page.wait_for_timeout(250)
            outdir = PWA / "data/daka_figs"
            outdir.mkdir(parents=True, exist_ok=True)
            qf, af = f"{j['cid']}_q_0.jpg", f"{j['cid']}_a_0.jpg"
            page.locator("#q").screenshot(path=str(outdir / qf), type="jpeg", quality=88)
            page.locator("#a").screenshot(path=str(outdir / af), type="jpeg", quality=88)
            card = {
                "id": j["cid"],
                "priority": 0,
                "priority_label": "必做",
                "module": "真题训练",
                "kaodian": "应用题",
                "source": f"{j['year']}年408真题第{j['qno']}题",
                "real": f"{j['year']}年408真题第{j['qno']}题",
                "sheet": "应用题",
                "figs": {"content": [qf], "answer": [af]},
                "tasks": [f"做408真题_{j['year']}_{j['qno']}题"],
            }
            # 插到最后一个「应用题」之后，保持分组内顺序自然
            last = max(i for i, x in enumerate(qs) if x.get("sheet") == "应用题")
            qs.insert(last + 1, card)
            data["total"] = len(qs)
            print(f"  ✓ {j['cid']}  {qf} / {af}")
        browser.close()

    data["total"] = len(data["questions"])
    p.write_bytes(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
    print(f"\nds_daka.json 已更新，共 {len(data['questions'])} 张卡")

    subprocess.run([sys.executable, str(ROOT / "tools/build_note_alias.py")], check=False)


if __name__ == "__main__":
    main()
