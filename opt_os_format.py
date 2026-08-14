# -*- coding: utf-8 -*-
"""OS 笔记排版优化：把超长堆叠段落拆成 列表/要点 + 小标题。

仅作用于 <p class="paragraph"> 内部。
  1. ① ② ③ … 枚举 → <ol>（≥2 个、按序、前为分隔符）
  2. <strong>术语</strong>：…；<strong>… 并列要点 → <ul>（≥3 个）
  3. 超长段（纯文本 ≥150 字）且无可列表化结构 → 按句子切短段

切分时用「内联标签栈携带」方式：跨段时先闭合再重开，保证每段标签平衡。
"""
import io
import json
import re
import sys

CIRCLED = '①②③④⑤⑥⑦⑧⑨'
LIST_MIN_CIRCLE = 2
LIST_MIN_STRONG = 3
SPLIT_LEN = 150

INLINE_TAGS = {
    'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'code', 'span',
    'small', 'mark', 'a', 's', 'del', 'ins',
}
VOID_TAGS = {'br', 'img', 'hr', 'input', 'link', 'meta'}


def _scan_tag(html, i):
    """从 i 处（html[i]=='<') 扫描一个完整标签。若解析失败返回 None。
    线性扫描，绝不回溯，避免灾难性回溯。"""
    n = len(html)
    j = i + 1
    # 跳过前导空白
    while j < n and html[j] in ' \t\r\n':
        j += 1
    if j >= n:
        return None
    # 闭合标签 </name>：跳过 /
    if html[j] == '/':
        j += 1
        while j < n and html[j] in ' \t\r\n':
            j += 1
    if j >= n:
        return None
    # 标签名（HTML 标签名必须以字母开头，数字开头的如 "10<12" 按文本处理）
    k = j
    while k < n and (html[k].isalnum() or html[k] == '-'):
        k += 1
    if k == j or not html[j].isalpha():
        return None  # 非标签
    tag = html[j:k]
    # 扫描属性直到 >（注意引号）
    m = k
    while m < n:
        c = html[m]
        if c == '>':
            return (i, m + 1, tag, html[i:m + 1])  # start, end_excl(不含), name, raw
        if c == '"':
            q = m + 1
            while q < n and html[q] != '"':
                q += 1
            m = q + 1
            continue
        if c == "'":
            q = m + 1
            while q < n and html[q] != "'":
                q += 1
            m = q + 1
            continue
        m += 1
    return None  # 未闭合标签，按文本处理


def tokenize(html):
    """token: (kind, name, raw)  kind in start/end/void/text
    start/end: name=标签名 raw=完整标签串；text: name='' raw=文本；void: name='' raw=标签串
    纯线性扫描，无正则回溯，内存安全。"""
    tokens = []
    i = 0
    n = len(html)
    while i < n:
        if html[i] == '<':
            hit = _scan_tag(html, i)
            if hit is not None:
                _, end_excl, tag, raw = hit
                ltag = tag.lower()
                if raw.startswith('</'):
                    tokens.append(('end', ltag, raw))
                elif raw.rstrip().endswith('/>') or ltag in VOID_TAGS:
                    tokens.append(('void', '', raw))
                else:
                    tokens.append(('start', ltag, raw))
                i = end_excl
                continue
            # 不是标签，当作文本的 '<'，推进一格
            tokens.append(('text', '', '<'))
            i += 1
            continue
        # 找下一个 '<'
        j = html.find('<', i)
        if j == -1:
            tokens.append(('text', '', html[i:]))
            break
        tokens.append(('text', '', html[i:j]))
        i = j
    return tokens


def render(tokens):
    return ''.join(raw for _, _, raw in tokens)


def plain_text(tokens):
    return ''.join(raw for kind, _, raw in tokens if kind == 'text')


def scan_prev_char(tokens, ti, co):
    for i in range(ti, -1, -1):
        kind, name, raw = tokens[i]
        if kind == 'text':
            if i == ti:
                if co > 0:
                    return raw[co - 1]
            else:
                if raw:
                    return raw[-1]
    return None


def find_char_bounds(tokens, chars):
    bounds = []
    for idx, (kind, name, raw) in enumerate(tokens):
        if kind == 'text':
            for ci, ch in enumerate(raw):
                if ch in chars:
                    bounds.append((idx, ci))
    return bounds


def is_circled_enumerated(tokens, bounds):
    if len(bounds) < LIST_MIN_CIRCLE:
        return False
    prevs = [scan_prev_char(tokens, ti, co) for (ti, co) in bounds]
    ok = all(p is None or p in '；。：，、.，;，）(（\u201d」』》。； ' for p in prevs)
    if not ok:
        return False
    nonstart = [p for p in prevs if p is not None]
    if len(nonstart) < LIST_MIN_CIRCLE - 1:
        return False
    return True


def split_at_bounds(tokens, boundaries, after_char=False):
    """boundaries: iterable of (ti, ci)。
    after_char=False: ci 为新段起点（字符本身进入新段）。
    after_char=True: ci 处字符（标点）留在上一段，切分在其后发生。"""
    inline_stack = []
    seg_buf = []
    segments = []

    def flush():
        seg_buf.extend('</%s>' % t for t in reversed(inline_stack))
        segments.append(''.join(seg_buf))
        seg_buf.clear()
        seg_buf.extend('<%s>' % t for t in inline_stack)

    for idx, (kind, name, raw) in enumerate(tokens):
        if kind == 'text':
            pos = 0
            while pos < len(raw):
                if after_char:
                    seg_buf.append(raw[pos])
                    if (idx, pos) in boundaries:
                        flush()
                else:
                    if (idx, pos) in boundaries:
                        flush()
                    seg_buf.append(raw[pos])
                pos += 1
        else:
            if kind == 'start':
                inline_stack.append(name)
            elif kind == 'end':
                if inline_stack and inline_stack[-1] == name:
                    inline_stack.pop()
            seg_buf.append(raw)
    seg_buf.extend('</%s>' % t for t in reversed(inline_stack))
    segments.append(''.join(seg_buf))
    # 去掉首段开头可能残留的空串
    while segments and not segments[0].strip():
        segments.pop(0)
    return segments


def strip_empty_inline(html):
    """清除空的内联标签，如 <strong></strong>（可嵌套/相邻，重复直至稳定）。"""
    prev = None
    while prev != html:
        prev = html
        html = re.sub(r'<(strong|b|em|i|u|span|sub|sup|code|small|mark|a|s|del|ins)></\1>', '', html)
    return html


def strip_leading_circle(item):
    """去掉 li 开头的圈号（允许其前有内联标签，如 <strong>①xxx）。"""
    m = re.match(r'(?:<[^>]+>)*([①-⑨])', item)
    if m:
        return item[:m.start(1)] + item[m.end(1):]
    return item


def build_ol_from_circles(tokens, bounds):
    boundary = bounds
    segments = split_at_bounds(tokens, boundary)
    lead = segments[0].strip() if segments else ''
    items = [seg.strip() for seg in segments[1:]]
    # 去掉 li 开头的圈数字号（ol 自带编号，避免重复）
    clean = []
    for it in items:
        it = strip_leading_circle(it)
        it = re.sub(r'[；。！？]+\s*$', '', it)
        clean.append(it)
    ol = '<ol>' + ''.join('<li>%s</li>' % it for it in clean) + '</ol>'
    parts = []
    if lead.strip():
        parts.append('<p class="paragraph">%s</p>' % strip_empty_inline(lead.strip()))
    parts.append(ol)
    return parts


def build_ul_from_strongs(inner, strongs):
    cuts = [s for (s, _) in strongs]
    segs = []
    prev = 0
    for c in cuts:
        segs.append(inner[prev:c])
        prev = c
    segs.append(inner[prev:])
    lead = segs[0].strip()
    items = [s.strip() for s in segs[1:]]
    ul = '<ul>' + ''.join('<li>%s</li>' % it for it in items) + '</ul>'
    parts = []
    if lead:
        parts.append('<p class="paragraph">%s</p>' % lead)
    parts.append(ul)
    return parts


def _balanced_split_html(html):
    """对单个仍过长(>=SPLIT_LEN)的段落切分。
    优先按 clause 标点（，、；：）在中点平衡切分；若无任何 clause 标点（整段是单句/长串），
    则在中点附近的「文字字符」处硬切（可能句中断开），保证每段 <= SPLIT_LEN。"""
    toks = tokenize(html)
    if len(plain_text(toks)) <= SPLIT_LEN:
        return [html]
    total = len(plain_text(toks))
    mid = total / 2
    # 收集：clause 标点位置 与 全部文字字符位置（仅在 text token 内，避免切断标签）
    clause_bounds = []
    char_positions = []   # (text_offset, idx, ci)
    text_off = 0
    for idx, (kind, name, raw) in enumerate(toks):
        if kind == 'text':
            for ci, ch in enumerate(raw):
                char_positions.append((text_off + ci, idx, ci))
                if ch in '，、；：':
                    clause_bounds.append((text_off + ci, idx, ci))
            text_off += len(raw)
    # 选切点：优先 clause 标点里离中点最近的；否则用任意文字字符里离中点最近的（句中硬切）
    if clause_bounds:
        best = min(clause_bounds, key=lambda b: abs(b[0] - mid))
    elif char_positions:
        best = min(char_positions, key=lambda b: abs(b[0] - mid))
    else:
        return [html]  # 全是标签，无法切
    boundary = (best[1], best[2])
    parts = split_at_bounds(toks, {boundary}, after_char=True)
    res = []
    for p in parts:
        p = p.strip()
        if p:
            res.extend(_balanced_split_html(p))
    return res


def split_long(tokens):
    # 1) 主切分：句末标点 。；！？（标点留上段）
    boundaries = set()
    for idx, (kind, name, raw) in enumerate(tokens):
        if kind == 'text':
            for ci, ch in enumerate(raw):
                if ch in '。；！？':
                    boundaries.add((idx, ci))
    if boundaries:
        segments = split_at_bounds(tokens, boundaries, after_char=True)
    else:
        segments = [render(tokens)]
    # 2) 对仍过长(>=SPLIT_LEN)的段，按 clause 标点平衡切分（解决"一长串句子"）
    parts = []
    for seg in segments:
        parts.extend(_balanced_split_html(seg))
    return ['<p class="paragraph">%s</p>' % p for p in parts if p.strip()]


def process_paragraph(inner):
    tokens = tokenize(inner)
    cb = find_char_bounds(tokens, CIRCLED)
    if cb and is_circled_enumerated(tokens, cb):
        return build_ol_from_circles(tokens, cb)

    strongs = list(re.finditer(r'<(?:strong|b)>([^<]+)</(?:strong|b)>', inner))
    if len(strongs) >= LIST_MIN_STRONG:
        def after_mark(it):
            return inner[it.end():][:1] in '：，,，、；'
        marks = [after_mark(m) for m in strongs]
        if sum(marks) >= LIST_MIN_STRONG - 1:
            # 要点开头：strong 前为分隔符或段首，防止把句中强调词误拆成列表
            def item_start(it):
                i = it.start() - 1
                while i >= 0 and inner[i].isspace():
                    i -= 1
                return i < 0 or inner[i] in '；。：，、,;（'
            starts = [item_start(m) for m in strongs]
            if all(starts):
                strong_pos = [m.start() for m in strongs]
                return build_ul_from_strongs(inner, [(p, '') for p in strong_pos])

    if len(plain_text(tokens)) >= SPLIT_LEN:
        return split_long(tokens)
    return ['<p class="paragraph">%s</p>' % inner]


def transform_section_html(html):
    out = []
    pos = 0
    # 兼容 <p> 与 <p class="paragraph"> 两种段落标签
    p_open = re.compile(r'<p( class="paragraph")?>')
    i = 0
    n = len(html)
    while True:
        mm = p_open.search(html, i)
        if not mm:
            out.append(html[pos:])
            break
        idx = mm.start()
        out.append(html[pos:idx])
        inner_start = mm.end()
        end_idx = html.find('</p>', inner_start)
        if end_idx == -1:
            out.append(html[idx:])
            break
        inner = html[inner_start:end_idx]
        out.extend(process_paragraph(inner))
        pos = end_idx + len('</p>')
        i = end_idx + len('</p>')
    return strip_empty_inline(''.join(out))


def main(path):
    d = json.load(io.open(path, encoding='utf-8'))
    sec_changed = 0
    for ch in d['chapters']:
        for s in ch['sections']:
            new = transform_section_html(s['html'])
            if new != s['html']:
                s['html'] = new
                sec_changed += 1
    json.dump(d, io.open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%s -> sections changed: %d' % (path, sec_changed))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)