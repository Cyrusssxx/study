# -*- coding: utf-8 -*-
"""从解析册 OCR（a_v2.json）注入模拟卷（二）的答案与解析，并处理大题解析里的代码块。

a_v2.json 是 ocr_mock_vols.py 的输出：list of {p, lines:[{x0,y0,x1,y1,t,s}]}。
解析标记格式：`NN．X。【解析】…`，答案表在 p14 上半（已由解析标记行覆盖，逐行扫描更可靠）。
写入：pwa/data/zt/zt_mock2.json（indent=1 / LF / 无尾换行）。
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'archive', '_pdf_probe', 'a_v2.json')
OUT = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock2.json')


def load_text():
    d = json.load(open(SRC, encoding='utf-8'))
    out = []
    for p in d:
        lines = sorted(p['lines'], key=lambda z: (z['y0'], z['x0']))
        for l in lines:
            t = l['t'].strip()
            if not t:
                continue
            if t.startswith('全国硕士研究生入学统一考试') or t.startswith('计算机科学与技术学科联考'):
                continue
            if t.startswith('计算机专业基础综合考试模拟试卷'):
                continue
            if re.match(r'^第\s*\d+\s*页', t):
                continue
            out.append(t)
    return '\n'.join(out)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def ana_html(s):
    """解析正文 -> HTML：连续汇编/代码行合并为 pre，其余按行 p+br。"""
    def iscode(ln):
        return bool(re.search(
            r'^\s*(move|add|addi|sub|lw|sw|beq|bne|j|jal|jr|lui|ori|and|or|slt|sll|srl|li|la|call|push|pop|ret|cmp|mov|lea|inc|dec|xor|test|jmp|je|jne)\b|^\s*(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{4,8}\s+[0-9A-Fa-f]{4,8})|←|<-|//|/\*',
            ln, re.I))
    parts, buf, in_code = [], [], False
    for ln in s.split('\n'):
        ln = ln.strip()
        if not ln:
            continue
        code = iscode(ln)
        if code and not in_code:
            if buf:
                parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>'); buf = []
            in_code = True
        if not code and in_code:
            parts.append('<pre><code class="language-c">' + '\n'.join(esc(x) for x in buf) + '</code></pre>'); buf = []; in_code = False
        buf.append(ln)
    if in_code:
        parts.append('<pre><code class="language-c">' + '\n'.join(esc(x) for x in buf) + '</code></pre>')
    elif buf:
        parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>')
    return '\n'.join(parts)


def main():
    text = load_text()
    ms = list(re.finditer(r'(\d{1,2})\s*[.．]\s*(?:([A-D])\s*[。.．、]\s*)?【解析】', text))
    ans, ana = {}, {}
    for k, m in enumerate(ms):
        n = int(m.group(1))
        if not (1 <= n <= 47) or n in ana:
            continue
        end = ms[k + 1].start() if k + 1 < len(ms) else len(text)
        body = text[m.end():end].strip()
        body = re.sub(r'\n{2,}', '\n', body)
        if body:
            ana[n] = body
        if m.group(2) and n <= 40:
            ans[n] = m.group(2)
    print('答案 %d/40，解析 %d/47' % (len(ans), len(ana)))
    print('缺答案:', [n for n in range(1, 41) if n not in ans])
    print('缺解析:', [n for n in range(1, 48) if n not in ana])

    d = json.load(open(OUT, encoding='utf-8'))
    filled_a = filled_an = 0
    for it in d['items']:
        n = it['i']
        if n in ans:
            it['a'] = ans[n]; filled_a += 1
        if n in ana:
            it['an'] = '<div class="analysis-content">' + ana_html(ana[n]) + '</div>'; filled_an += 1
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print('写入答案 %d，解析 %d -> %s' % (filled_a, filled_an, OUT))


if __name__ == '__main__':
    main()
