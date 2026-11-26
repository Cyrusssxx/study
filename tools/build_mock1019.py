# -*- coding: utf-8 -*-
"""从「王道408全真模考1019」两份转排 PDF 文本构建 zt_mock1019.json。

输入：archive/_pdf_probe/{q,a}1019.txt（tools/dump_mock1019.py 导出）
输出：pwa/data/zt/zt_mock1019.json（结构同 zt_mock3.json）
写盘：indent=1 / LF / 无尾换行。

两册都是文本型 PDF（无嵌入图片），题目按「第N 题」切分；
特殊排版（代码块 / 表格 / 树）在 tools/refig_mock1019.py 里逐题覆盖。
"""
import os, re, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE = os.path.join(ROOT, 'archive', '_pdf_probe')
DST = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock1019.json')

HEAD_Q = ('王道408 全真模考·1019', '共47 题/ 150 分')
HEAD_A = ('王道408 全真模考·1019', '参考答案与解析')


def read_lines(tag):
    with open(os.path.join(PROBE, tag + '1019.txt'), encoding='utf-8') as f:
        return f.read().splitlines()


def clean_lines(lines, heads, page_re):
    out = []
    for s in lines:
        t = s.strip()
        if not t:
            continue
        if t in heads or page_re.match(t) or t.startswith('===== PAGE'):
            continue
        out.append(t)
    return out


def split_questions(lines):
    """返回 {n: [line,...]}；第44 题作答 这样的页标题并入上一题后丢弃。"""
    qs, cur = {}, None
    for s in lines:
        m = re.match(r'^第\s*(\d+)\s*题\s*(作答)?$', s)
        if m:
            n = int(m.group(1))
            if m.group(2):
                continue       # 「第44 题作答」整页是空白作答区，跳过
            cur = n
            qs[cur] = []
        elif cur is not None:
            qs[cur].append(s)
    return qs


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def is_code(ln):
    return bool(re.search(r'(?<![A-Za-z])(for|if|else|while|int|void|return|typedef|struct|semaphore|while)\b|[{};]', ln))


def stem_to_html(lines, skip_head=()):
    """按行分段；连续代码行合并成 pre，其余 p（用 <br/> 保留换行）。"""
    parts, buf, in_code = [], [], False
    for raw in lines:
        ln = raw.strip()
        if not ln or ln in skip_head or ln == '作答区':
            continue
        code = is_code(ln)
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


def score_of(n, lines):
    m = re.search(r'^（(\d+)\s*分）$', lines[0]) if lines else None
    return int(m.group(1)) if m else (2 if n <= 40 else 0)


def sid_of(n):
    if n <= 11: return 'ds'
    if n <= 22: return 'co'
    if n <= 32: return 'os'
    if n <= 40: return 'cn'
    if n <= 42: return 'ds'
    if n <= 44: return 'co'
    if n <= 46: return 'os'
    return 'cn'


def main():
    qraw = clean_lines(read_lines('q'), HEAD_Q, re.compile(r'^\d+\s*/\s*19$'))
    araw = clean_lines(read_lines('a'), HEAD_A, re.compile(r'^\d+\s*/\s*12$'))
    Q = split_questions(qraw)
    A = split_questions(araw)
    print('题册切出', len(Q), '题；解析册切出', len(A), '题')
    missing = [n for n in range(1, 48) if n not in Q or n not in A]
    print('缺题:', missing)

    ans, ana = {}, {}
    for n, ls in A.items():
        if n <= 40:
            for k, s in enumerate(ls):
                m = re.match(r'^参考答案：\s*([A-D])$', s)
                if m:
                    ans[n] = m.group(1)
                    body = ls[k + 1:]
                    break
            else:
                body = ls
        else:
            body = ls
        ana[n] = '<div class="analysis-content">' + stem_to_html(body) + '</div>'

    items = []
    for n in range(1, 48):
        ls = Q.get(n, [])
        sc = score_of(n, ls)
        if n <= 40:
            # 题干截止到第一个选项行
            cut = next((k for k, s in enumerate(ls) if re.match(r'^[A-D][.．、]', s)), len(ls))
            stem = ls[:cut]
            opts, labels = [], []
            for s in ls[cut:]:
                m = re.match(r'^([A-D])[.．、]\s*(.*)$', s)
                if m:
                    labels.append(m.group(1)); opts.append(m.group(2))
                elif opts:
                    opts[-1] += '<br/>' + esc(s)
            if labels != list('ABCD')[:len(labels)]:
                print('  !! 题%d 选项标签异常 %s' % (n, labels))
            q = stem_to_html(stem)
            o = opts
        else:
            # 大题：去掉「（N 分）」和学科名行（保留分数在题干开头）
            body = [s for s in ls if s not in ('数据结构', '计算机组成原理', '操作系统', '计算机网络')]
            q = stem_to_html(body)
            o = []
        items.append({
            'i': n, 't': 1 if n <= 40 else 2, 's': sc, 'a': ans.get(n, ''),
            'sid': sid_of(n), 'q': q, 'o': o,
            'an': ana.get(n, ''), 'qid': None, 'kp': ''
        })

    with open(DST, 'w', encoding='utf-8', newline='') as f:
        json.dump({'y': '模考1019', 'n': 47, 'items': items}, f, ensure_ascii=False, indent=1)
    b = open(DST, 'rb').read()
    print('写出', DST, '答案缺失', [n for n in range(1, 41) if not ans.get(n)],
          'tail=%r CRLF=%d' % (b[-12:], b.count(b'\r\n')))
    # 调试 dump：每题题干/选项原文，便于逐题核对特殊排版
    with open(os.path.join(PROBE, 'build_1019_qs.json'), 'w', encoding='utf-8') as f:
        json.dump({'q': Q, 'a': A}, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
