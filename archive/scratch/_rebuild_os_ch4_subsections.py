# -*- coding: utf-8 -*-
"""一次性脚本：os_notes.json 第4章重构为 章→节→小节(教材原目录) 结构。
- 按 h4 切块，映射到教材小节编号（4.1.1~4.1.3 / 4.2.1~4.2.9(无4.2.5) / 4.3.1~4.3.4）
- 4.1 的「七、文件的基本操作与文件的打开/关闭」整体移入 4.2.7 文件的操作（教材归属）
- 例题/总结块归节尾 html；其他章保持原结构不变
"""
import json, re, sys

SRC = 'pwa/data/notes/os_notes.json'
notes = json.load(open(SRC, encoding='utf-8'))

def split_by_h4(html):
    """按 h4 切块，返回 [(h4标题, 块html含h4标签)]，保持文档顺序"""
    parts = re.split(r'(<h4>[^<]+</h4>)', html)
    blocks = []
    cur = None
    for p in parts:
        m = re.match(r'<h4>([^<]+)</h4>', p)
        if m:
            cur = m.group(1)
            blocks.append([cur, p])
        elif cur is not None:
            blocks[-1][1] += p
    return blocks

def find_ch4(notes):
    for ch in notes['chapters']:
        if ch['chapter'] == '第4章 文件管理':
            return ch
    raise SystemExit('未找到第4章')

def rebuild_section(sec, sec_map, extra_blocks=None):
    """按 sec_map 重组一个节: sec_map = [(教材小节名, [h4标题...])], 返回 (new_sec, 节尾html, 未用块)
    extra_blocks: 额外注入的块 [(h4标题, html)]，供跨节移动（如4.1→4.2.7）"""
    blocks = split_by_h4(sec['html'])
    if extra_blocks:
        blocks.extend(extra_blocks)
    by_title = {t: h for t, h in blocks}
    # 校验所有映射目标都存在
    used = set()
    for _, titles in sec_map:
        for t in titles:
            if t not in by_title:
                raise SystemExit(f'映射缺失: {sec["section"]} -> {t!r}')
            used.add(t)
    # 小节重组
    subsections = []
    for sub_name, titles in sec_map:
        html = ''.join(by_title[t] for t in titles)
        subsections.append({'section': sub_name, 'html': html})
    # 节尾 = 未映射的块（例题/总结）
    tail = ''.join(h for t, h in blocks if t not in used)
    new_sec = {'section': sec['section'], 'html': tail}
    if subsections:
        new_sec['subsections'] = subsections
    return new_sec, used

ch4 = find_ch4(notes)
sections = {s['section']: s for s in ch4['sections']}

# ---------- 4.1 ----------
s41 = sections['4.1 文件系统基础']
sec41_map = [
    ('4.1.1 文件的基本概念', ['一、文件与文件系统的基本概念', '二、文件的属性与分类']),
    ('4.1.2 文件系统结构', ['三、操作系统对文件的管理视图', '六、文件系统的层次结构']),
    ('4.1.3 文件的逻辑结构', ['四、文件的逻辑结构之一：无结构文件与有结构文件',
                            '五、文件的逻辑结构之二：四种有结构组织方式',
                            '八、直接存取与顺序存取、定长与变长记录对比']),
]
new41, used41 = rebuild_section(s41, sec41_map)

# ---------- 4.2 ----------
s42 = sections['4.2 目录与文件']
sec42_map = [
    ('4.2.1 目录的基本概念', ['一、目录的基本概念与目录管理的基本要求']),
    ('4.2.2 文件控制块和索引节点', ['二、文件控制块（FCB）', '三、索引结点（inode）']),
    ('4.2.3 目录结构', ['四、目录结构：五种结构的演进与对比']),
    ('4.2.4 目录的操作', ['五、目录的操作与目录实现']),
    ('4.2.6 文件的物理结构', ['六、文件物理结构总览与三种分配方式对比',
                            '七、连续分配', '八、链接分配：隐式链接与显式链接（FAT）',
                            '九、索引分配：单级、多级与混合索引']),
    ('4.2.7 文件的操作', ['七、文件的基本操作与文件的打开/关闭（核心考点）']),  # 来自4.1，先占位
    ('4.2.8 文件共享', ['十、文件共享：硬链接与符号链接']),
    ('4.2.9 文件保护', ['十一、文件保护']),
]

# ---------- 4.3 ----------
s43 = sections['4.3 文件系统的实现']
sec43_map = [
    ('4.3.1 文件系统布局', ['一、本节知识框架与考情分析', '二、文件系统在磁盘上的布局',
                          '三、文件系统在内存中的结构']),
    ('4.3.2 文件存储空间管理', ['四、文件存储空间管理概述', '五、空闲表法与空闲链表法',
                              '六、位示图法（重点）', '七、成组链接法（UNIX，重点）']),
    ('4.3.3 虚拟文件系统（VFS）', ['八、虚拟文件系统（VFS）']),
    ('4.3.4 文件系统挂载（mounting）', ['九、文件系统挂载（mounting）']),
]
new43, used43 = rebuild_section(s43, sec43_map)

# ---------- 移动 4.1 的「七、文件的基本操作」→ 4.2.7 ----------
blocks41 = split_by_h4(s41['html'])
move_title = '七、文件的基本操作与文件的打开/关闭（核心考点）'
move_html = None
rest41 = []
for t, h in blocks41:
    if t == move_title:
        move_html = h
    else:
        rest41.append((t, h))
if move_html is None:
    raise SystemExit('4.1 未找到待移动的「七、文件的基本操作」块')
# 4.1 节尾 html 重算（去掉移动块）
new41['html'] = ''.join(h for t, h in rest41 if t not in used41)

# 4.2 用注入的移动块重新构建（4.2.7 = 来自4.1的「七」）
new42, used42 = rebuild_section(s42, sec42_map, extra_blocks=[(move_title, move_html)])

# ---------- 写回 ----------
ch4['sections'] = [new41, new42, new43]
with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(notes, f, ensure_ascii=False, indent=2)
    f.write('\n')

# ---------- 校验输出 ----------
print('=== 第4章重构后结构 ===')
for s in ch4['sections']:
    subs = s.get('subsections', [])
    print(f'{s["section"]} (节尾html {len(s["html"])}字, {len(subs)}小节)')
    for sub in subs:
        print(f'    {sub["section"]}  ({len(sub["html"])}字)')
print()
print('4.1 移动块已并入 4.2.7，4.1 节尾不含「文件的基本操作」:', move_title not in new41['html'])
print('4.1 节尾剩余:', [t for t,_ in rest41 if t not in used41])
