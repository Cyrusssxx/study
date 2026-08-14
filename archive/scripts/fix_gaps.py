"""修复剩余缺口节：显式节映射 + 内容相似度DP对齐
- 等条数节：直接位置写入（含 ds 8.3 错配数据重写）
- 提取多1~4条的节：按题目文本与解析文本的字符二元组相似度DP对齐，跳过多余条
"""
import json
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, r'D:\ai code\408-quiz-app')
from extract_explanations_ocr import extract_sections, group_by_section, to_html

BASE = r'D:\ai code\408-quiz-app'

# 科目 -> [(题库节名关键字, [提取节索引], 模式)]  模式: eq=等条数直写 dp=DP对齐
PLAN = {
    'ds': [
        ('5.3 二叉树的遍历和线索二叉树', [12], 'dp'),
        ('5.5 树与二叉树的应用', [14], 'dp'),
        ('6.2 图的存储及基本操作', [16], 'dp'),
        ('7.2 顺序查找和折半查找', [19], 'dp'),
        ('7.3 树形查找', [20, 21, 22], 'dp'),   # 教材7.3+7.4+7.5合并对应
        ('8.1 排序的基本概念', [23], 'eq'),
        ('8.2 插入排序', [24], 'eq'),
        ('8.3 交换排序', [25], 'eq'),           # 重写：原错配教材8.2数据
        ('8.4 选择排序', [26], 'eq'),
        ('8.5 归并排序、基数排序和计数排序', [27], 'eq'),
        ('8.6 各种内部排序算法的比较及应用', [28], 'dp'),
    ],
    'co': [
        ('3.5 高速缓冲存储器', [9], 'dp'),
    ],
    'cn': [
        ('1.1 计算机网络概述', [0], 'dp'),
        ('1.2 计算机网络体系结构与参考模型', [1], 'dp'),
        ('4.2 IPv4', [14], 'dp'),
        ('5.3 TCP', [22], 'dp'),
        ('6.5 万维网', [27], 'dp'),
    ],
}


def bigrams(s):
    s = re.sub(r'\s', '', s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def sim(qtext_bg, etext):
    eb = bigrams(etext)
    if not qtext_bg or not eb:
        return 0.0
    return len(qtext_bg & eb) / min(len(qtext_bg), len(eb))


def qtext_of(q):
    opts = ' '.join(str(v) for v in (q.get('options') or {}).values())
    return f"{q.get('content', '')} {opts}"


def dp_align(qs, es):
    """全部题目按序匹配到提取条目，多余条目跳过；返回(匹配对列表, 跳过条索引)"""
    n, m = len(qs), len(es)
    qbgs = [bigrams(qtext_of(q)) for q in qs]
    etexts = [''.join(lines) for _, lines in es]
    NEG = float('-inf')
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bp = [[None] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[0][j] = 0.0
    for i in range(1, n + 1):
        for j in range(i, m + 1):
            # 跳过第j个提取条
            if dp[i][j - 1] > dp[i][j]:
                dp[i][j] = dp[i][j - 1]
                bp[i][j] = 'skip'
            # 匹配 q[i-1] <- e[j-1]
            if dp[i - 1][j - 1] > NEG:
                s = dp[i - 1][j - 1] + sim(qbgs[i - 1], etexts[j - 1])
                if s > dp[i][j]:
                    dp[i][j] = s
                    bp[i][j] = 'match'
    pairs, skipped = [], []
    i, j = n, m
    while j > 0:
        if i > 0 and bp[i][j] == 'match':
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        else:
            skipped.append(j - 1)
            j -= 1
    pairs.reverse()
    skipped.reverse()
    return pairs, skipped


def write_entries(qs, es, pairs, report_lines, corrections):
    written = 0
    for qi, ei in pairs:
        q = qs[qi]
        ans, lines = es[ei]
        if ans is None:
            continue
        if q.get('answer') and q['answer'] != ans:
            corrections.append(f"{q['id']}: {q['answer']} -> {ans}")
        q['answer'] = ans
        htm = to_html(lines)
        if htm:
            q['explanation'] = htm
            written += 1
        elif 'explanation' in q:
            del q['explanation']  # 清掉可能的错配旧数据
    return written


out = []
for sk, plan in PLAN.items():
    pages = []
    with open(os.path.join(BASE, 'data', 'ocr_cache', f'{sk}_pages.jsonl'), 'r', encoding='utf-8') as f:
        for ln in f:
            pages.append(json.loads(ln))
    es_all = extract_sections(pages)
    jpath = os.path.join(BASE, 'data', 'questions', f'{sk}.json')
    with open(jpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    qgroups = group_by_section(data['questions'])
    gmap = {key[1]: qs for key, qs in qgroups}

    out.append(f"\n===== {sk} =====")
    total_written = 0
    corrections = []
    for sec_name, eidx, mode in plan:
        qs = gmap.get(sec_name)
        if qs is None:
            out.append(f"  [错误] 找不到题库节: {sec_name}")
            continue
        es = []
        for k in eidx:
            es.extend(es_all[k])
        if mode == 'eq':
            if len(qs) != len(es):
                out.append(f"  [跳过] {sec_name}: {len(qs)}题 vs {len(es)}条不等，eq模式不适用")
                continue
            pairs = list(zip(range(len(qs)), range(len(es))))
            skipped = []
        else:
            if len(es) < len(qs):
                out.append(f"  [跳过] {sec_name}: 提取条数{len(es)}少于题数{len(qs)}")
                continue
            pairs, skipped = dp_align(qs, es)
        w = write_entries(qs, es, pairs, out, corrections)
        total_written += w
        skipinfo = ''
        for si in skipped:
            ans, lines = es[si]
            first = (lines[0][:30] if lines else '(空)')
            skipinfo += f"\n      跳过条#{si + 1}: [{ans}] {first}"
        out.append(f"  {sec_name}: 写入{w}/{len(qs)} 跳过{len(skipped)}条{skipinfo}")

    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    with_expl = sum(1 for q in data['questions'] if q.get('explanation'))
    out.append(f"  本轮写入: {total_written}, 答案修正: {len(corrections)}")
    out.append(f"  {sk} 当前有解析: {with_expl}/{data['total']} ({with_expl / data['total'] * 100:.1f}%)")

with open(os.path.join(BASE, 'fix_gaps_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done')
