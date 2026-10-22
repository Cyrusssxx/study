# -*- coding: utf-8 -*-
"""
DS 笔记重点标记：按「内容价值」逐条判定，而不是套黑名单。

判定分三类：
  KEEP  该标 —— 公式/复杂度、带判断词的结论句、易错辨析
  DROP  不该标 —— 表头、标签词、算法名、纯名词短语、单字/数字
  (无中性区，一律二选一，避免"标一半")

上下文也参与判定：
  - <th> 里的加粗 → 永远 DROP（表头不是考点）
  - <td> 里的短名词 → DROP（表格单元不是考点）
  - <li>/<p> 里的句子 → 按句子价值判

用法：
  python _scan_ds_marks.py            # 只出报告
  python _scan_ds_marks.py --apply    # 落盘
"""
import json
import re
import sys
import shutil
from collections import Counter, OrderedDict
from datetime import datetime

NOTES = 'pwa/data/notes/ds_notes.json'
CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
APPLY = '--apply' in sys.argv

# ---------- 规则 ----------

# 纯结构标签：不是内容
LABELS = re.compile(
    r'^(易错点|易错|典型例子|考点追踪|考点|注意|提示|结论|小结|口诀|速记|记忆|重点|必背|补充|说明)'
    r'[：:！!]?$'
)

# 算法名（含「A 或 B」「A/B」组合）
ALGO_WORD = r'(?:直接插入|折半插入|希尔|冒泡|起泡|快速|快排|简单选择|选择|堆|归并|基数|计数|置换-选择|拓扑)'
ALGO_NAME = re.compile(rf'^(?:2\s*路)?{ALGO_WORD}(?:排序)?(?:[／/、或和与]{ALGO_WORD}(?:排序)?)*$')

# 公式/复杂度：只要含这些，一定值得标
FORMULA = re.compile(
    r'O\s*\(|⌈|⌉|⌊|⌋|log\s*[₂2]|∑|mod|√|'
    r'[A-Za-z]\s*[²³\^]|'                 # n²、n^2、2^k
    r'[A-Za-z]\s*[−\-]\s*\d|'             # n−1、m-1、k-1
    r'\d\s*[+\−\-\*/]\s*\d|'             # 3n(n−1)/2
    r'\([A-Za-z]\s*[+\−\-]\s*[A-Za-z]\)|'  # d(n + r)
    r'=\s*[A-Za-z0-9(]|%|'
    r'\d+\s*次|'                          # 0 次、n−1 次
    r'≈\s*[A-Za-z]'                        # ≈ n log₂n
)

# 判断/限定词：必须是"多字实词"，单字（是/有/取/用）太容易误命中，一律不收
JUDGE = re.compile(
    r'必须|只能|至少|至多|最多|最少|一定|唯一|不唯一|必然|等价|退化|退化为|决定|影响|导致|否则|'
    r'不能|不可|不一定|相反|区别|不同|相同|无关|有关|优于|劣于|高于|低于|更快|更慢|'
    r'无需|不必|不需要|适用于|不适合|恒为|不超过|不少于|不超过|'
    r'不稳定|稳定|连续|随机|有序|逆序|平均|最坏|最好'
)

# 纯名词短语（无判断词时的兜底：这些当名词看，不标）
BARE_NOUN = re.compile(
    r'^[①-⑩]?\s*(n|N)?\s*(较小|较大|很小|很大|小|大|多|少)?$|'
    r'^[①-⑩]\s*[^，。；]{1,12}$'
)

# 泛化名词表（仅用于"无判断词 + 短"的兜底，不单独成规则）
GENERIC = {
    '有关', '无关', '无关！', '稳定', '不稳定', '稳定性', '适用', '唯一', '不唯一',
    '有向图', '无向图', '稀疏图', '稠密图', '连通图', '极大连通子图',
    '队列', '栈', '路径', '边数', '入度', '出度', '叶结点', '数据项',
    '逻辑结构', '存储结构', '有限序列', '动态分配', '随机存取',
    '顺序存储', '链式存储', '十字链表', '邻接矩阵', '邻接表',
    '双亲表示法', '孩子表示法', '树的度', '同义词',
    '层次遍历', '先序遍历', '中序遍历', '后序遍历', '遍历',
    '不带头结点', '带头结点', '败者树', '最佳归并树', '判定树',
}


def plain(x):
    return re.sub(r'<[^>]+>', '', x).strip()


def classify(text, in_th=False, in_td=False):
    """返回 (KEEP/DROP, 原因)"""
    t = text.strip()
    if not t:
        return 'DROP', '空'
    if in_th:
        return 'DROP', '表头'
    if LABELS.match(t):
        return 'DROP', '结构标签'
    core = re.sub(r'^[①-⑩]\s*', '', t)          # 去掉 ①② 序号再判
    # 小标题（一、二、三、…）本身就是标题，不重复标
    if re.match(r'^[一二三四五六七八九十]+、', core):
        return 'DROP', '小标题'
    if ALGO_NAME.match(core):
        return 'DROP', '算法名'
    if len(core) <= 2:
        return 'DROP', '单字/数字'
    if re.fullmatch(r'[\d\s.]+', core):
        return 'DROP', '纯数字'
    if core in GENERIC and not JUDGE.search(core):
        return 'DROP', '泛化名词'
    if FORMULA.search(core):
        return 'KEEP', '公式/复杂度'
    # 表格单元：没有公式、判断词又不强 → 就是单元格取值，不标
    if in_td:
        if JUDGE.search(core) and len(core) >= 10:
            return 'KEEP', '表内结论句'
        return 'DROP', '表格单元取值'
    if BARE_NOUN.match(t):
        return 'DROP', '纯名词短语'
    if JUDGE.search(core) and len(core) >= 8:
        return 'KEEP', '判断句/结论'
    if len(core) >= 14:
        return 'KEEP', '长结论句'
    return 'DROP', '短名词（无判断词）'


def walk_html(html, decider):
    """遍历 <b>/<strong>，用 decider(text, in_th, in_td) 决定是否脱标签。"""
    # 先标记每个位置是否在 th / td 内
    out, pos, drops, keeps = [], 0, [], []
    pat = re.compile(r'<(b|strong)(\s[^>]*)?>(.*?)</\1>', re.S)
    for m in pat.finditer(html):
        start = m.start()
        before = html[:start]
        # 最近的 <th / <td 开标签决定上下文
        th_i = before.rfind('<th')
        td_i = before.rfind('<td')
        th_c = before.rfind('</th>')
        td_c = before.rfind('</td>')
        in_th = th_i > max(td_i, th_c, td_c)
        in_td = td_i > max(th_i, th_c, td_c)
        inner = m.group(3)
        txt = plain(inner)
        verdict, why = decider(txt, in_th, in_td)
        out.append(html[pos:start])
        if verdict == 'KEEP':
            out.append(m.group(0))
            keeps.append((txt, why))
        else:
            out.append(inner)
            drops.append((txt, why))
        pos = m.end()
    out.append(html[pos:])
    return ''.join(out), drops, keeps


def main():
    d = json.load(open(NOTES, encoding='utf-8'))
    all_drop, all_keep = [], []
    for ch in d['chapters']:
        for s in ch['sections']:
            for sb in s.get('subsections') or []:
                html = sb.get('html') or ''
                if '<b' not in html and '<strong' not in html:
                    continue
                new, drops, keeps = walk_html(html, classify)
                sb['html'] = new
                all_drop.extend(drops)
                all_keep.extend(keeps)

    total = len(all_drop) + len(all_keep)
    print(f'加粗共 {total} 处 → 保留 {len(all_keep)}（{len(all_keep)/max(total,1)*100:.0f}%），脱掉 {len(all_drop)}')
    print('\n=== 保留原因分布 ===')
    for why, n in Counter(w for _, w in all_keep).most_common():
        print(f'  {n:4d}  {why}')
    print('\n=== 脱掉原因分布 ===')
    for why, n in Counter(w for _, w in all_drop).most_common():
        print(f'  {n:4d}  {why}')
    print('\n=== 保留样例（每类 4 条）===')
    by = OrderedDict()
    for t, w in all_keep:
        by.setdefault(w, [])
        if len(by[w]) < 4:
            by[w].append(t)
    for w, ts in by.items():
        print(f'  [{w}]')
        for t in ts:
            print('     ', t[:60])
    print('\n=== 脱掉样例（每类 6 条）===')
    by2 = OrderedDict()
    for t, w in all_drop:
        by2.setdefault(w, [])
        if len(by2[w]) < 6:
            by2[w].append(t)
    for w, ts in by2.items():
        print(f'  [{w}] ' + ' | '.join(x[:24] for x in ts))

    if APPLY:
        shutil.copy2(NOTES, f'{BACKUP_DIR}/ds_notes.{datetime.now():%Y%m%d-%H%M%S}.bak')
        with open(NOTES, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        print(f'\n已写入 {NOTES}')


if __name__ == '__main__':
    main()
