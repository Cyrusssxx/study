# -*- coding: utf-8 -*-
"""一次性脚本：co 笔记按内嵌 h5 小节标题拆三级(章→节→小节)。
co 结构规整: h4=节标题副本, h5=x.y.z 小节标题, 其余为内容。
首个 h5 前的导语归节尾；h4 节标题副本丢弃（渲染层已有 .notes-sec-title）。
ds/cn 无 h5 编号结构，本轮不拆。
"""
import json, re

SRC = 'pwa/data/notes/co_notes.json'
notes = json.load(open(SRC, encoding='utf-8'))

def split_co(html):
    html = re.sub(r'^<h4>[^<]*</h4>', '', html.strip())   # 去掉节标题副本
    parts = re.split(r'(<h5>[^<]+</h5>)', html)
    subs = []
    pre = parts[0] or ''
    i = 1
    while i < len(parts):
        m = re.match(r'<h5>([^<]+)</h5>', parts[i])
        title = m.group(1).strip()
        content = parts[i + 1] if i + 1 < len(parts) else ''
        subs.append({'section': title, 'html': content})
        i += 2
    tail = pre   # 首个 h5 前的内容（导语）归节尾
    return subs, tail

changed = 0
for ch in notes['chapters']:
    new_secs = []
    for s in ch['sections']:
        if 'subsections' in s:
            new_secs.append(s); continue
        if '<h5>' not in s['html']:
            new_secs.append(s); continue
        subs, tail = split_co(s['html'])
        if not subs:
            new_secs.append(s); continue
        s = {'section': s['section'], 'html': tail, 'subsections': subs}
        changed += 1
        new_secs.append(s)
    ch['sections'] = new_secs

with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(notes, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f'co 已拆 {changed} 个节')
total = 0
for ch in notes['chapters']:
    n = sum(len(s.get('subsections', [])) for s in ch['sections'])
    total += n
    print(f'  {ch["chapter"]}: {n} 小节')
print('co 总小节:', total)
