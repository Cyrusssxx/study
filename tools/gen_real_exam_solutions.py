# -*- coding: utf-8 -*-
"""生成四科 408 统考真题(2016-2025)逐题逐选项精解 markdown。
数据取自 pwa/data/{cn,co,ds,os}.json，仅筛选题干含【YYYY统考真题】且年份∈[2016,2025] 的题。
输出 4 份独立 md，与计网题库知识点归纳.md(综合) 相互独立，不污染笔记。
"""
import json, re, html

SUBS = {"cn": "计网", "co": "计组", "ds": "数据结构", "os": "OS"}
YEAR_RE = re.compile(r"(20[01][0-9]|202[0-5])")
MARK_RE = re.compile(r"统考真题")
PREFIX_RE = re.compile(r"^【\s*\d{4}\s*年?统考真题】\s*")


def clean_cell(s):
    if not s:
        return ""
    s = html.unescape(s)
    s = re.sub(r"(?is)<img\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>", r"［图：\1］", s)
    s = re.sub(r"(?is)<br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</p>", "\n", s)
    s = re.sub(r"(?is)<p\b[^>]*>", "", s)
    s = re.sub(r"(?is)</?pre\b[^>]*>", "\n", s)
    # 表格转 markdown
    def table_to_md(m):
        tbl = m.group(0)
        rows = re.findall(r"(?is)<tr\b[^>]*>(.*?)</tr>", tbl, re.S)
        out = []
        for i, row in enumerate(rows):
            cells = re.findall(r"(?is)<t[hd]\b[^>]*>(.*?)</t[hd]>", row, re.S)
            cells = [re.sub(r"\s+", " ", clean_cell(c)).strip() for c in cells]
            out.append("| " + " | ".join(cells) + " |")
            if i == 0:
                out.append("| " + " | ".join(["---"] * len(cells)) + " |")
        return "\n" + "\n".join(out) + "\n"
    s = re.sub(r"(?is)<table\b[^>]*>.*?</table>", table_to_md, s, flags=re.S)
    # 保留 sub/sup（合法的 markdown 内联 HTML），其余标签剥离
    s = re.sub(r"(?is)<(?!sub>|/sub>|sup>|/sup>)[a-z/][^>]*>", "", s)
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&nbsp;", " ")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def fmt_question(q, s):
    n = q.get("number")
    ch = q.get("chapter", "")
    sec = q.get("section", "")
    loc = f"{ch} {sec}".strip()
    head = f"**Q{n}〔{loc}〕**"
    content = clean_cell(q.get("content") or "")
    content = PREFIX_RE.sub("", content).strip()
    lines = [head, "", f"- 题干：{content}", ""]
    # 选项
    blank_opts = q.get("blank_opts")
    if blank_opts:
        lines.append("- 多空题选项：")
        for bi, opts in enumerate(blank_opts, 1):
            lines.append(f"  - 第{bi}空：")
            if isinstance(opts, dict):
                for k in sorted(opts.keys()):
                    lines.append(f"    - {k}. {clean_cell(opts[k])}")
            elif isinstance(opts, list):
                for k, v in enumerate(opts, 1):
                    lines.append(f"    - {k}. {clean_cell(v)}")
        lines.append("")
    else:
        opts = q.get("options") or {}
        lines.append("- 选项：")
        for k in ["A", "B", "C", "D", "E", "F"]:
            if k in opts:
                lines.append(f"  - {k}. {clean_cell(opts[k])}")
        lines.append("")
    ans = q.get("answer")
    lines.append(f"- 答案：**{ans}**")
    lines.append("")
    exp = clean_cell(q.get("explanation") or "")
    lines.append(f"- 解析：{exp}")
    lines.append("")
    return "\n".join(lines)


def gen(sub, zh):
    data = json.load(open(f"pwa/data/{sub}.json", encoding="utf-8"))
    qs = data.get("questions", [])
    picked = []
    for q in qs:
        c = q.get("content") or ""
        if not MARK_RE.search(c):
            continue
        ym = YEAR_RE.search(c)
        if not ym:
            continue
        y = int(ym.group())
        if 2016 <= y <= 2025:
            picked.append((y, q.get("number", 0), q))
    picked.sort(key=lambda x: (-x[0], x[1]))
    from collections import OrderedDict
    by_year = OrderedDict()
    for y, n, q in picked:
        by_year.setdefault(y, []).append(q)
    total = len(picked)
    out = [f"# {zh}统考真题逐题逐选项精解（2016–2025，共 {total} 题）", "",
           "> 数据来源 `pwa/data/%s.json`。筛选：题干含【YYYY统考真题】标记且年份∈[2016,2025]。" % sub,
           "> 选项、答案、解析均取自题库原字段（HTML 已清理为可读文本，公式下标用 `<sub>`/`<sup>` 保留）。",
           "> 本文件为「逐题逐选项精解」参考资料，与 `计网题库知识点归纳.md`（知识点综合）相互独立，不互相包含。", ""]
    for y in sorted(by_year.keys(), reverse=True):
        qs_y = by_year[y]
        out.append(f"## {y} 年（{len(qs_y)} 题）")
        out.append("")
        for q in qs_y:
            out.append(fmt_question(q, sub))
        out.append("")
    fn = f"real_exam_{sub}.md"  # ASCII 文件名，避免 Windows Git 对中文未跟踪文件名枚举失败
    open(fn, "w", encoding="utf-8").write("\n".join(out).rstrip() + "\n")
    print(f"{zh}({sub}): {total} 题 -> {fn}")


if __name__ == "__main__":
    for s, zh in SUBS.items():
        gen(s, zh)
