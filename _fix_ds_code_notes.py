# -*- coding: utf-8 -*-
"""ds_code.json 答案修复：
1) 2023 printVertices 只保留写法二（合并循环版），清掉错位的 note '写法 2：'
2) 2024 uniquely1 清掉碎片 note '在'
3) 2012/2015 清掉碎片 note
4) 2011解法4 / 2016解法2 空标签 complexity 补上数值（依据各自备注原文）
5) 全部解法的无注释关键语句行尾补注释（不增删行、不改代码语义）
"""
import json, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
PATH = 'pwa/data/ds_code.json'
d = json.load(open(PATH, encoding='utf-8'))

def dispw(s):
    w = 0
    for ch in s:
        w += 2 if unicodedata.east_asian_width(ch) in ('F', 'W') else 1
    return w

def add_comment(code, idx, text, col=48):
    lines = code.split('\n')
    assert 0 <= idx < len(lines), f'行号越界 {idx}/{len(lines)}'
    assert '//' not in lines[idx], f'已有注释: {lines[idx]!r}'
    line = lines[idx]
    pad = max(2, col - dispw(line.rstrip()))
    lines[idx] = line.rstrip() + ' ' * pad + '// ' + text
    return '\n'.join(lines)

def qget(qid):
    return [x for x in d['questions'] if x['id'] == qid][0]

changed = []

# ---------- 1) 2023 printVertices 只保留写法二 ----------
q = qget('ds_code_2023')
sol = q['solutions']['list'][0]
blocks = sol['code'].split('int printVertices(MGraph G)')
assert len(blocks) == 3, f'2023 应有 2 个 printVertices，实际 {len(blocks)-1}'
sol['code'] = 'int printVertices(MGraph G)' + blocks[2]
sol['note'] = ''
sol['analysis'] = sol['analysis'].replace('\n注：以下两种答案本质一样，仅供参考', '').replace('注：以下两种答案本质一样，仅供参考', '').rstrip()
changed.append(('2023', '去重保留写法二 + 清 note + 删 analysis 尾注'))

# ---------- 2) 2024 '在' ----------
q = qget('ds_code_2024')
sol = q['solutions']['list'][0]
assert sol['note'] == '在'
sol['note'] = ''
changed.append(('2024', "清 note '在'"))

# ---------- 3) 2012 / 2015 碎片 note ----------
q = qget('ds_code_2012')
sol = q['solutions']['list'][1]
assert sol['note'].strip() == '能长度\n地址', repr(sol['note'])
sol['note'] = ''
changed.append(('2012解法2', "清碎片 note '能长度\\n地址'"))

q = qget('ds_code_2015')
sol = q['solutions']['list'][1]
assert sol['note'].strip().startswith('（4）时间复杂度：'), repr(sol['note'])
sol['note'] = ''
changed.append(('2015解法2', '清碎片 note（4）时间复杂度：…'))

# ---------- 4) 空标签 complexity 补值（顺带把会原样显示的 ' | ' 分隔规范掉） ----------
q = qget('ds_code_2011')
sol = q['solutions']['list'][3]
assert sol['complexity'].startswith('时间复杂度： | 空间复杂度： '), repr(sol['complexity'][:20])
sol['complexity'] = sol['complexity'].replace(
    '时间复杂度： | 空间复杂度： ',
    '时间复杂度：O(log n)（二分排除一半区间）   空间复杂度：O(1)。', 1)
sol['complexity'] = sol['complexity'].replace(' | ', '。')
changed.append(('2011解法4', 'complexity 空标签补 O(log n)/O(1) + 规范分隔'))

q = qget('ds_code_2016')
sol = q['solutions']['list'][1]
assert sol['complexity'].startswith('时间复杂度： | 空间复杂度： '), repr(sol['complexity'][:20])
sol['complexity'] = sol['complexity'].replace(
    '时间复杂度： | 空间复杂度： ',
    '时间复杂度：O(n)（平均，证明见下）   空间复杂度：O(log n)（平均递归深度）。', 1)
sol['complexity'] = sol['complexity'].replace(' | ', '。')
changed.append(('2016解法2', 'complexity 空标签补 O(n)/O(log n) + 规范分隔'))

# ---------- 5) 关键语句行尾补注释（不加行） ----------
C = {
    ('ds_code_2009', '解法1'): [
        (0, '查找链表倒数第k个结点，k超出长度返回0'),
        (2, 'p指向首元结点'),
        (3, 'n统计链表长度，t为待找序号'),
        (4, '第一趟遍历求链表长度'),
        (9, '倒数第k个即正数第n-k+1个'),
        (10, 'k不合法，查找失败'),
        (12, '第二趟从头结点走t步'),
        (15, '查找成功'),
    ],
    ('ds_code_2009', '解法2'): [
        (0, '借助结点地址数组，直接取倒数第k个'),
        (7, '顺序存入结点地址'),
        (10, 'k不合法，查找失败'),
        (12, '查找成功'),
    ],
    ('ds_code_2009', '解法3'): [
        (0, '双指针：right先走k步，再与left同步后移'),
        (2, '慢指针left'),
        (3, '快指针right'),
        (4, 'right先走k步'),
        (9, '两指针同步后移，right到尾时left即倒数第k个'),
        (15, '查找成功'),
    ],
    ('ds_code_2010', '解法1'): [
        (0, '借助辅助数组B：前p个整体后移，其余前移'),
        (2, '辅助数组'),
        (3, 'A[0..p-1]移到B的后半段'),
        (5, 'A[p..n-1]移到B的前半段'),
    ],
    ('ds_code_2010', '解法2'): [
        (0, '将A[L..R]原地逆置'),
        (2, '两端对称交换次数'),
        (3, '首尾对称互换'),
        (6, '三次翻转实现循环左移p个位置'),
    ],
    ('ds_code_2011', '解法1'): [
        (0, '快速排序（辅助函数）'),
        (18, '合并两数组排序后取第n个（中位数）'),
        (20, '辅助数组C存合并结果'),
        (21, 'A、B先后并入C'),
    ],
    ('ds_code_2011', '解法2'): [
        (0, '归并两有序数组到C，取第n个'),
        (2, '辅助数组C'),
        (3, 'i、j、k分别为A、B、C的下标'),
        (4, '归并较小的元素'),
        (9, 'A有剩余'),
        (10, 'B有剩余'),
    ],
    ('ds_code_2011', '解法3'): [
        (0, '两数组指针共走n-1步，较小者即中位数'),
        (2, 'i、j分别为A、B的下标'),
    ],
    ('ds_code_2011', '解法4'): [
        (0, '两数组分别二分收缩区间'),
        (2, '两数组各自的中间下标与区间边界'),
        (5, 'A的中点下标'),
        (7, '中位数只能落在A的后半段与B的前半段'),
        (13, '反之，中位数落在A的前半段与B的后半段'),
    ],
    ('ds_code_2012', '解法1'): [
        (0, '暴力：双重循环逐一比对结点地址'),
        (4, '依次取str1的每个结点'),
        (6, 'p2从头遍历str2'),
        (15, '无共同后缀'),
    ],
    ('ds_code_2012', '解法2'): [
        (0, '借助结点地址数组，从后向前找第一个不相同的结点'),
        (5, '两链表长度'),
    ],
    ('ds_code_2012', '解法3'): [
        (0, '先求两表长度，长表指针先走差值步，再同步比对'),
        (4, '两链表长度'),
        (15, '重新回到首元结点'),
        (23, '同步后移比对'),
    ],
    ('ds_code_2013', '解法1'): [
        (0, '两层循环枚举统计出现次数'),
    ],
    ('ds_code_2013', '解法2'): [
        (0, '快速排序（辅助函数）'),
        (18, '排序后主元素只可能在中间，一趟验证'),
        (20, '先快速排序'),
    ],
    ('ds_code_2013', '解法3'): [
        (0, '计数数组统计频率（0<=A[i]<n）'),
    ],
    ('ds_code_2013', '解法4'): [
        (0, '摩尔投票法：抵消思想找候选，再一趟验证'),
    ],
    ('ds_code_2014', '解法1'): [
        (10, '叶结点：累加权值×深度'),
    ],
    ('ds_code_2014', '解法2'): [
        (14, '向上返回该子树的WPL'),
    ],
    ('ds_code_2015', '解法1'): [
        (4, '双重循环：p固定，删除其后所有绝对值相等的结点'),
        (17, '摘除q结点'),
        (18, '释放q空间'),
        (21, '未删除则pre后移'),
        (23, '处理下一个p'),
    ],
    ('ds_code_2015', '解法2'): [
        (4, '计数数组标记已出现的绝对值，一趟完成去重'),
        (8, 'count[k]标记绝对值k是否出现过'),
        (11, '首次出现，保留'),
        (21, '继续处理下一个结点'),
    ],
    ('ds_code_2016', '解法1'): [
        (0, '快速排序（辅助函数）'),
        (18, '排序后前n/2个为A1，其余为A2'),
        (20, '先快速排序'),
    ],
    ('ds_code_2016', '解法2'): [
        (0, '快速选择：只递归包含n/2-1的一侧'),
        (15, '基准恰好落在n/2-1位，划分完成'),
        (21, '划分完成后前半为A1，后半为A2'),
        (23, '快速选择划分'),
    ],
    ('ds_code_2016', '解法3'): [
        (0, '迭代式快排划分，直到基准落在n/2-1位'),
        (2, '当前待划分区间'),
    ],
    ('ds_code_2017', '解法1'): [
        (0, '中序输出中缀表达式，root用于判断是否为根'),
        (3, '非根的表达式结点先输出左括号'),
        (8, '表达式子树输出完补右括号'),
    ],
    ('ds_code_2018', '解法1'): [
        (0, '从1枚举到n+1，未出现的最小正整数即答案'),
    ],
    ('ds_code_2018', '解法2'): [
        (0, '快速排序（辅助函数）'),
        (14, '排序后从前往后找第一个跳过的值'),
        (16, '先快速排序'),
    ],
    ('ds_code_2018', '解法3'): [
        (0, '计数标记1~n+1的出现情况，再取最小未出现'),
    ],
    ('ds_code_2019', '解法1'): [
        (0, '后半段结点逐个插入前半段的空隙'),
        (14, 'temp指向前一半的表尾'),
        (15, 'p指向后一半首结点'),
        (16, '断开成两段'),
        (18, '后一半共n/2个结点'),
        (20, '暂存后一半的下一个结点'),
        (21, 'pre从头结点出发找插入位置'),
        (22, '定位到第n/2-i个结点之后'),
        (24, '插入到pre之后'),
    ],
    ('ds_code_2019', '解法2'): [
        (1, '头插p结点'),
        (9, 'p慢q快，q一次走两步'),
        (11, '快慢指针找中间结点'),
        (20, 'temp指向前一半表尾'),
        (21, 'p指向后一半首结点'),
        (22, '断开成两段'),
        (33, 'p1指向前一半首结点'),
        (34, 'p2指向逆置后的后一半首结点'),
    ],
    ('ds_code_2020', '解法1'): [
        (0, '暴力三重循环枚举所有三元组'),
    ],
    ('ds_code_2020', '解法2'): [
        (0, '计算三元组距离'),
        (7, 'k是C的当前下标'),
    ],
    ('ds_code_2020', '解法3'): [
        (11, '尝试B、C中与A[i]最近的四个组合'),
    ],
    ('ds_code_2020', '解法4'): [
        (8, '三指针归并推进'),
        (11, '当前最小元素所在数组的指针后移'),
    ],
    ('ds_code_2021', '解法1'): [
        (0, '判断是否存在欧拉路径：奇度顶点数为0或2'),
        (2, '奇度顶点计数'),
        (5, '当前顶点度数'),
        (9, '奇度顶点'),
    ],
    ('ds_code_2023', '解法1'): [
        (0, '统计并输出全部K顶点，返回个数'),
    ],
    ('ds_code_2025', '解法1'): [
        (1, '对每个i计算区间最大乘积'),
    ],
    ('ds_code_2025', '解法2'): [
        (1, '后缀最大/最小辅助数组，一次算出所有res[i]'),
    ],
    ('ds_code_2025', '解法3'): [
        (1, '不用辅助数组：滚动维护后缀最大/最小值'),
    ],
    ('ds_code_2026', '解法1'): [
        (26, '输出全部并列最小结点值'),
    ],
    ('ds_code_2026', '解法2'): [
        (11, '空结点或已提前终止'),
        (26, '输出全部并列最小结点值'),
    ],
}

applied = 0
for (qid, tag), entries in C.items():
    q = qget(qid)
    for sol in q['solutions']['list']:
        if sol['tag'] != tag:
            continue
        for idx, text in entries:
            sol['code'] = add_comment(sol['code'], idx, text)
            applied += 1

# ---------- 校验：只追加了注释，未增删行、未改代码 ----------
def strip_comments(code):
    return '\n'.join(re.sub(r'\s*//.*$', '', l).rstrip() for l in code.split('\n'))

d2 = json.load(open(PATH, encoding='utf-8'))
assert len(json.dumps(d2, ensure_ascii=False, indent=2)) > 0

json.dump(d, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('结构修复:', len(changed), '处')
for c in changed:
    print('  ', c[0], '—', c[1])
print('补注释:', applied, '行')
