# -*- coding: utf-8 -*-
"""计组笔记排版处理（临时脚本）：
1. 删除全部「（考点追踪 ...）」标签（含嵌套括号）
2. <p> 内分号拆行：分号后内容 >= 12 字时拆为独立段落
3. <li> 内序号 ①②③ 前分行（<br>），不破坏列表结构
输出每文件统计 + 改动预览
"""
import re, io

def remove_kc(txt):
    """删除考点追踪标签（先嵌套后普通）"""
    n1 = len(re.findall(r'（考点追踪', txt))
    txt = re.sub(r'（考点追踪[^（）]*（[^（）]*）[^（）]*）', '', txt)  # 嵌套括号
    txt = re.sub(r'（考点追踪[^（）]*）', '', txt)
    # 清理残留标点与空段落
    txt = re.sub(r'<p>(\s|：|,|，)*</p>', '', txt)
    txt = txt.replace('<p>：', '<p>').replace('<p>,', '<p>').replace('<p>，', '<p>')
    return txt, n1

def split_p(txt):
    """<p> 内分号拆行：分号后内容 >= 12 字拆为新 <p>"""
    def rep(m):
        content = m.group(1)
        segs = content.split('；')
        if len(segs) < 2:
            return m.group(0)
        out = [segs[0]]
        for s in segs[1:]:
            if len(s.strip()) >= 12:
                out.append('</p><p>' + s)
            else:
                out[-1] += '；' + s
        return '<p>' + ''.join(out) + '</p>'
    txt, cnt = re.subn(r'<p>(.*?)</p>', rep, txt, flags=re.S)
    return txt, cnt

def br_li(txt):
    """<li> 内 ①②③ 序号前分行"""
    def rep(m):
        content = m.group(1)
        c2 = re.sub(r'；([①②③④⑤⑥⑦⑧⑨⑩])', r'；<br>\1', content)
        return '<li>' + c2 + '</li>'
    txt, cnt = re.subn(r'<li>(.*?)</li>', rep, txt, flags=re.S)
    return txt, cnt

total = {'kc': 0, 'p': 0, 'li': 0}
for ch in range(1, 8):
    path = '_co_build/ch%d.py' % ch
    txt = io.open(path, encoding='utf-8').read()
    orig = txt
    txt, n_kc = remove_kc(txt)
    txt, n_p = split_p(txt)
    txt, n_li = br_li(txt)
    if txt != orig:
        io.open(path, 'w', encoding='utf-8', newline='').write(txt)
    total['kc'] += n_kc; total['p'] += n_p; total['li'] += n_li
    print('ch%d: 考点追踪删除 %d，p内分号拆行 %d，li内序号分行 %d' % (ch, n_kc, n_p, n_li))
print('TOTAL:', total)
# 残留检查
for ch in range(1, 8):
    txt = io.open('_co_build/ch%d.py' % ch, encoding='utf-8').read()
    left = re.findall(r'考点追踪', txt)
    if left:
        print('ch%d 残留考点追踪 %d 处!' % (ch, len(left)))
print('done')
