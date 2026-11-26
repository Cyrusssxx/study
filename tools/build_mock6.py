# -*- coding: utf-8 -*-
"""从文本型合订本抽取模拟卷（六）47题的题干/选项/分数，建 zt_mock6.json 骨架。
答案解析待 OCR 完成后由 inject_mock6_ans.py 补入；图形题由 refig_mock6.py 处理。

来源：E:/Desktop/做题/408模拟/2027王道8套模拟卷(1).pdf  p55-63（0基）
格式：(A) 独占行、内容在随后行；选项内容可跨行。矩阵/B树/AOE/拓扑等图形题需人工重排。
写入：pwa/data/zt/zt_mock6.json（indent=1 / LF / 无尾换行，与其它 zt json 一致）
"""
import json, os, re, fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = r'E:/Desktop/做题/408模拟/2027王道8套模拟卷(1).pdf'
OUT = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock6.json')
PROBE = os.path.join(ROOT, 'archive', '_pdf_probe')
P0, P1 = 55, 64  # 卷六页范围（0基，含 P0 不含 P1）


def load_lines():
    doc = fitz.open(PDF)
    lines = []
    for i in range(P0, P1):
        for s in doc[i].get_text().split('\n'):
            t = s.strip()
            if not t:
                continue
            # 去页眉页脚
            if t.startswith('2027 王道408 冲刺模拟试卷') or re.match(r'^第\s*\d+\s*页', t):
                continue
            if t.startswith('====='):
                continue
            # 卷六文本层缺陷：题号前混入 \x00 导致不在行首，选项 (C)(D) 挤在上一行行尾。
            # 先把行内题号标记 `NN. ` 拆成独立行（点后须为空白或全角括号，排除 5.125ms 这类小数）
            t = re.sub(r'(?<!\d)(\d{1,2})[.．](?=\s|[（(])', r'\n\1. ', t)
            # 再把行内的 `(A)~(D)` 选项标记拆行
            t = re.sub(r'([^\n])\(([ABCD])\)', r'\1\n(\2)', t)
            for x in t.split('\n'):
                x = x.strip()
                if x:
                    lines.append(x)
    return lines


def split_questions(lines):
    """按行首 `N. ` 切题；大题形如 `41.（11 分）`。"""
    marks = []
    # 点后须为空白或全角括号，排除 `15.125ms` 这类小数被误当题号
    pat = re.compile(r'^(\d{1,2})[.．](?=\s|[（(])\s*(.*)$')
    expect = 1
    for idx, ln in enumerate(lines):
        m = pat.match(ln)
        if m and int(m.group(1)) == expect:
            marks.append((int(m.group(1)), idx, m.group(2)))
            expect += 1
            if expect > 47:
                break
    qs = []
    for k, (n, st, rest) in enumerate(marks):
        en = marks[k + 1][1] if k + 1 < len(marks) else len(lines)
        body = [rest] + lines[st + 1:en]
        qs.append((n, body))
    return qs


def parse(n, body):
    """识别分数、题干、四选项。"""
    score = 2 if n <= 40 else 0
    start = 0
    if n > 40 and body:
        m = re.match(r'[（(](\d+)\s*分[）)]\s*(.*)', body[0])
        if m:
            score = int(m.group(1))
            body[0] = m.group(2)
    # 找 (A)(B)(C)(D) 行位置
    marks = []
    for i, ln in enumerate(body):
        m = re.match(r'^\(([ABCD])\)\s*(.*)$', ln)
        if m:
            marks.append((m.group(1), i, m.group(2)))
    if len(marks) >= 4:
        picked, seen = [], set()
        for letter, i, tail in marks:
            if letter in seen:
                continue
            seen.add(letter)
            picked.append((letter, i, tail))
            if len(picked) == 4:
                break
        # 只接受 A B C D 顺序齐全
        if [p[0] for p in picked] == ['A', 'B', 'C', 'D']:
            stem = body[:picked[0][1]]
            opts = []
            for j, (_, i, tail) in enumerate(picked):
                end = picked[j + 1][1] if j < 3 else len(body)
                chunk = ([tail] if tail else []) + body[i + 1:end]
                opts.append(chunk)
            return {'i': n, 't': 1, 's': score, 'stem': stem, 'opts': opts}
    # 大题或无选项：整段作题干
    return {'i': n, 't': 1 if n <= 40 else 2, 's': score, 'stem': body, 'opts': []}


def sid_of(n):
    if n <= 11: return 'ds'
    if n <= 22: return 'co'
    if n <= 32: return 'os'
    if n <= 40: return 'cn'
    if n <= 42: return 'ds'
    if n <= 44: return 'co'
    if n <= 46: return 'os'
    return 'cn'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def stem_html(stem):
    """题干行 -> HTML：代码块用 pre，其余 p（保留换行 br）。"""
    parts, buf, in_code = [], [], False
    def iscode(ln):
        return bool(re.search(r'(?<![A-Za-z])(for|if|while|int|void|return|typedef|struct|#include)\b|[{};]|//|←|<-|lui\b|ori\b|lw\b', ln))
    for ln in stem:
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
    lines = load_lines()
    qs = split_questions(lines)
    print('切题数:', len(qs), '题号:', [q[0] for q in qs])
    items, dump = [], []
    for n, body in qs:
        q = parse(n, body)
        opts_html = ['<br/>'.join(esc(x) for x in o) for o in q['opts']]
        item = {
            'i': n, 't': q['t'], 's': q['s'], 'a': '',
            'sid': sid_of(n), 'q': stem_html(q['stem']),
            'o': opts_html, 'an': '', 'qid': None, 'kp': ''
        }
        items.append(item)
        dump.append({'i': n, 'stem': q['stem'], 'opts': q['opts'], 'score': q['s']})
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'y': '模拟六', 'n': len(items), 'items': items}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(PROBE, 'build_v6_qs.json'), 'w', encoding='utf-8') as f:
        json.dump(dump, f, ensure_ascii=False, indent=1)
    # 简报
    for it in items:
        if it['t'] == 1 and len(it['o']) != 4:
            print('  选择题%d 选项数=%d' % (it['i'], len(it['o'])))
    print('写出', OUT)


if __name__ == '__main__':
    main()
