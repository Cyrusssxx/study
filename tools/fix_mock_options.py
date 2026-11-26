"""补回模拟卷（一/三/五）丢失的选择题选项（2026-11-26）。

问题：early 建库脚本把选项挤进题干一行（mock3/mock5）或整题截图后清空 o 未补回（mock1），
导致 21 道选择题的 o 为空、页面选项框只剩 A/B/C/D 字母。

做法：从 8 套卷合订本 PDF 的文本层按题号精确抽取 `(A)…(B)…(C)…(D)`，
写回 o 字段，并删掉 q 里残留的挤行选项文字。只处理 o 为空的题，不动其它题。

来源：E:/Desktop/做题/408模拟/2027王道8套模拟卷(1).pdf
写入：pwa/data/zt/zt_mock{1,3,5}.json（indent=1 / LF / 无尾换行，与其它 zt json 一致）
"""
import json, os, re, fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = r'E:/Desktop/做题/408模拟/2027王道8套模拟卷(1).pdf'
# 卷号 -> (起始页0基, 结束页0基, 数据文件)
VOLS = {
    1: (3, 15, 'zt_mock1.json'),
    3: (26, 35, 'zt_mock3.json'),
    5: (46, 55, 'zt_mock5.json'),
}

doc = fitz.open(PDF)

def vol_text(v):
    a, b, _ = VOLS[v]
    return '\n'.join(doc[i].get_text() for i in range(a, b))

def clean(s):
    s = s.replace('\u00a0', ' ').strip()
    s = re.sub(r'\s+', ' ', s)
    return s

def extract_opts(v, n):
    """在卷文本里定位 `n. ` 题，抽其后紧邻的 (A)~(D)。"""
    txt = vol_text(v)
    # 题号行：`N. ` 开头（行首），避免匹配题内数字
    m = re.search(r'(?m)^%d\.\s' % n, txt)
    if not m:
        return None
    start = m.end()
    nxt = re.search(r'(?m)^%d\.\s' % (n + 1), txt[start:])
    seg = txt[start:start + nxt.start()] if nxt else txt[start:start + 2000]
    # 选项：(A) 独占一行，内容到下一个 (B)/(C)/(D) 或题末
    opts = []
    marks = list(re.finditer(r'\(([ABCD])\)', seg))
    if len(marks) < 4:
        return None
    # 只取前四个 A B C D 顺序标记
    marks = marks[:4]
    if [x.group(1) for x in marks] != ['A', 'B', 'C', 'D']:
        return None
    for i, mk in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(seg)
        val = clean(seg[mk.end():end])
        # 去掉题末页脚（2027 王道408 冲刺模拟试卷… / 第NN 页（共79 页））
        val = re.split(r'2027\s*王道408|第\s*\d+\s*页', val)[0].strip()
        if not val:
            return None
        opts.append(val)
    return opts

def strip_inline_opts(q, opts):
    """删掉题干里挤成一行的 `A.xxx B.xxxC.xxx D.xxx`。"""
    # 匹配以 A. 开头、含 B./C./D. 的末段文字（含 HTML 标签包裹）
    pat = re.compile(r'(?:<br\s*/?>)?\s*A\.\s*' + re.escape(opts[0]) +
                     r'.*?D\.\s*' + re.escape(opts[3]) + r'\s*(?:</p>)?', re.S)
    new, cnt = pat.subn('</p>' if '</p>' in q[pat.search(q).start():pat.search(q).end()] else '', q) if pat.search(q) else (q, 0)
    return new, cnt

for v, (_, _, fn) in VOLS.items():
    path = os.path.join(ROOT, 'pwa', 'data', 'zt', fn)
    d = json.load(open(path, encoding='utf-8'))
    fixed = []
    missed = []
    for it in d['items']:
        if it.get('t') != 1 or it.get('o'):
            continue
        n = it['i']
        opts = extract_opts(v, n)
        if not opts:
            missed.append(n)
            continue
        it['o'] = opts
        # 题干里挤行选项：删掉（只在确认包含时）
        q = it['q']
        flat = re.sub(r'<[^>]+>', '', q)
        if opts[0] in flat and opts[3] in flat and re.search(r'A\.', flat):
            # 用正则从 A. 第一次出现处删到 D.选项末
            pat = re.compile(r'(?:<br\s*/?>)?\s*A\.[\s\S]*?D\.\s*' + re.escape(opts[3]))
            q, _ = pat.subn('', q, count=1)
            it['q'] = q
        fixed.append(n)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print('%s: 补回 %d 题 %s；仍缺 %s' % (fn, len(fixed), fixed, missed))
doc.close()
