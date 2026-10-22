# -*- coding: utf-8 -*-
"""
DS 重点标记重做：把"标得太滥"的加粗去掉，只留真正该标的。

问题（用户反馈）：
  - 算法名字被标了（直接插入排序 / 冒泡排序 …）
  - 「有关 / 无关」这种对比表里每行都有的词被标了
  - 标签词（易错点、典型例子、考点追踪）、单字（是/否）、纯数字（3/5/0/n）也被标
  → 一张表几乎全标 = 等于没标

做两件事：
  1. 清理 ds_notes.json 里的 <b>/<strong>：命中黑名单的直接脱掉标签（保留文字）
  2. 清掉 cards.json 里 ds 的 ** 标记，按清理后的笔记重新生成

用法：python _refine_ds_marks.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

SUBJ = 'ds'
for _a in sys.argv[1:]:
    if _a.startswith('--subject='):
        SUBJ = _a.split('=', 1)[1]
NOTES = f'pwa/data/notes/{SUBJ}_notes.json'
CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
DRY = '--dry' in sys.argv

# 标签类词：只是结构提示，不是内容重点
LABELS = {
    '易错点', '易错点：', '易错点:', '典型例子', '考点追踪', '考点追踪：', '考点追踪:',
    '注意', '提示', '结论', '小结', '口诀', '速记',
}

# 太泛、每行都出现的对比词
GENERIC = {
    '有关', '无关', '无关！', '无关!', '有关！', '有关!',
    '稳定', '不稳定', '稳定性',
    '适用', '不适用', '唯一', '不唯一', '不能', '不一定', '相反',
    '是', '否', '有', '无', '可以', '不可以', '需要', '不需要',
    '插入', '删除', '查找', '出队', '入队',
    '有向图', '无向图', '稀疏图', '稠密图', '连通图', '极大连通子图',
    '队列', '栈', '路径', '边数', '入度', '出度', '叶结点', '数据项',
    '逻辑结构', '存储结构', '有限序列', '动态分配', '随机存取',
    '顺序存储', '链式存储', '十字链表', '邻接矩阵', '邻接表',
    '双亲表示法', '孩子表示法', '树的度', '同义词',
    '层次遍历', '先序遍历', '中序遍历', '后序遍历',
    '不带头结点', '带头结点', '败者树', '最佳归并树',
}

# 算法名：整段就是一个算法名 → 不标
ALGO_RE = re.compile(
    r'^(2\s*路)?(直接插入|折半插入|希尔|冒泡|起泡|快速|简单选择|选择|堆|归并|基数|计数|置换-选择)排序$'
)


def plain(x):
    return re.sub(r'<[^>]+>', '', x).strip()


def should_unwrap(t):
    s = t.strip()
    if not s:
        return True
    if len(s) <= 2:                       # 是 / 否 / 3 / 5 / 0 / n
        return True
    if re.fullmatch(r'[\d\s.]+', s):      # 纯数字
        return True
    if s in LABELS or s in GENERIC:
        return True
    if ALGO_RE.match(s):
        return True
    return False


def clean_html(html):
    """把命中的 <b>/<strong> 脱掉标签，保留内部内容（含内层标签）。"""
    removed = []

    def repl(m):
        inner = m.group(3)
        if should_unwrap(plain(inner)):
            removed.append(plain(inner))
            return inner
        return m.group(0)

    out = re.sub(r'<(b|strong)(\s[^>]*)?>(.*?)</\1>', lambda m: repl(m), html, flags=re.S)
    return out, removed


# ---------- 卡片标记（与 _enrich_cards.py 同规则） ----------
def bold_phrases(html):
    out = []
    for b in re.findall(r'<(?:b|strong)[^>]*>(.*?)</(?:b|strong)>', html, re.S):
        t = re.sub(r'<[^>]+>', '', b).strip()
        t = re.sub(r'[*]{2}', '', t)
        if 5 <= len(t) <= 20 and t not in out:
            out.append(t)
    return out


def mark(text, phrases, max_spans=2):
    if '**' in text:
        return text
    spans = []
    for p in phrases:
        i = text.find(p)
        if i >= 0:
            spans.append((i, i + len(p)))
    if not spans:
        return text
    spans.sort(key=lambda x: -(x[1] - x[0]))
    chosen = []
    for s0, e0 in spans:
        if any(not (e0 <= cs or s0 >= ce) for cs, ce in chosen):
            continue
        chosen.append((s0, e0))
        if len(chosen) >= max_spans:
            break
    chosen.sort()
    merged = []
    for s0, e0 in chosen:
        if merged and s0 <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(e0, merged[-1][1]))
        else:
            merged.append((s0, e0))
    out, last = [], 0
    for s0, e0 in merged:
        out.append(text[last:s0])
        out.append('**' + text[s0:e0] + '**')
        last = e0
    out.append(text[last:])
    return ''.join(out)


def main():
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        for p in (NOTES, CARDS):
            shutil.copy2(p, f'{BACKUP_DIR}/{p.split("/")[-1]}.{ts}.bak')

    # ---------- 1. 清理笔记加粗 ----------
    notes = json.load(open(NOTES, encoding='utf-8'))
    removed = []
    total_b = 0
    for ch in notes['chapters']:
        for s in ch['sections']:
            for sb in s.get('subsections') or []:
                html = sb.get('html') or ''
                total_b += len(re.findall(r'<(?:b|strong)[\s>]', html))
                new, rm = clean_html(html)
                sb['html'] = new
                removed.extend(rm)
    print(f'笔记加粗 {total_b} 处 → 脱掉 {len(removed)} 处（{len(removed)/max(total_b,1)*100:.0f}%）')
    from collections import Counter
    for t, n in Counter(removed).most_common(12):
        print(f'    {n:2d} × {t}')

    if not DRY:
        with open(NOTES, 'w', encoding='utf-8') as f:
            json.dump(notes, f, ensure_ascii=False, indent=1)

    # ---------- 2. 重建卡片标记 ----------
    sec_html = {}
    for ch in notes['chapters']:
        for s in ch['sections']:
            for sb in s.get('subsections') or []:
                sec_html[sb.get('section')] = sb.get('html') or ''

    cards = json.load(open(CARDS, encoding='utf-8'))
    before = after = 0
    for c in cards['cards'][SUBJ]:
        phrases = bold_phrases(sec_html.get(c.get('title') or '', ''))
        for i, p in enumerate(c.get('points') or []):
            if '**' in p:
                before += 1
            stripped = re.sub(r'\*\*(.+?)\*\*', r'\1', p)     # 先清掉旧标记
            np = mark(stripped, phrases)
            if '**' in np:
                after += 1
            c['points'][i] = np
        if c.get('tip'):
            c['tip'] = mark(re.sub(r'\*\*(.+?)\*\*', r'\1', c['tip']), phrases)

    print(f'\n{SUBJ} 卡片带重点标记的要点：{before} → {after}')
    if not DRY:
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)
            f.write('\n')


if __name__ == '__main__':
    main()
