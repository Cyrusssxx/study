# -*- coding: utf-8 -*-
"""把三张排序过程图接进 ds_notes.json 的 8.2.1 / 8.4.1 / 8.5.1。

字节级精确替换：只对目标 section 的 html 字段做「旧 JSON 字面量 -> 新 JSON 字面量」
替换，其余字节（CRLF、缩进、字段顺序）完全不动；不碰 8.6.1 指标表。
"""
import json

P = r'D:/ai code/408-quiz/pwa/data/notes/ds_notes.json'
BAK = P + '.bak_20261121_sortfig'

with open(P, 'rb') as f:
    raw = f.read()
assert not raw.endswith(b'\n'), 'unexpected trailing newline'
assert b'\r\n' in raw, 'expected CRLF'

with open(BAK, 'wb') as f:
    f.write(raw)
print('backup ->', BAK)

FIG = ('<p class="paragraph" data-fig="1"><b>图：{cap}</b></p>\r\n'
       '<p class="paragraph" data-fig="1"><img class="fig-img" '
       'src="img/{src}" style="max-width:100%;border:1px solid var(--border);'
       'border-radius:var(--radius);display:block;margin:8px auto;"/></p>\r\n')

INSERTS = {
    '8.2.1 直接插入排序': ('直接插入排序 · i 与 j 的比较和移动（8 元素实例）',
                        'ds_fig_insert_sort.svg'),
    '8.4.1 简单选择排序': ('简单选择排序 · i / j / k 下标与比较移动次数（8 元素实例）',
                        'ds_fig_select_sort.svg'),
    '8.5.1 归并排序': ('二路归并 · 合并时 i / j 比较过程与次数（8 元素实例）',
                    'ds_fig_merge_compare.svg'),
}

data = json.loads(raw.decode('utf-8'))
ch = data['chapters'][7]
targets = {}
for s in ch['sections']:
    for s2 in s.get('subsections', []):
        sec = s2.get('section')
        if sec in INSERTS:
            targets[sec] = s2['html']
assert set(targets) == set(INSERTS), f'missing: {set(INSERTS) - set(targets)}'

result = raw
for sec, old_html in targets.items():
    cap, src = INSERTS[sec]
    assert src not in old_html, f'{src} already present in {sec}'
    anchor = '<h4>★ 高频真题考点与陷阱</h4>'
    assert anchor in old_html, f'anchor missing in {sec}'
    new_html = old_html.replace(anchor, FIG.format(cap=cap, src=src) + anchor, 1)

    old_lit = json.dumps(old_html, ensure_ascii=False).encode('utf-8')
    new_lit = json.dumps(new_html, ensure_ascii=False).encode('utf-8')
    n = result.count(old_lit)
    assert n == 1, f'{sec}: old html literal appears {n} times'
    result = result.replace(old_lit, new_lit, 1)
    print('inserted', src, '->', sec)

with open(P, 'wb') as f:
    f.write(result)
print('written', len(raw), '->', len(result), 'bytes')

d2 = json.loads(result.decode('utf-8'))
for s in d2['chapters'][7]['sections']:
    for s2 in s.get('subsections', []):
        if s2.get('section') in INSERTS:
            print('verify', s2['section'], 'imgs', s2['html'].count('<img'))
