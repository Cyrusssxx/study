# -*- coding: utf-8 -*-
"""把栈帧图插入 co 4.3.4（★ 之前），并修正一处与 sub esp,24 矛盾的表述。

用法：
  python tools/ins_co_stack_frame.py --dry    # 只预演
  python tools/ins_co_stack_frame.py          # 写盘
"""
import io, json, re, sys

P = 'pwa/data/notes/co_notes.json'
SEC = '4.3.4'
IMG = 'co_fig_stack_frame.svg'
STAR = '<h4>★ 高频真题考点与陷阱</h4>'

TEXT_FIX = [
    # ① 「16 字节倍数 → 实际用 28 分配 32」与本节 sub esp,24 直接矛盾（24 不是 16 的倍数），
    #    且与 temp1/temp2/sum(12) + 实参(8) = 20 的实际用量不符。
    ('最后 <b>leave 等价于 mov esp,ebp + pop ebp</b>，再 ret。<br/>'
     'GCC 规定每个函数栈帧大小为 16 字节的倍数（实际用 28 字节 → 分配 32 字节，4 字节对齐填充）。',
     '最后 <b>leave 等价于 mov esp,ebp + pop ebp</b>，再 ret。<br/>'
     '本例 sub esp,24 只保证 4 字节对齐。现代 GCC 默认把栈帧按 <b>16 字节</b>对齐'
     '（sub esp 取值多为 16 的倍数，便于对齐存放 XMM 操作数），教材为简化取了 24。'),
    # ② 「入口参数右参数在较高地址」句子残缺。
    ('入口参数右参数在较高地址：将 temp2 放 [esp+4]、temp1 放 [esp]',
     '入口参数：右参数在较高地址——将 temp2 放 [esp+4]、temp1 放 [esp]（调用后即被调者的 [ebp+12] 与 [ebp+8]）'),
]


def dump(d, crlf):
    s = json.dumps(d, ensure_ascii=False, indent=1)
    if crlf:
        s = s.replace('\n', '\r\n')
    return s.encode('utf-8')


def main():
    dry = '--dry' in sys.argv
    raw = io.open(P, 'rb').read()
    crlf = b'\r\n' in raw
    d = json.loads(raw.decode('utf-8'))
    assert dump(d, crlf) == raw, '序列化不可逆，先查 json 格式'

    target = None
    for ch in d['chapters']:
        for s in ch.get('sections', []):
            for x in [s] + s.get('subsections', []):
                if (x.get('section') or '').startswith(SEC):
                    target = x
    assert target, '找不到 %s' % SEC
    h = target['html']
    print('目标:', target['section'], '| 原长', len(h))

    # ---- 文字修正：只替换不增删块，p / li 数必须不变 ----
    for a, b in TEXT_FIX:
        assert a in h, '待修文本未找到: %s' % a[:40]
        assert h.count(a) == 1, '待修文本不唯一: %s' % a[:40]
        h2 = h.replace(a, b)
        # 全角「；」个数必须不变（fmtNotes 按它拆行，多一个行号就 +1）
        assert h2.count('；') == h.count('；'), '；个数变了，行号会漂移'
        h = h2
    print('文字修正 2 处；「；」数', h.count('；'))

    # ---- 插图 ----
    assert IMG not in h, '图已存在（幂等）'
    assert h.count(STAR) == 1, '★ 锚点不唯一'
    nl = '\r\n' if '\r\n' in h else '\n'
    block = nl.join([
        '<p class="paragraph" data-fig="1"><b>图：caller 调 add 的运行栈 —— 实参放在 caller 栈帧的低地址端，'
        'add 用 ebp′+8 / ebp′+12 的正偏移取参</b></p>',
        '<p class="paragraph" data-fig="1"><img class="fig-img" src="img/%s" '
        'style="max-width:100%%;border:1px solid var(--border);border-radius:var(--radius);'
        'display:block;margin:8px auto;"/></p>' % IMG,
        ''])
    i = h.index(STAR)
    # 注入点前缀必须是标签结尾，不能落在 <p> 正文内部
    assert h[i - 1] in '>\r\n', '注入点前一个字符不是标签结尾: %r' % h[i - 20:i]
    assert h[:i].rstrip().endswith('</p>'), '★ 前不是 </p>'
    newh = h[:i] + block + h[i:]

    cp = lambda x: len(re.findall(r'<p(?! class="paragraph" data-fig)', x))
    assert cp(newh) == cp(h), '非 data-fig <p> 数变了'
    assert newh.count('<li>') == h.count('<li>'), 'li 数变了'
    assert newh.count('；') == h.count('；'), '；个数变了'
    assert newh.count(STAR) == 1
    target['html'] = newh

    out = dump(d, crlf)
    print('非 data-fig <p>', cp(newh), '| li', newh.count('<li>'), '| 图 src', IMG in newh)
    print('新长', len(newh))
    if dry:
        print('--- DRY，未写盘 ---')
        k = newh.index(IMG)
        print('注入点前后 120 字:\n', newh[max(0, k - 220):k + 60].replace('\r', ''))
        return
    io.open(P, 'wb').write(out)
    print('已写盘', len(raw), '->', len(out))


if __name__ == '__main__':
    main()
