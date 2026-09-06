# -*- coding: utf-8 -*-
"""通用版：把「题库知识点归纳」(过渡稿 md) 按 题号→小节 投递进对应科目线上考点笔记。
用法:
  python tools/merge_md_to_notes.py <subject> [--dry]    subject ∈ {cn, co, ds, os}
幂等：重复运行先移除旧的「📌 题库考点补充」块再重新注入。
小节归属规则：
  - 题有 subsection → 投递到对应小节 html
  - 题 subsection 为空 → 投递到所在「节」的节级 html（渲染在整节末尾），键前缀 "§"
"""
import json, re, sys

CONF = {
    "cn": {"md": "计网题库知识点归纳.md",   "notes": "pwa/data/notes/cn_notes.json", "qs": "pwa/data/cn.json"},
    "co": {"md": "计组题库知识点归纳.md",   "notes": "pwa/data/notes/co_notes.json", "qs": "pwa/data/co.json"},
    "ds": {"md": "数据结构题库知识点归纳.md", "notes": "pwa/data/notes/ds_notes.json", "qs": "pwa/data/ds.json"},
    "os": {"md": "OS题库知识点归纳.md",     "notes": "pwa/data/notes/os_notes.json", "qs": "pwa/data/os.json"},
}
# 特例：题库 subsection 名 → 笔记小节名（仅不匹配的科目需要）
OVERRIDE = {"5.2.x 中断处理流程": "5.2.6 I/O操作举例"}
MARK = "📌 题库考点补充"
ALLOWED = ("sub", "sup", "br", "b", "code")


def cited_qs(text):
    out = []
    for m in re.finditer(r"Q(\d{1,3})(?:\s*[–\-]\s*Q?(\d{1,3}))?", text):
        a = int(m.group(1)); b = m.group(2)
        if b:
            b = int(b)
            if a <= b <= a + 300:
                out.extend(range(a, b + 1))
            else:
                out.append(a)
        else:
            out.append(a)
    return out


def to_html(t):
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = t.replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"&lt;(/?(?:%s))&gt;" % "|".join(ALLOWED), r"<\1>", t)
    return t


def make_block(items):
    lis = []
    for it in items:
        li = "<li>" + to_html(it["text"])
        if it["subs"]:
            li += "<ul>" + "".join("<li>" + to_html(s) + "</li>" for s in it["subs"]) + "</ul>"
        li += "</li>"
        lis.append(li)
    return f"<h4>{MARK}</h4><ul>" + "".join(lis) + "</ul>"


def strip_old(h):
    return re.sub(r"<h4>%s</h4><ul>[\s\S]*?</ul>\s*$" % re.escape(MARK), "", h).rstrip()


def main():
    sub = sys.argv[1] if len(sys.argv) > 1 else "cn"
    dry = "--dry" in sys.argv
    if sub not in CONF:
        print("未知科目:", sub); sys.exit(1)
    md_path, notes_path, qs_path = CONF[sub]["md"], CONF[sub]["notes"], CONF[sub]["qs"]

    qsub = {}
    for q in json.load(open(qs_path, encoding="utf-8"))["questions"]:
        s = (q.get("subsection") or "").strip()
        if not s:
            s = "§" + (q.get("section") or "").strip()  # 空小节 → 节级综合
        qsub[q["number"]] = OVERRIDE.get(s, s)

    bullets, cur = [], None
    for ln in open(md_path, encoding="utf-8").read().splitlines():
        m = re.match(r"^(\s*)- (.*)$", ln)
        if not m:
            if ln.strip().startswith(("#", ">")):
                cur = None
            continue
        indent, text = len(m.group(1)), m.group(2).strip()
        if indent == 0:
            cur = {"text": text, "subs": []}
            bullets.append(cur)
        elif cur is not None:
            cur["subs"].append(text)

    dist, orphan = {}, []
    for b in bullets:
        target = None
        for n in cited_qs(b["text"] + " " + " ".join(b["subs"])):
            if n in qsub and qsub[n]:
                target = qsub[n]
                break
        if target:
            dist.setdefault(target, []).append(b)
        else:
            orphan.append(b["text"][:40])

    n_sub = sum(1 for k in dist if not k.startswith("§"))
    n_sec = sum(1 for k in dist if k.startswith("§"))
    print(f"[{sub}] md 条目={len(bullets)} | 可投递={sum(len(v) for v in dist.values())} -> 小节{len(dist)-n_sec}+节级{n_sec} | 无引用={len(orphan)}")
    if orphan:
        print("  无引用示例:", " | ".join(orphan[:3]))

    raw = open(notes_path, "rb").read()
    had_trailing = raw.endswith(b"\n")
    d = json.loads(raw.decode("utf-8"))
    changed = 0
    for ch in d["chapters"]:
        for sec in ch["sections"]:
            secname = sec["section"].strip()
            sec_items = dist.get("§" + secname)
            if sec_items:
                block = make_block(sec_items)
                h = sec.get("html") or ""
                h = strip_old(h)
                sec["html"] = (h + "\n" + block).strip() if h else block
                changed += 1
            for ss in sec.get("subsections", []):
                name = ss["section"].strip()
                items = dist.get(name)
                if not items:
                    continue
                block = make_block(items)
                h = ss.get("html") or ""
                h = strip_old(h)
                ss["html"] = (h + "\n" + block).strip() if h else block
                changed += 1

    print(f"[{sub}] 注入位置数={changed}")
    top = sorted(dist.items(), key=lambda x: -len(x[1]))[:6]
    for name, its in top:
        print(f"    {name}: {len(its)} 条")

    if dry:
        print("[dry-run] 未写入")
        return

    out = json.dumps(d, ensure_ascii=False, indent=2)
    if had_trailing:
        out += "\n"
    open(notes_path, "w", encoding="utf-8", newline="").write(out)
    print(f"[{sub}] 已写入 {notes_path}（格式: LF, 尾换行={had_trailing}）")


if __name__ == "__main__":
    main()
