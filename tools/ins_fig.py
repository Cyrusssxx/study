# -*- coding: utf-8 -*-
"""通用「把一张 data-fig 图块插到某小节 ★ 之前」脚本。

用法：
  python tools/ins_fig.py --subject ds --sec 6.4.2 \
      --img ds_fig_dijkstra_table.svg \
      --caption "图：Dijkstra 逐轮 dist 表 —— n−1 轮，每轮定一个顶点、只松它一圈" [--dry]

设计约束（都是踩过的坑）：
  · 图块必须是紧邻的两段 <p class="paragraph" data-fig="1">：图题 + img，
    整块不计入行号，否则已存行级批注会错位。
  · 注入点前缀必须是标签结尾（'</p>' / '</div>' / '</table>' / '>' / 换行），
    绝不能落在 <p> 正文内部，否则浏览器提前闭段，行号会少算。
  · 序列化必须与原文件字节级可逆（各科 JSON 的 indent / 行尾 / 尾换行不一致）。
  · 幂等：图已存在则直接退出。
  · 非 data-fig 的 <p> 数、<li> 数、全角「；」数都必须不变。
"""
import io, json, re, sys, argparse

FILES = {
    'co': 'pwa/data/notes/co_notes.json',
    'os': 'pwa/data/notes/os_notes.json',
    'cn': 'pwa/data/notes/cn_notes.json',
    'ds': 'pwa/data/notes/ds_notes.json',
}
STAR = '<h4>★ 高频真题考点与陷阱</h4>'


def dump(d, crlf):
    s = json.dumps(d, ensure_ascii=False, indent=1)
    if crlf:
        s = s.replace('\n', '\r\n')
    return s.encode('utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--subject', required=True, choices=list(FILES))
    ap.add_argument('--sec', required=True)
    ap.add_argument('--img', required=True)
    ap.add_argument('--caption', required=True)
    ap.add_argument('--anchor', default='star', choices=['star', 'last', 'after'],
                    help='star=插到 ★ 之前（默认）；last=追加到末尾；after=插到 --after-text 之后')
    ap.add_argument('--after-text', default='',
                    help='仅 anchor=after 用：在该子串之后插入（子串必须唯一，且以标签结尾）')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    P = FILES[a.subject]
    raw = io.open(P, 'rb').read()
    crlf = b'\r\n' in raw
    d = json.loads(raw.decode('utf-8'))
    assert dump(d, crlf) == raw, '序列化不可逆，先查该文件 json 格式'

    target = None
    for ch in d['chapters']:
        for s in ch.get('sections', []):
            for x in [s] + s.get('subsections', []):
                if (x.get('section') or '').split(' ')[0] == a.sec:
                    target = x
    assert target, '找不到小节 %s' % a.sec
    h = target['html'] or ''
    print('目标: %s %s | 原长 %d' % (a.subject, target['section'], len(h)))

    if a.img in h:
        print('图已存在（幂等），退出')
        return

    nl = '\r\n' if '\r\n' in h else '\n'
    block = nl.join([
        '<p class="paragraph" data-fig="1"><b>%s</b></p>' % a.caption,
        '<p class="paragraph" data-fig="1"><img class="fig-img" src="img/%s" '
        'style="max-width:100%%;border:1px solid var(--border);border-radius:var(--radius);'
        'display:block;margin:8px auto;"/></p>' % a.img,
        ''])

    if a.anchor == 'star':
        assert h.count(STAR) == 1, '★ 锚点不唯一或缺失'
        i = h.index(STAR)
        assert h[i - 1] in '>\r\n', '★ 前一个字符不是标签结尾: %r' % h[max(0, i - 20):i]
        assert h[:i].rstrip().endswith(('</p>', '</div>', '</table>', '</ul>')), \
            '★ 前不是块级结束标签: %r' % h[:i].rstrip()[-30:]
        newh = h[:i] + block + h[i:]
    elif a.anchor == 'last':
        assert h.rstrip().endswith(('</p>', '</div>', '</table>', '</ul>')), '末尾不是块级结束标签'
        # 注意：末尾是 </p> 也可能仍处在未闭合的 <ul><li> 里（CN 6.5.2、CN 2.2.1、CO 5.3.2 都踩过），
        # 那种情况必须改用具名锚点（--anchor after），否则图块会被收进 <li>。
        assert '<li' not in h[h.rindex('</uls>' if '</uls>' in h else '</ul>') + 4:], \
            '末尾区块疑似仍在未闭合的 <ul> 内，请改用 --anchor after 指定安全锚点'
        t = h.rstrip()
        newh = t + nl + block + h[len(t):]
    else:
        assert a.after_text, 'anchor=after 必须给 --after-text'
        assert h.count(a.after_text) == 1, '--after-text 不唯一或缺失'
        j = h.index(a.after_text) + len(a.after_text)
        assert h[j:j + 2] in ('', nl[:2]) or h[j] in '>\r\n', '锚点后不是换行/标签边界'
        newh = h[:j] + nl + block + h[j:]

    cp = lambda x: len(re.findall(r'<p(?! class="paragraph" data-fig)', x))
    assert cp(newh) == cp(h), '非 data-fig <p> 数变了 %d -> %d' % (cp(h), cp(newh))
    assert newh.count('<li>') == h.count('<li>'), '<li> 数变了'
    assert newh.count('；') == h.count('；'), '「；」数变了（行号会漂移）'
    assert newh.count(STAR) == h.count(STAR)
    target['html'] = newh
    print('非 data-fig <p> %d | li %d | 「；」 %d | 新长 %d' % (cp(newh), newh.count('<li>'),
                                                       newh.count('；'), len(newh)))

    out = dump(d, crlf)
    if a.dry:
        k = newh.index(a.img)
        print('--- DRY ---\n' + newh[max(0, k - 200):k + 40].replace('\r', ''))
        return
    io.open(P, 'wb').write(out)
    print('已写盘 %d -> %d' % (len(raw), len(out)))


if __name__ == '__main__':
    main()
