# -*- coding: utf-8 -*-
"""一次性脚本：修复 OS 3.2 拆分丢内容 bug + 2.5.4 漏知识点。
3.2 用了「主标题h4 + 数字子标题h4」嵌套结构，原映射只认主标题，
数字子标题(1.2.3.)全落入节尾 → 3.2.1/3.2.3/3.2.8 近乎空。
此处重拆 3.2，数字子标题归入其前最近的"主标题"所属小节；
2.5.4 补入漏掉的「十二、死锁临界条件」。
"""
import json, re

SRC = 'pwa/data/notes/os_notes.json'
notes = json.load(open(SRC, encoding='utf-8'))

ch3 = next(c for c in notes['chapters'] if c['chapter'] == '第3章 内存管理')
s32 = next(s for s in ch3['sections'] if s['section'] == '3.2 虚拟内存管理')

# 3.2 重新切块：先合并回完整 html（小节 + 节尾）
full = s32['html'] + ''.join(ss['html'] for ss in s32['subsections'])

def split_h4(html):
    parts = re.split(r'(<h4>[^<]+</h4>)', html)
    blocks, cur = [], None
    for p in parts:
        m = re.match(r'<h4>([^<]+)</h4>', p)
        if m:
            cur = m.group(1); blocks.append([cur, p])
        elif cur is not None:
            blocks[-1][1] += p
    return blocks

blocks = split_h4(full)
by_title = {t: h for t, h in blocks}

# 3.2 映射：小节 → [h4标题...]（数字子标题并入所属主标题）
map32 = [
    ('3.2.1 虚拟内存的基本概念', ['一、虚拟内存的基本概念',
        '1.传统存储管理方式的特征与缺陷', '2.局部性原理（虚拟内存的理论基础）',
        '3.虚拟存储器的定义与特征', '4.虚拟内存的容量上限与实现方式']),
    ('3.2.2 请求分页管理方式', ['二、请求分页管理方式',
        '1.页表机制（新增四个字段）', '2.缺页中断机构', '3.请求分页地址变换过程（完整步骤，重点）']),
    ('3.2.4 页面置换算法', ['三、页面置换算法（统考必考手算）',
        '1.OPT最佳置换算法', '2.FIFO先进先出算法', '3.LRU最近最久未使用算法',
        '4.CLOCK（时钟）算法（NRU算法）',
        '四、手算典例：引用串7,0,1,2,0,3,0,4,2,3,0,3,2（物理块3）']),
    ('3.2.3 页框分配', ['五、页面分配策略与抖动',
        '1.最小页框数与驻留集', '2.内存分配策略与置换策略的四种组合',
        '3.调入页面的时机与来源', '4.抖动（颠簸）', '5.工作集']),
    ('3.2.8 虚拟存储器性能影响因素', ['六、缺页率与有效访问时间（EAT）',
        '1.缺页率的概念与影响因素', '2.有效访问时间EAT公式推导与例题']),
]
used = set()
subs = []
for sub_name, titles in map32:
    for t in titles:
        if t not in by_title:
            raise SystemExit(f'3.2 映射缺失: {t!r}')
        used.add(t)
    subs.append({'section': sub_name, 'html': ''.join(by_title[t] for t in titles)})
# 节尾 = 未映射（考点总览 + 七经典例题 + ①~⑥ + 八易错）
tail = ''.join(h for t, h in blocks if t not in used)
s32['html'] = tail
s32['subsections'] = subs

# 2.5.4 补入 十二、死锁临界条件
ch2 = next(c for c in notes['chapters'] if c['chapter'] == '第2章 进程与线程')
s25 = next(s for s in ch2['sections'] if s['section'] == '2.5 死锁')
# 从节尾取出「十二、死锁临界条件」块
b25 = split_h4(s25['html'])
move = None; rest = []
for t, h in b25:
    if t == '十二、死锁临界条件（多次考查的快速结论）':
        move = h
    else:
        rest.append((t, h))
if move:
    s25['html'] = ''.join(h for t, h in rest)
    target = next(ss for ss in s25['subsections'] if ss['section'] == '2.5.4 死锁检测与解除')
    target['html'] += move
    print('2.5.4 已补入 十二、死锁临界条件')
else:
    print('警告：2.5 未找到「十二、死锁临界条件」')

with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(notes, f, ensure_ascii=False, indent=2)
    f.write('\n')

# 校验
for ss in s32['subsections']:
    txt = re.sub(r'<[^>]+>', '', ss['html'])
    print(f'  3.2 -> {ss["section"]}: {len(txt)}字')
