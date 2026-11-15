# -*- coding: utf-8 -*-
"""把 2021-47 的 Web 访问时序图插入 cn 4.2.5（ARP）★ 之前。

用法：python tools/ins_cn_webvisit.py [--dry]
硬校验：
  1) 重新序列化结果必须与原始字节逐字节一致（除新增块），否则中止；
  2) 注入点前缀必须是标签结尾（不能落在 <p> 正文内部）；
  3) 行号零漂移：新增块只允许 data-fig="1" 的 <p>，行号器不计；
  4) 图片文件必须存在，且旧 html 里没有同名引用。
"""
import json, io, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
P = os.path.join(ROOT, 'pwa', 'data', 'notes', 'cn_notes.json')
SVG = os.path.join(ROOT, 'pwa', 'img', 'cn_fig_web_visit_seq.svg')
DRY = '--dry' in sys.argv

raw = io.open(P, 'rb').read()
crlf = b'\r\n' in raw
d = json.loads(raw.decode('utf-8'))

# 1) 序列化可逆性校验
def dump(obj):
    s = json.dumps(obj, ensure_ascii=False, indent=1)
    if crlf:
        s = s.replace('\n', '\r\n')
    return s.encode('utf-8')

if dump(d) != raw:
    print('!! 序列化不可逆，原始字节与重写结果不一致，中止')
    sys.exit(1)

if not os.path.exists(SVG):
    print('!! 缺图', SVG); sys.exit(1)

target = None
for ch in d['chapters']:
    for s in ch.get('sections', []):
        for ss in s.get('subsections', []):
            if ss.get('section', '').startswith('4.2.5'):
                target = ss
if target is None:
    print('!! 找不到 4.2.5'); sys.exit(1)

h = target['html']
if 'cn_fig_web_visit_seq' in h:
    print('!! 已经插入过，中止（幂等保护）'); sys.exit(1)

nl = '\r\n' if '\r\n' in h else '\n'
block = nl.join([
    '<p class="paragraph" data-fig="1"><b>图：2021-47 一次 Web 访问的 t0 → t1 —— 两个广播帧谁都能收到，S 顺手学到三条表项</b></p>',
    '<p class="paragraph" data-fig="1"><img class="fig-img" src="img/cn_fig_web_visit_seq.svg" style="max-width:100%;border:1px solid var(--border);border-radius:var(--radius);display:block;margin:8px auto;"/></p>',
    '',
])

anchor = '<h4>★ 高频真题考点与陷阱</h4>'
if h.count(anchor) != 1:
    print('!! ★ 锚点数量异常：', h.count(anchor)); sys.exit(1)
i = h.index(anchor)
if i > 0 and h[i - 1] not in '>\n\r':
    print('!! 锚点前缀不是标签结尾：', repr(h[max(0, i - 40):i])); sys.exit(1)

new_h = h[:i] + block + h[i:]

# 行号器只数 .notes-body li / p，且 data-fig="1" 的块整块排除；
# 新块两段都带 data-fig="1"，所以 <p> 计数增量应为 0（由 _test_cn_webvisit 复核）。
target['html'] = new_h

out = dump(d)
if not DRY:
    io.open(P, 'wb').write(out)
    print('written', len(raw), '->', len(out))
else:
    print('[dry] 将写入', len(raw), '->', len(out))
print('block bytes', len(block.encode('utf-8')))
