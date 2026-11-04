#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从真题套卷（zt_*.json）抽取大题，补进「大题专项」（dati.json）。

    zt 的题目是 HTML 富文本（KaTeX + 外置 SVG），dati 的题目是图片列表，
    因此这里用 Chromium 把题干/解析渲染成 2x JPG，再按题型归入对应章节。
    宽表格/数据通路图：画布按内容自然宽度自适应，避免右侧裁切。

用法：
    python tools/extract_zt_bigq.py --dry-run     # 只打印计划
    python tools/extract_zt_bigq.py               # 渲染 + 入库
"""
import json
import re
import subprocess
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PWA = ROOT / "pwa"
DRY = "--dry-run" in sys.argv

# (year, 套卷题号, 科目, 章_节, 说明) —— 章节按题目考点人工判定
PLAN = [
    (2026, 43, "co", "4_1", "定长指令字 / R-I-M 型指令格式"),
    (2026, 44, "co", "5_3", "数据通路、多路选择器与扩展器"),
    (2026, 45, "os", "2_2", "优先级 + 时间片轮转调度"),
    (2026, 46, "os", "4_3", "索引节点、位图与目录"),
    (2026, 47, "cn", "5_3", "TCP 三次握手与拥塞控制"),
]

CSS = """
html,body{margin:0;padding:0;background:#fff}
#box{padding:18px 24px;box-sizing:border-box}
#box .svg-container{width:100%!important}
#box .zt-svg-wrap svg{max-width:100%;height:auto}
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
    it = [x for x in z["items"] if x["i"] == qno][0]
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
    dati_path = PWA / "data/dati.json"
    dati = json.loads(dati_path.read_text(encoding="utf-8"))
    subs = {s["key"]: s for s in dati["subjects"]}
    jobs = []
    for year, qno, sid, sec_key, desc in PLAN:
        sub = subs[sid]
        target = None
        for ch in sub["chapters"]:
            for sec in ch["sections"]:
                m = re.match(r"(\d+)\.(\d+)", sec["name"])
                if m and f"{m.group(1)}_{m.group(2)}" == sec_key:
                    target = sec
                    break
            if target:
                break
        if not target:
            print(f"[跳过] {year}-{qno} {sid}: 找不到节 {sec_key}")
            continue
        ch_no, sec_no = sec_key.split("_")
        existing = {q["id"] for q in target["questions"]}
        idx = len(target["questions"]) + 1
        qid = f"dati_{sid}_{ch_no}_{sec_no}_{idx:02d}"
        while qid in existing:
            idx += 1
            qid = f"dati_{sid}_{ch_no}_{sec_no}_{idx:02d}"
        jobs.append(dict(year=year, qno=qno, sid=sid, sec=target, qid=qid, desc=desc))

    for j in jobs:
        print(f"{j['year']} 第 {j['qno']} 题 [{j['sid']}] → {j['sec']['name']}  新 id={j['qid']}  ({j['desc']})")

    if DRY:
        return

    tmp = ROOT / "_tmp_render"
    tmp.mkdir(exist_ok=True)
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000}, device_scale_factor=2)
        for j in jobs:
            html_file = tmp / f"r_{j['year']}_{j['qno']}.html"
            build_html(j["year"], j["qno"], html_file)
            page.goto(html_file.as_uri(), wait_until="load")
            page.wait_for_timeout(600)
            page.evaluate(FIT_JS)
            page.wait_for_timeout(250)
            outdir = PWA / f"data/dati_figs/{j['sid']}"
            outdir.mkdir(parents=True, exist_ok=True)
            qf, af = f"{j['qid']}_q_01.jpg", f"{j['qid']}_a_01.jpg"
            page.locator("#q").screenshot(path=str(outdir / qf), type="jpeg", quality=88)
            page.locator("#a").screenshot(path=str(outdir / af), type="jpeg", quality=88)
            j["sec"]["questions"].append({
                "id": j["qid"], "num": len(j["sec"]["questions"]) + 1,
                "real": True, "year": j["year"], "q": [qf], "a": [af],
            })
            print(f"  ✓ {j['qid']}  ->  {qf} / {af}")
        browser.close()

    out = (json.dumps(dati, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    dati_path.write_bytes(out)
    print(f"\ndati.json 已更新（{len(out)} 字节）")

    subprocess.run([sys.executable, str(ROOT / "tools/build_note_alias.py")], check=False)


if __name__ == "__main__":
    main()
