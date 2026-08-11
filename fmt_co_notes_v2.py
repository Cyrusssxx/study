# -*- coding: utf-8 -*-
"""计组笔记去密集化 v2（PWA 版）：段内分号自动分行，保留 <b> 标签与表格结构。

规则：
  1. <p>/<li>/<td>/<th>/<ul>/<ol> 内的「；」替换为 <br> 分行
     - 若「；」后紧跟着已有 <br>，则保留「；」不替换（避免双换行）
     - 跳过 <table> 内部，避免破坏表格网格
  2. ① ② ③ ④ ⑤ ⑥ 序号：若前面紧跟分隔符且非范围引用（如 ①~③），则前插 <br> 单独分行
  3. 顺带清除残留的「考点追踪」（含年份）标签
"""
import io
import json
import re
from html.parser import HTMLParser

SRC = 'pwa/data/notes/co_notes.json'

SPLIT_ELEMENTS = {'p', 'li', 'td', 'th', 'ul', 'ol'}
NO_SPLIT = {'table', 'pre'}
INLINE_TAGS = {'b', 'i', 'em', 'strong', 'u', 'sub', 'sup', 'code', 'span', 'small', 'mark'}
NUMBERED = '①②③④⑤⑥'
SEP_CHARS = ('，', '：', '。', '、', '；', ',', ';', '）', '」', '』', '》')
RANGE_FOLLOW = ('~', '～', '-', '—', '到')
# 句末分隔符（分行）：分号、句号、叹号、问号
LINE_BREAK_AFTER = '；。！？'

def strip_kaodian_trace(html):
    html = re.sub(r'[（(]\s*考点追踪[:：][^)）]*[)）]', '', html)
    html = re.sub(r'考点追踪[:：][^）)，。；;\n]*', '', html)
    return html


class NoteFormatter(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=False)
        self.out = []
        self.stack = []
        self.inline_open = []
        self.no_split_depth = 0

    def is_inline(self, tag):
        return tag in INLINE_TAGS

    def starttag_html(self, tag, attrs):
        if not attrs:
            return '<%s>' % tag
        a = ''.join(' %s="%s"' % (k, v.replace('"', '&quot;')) for k, v in attrs if v is not None)
        return '<%s%s>' % (tag, a)

    def handle_starttag(self, tag, attrs):
        self.stack.append(tag)
        if tag in NO_SPLIT:
            self.no_split_depth += 1
        if self.is_inline(tag):
            self.inline_open.append(tag)
        self.out.append(self.starttag_html(tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.out.append(self.starttag_html(tag, attrs))

    def handle_endtag(self, tag):
        if tag in self.inline_open:
            for i in range(len(self.inline_open) - 1, -1, -1):
                if self.inline_open[i] == tag:
                    self.inline_open.pop(i)
                    break
        if tag in NO_SPLIT:
            self.no_split_depth -= 1
        if self.stack:
            self.stack.pop()
        self.out.append('</%s>' % tag)

    def handle_entityref(self, name):
        self.out.append('&%s;' % name)

    def handle_charref(self, name):
        self.out.append('&#%s;' % name)

    def handle_data(self, data):
        if self.no_split_depth == 0 and any(e in SPLIT_ELEMENTS for e in self.stack):
            data = self.split_text(data)
        self.out.append(data)

    def emit_br(self, buf):
        for t in reversed(self.inline_open):
            buf.append('</%s>' % t)
        buf.append('<br>')
        for t in self.inline_open:
            buf.append('<%s>' % t)

    def split_text(self, data):
        # ---- 1) 分号/句号/叹号/问号 → 分行（句末符保留在本行行尾） ----
        buf = []
        for i, ch in enumerate(data):
            if ch in LINE_BREAK_AFTER:
                buf.append(ch)
                nxt = data[i + 1] if i + 1 < len(data) else ''
                # 若「；」后紧跟着已有 <br>，保留「；」不额外换行，避免双换行
                if ch == '；' and nxt.lstrip().startswith('<br'):
                    continue
                self.emit_br(buf)
            else:
                buf.append(ch)
        text = ''.join(buf)

        # ---- 2) ① ② ③… 单独分行（非范围引用、前有分隔符） ----
        out = []
        for i, ch in enumerate(text):
            if ch in NUMBERED:
                nxt = text[i + 1] if i + 1 < len(text) else ''
                prev_nonws = ''
                for c in reversed(out):
                    if c not in (' ', '\n', '\t'):
                        prev_nonws = c
                        break
                is_range = nxt in RANGE_FOLLOW
                if prev_nonws in SEP_CHARS and not is_range:
                    self.emit_br(out)
                out.append(ch)
            else:
                out.append(ch)
        return ''.join(out)


def main():
    d = json.load(io.open(SRC, encoding='utf-8'))
    changed = 0
    for ch in d['chapters']:
        for s in ch['sections']:
            html = strip_kaodian_trace(s['html'])
            f = NoteFormatter()
            f.feed(html)
            f.close()
            new = ''.join(f.out)
            # 清理：去掉块级标签前/后的冗余 <br>
            new = re.sub(r'(?:<br>\s*){2,}', '<br>', new)
            new = re.sub(r'\s*<br\s*/?>\s*(</(?:p|li|td|th|ul|ol|h4|h5|table)>)', r'\1', new)
            new = re.sub(r'\s*<br\s*/?>\s*(<(?:p|ul|ol|h4|h5|table)(?:\s|>))', r'\1', new)
            new = re.sub(r'\n{2,}', '\n', new)
            if new != s['html']:
                s['html'] = new
                changed += 1
    json.dump(d, io.open(SRC, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    tags = sum(s['html'].count('考点追踪') for ch in d['chapters'] for s in ch['sections'])
    total = sum(len(s['html']) for ch in d['chapters'] for s in ch['sections'])
    print('changed sections:', changed)
    print('考点追踪 remaining:', tags)
    print('HTML total chars:', total)


if __name__ == '__main__':
    main()
