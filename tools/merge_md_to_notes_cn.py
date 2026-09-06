# -*- coding: utf-8 -*-
"""把《计网题库知识点归纳.md》的条目按 题号→小节 投递进线上《计算机网络 · 考点笔记》(cn_notes.json)。
用法:
  python tools/merge_md_to_notes_cn.py --dry   # 只报告分布,不改文件
  python tools/merge_md_to_notes_cn.py         # 实际写入
幂等:重复运行会先移除旧的「📌 题库考点补充」块再重新注入。
"""
import json, re, sys

MD = "计网题库知识点归纳.md"
NOTES = "pwa/data/notes/cn_notes.json"
QJSON = "pwa/data/cn.json"
MARK = "📌 题库考点补充"
ALLOWED = ("sub", "sup", "br", "b", "code")

dry = "--dry" in sys.argv


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


def main():
    qsub = {}
    for q in json.load(open(QJSON, encoding="utf-8"))["questions"]:
        qsub[q["number"]] = (q.get("subsection") or "").strip()

    bullets, cur = [], None
    for ln in open(MD, encoding="utf-8").read().splitlines():
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

    # 投递:第一条被引题号所在的小节
    dist = {}  # subsection -> [bullet]
    orphan = []
    for b in bullets:
        sub = None
        for n in cited_qs(b["text"] + " " + " ".join(b["subs"])):
            if n in qsub and qsub[n]:
                sub = qsub[n]
                break
        if sub:
            dist.setdefault(sub, []).append(b)
        else:
            orphan.append(b["text"][:40])

    print(f"md 顶层条目={len(bullets)} | 可投递={sum(len(v) for v in dist.values())} 条 -> {len(dist)} 个小节 | 无题号引用={len(orphan)}")
    if orphan:
        print("  无引用示例:", " | ".join(orphan[:3]))

    # 读写笔记
    raw = open(NOTES, "rb").read()
    crlf = b"\r\n" in raw
    d = json.loads(raw.decode("utf-8"))
    changed = 0
    for ch in d["chapters"]:
        for sec in ch["sections"]:
            for ss in sec.get("subsections", []):
                name = ss["section"].strip()
                items = dist.get(name)
                if not items:
                    continue
                lis = []
                for it in items:
                    li = "<li>" + to_html(it["text"])
                    if it["subs"]:
                        li += "<ul>" + "".join("<li>" + to_html(s) + "</li>" for s in it["subs"]) + "</ul>"
                    li += "</li>"
                    lis.append(li)
                block = f"<h4>{MARK}</h4><ul>" + "".join(lis) + "</ul>"
                h = ss.get("html") or ""
                # 幂等:去掉旧块
                h = re.sub(r"<h4>%s</h4><ul>[\s\S]*?</ul>\s*$" % re.escape(MARK), "", h).rstrip()
                ss["html"] = (h + "\n" + block).strip() if h else block
                changed += 1

    print(f"将被注入的小节数={changed} | 笔记小节总数={sum(len(s.get('subsections', [])) for c in d['chapters'] for s in c['sections'])}")
    top = sorted(dist.items(), key=lambda x: -len(x[1]))[:8]
    print("条目最多的小节 Top8:")
    for name, its in top:
        print(f"  {name}: {len(its)} 条")

    if dry:
        print("\n[dry-run] 未写入文件")
        return

    out = json.dumps(d, ensure_ascii=False, indent=2) + "\n"
    if crlf:
        out = out.replace("\n", "\r\n")
    open(NOTES, "w", encoding="utf-8", newline="").write(out)
    print(f"\n[写入完成] {NOTES}")


if __name__ == "__main__":
    main()
