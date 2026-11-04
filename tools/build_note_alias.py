#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成跨页笔记共享映射：把 zhenti / dati（大题专项）/ ds_daka（打卡表）的题目
   对齐到同一个键 zt{year}_{卷面题号}。

对齐依据：
  - zt_*.json 的 items 里带 i（卷面题号）与 sid（科目）——每年 41~47 的真实归属
  - dati.json 的题按 (year, 科目) 分组，组内数量与 zt 同年同科的题数相等时，
    按章节顺序依次对应（不等则记为 conflict，不生成映射，页面回退本地 key）
  - ds_daka.json 的 real 字段形如 "2014年408真题第42题"，可直接解析

输出 pwa/data/note_alias.json：{ "<本地key>": "zt2014_42", ... }
用法：python tools/build_note_alias.py [--dry-run]
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PWA = ROOT / "pwa"
dry = "--dry-run" in sys.argv
SUBJ = {"co", "os", "cn", "ds"}

alias = {}

# ---- 1) zt：每年每科的卷面题号列表 ----
zt_map = {}          # {year: {sid: [i, ...]}}
for f in sorted((PWA / "data/zt").glob("zt_*.json")):
    year = int(re.search(r"zt_(\d{4})", f.name).group(1))
    items = json.loads(f.read_text(encoding="utf-8"))["items"]
    per = {}
    for it in items:
        i, sid = it.get("i"), it.get("sid")
        if sid in SUBJ and isinstance(i, int) and i >= 41:
            per.setdefault(sid, []).append(i)
    zt_map[year] = {k: sorted(v) for k, v in per.items()}

# ---- 1b) zhenti：把 iid 也指向同一个规范键 ----
for f in sorted((PWA / "data/zt").glob("zt_*.json")):
    year = int(re.search(r"zt_(\d{4})", f.name).group(1))
    for it in json.loads(f.read_text(encoding="utf-8"))["items"]:
        i = it.get("i")
        if not isinstance(i, int) or i < 41:
            continue
        iid = it.get("qid") or f"{it.get('sid')}_zt{year}_{i}"
        alias[iid] = f"zt{year}_{i}"

# ---- 2) dati：按 (year, 科目) 分组 ----
dati = json.loads((PWA / "data/dati.json").read_text(encoding="utf-8"))
dati_by = {}         # {(year, sid): [qid, ...]}  保持章节顺序
for s in dati["subjects"]:
    sid = s["key"]
    for ch in s["chapters"]:
        for sec in ch["sections"]:
            for q in sec["questions"]:
                y = q.get("year")
                if y:
                    dati_by.setdefault((int(y), sid), []).append(q["id"])

# ---- 3) 配对 ----
conflicts = []
for (year, sid), qids in sorted(dati_by.items()):
    nums = zt_map.get(year, {}).get(sid, [])
    if not nums:
        conflicts.append((year, sid, len(qids), "zt 无该年该科大题"))
        continue
    if len(nums) != len(qids):
        conflicts.append((year, sid, len(qids), f"数量不等 zt={len(nums)}"))
        continue
    for qid, no in zip(qids, nums):
        alias[qid] = f"zt{year}_{no}"

# ---- 4) 打卡表：解析 real ----
daka = json.loads((PWA / "data/ds_daka.json").read_text(encoding="utf-8"))
daka_hit = 0
for q in daka["questions"]:
    m = re.search(r"(\d{4})年408真题第(\d+)题", q.get("real") or "")
    if not m:
        continue
    year, no = int(m.group(1)), int(m.group(2))
    alias[q["id"]] = f"zt{year}_{no}"
    daka_hit += 1

# ---- 5) 统计与输出 ----
dati_hit = sum(1 for k in alias if k.startswith("dati_"))
print(f"dati 映射 {dati_hit} / {sum(len(v) for v in dati_by.values())} 题")
print(f"daka 映射 {daka_hit} / {len(daka['questions'])} 卡片（含真题标注的）")
if conflicts:
    print("\n未映射（数量不匹配，需人工核对）:")
    for year, sid, n, why in conflicts:
        print(f"  {year} {sid}: dati {n} 题，{why}")

# 说明：多个本地键指向同一个规范键是**预期**（zhenti/dati/daka 各有一份），
# 只需保证「一个本地键不被赋两个不同值」——上面按来源分别赋值，天然满足。

out = PWA / "data/note_alias.json"
if dry:
    print(f"\n[dry-run] 将写入 {len(alias)} 条 → {out.name}")
    for k in list(alias)[:5]:
        print("  ", k, "->", alias[k])
else:
    out.write_text(json.dumps(dict(sorted(alias.items())), ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")
    print(f"\n已写入 {out} （{len(alias)} 条）")
