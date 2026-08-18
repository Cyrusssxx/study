# -*- coding: utf-8 -*-
"""生成 pwa/data/ds_code.json —— 「数据结构代码真题」专栏（2009-2026 共18道408代码题）。

2009-2023 (15道)：content/answer 直接复用 ds_daka.json 中已核对过的王道官方答案，
  本脚本按 年份+关键词 定位条目并补全 real/kaodian/analysis/weblink。
2024-2026 (3道)：ds_daka 未收录，由本脚本 EXTRA 内置（题目原文+解答+参考链接）。
注意：2024 年起 408 算法设计题由「第42题」移到「第41题」（42 变哈希/AOE 等计算题）。
"""
import json

# year -> (定位关键词, 考点分类, 知乎子文章ID, 详细考点+易错点)
META = {
    2009: ("倒数第k", "链表", "715401637",
           "考点：单链表单遍扫描、快慢指针（两指针间距 k）。易错点：快指针先走 k 步后慢指针才同步出发；表长<k 时快指针走完仍不足 k 步须返回失败；k<=0 与空表要特判；“倒数第 k 个”从 1 计数。"),
    2010: ("循环左移", "顺序表", "715616143",
           "考点：线性表原地逆置技巧、三段逆置组合（前段/后段/整体）。易错点：p 可能 >=n，必须先 p=p%n；三段边界 Reverse(0,p-1)、Reverse(p,n-1)、Reverse(0,n-1) 别写错；要求 O(n)/O(1) 时不能开辅助数组。"),
    2011: ("中位数", "顺序表", "718557723",
           "考点：两个有序表合并、中位数定义（2n 个元素的中位=第 n 小，0 基下标 n-1）。易错点：合并后总长 2n，中位数下标是 n-1 不是 n；等长时也可用“平分法”（递归比较两表中位）做到 O(logn)，注意递归边界。"),
    2012: ("后缀", "链表", "720226035",
           "考点：链表公共结点/公共后缀、长度差对齐、栈“后进先出”倒序比较。易错点：先让长表头指针走 |len1-len2| 步再同步比较；判断条件是结点地址相同（p==q）而非值相同；公共结点之后的所有结点都相同。"),
    2013: ("主元素", "顺序表", "718848457",
           "考点：主元素定义（出现次数>n/2）、摩尔投票（候选+计数）、伪散列计数（值域有限）。易错点：摩尔投票只产生候选，无论是否存在主元素都必须二次扫描验证出现次数是否真>n/2；用数组下标计数时注意值域 [0,n-1] 与开数组大小。"),
    2014: ("WPL", "二叉树", "717071345",
           "考点：带权路径长度 WPL、先序/层次遍历带深度、叶结点判定。易错点：递归深度定义要统一（根深度从 0 或 1 计，WPL 相应差一个权值）；只累加叶结点（左右孩子皆空）的 deep*weight；层次遍历需队列记录深度。"),
    2015: ("绝对值", "链表", "720389291",
           "考点：链表删除、伪散列哈希（值域有限用数组做标记）、绝对值去重。易错点：标记数组大小是 n+1（绝对值范围 [0,n]，含 0）；删除 p->next 后 p 不移动（避免漏判）；先判断 key[m]==0 再决定保留或删除。"),
    2016: ("划分为两个不相交", "顺序表", "722256405",
           "考点：快速排序 partition 思想、“第 k 小元素”减治选择、集合划分使个数差最小且和差最大。易错点：枢轴定位到 n/2（k-1）位置即停止，无需完全排序；平均 O(n)/O(1) 是快排划分的期望，最坏 O(n^2)；若要求各段内部相对顺序不变，partition 不稳定需换辅助数组/前插。"),
    2017: ("中缀表达式", "二叉树", "720860549",
           "考点：表达式树的中序遍历、运算符优先级与括号策略。易错点：最外层不加括号（deep>1 才加）；括号加在当前结点是加减法且非根的子树外；单目运算符（如负号）只处理右子树；操作数叶子直接输出。"),
    2018: ("最小正整数", "顺序表", "720283487",
           "考点：数值与下标映射（伪散列/原地置换）、“缺失的最小正整数”。易错点：值域 [1,n] 才有意义，忽略 <=0 和 >n 的元素；置换法原地归位时防死循环（目标位置已有正确值则跳过）；标记数组法空间 O(n)、置换法空间 O(1)，按题目要求选择。"),
    2019: ("重新排列", "链表", "720397271",
           "考点：快慢指针找中点、单链表逆置、两链表交替合并。易错点：快指针走两步的条件（fast->next && fast->next->next）；断开中点 slow->next=NULL；逆置后半段用三指针；交叉合并时先保存 q 的下一结点，再把 p 移到下一段头（p=q->next）。"),
    2020: ("三元组", "顺序表", "720312808",
           "考点：三个有序数组的贪心多指针、距离公式化简 D=|a-b|+|b-c|+|c-a|=2(max-min)。易错点：每次移动“当前三者最小值”所在指针（升序下才能逼近最优）；暴力 O(n^3) 超时，要写 O(n) 线性扫描；保留最优三元组值；先化简公式便于分析。"),
    2021: ("EL路径", "图", "721791028",
           "考点：欧拉回路/路径判定（奇度顶点数 0 或 2 + 图连通）、邻接矩阵求度数。易错点：奇度=2 只是必要非充分，还须保证图连通（排除孤立点/森林）；无向图度数看行或列均可（矩阵对称）；有向图欧拉条件不同（入度=出度或仅起终点差 1），勿混用。"),
    2022: ("二叉搜索树", "二叉树", "720983629",
           "考点：顺序存储二叉树下标关系（i 的左右孩子 2i+1/2i+2，-1 表示空）、BST 性质（左<根<右）。易错点：递归范围约束 (min,max) 初始为负/正无穷，空结点（-1）直接返回真；“等于”按题目要求严格小于/大于；中序遍历法须严格递增（prev<cur），初值 -INF。"),
    2023: ("K顶点", "图", "721975150",
           "考点：邻接矩阵有向图出度/入度计算（行=出度、列=入度）、矩阵遍历统计。易错点：出度看第 i 行、入度看第 i 列，别反；无向图对称矩阵行列一致；无权图邻接值 0/1、有权图 INF 的判断；返回计数与输出顶点别遗漏。"),
}

# 2024-2026：ds_daka 未收录，内置题目原文与解答（参考良师408等公开解析整理）
EXTRA = [
    {
        "year": 2024,
        "real": "2024年408真题第41题",
        "kaodian": "图",
        "module": "408代码真题",
        "content": ("【2024-41】载人航天工程包含众多子工程，可将子工程间的依赖关系抽象为有向图的拓扑序列问题。"
                    "已知有向图 G 采用邻接矩阵存储：\n"
                    "typedef struct {\n"
                    "    int numVertices, numEdges;   // 图的顶点数和有向边数\n"
                    "    char VerticesList[MAXV];     // 顶点表，MAXV 为已定义常量\n"
                    "    int Edge[MAXV][MAXV];        // 邻接矩阵\n"
                    "} MGraph;\n"
                    "请设计算法 int uniquely(MGraph G)，判定 G 是否存在唯一的拓扑序列：若是返回 1，否则返回 0。\n"
                    "要求：(1) 给出算法的基本设计思想；(2) 用 C/C++ 描述算法，关键之处给出注释。"),
        "answer": ("(1) 基本思想：采用 Kahn（BFS）拓扑排序。先建立各顶点入度表，每次选择入度为 0 的顶点加入拓扑序列，"
                   "并将该顶点所有邻接顶点的入度减 1，重复该过程。若每次入度为 0 的顶点有且仅有一个，且共处理了 G.numVertices 次，"
                   "则拓扑序列唯一返回 1；否则（某一步出现多个入度为 0 的顶点，或存在环导致无法处理完所有顶点）返回 0。\n"
                   "(2) C 代码：\n"
                   "int uniquely(MGraph G) {                    // 判定是否存在唯一拓扑序列\n"
                   "    int *degree = malloc(G.numVertices * sizeof(int));\n"
                   "    int i, j, count = 0, in0 = -1, prev_in0;\n"
                   "    for (j = 0; j < G.numVertices; j++) {   // 初始化入度表\n"
                   "        degree[j] = 0;\n"
                   "        for (i = 0; i < G.numVertices; i++)\n"
                   "            if (G.Edge[i][j] == 1) degree[j]++;   // 列和 = 入度\n"
                   "    }\n"
                   "    for (j = 0; j < G.numVertices; j++)\n"
                   "        if (degree[j] == 0) {\n"
                   "            if (in0 == -1) in0 = j;          // 第一个入度为0的顶点\n"
                   "            else return 0;                   // 初始就有多个选择：不唯一\n"
                   "        }\n"
                   "    prev_in0 = in0;                          // 上一次选中的入度0顶点\n"
                   "    while (prev_in0 >= 0) {\n"
                   "        count++;                             // 已处理顶点数+1\n"
                   "        for (j = 0; j < G.numVertices; j++)  // 删边：邻接点入度-1\n"
                   "            if (G.Edge[prev_in0][j] == 1) {\n"
                   "                if (--degree[j] == 0) {\n"
                   "                    if (in0 == -1) in0 = j;  // 新入度0的顶点\n"
                   "                    else return 0;           // 某一步多个选择：不唯一\n"
                   "                }\n"
                   "            }\n"
                   "        prev_in0 = in0; in0 = -1;\n"
                   "    }\n"
                   "    free(degree);\n"
                   "    return count == G.numVertices ? 1 : 0;   // 有环时 count < 顶点数\n"
                   "}\n"
                   "(3) 时间复杂度 O(n^2)（邻接矩阵遍历），空间复杂度 O(n)。"),
        "analysis": ("考点：拓扑排序（Kahn/BFS）、DAG 判定、拓扑序列唯一性判定（每一步入度为 0 的顶点有且仅有一个）。"
                     "易错点：唯一 ≠ 能完成拓扑排序——有环或某一步出现多个入度为 0 的顶点都不唯一；"
                     "入度按列统计（邻接矩阵列和=入度）；删边时所有邻接点入度都要减 1；处理完顶点数 < 顶点总数说明有环，返回 0。"),
        "weblink": "https://blog.csdn.net/goodteacher408/article/details/149190164",
    },
    {
        "year": 2025,
        "real": "2025年408真题第41题",
        "kaodian": "顺序表",
        "module": "408代码真题",
        "content": ("【2025-41】有两个长度均为 n 的一维整型数组 A[n]、res[n]，计算 A[i] 与 A[j]（0<=i<=j<=n-1）乘积的最大值，"
                    "并将其保存到 res[i] 中。若 A[]={1,4,-9,6}，则得到 res[]={6,24,81,36}。"
                    "现给定数组 A，请设计时间空间上尽可能高效的算法 CalMulMax，求 res 中各元素的值。\n"
                    "函数原型：void CalMulMax(int A[], int res[], int n)。\n"
                    "要求：(1) 给出算法的基本设计思想；(2) 用 C/C++ 描述算法，关键之处给出注释；(3) 说明时间、空间复杂度。"),
        "answer": ("(1) 基本思想：从后向前一趟扫描。对每个 A[i]，使 A[i]*A[j]（j>=i）最大的 A[j] 必为后缀 A[i..n-1] 中的某个极值："
                   "若 A[i]>=0，应乘后缀最大值（正数乘更大数结果更大，0 乘任何数为 0）；若 A[i]<0，应乘后缀最小值（负负得正，"
                   "如 -9*-9=81 > -9*6=-54）。故从右向左扫描，动态维护当前及右侧的后缀最大值 maxSuffix 与最小值 minSuffix："
                   "先更新极值（保证 j=i 被覆盖），再按符号选择极值计算 res[i]。\n"
                   "(2) C 代码：\n"
                   "void CalMulMax(int A[], int res[], int n) {\n"
                   "    int minSuffix = A[n-1], maxSuffix = A[n-1];   // 后缀最值（含当前）\n"
                   "    for (int i = n-1; i >= 0; i--) {\n"
                   "        if (A[i] < minSuffix) minSuffix = A[i];   // 更新后缀最小值\n"
                   "        if (A[i] > maxSuffix) maxSuffix = A[i];   // 更新后缀最大值\n"
                   "        if (A[i] >= 0) res[i] = A[i] * maxSuffix; // 非负：乘后缀最大值\n"
                   "        else            res[i] = A[i] * minSuffix; // 负：乘后缀最小值（负负得正）\n"
                   "    }\n"
                   "}\n"
                   "(3) 时间复杂度 O(n)，空间复杂度 O(1)。"),
        "analysis": ("考点：贪心 + 正负性符号分析、后缀极值动态维护、单次逆序遍历。"
                     "易错点：负数乘负数更大，必须同时维护后缀最小值和最大值，只维护最大值会错（A[i]<0 且后缀最小为负时）；"
                     "先更新极值再计算（保证 j=i 被覆盖）；A[i]==0 结果为 0；n=1 时 res[0]=A[0]*A[0]；暴力 O(n^2) 只能拿部分分。"),
        "weblink": "https://blog.csdn.net/goodteacher408/article/details/154981996",
    },
    {
        "year": 2026,
        "real": "2026年408真题第41题",
        "kaodian": "二叉树",
        "module": "408代码真题",
        "content": ("【2026-41】二叉搜索树采用二叉链表存储，类型定义如下：\n"
                    "typedef struct BSTNode {\n"
                    "    int data;\n"
                    "    struct BSTNode *left, *right;\n"
                    "} BSTNode;\n"
                    "typedef BSTNode BTNode;\n"
                    "给定一棵非空二叉搜索树 T（root 是指向 T 中根结点的指针）和整数 k，"
                    "请设计一个尽可能高效的算法 void SearchX(BTNode *root, int k)，"
                    "查找关键字值与 k 的差值的绝对值最小的所有结点，输出差值的绝对值和结点的关键字值。\n"
                    "要求：(1) 描述算法的基本思想；(2) 根据设计思想，采用 C 或 C++ 语言描述算法，关键之处给出注释。"),
        "answer": ("(1) 基本思想：利用 BST 左子树<根<右子树的有序性，与 k 差值最小的结点一定在“沿根向下搜索 k 的路径”上"
                   "（路径外结点落在某段区间内部，其与 k 的差比区间端点更大）。故从根开始，根据 k 与当前结点值的大小关系向左/右移动"
                   "（类二分查找），仅遍历搜索路径上的结点，实时计算 |data-k|，维护最小差值 minDiff 与对应关键字列表："
                   "差值更小则更新并重置列表，相等则加入列表；若结点值等于 k（差值为 0，最小可能值）立即终止。\n"
                   "时间复杂度 O(h)（h 为树高，平衡树 h=log n，最坏 h=n），空间复杂度 O(1)。\n"
                   "(2) C 代码：\n"
                   "void SearchX(BTNode *root, int k) {             // 输出与k差值最小的结点\n"
                   "    int minDiff = INT_MAX, idx = 0;\n"
                   "    int res[2];                                 // 差值最小的关键字（路径上至多2个）\n"
                   "    BTNode *p = root;\n"
                   "    while (p != NULL) {\n"
                   "        int d = abs(p->data - k);               // 当前差值\n"
                   "        if (d < minDiff) { minDiff = d; idx = 0; res[idx++] = p->data; }\n"
                   "        else if (d == minDiff) res[idx++] = p->data;   // 并列最小，加入列表\n"
                   "        if (p->data == k) break;                // 差值为0，最小，提前终止\n"
                   "        p = (k < p->data) ? p->left : p->right; // 沿搜索路径走\n"
                   "    }\n"
                   "    printf(\"min diff = %d: \", minDiff);\n"
                   "    for (int i = 0; i < idx; i++) printf(\"%d \", res[i]);\n"
                   "    printf(\"\\n\");\n"
                   "}\n"
                   "(3) 说明：路径上可能出现两个并列最小的结点（k 落在两结点值中间，如树中 3 与 5、k=4 时两者差值均为 1），都要输出。"),
        "analysis": ("考点：BST 有序性（左<根<右）、类二分搜索路径遍历、最接近值查找。"
                     "易错点：与 k 差值最小的结点一定在搜索路径上，不要全树遍历（会丢掉 O(h) 的得分点）；"
                     "结点值等于 k（差 0）时提前终止；并列最小的结点可能有两个，都要输出；h=log n 只在平衡时成立，最坏退化为链 O(n)。"),
        "weblink": "https://noobdream.com/post/406519/",
    },
]

with open('pwa/data/ds_daka.json', encoding='utf-8') as f:
    daka = json.load(f)

questions = []
for year in sorted(META):
    kw, kaodian, zhihu, analysis = META[year]
    cand = [q for q in daka['questions']
            if q.get('sheet') == '算法题' and kw in q.get('content', '')]
    if not cand:
        raise SystemExit(f"[!] 未找到 {year} 代码题 (keyword={kw})")
    if len(cand) > 1:
        print(f"[!] {year} 命中多个候选，取首个：{[c.get('id') for c in cand]}")
    q = cand[0]
    questions.append({
        "id": f"ds_code_{year}",
        "year": year,
        "real": f"{year}年408真题第42题",
        "kaodian": kaodian,
        "module": "408代码真题",
        "source": q.get('source', ''),
        "content": q.get('content', ''),
        "answer": q.get('answer', ''),
        "analysis": analysis,
        "weblink": f"https://zhuanlan.zhihu.com/p/{zhihu}",
    })

for e in EXTRA:
    questions.append({
        "id": f"ds_code_{e['year']}",
        "year": e['year'],
        "real": e['real'],
        "kaodian": e['kaodian'],
        "module": e['module'],
        "source": "良师408解析",
        "content": e['content'],
        "answer": e['answer'],
        "analysis": e['analysis'],
        "weblink": e['weblink'],
    })

questions.sort(key=lambda x: x['year'])

out = {
    "subject": "数据结构代码题",
    "subject_key": "ds_code",
    "name": "数据结构代码真题(2009-2026)",
    "total": len(questions),
    "questions": questions,
}
with open('pwa/data/ds_code.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"[ok] 写入 pwa/data/ds_code.json，共 {len(questions)} 道")
for q in questions:
    print(f"  - {q['id']:14s} {q['real']:20s} {q['kaodian']}")
