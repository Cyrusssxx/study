# -*- coding: utf-8 -*-
"""ds_code 2024/2025/2026 修补：补 24/25 缺失题面、26 题面换权威版、26 解法改 SearchX + 输出差值"""
import io, json, sys

sys.stdout.reconfigure(encoding='utf-8')
B = chr(92)
PATH = 'pwa/data/ds_code.json'
d = json.load(io.open(PATH, encoding='utf-8'))
qs = {q['id']: q for q in d['questions']}

# ---------- 2024：补题面 ----------
t24 = ('【2024统考真题】某有向图采用邻接矩阵存储，类型定义如下：<br>'
       'typedef struct {<br>'
       '&nbsp;&nbsp;&nbsp;&nbsp;int numVertices;&nbsp;&nbsp;// 顶点数<br>'
       '&nbsp;&nbsp;&nbsp;&nbsp;int Edge[MAXV][MAXV];&nbsp;&nbsp;// 邻接矩阵<br>'
       '} MGraph;<br>'
       '请设计一个尽可能高效的算法 int uniquely(MGraph G)，判断该有向图的拓扑序列是否唯一：'
       '若唯一返回 1，否则返回 0（若图中存在环，拓扑序列不存在，同样返回 0）。<br>'
       '要求：(1) 描述算法的基本思想；(2) 根据设计思想，采用 C 或 C++ 语言描述算法，关键之处给出注释')
qs['ds_code_2024']['content_text'] = t24

# ---------- 2025：补题面 ----------
t25 = ('【2025统考真题】已知数组 A[0..n-1] 中存放着 n 个整数（可正、可负、可为零），'
       '对每个 0 ≤ i ≤ n-1 定义 res[i] 为 A[i] 与 A[j]（i ≤ j ≤ n-1）乘积的最大值，'
       '即 res[i] = max{A[i]×A[j] | i ≤ j ≤ n-1}。'
       '请设计一个尽可能高效的算法 void CalMulMax(int A[], int res[], int n)，计算 res 数组的所有元素。<br>'
       '要求：(1) 描述算法的基本思想；(2) 根据设计思想，采用 C 或 C++ 语言描述算法，关键之处给出注释')
qs['ds_code_2025']['content_text'] = t25

# ---------- 2026：题面换权威版（含 typedef 与 输出差值 要求） ----------
t26 = ('【2026统考真题】二叉搜索树采用二叉链表存储，类型定义如下：<br>'
       'typedef struct BSTNode {<br>'
       '&nbsp;&nbsp;&nbsp;&nbsp;int data;<br>'
       '&nbsp;&nbsp;&nbsp;&nbsp;struct BSTNode *left, *right;<br>'
       '} BSTNode;<br>'
       'typedef BSTNode BTNode;<br>'
       '给定一棵非空二叉搜索树 T（root 是指向 T 中根结点的指针）和整数 k，'
       '请设计一个尽可能高效的算法 void SearchX(BTNode *root, int k)，'
       '查找关键字值与 k 的差值的绝对值最小的所有结点，输出差值的绝对值和结点的关键字值。<br>'
       '要求：(1) 描述算法的基本思想；(2) 根据设计思想，采用 C 或 C++ 语言描述算法，关键之处给出注释')
qs['ds_code_2026']['content_text'] = t26

# ---------- 2026：两解法入口改 SearchX + 补输出差值的绝对值 ----------
s1 = qs['ds_code_2026']['solutions']['list'][0]['code']
s2 = qs['ds_code_2026']['solutions']['list'][1]['code']
assert s1.count('void solve(BTNode *root, int K)') == 1 and s2.count('void solve(BTNode *root, int K)') == 1
s1 = s1.replace('void solve(BTNode *root, int K)', 'void SearchX(BTNode *root, int k)')
s2 = s2.replace('void solve(BTNode *root, int K)', 'void SearchX(BTNode *root, int k)')
assert s1.count('findMinDiff(root, K);') == 1
s1 = s1.replace('findMinDiff(root, K);',
                'findMinDiff(root, k);\n'
                + '     printf("%d' + B + 'n", minDiff);            // 输出差值的绝对值')
assert s2.count('InOrder(root, K);') == 1
s2 = s2.replace('InOrder(root, K);',
                'InOrder(root, k);\n'
                + '     printf("%d' + B + 'n", minDiff);            // 输出差值的绝对值')
qs['ds_code_2026']['solutions']['list'][0]['code'] = s1
qs['ds_code_2026']['solutions']['list'][1]['code'] = s2

json.dump(d, io.open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('2024/2025 题面已补；2026 题面换权威版；两解法入口 SearchX + 补输出差值')
