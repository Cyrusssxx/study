# -*- coding: utf-8 -*-
"""
为 ds_code.json 的 18 道代码真题生成「暴力解」字段（brute）。
规范：仅用 枚举法 / 快速排序 两种；不写 main、不写 #include；
      Qsort 严格使用可默写模板；思想简单、能简单就简单。
"""
import json
from collections import OrderedDict

PATH = 'pwa/data/ds_code.json'

# ============ 可默写的快速排序模板（严格照抄规范） ============
QSORT = """void Qsort(int A[], int L, int R)
{
    if (L >= R) return;              // 区间内元素个数为 0 或 1，自然有序
    int i = L, j = R;
    int pivot = A[L];                // 选取区间第一个元素作为基准
    while (i < j)
    {
        while (i < j && A[j] >= pivot) j--;  // 从右向左找第一个小于 pivot 的数
        while (i < j && A[i] <= pivot) i++;  // 从左向右找第一个大于 pivot 的数
        if (i < j) swap(A[i], A[j]);
    }
    swap(A[L], A[i]);                // 基准归位
    Qsort(A, L, i - 1);              // 递归处理左子区间
    Qsort(A, i + 1, R);              // 递归处理右子区间
}"""

BRUTE = OrderedDict()


def add(qid, method, idea, code):
    BRUTE[qid] = {"method": method, "idea": idea, "code": code}


# ---------------- 2009 链表·倒数第 k 个：枚举法 ----------------
add('ds_code_2009', '枚举法',
    "1. 枚举链表中的每一个结点 p（第一层循环）。<br>"
    "2. 对每一个 p，从 p 出发向后数 k 个结点：用指针 q 从 p 开始，数满 k 个就停（第二层循环）。<br>"
    "3. 若数满 k 个且此时 q 正好是最后一个结点（q->link == NULL），说明 p 后面恰好有 k-1 个结点，p 就是倒数第 k 个，输出其 data 并返回 1。<br>"
    "4. 若整条链表枚举完都没找到，说明表长小于 k，返回 0。",
    """int findKth(LinkList list, int k)
{
    if (k <= 0) return 0;                 // k 非法，直接失败
    LNode *p = list->link;                // 从第一个结点开始枚举
    while (p != NULL)                     // 第一层：枚举每个结点 p
    {
        LNode *q = p;
        int cnt = 1;
        while (cnt < k && q->link != NULL)  // 第二层：从 p 向后数 k 个
        {
            q = q->link;
            cnt++;
        }
        if (cnt == k && q->link == NULL)   // p 后面正好 k-1 个结点
        {
            printf("%d", p->data);
            return 1;                      // 查找成功
        }
        p = p->link;
    }
    return 0;                              // 表长 < k，查找失败
}""")

# ---------------- 2010 顺序表·循环左移 p：枚举法 ----------------
add('ds_code_2010', '枚举法',
    "1. 先用 p = p % n 把移动位数规范到 [0, n-1]，避免做无用功。<br>"
    "2. 枚举原数组的每一个下标 i（0 ~ n-1），算出它左移 p 位后的新下标 j = (i - p + n) % n。<br>"
    "3. 把 R[i] 直接放进辅助数组 T[j]。<br>"
    "4. 再枚举每个下标 i，把 T[i] 拷回 R[i]。",
    """void leftShift(int R[], int n, int p)
{
    if (n <= 1) return;
    p = p % n;                            // 移动位数规范化
    int T[MAXSIZE];                       // 辅助数组
    for (int i = 0; i < n; i++)           // 枚举每个元素
    {
        int j = (i - p + n) % n;          // 左移 p 位后的新下标
        T[j] = R[i];
    }
    for (int i = 0; i < n; i++)           // 拷回原数组
        R[i] = T[i];
}""")

# ---------------- 2011 两等长升序序列中位数：快速排序 ----------------
add('ds_code_2011', '快速排序',
    "1. 枚举序列 A 的每个元素，依次放入临时数组 C 的前 n 个位置。<br>"
    "2. 枚举序列 B 的每个元素，依次放入 C 的后 n 个位置，此时 C 共有 2n 个元素。<br>"
    "3. 对 C 调用快速排序，使其变为升序。<br>"
    "4. 2n 个元素的升序序列，其中位数是第 n 小的元素，即下标 n-1，直接返回 C[n-1]。",
    QSORT + """

int median(int A[], int B[], int n)
{
    int C[2 * MAXSIZE];
    for (int i = 0; i < n; i++)           // 枚举 A 的元素
        C[i] = A[i];
    for (int i = 0; i < n; i++)           // 枚举 B 的元素
        C[n + i] = B[i];
    Qsort(C, 0, 2 * n - 1);               // 先排序，再取中位数
    return C[n - 1];                      // 2n 个元素的中位数下标是 n-1
}""")

# ---------------- 2012 链表·公共后缀：枚举法 ----------------
add('ds_code_2012', '枚举法',
    "1. 枚举第一个链表 str1 中的每一个结点 p（第一层循环）。<br>"
    "2. 对每一个 p，枚举第二个链表 str2 中的每一个结点 q（第二层循环）。<br>"
    "3. 判断 p 与 q 是否为同一个结点（地址相同而非值相同）；若是，说明从这里开始后缀相同，直接返回 p。<br>"
    "4. 两层循环都枚举完仍未找到，返回 NULL 表示没有公共后缀。",
    """LNode* findCommon(LinkList str1, LinkList str2)
{
    LNode *p = str1->next;
    while (p != NULL)                     // 第一层：枚举 str1 每个结点
    {
        LNode *q = str2->next;
        while (q != NULL)                 // 第二层：枚举 str2 每个结点
        {
            if (p == q) return p;         // 地址相同才是公共结点
            q = q->next;
        }
        p = p->next;
    }
    return NULL;                          // 没有公共后缀
}""")

# ---------------- 2013 主元素：枚举法 ----------------
add('ds_code_2013', '枚举法',
    "1. 枚举数组 A 的每一个元素 A[i]，把它当作候选主元素（第一层循环）。<br>"
    "2. 对每一个候选 A[i]，再枚举整个数组统计它出现的次数 cnt（第二层循环）。<br>"
    "3. 若 cnt 大于 n/2，说明 A[i] 就是主元素，返回它。<br>"
    "4. 所有元素都枚举完仍不满足，返回 -1 表示不存在主元素。",
    """int Majority(int A[], int n)
{
    for (int i = 0; i < n; i++)           // 第一层：枚举每个元素作候选
    {
        int cnt = 0;
        for (int j = 0; j < n; j++)       // 第二层：枚举全数组统计次数
            if (A[j] == A[i]) cnt++;
        if (cnt > n / 2) return A[i];     // 出现次数超过一半
    }
    return -1;                            // 不存在主元素
}""")

# ---------------- 2014 二叉树 WPL：枚举法 ----------------
add('ds_code_2014', '枚举法',
    "1. 用先序遍历枚举二叉树中的每一个结点，同时用参数 deep 记录当前结点所在深度（根深度记为 0）。<br>"
    "2. 对枚举到的每个结点判断是否为叶结点（左右孩子均为空）。<br>"
    "3. 若是叶结点，就把 deep * weight 累加到全局变量 wpl 中。<br>"
    "4. 所有结点枚举完后，wpl 即为所求。",
    """typedef struct node{
    int weight;
    struct node *left, *right;
} BiNode, *BiTree;

int wpl = 0;                              // 全局累加带权路径长度

void preOrder(BiTree root, int deep)
{
    if (root == NULL) return;
    if (root->left == NULL && root->right == NULL)   // 只累加叶结点
        wpl += deep * root->weight;
    preOrder(root->left, deep + 1);       // 枚举左子树，深度加 1
    preOrder(root->right, deep + 1);      // 枚举右子树，深度加 1
}

int WPL(BiTree root)
{
    wpl = 0;
    preOrder(root, 0);                    // 根结点深度记为 0
    return wpl;
}""")

# ---------------- 2015 链表·绝对值去重：枚举法 ----------------
add('ds_code_2015', '枚举法',
    "1. 用指针 p 枚举链表中的每一个结点（第一层循环），用 pre 记住它的前驱。<br>"
    "2. 对每个 p，先算出它的绝对值 key = abs(p->data)。<br>"
    "3. 再用指针 q 从头枚举 p 之前的所有结点（第二层循环），检查是否存在绝对值也等于 key 的结点。<br>"
    "4. 若存在，说明 p 是重复结点，删除它（p 不后移，pre 不动）；若不存在，保留 p 并让 pre、p 一起后移。",
    """void deleteRepeat(LinkList head, int n)
{
    LNode *pre = head, *p = head->link;
    while (p != NULL)                     // 第一层：枚举每个结点 p
    {
        int key = abs(p->data);
        LNode *q = head->link;
        int dup = 0;
        while (q != p)                    // 第二层：枚举 p 之前的所有结点
        {
            if (abs(q->data) == key) { dup = 1; break; }
            q = q->link;
        }
        if (dup)                          // 之前出现过，删除 p
        {
            pre->link = p->link;
            free(p);
            p = pre->link;                // p 不后移，pre 不动
        }
        else                              // 第一次出现，保留
        {
            pre = p;
            p = p->link;
        }
    }
}""")

# ---------------- 2016 集合划分：快速排序 ----------------
add('ds_code_2016', '快速排序',
    "1. 要求 |n1-n2| 最小，则 n 个元素应分成 n/2 与 n-n/2 两组。<br>"
    "2. 又要求 |S1-S2| 最大，因此应把最小的 n/2 个元素放进一组、最大的放进另一组。<br>"
    "3. 先对数组调用快速排序，使其变为升序。<br>"
    "4. 枚举前一半下标累加得到 S1，枚举后一半下标累加得到 S2，返回 S2 - S1。",
    QSORT + """

int maxDiff(int A[], int n)
{
    Qsort(A, 0, n - 1);                   // 先排成升序
    int s1 = 0, s2 = 0;
    for (int i = 0; i < n / 2; i++)       // 枚举前一半（较小的元素）
        s1 += A[i];
    for (int i = n / 2; i < n; i++)       // 枚举后一半（较大的元素）
        s2 += A[i];
    return s2 - s1;                       // 升序下 S2 >= S1
}""")

# ---------------- 2017 表达式树转中缀：枚举法 ----------------
add('ds_code_2017', '枚举法',
    "1. 用中序遍历枚举表达式树中的每一个结点。<br>"
    "2. 对枚举到的每个结点判断：若是叶结点（左右孩子均为空），说明是操作数，直接输出。<br>"
    "3. 若是分支结点，说明是运算符，则按「左括号 + 左子树 + 运算符 + 右子树 + 右括号」的顺序输出。<br>"
    "4. 为写法最简，统一给每个运算符都加上括号（最朴素做法），保证运算次序一定正确，只是括号会多一些。",
    """void inOrder(BTree *root)
{
    if (root == NULL) return;
    if (root->left == NULL && root->right == NULL)   // 操作数，直接输出
    {
        printf("%s", root->data);
        return;
    }
    printf("(");                          // 运算符一律加括号，保证次序正确
    inOrder(root->left);
    printf("%s", root->data);
    inOrder(root->right);
    printf(")");
}""")

# ---------------- 2018 未出现的最小正整数：枚举法 ----------------
add('ds_code_2018', '枚举法',
    "1. n 个数最多只能填满 1~n，所以未出现的最小正整数一定在 1 到 n+1 之间。<br>"
    "2. 从小到大枚举正整数 i（1 ~ n+1），把它当作待判断的答案（第一层循环）。<br>"
    "3. 对每个 i，枚举整个数组 A，检查是否存在某个 A[j] 等于 i（第二层循环）。<br>"
    "4. 若整个数组都找不到 i，说明 i 就是未出现的最小正整数，直接返回。",
    """int findMissMin(int A[], int n)
{
    for (int i = 1; i <= n + 1; i++)      // 第一层：枚举可能的答案
    {
        int found = 0;
        for (int j = 0; j < n; j++)       // 第二层：枚举数组检查是否存在
            if (A[j] == i) { found = 1; break; }
        if (!found) return i;             // 第一个没出现的就是答案
    }
    return n + 1;
}""")

# ---------------- 2019 链表重排：枚举法 ----------------
add('ds_code_2019', '枚举法',
    "1. 第一遍枚举整个链表，把每个结点的值依次存入辅助数组 a[0..n-1]，同时统计结点个数 n。<br>"
    "2. 第二遍枚举每个下标 i（0 ~ n-1），按重排规律取数：i 为偶数时取前半段 a[i/2]，i 为奇数时取后半段的倒序 a[n-1-i/2]，依次放入 b。<br>"
    "3. 第三遍枚举链表的每个结点，把 b 中的新值依次写回结点的 data 域。",
    """void reOrder(LinkList head)
{
    int a[MAXSIZE], b[MAXSIZE], n = 0;
    LNode *p = head->next;
    while (p != NULL)                     // 第一遍：枚举链表，值存入数组
    {
        a[n++] = p->data;
        p = p->next;
    }
    int k = 0;
    for (int i = 0; i < n; i++)           // 第二遍：枚举每个位置，按规律取数
    {
        if (i % 2 == 0) b[k++] = a[i / 2];           // 偶数位取前半段
        else            b[k++] = a[n - 1 - i / 2];   // 奇数位取后半段倒序
    }
    p = head->next;
    for (int i = 0; i < n; i++)           // 第三遍：枚举链表，写回新值
    {
        p->data = b[i];
        p = p->next;
    }
}""")

# ---------------- 2020 三元组最小距离：枚举法 ----------------
add('ds_code_2020', '枚举法',
    "1. 三元组距离 D = |a-b| + |b-c| + |c-a|，可化简为 D = 2 * (max - min)。<br>"
    "2. 用三重循环枚举所有可能的组合：第一层枚举 S1 的元素 a，第二层枚举 S2 的元素 b，第三层枚举 S3 的元素 c。<br>"
    "3. 对每一种组合，取三者最大值 mx 与最小值 mn，算出 D = 2*(mx-mn)，若比当前最小值更小则更新。<br>"
    "4. 三层循环结束后返回最小值。",
    """int minDist(int S1[], int S2[], int S3[], int n)
{
    int ans = 0x7fffffff;                 // 初始化为无穷大
    for (int i = 0; i < n; i++)           // 第一层：枚举 a
        for (int j = 0; j < n; j++)       // 第二层：枚举 b
            for (int k = 0; k < n; k++)   // 第三层：枚举 c
            {
                int a = S1[i], b = S2[j], c = S3[k];
                int mx = max(max(a, b), c);
                int mn = min(min(a, b), c);
                int d = 2 * (mx - mn);    // D = 2*(max-min)
                if (d < ans) ans = d;     // 更新最小值
            }
    return ans;
}""")

# ---------------- 2021 EL 路径判定：枚举法 ----------------
add('ds_code_2021', '枚举法',
    "1. 用双重循环枚举邻接矩阵的每个元素：外层枚举行 i，内层枚举列 j，若 Edge[i][j] 不为 0 则顶点 i 的度加 1。<br>"
    "2. 枚举每个顶点的度数，统计度数为奇数的顶点个数 odd；若 odd 不是 0 也不是 2，直接返回 0。<br>"
    "3. 度数合法后还要判连通：从第一个非孤立顶点出发做 DFS，枚举统计能访问到的顶点数是否等于所有非孤立顶点数。<br>"
    "4. 奇数度顶点个数合法且图连通，返回 1，否则返回 0。",
    """int visited[MAXV];
int vcnt;                                 // DFS 访问到的顶点数

void DFS(MGraph G, int v)
{
    visited[v] = 1; vcnt++;
    for (int w = 0; w < G.numVertices; w++)      // 枚举所有顶点
        if (G.Edge[v][w] != 0 && !visited[w])
            DFS(G, w);
}

int IsExistEL(MGraph G)
{
    int degree[MAXV] = {0}, odd = 0;
    for (int i = 0; i < G.numVertices; i++)      // 枚举每一行
        for (int j = 0; j < G.numVertices; j++)  // 枚举每一列
            if (G.Edge[i][j] != 0) degree[i]++;  // 无向图统计度
    for (int i = 0; i < G.numVertices; i++)      // 枚举统计奇度顶点
        if (degree[i] % 2 == 1) odd++;
    if (odd != 0 && odd != 2) return 0;          // 奇度顶点数不合法
    int start = -1, all = 0;
    for (int i = 0; i < G.numVertices; i++)      // 枚举找第一个非孤立顶点
    {
        if (degree[i] > 0) { if (start == -1) start = i; all++; }
    }
    for (int i = 0; i < G.numVertices; i++) visited[i] = 0;
    vcnt = 0;
    DFS(G, start);                               // 检查是否连通
    return vcnt == all;
}""")

# ---------------- 2022 顺序存储二叉树判 BST：枚举法 ----------------
add('ds_code_2022', '枚举法',
    "1. 枚举数组中的每一个下标 i，跳过值为 -1 的空结点。<br>"
    "2. 对每个非空结点 i，递归枚举它左子树（下标 2i+1、2i+2 及其后代）中的每一个结点，检查是否都严格小于 T[i]。<br>"
    "3. 同样递归枚举它右子树中的每一个结点，检查是否都严格大于 T[i]。<br>"
    "4. 只要有一处不满足就返回 false，全部枚举完都满足则返回 true。",
    """bool checkLeft(int T[], int n, int i, int val)    // 枚举 i 左子树所有结点
{
    if (i >= n || T[i] == -1) return true;
    if (T[i] >= val) return false;                // 左子树必须都 < val
    return checkLeft(T, n, 2 * i + 1, val) && checkLeft(T, n, 2 * i + 2, val);
}

bool checkRight(int T[], int n, int i, int val)   // 枚举 i 右子树所有结点
{
    if (i >= n || T[i] == -1) return true;
    if (T[i] <= val) return false;                // 右子树必须都 > val
    return checkRight(T, n, 2 * i + 1, val) && checkRight(T, n, 2 * i + 2, val);
}

bool isBST(int T[], int ElemNum)
{
    for (int i = 0; i < ElemNum; i++)             // 枚举每个结点
    {
        if (T[i] == -1) continue;                 // 空结点跳过
        if (!checkLeft(T, ElemNum, 2 * i + 1, T[i]))  return false;
        if (!checkRight(T, ElemNum, 2 * i + 2, T[i])) return false;
    }
    return true;
}""")

# ---------------- 2023 K 顶点（出度>入度）：枚举法 ----------------
add('ds_code_2023', '枚举法',
    "1. 用双重循环枚举邻接矩阵的每个元素：外层枚举行 i，内层枚举列 j。<br>"
    "2. 若 Edge[i][j] 不为 0，说明有一条 i 指向 j 的边，则顶点 i 的出度加 1，顶点 j 的入度加 1。<br>"
    "3. 枚举完整个矩阵后，再枚举每个顶点，把出度大于入度的顶点（K 顶点）输出并计数。<br>"
    "4. 返回 K 顶点的个数。",
    """int printVertices(MGraph G)
{
    int outD[MAXV] = {0}, inD[MAXV] = {0};
    for (int i = 0; i < G.numVertices; i++)       // 枚举每一行
        for (int j = 0; j < G.numVertices; j++)   // 枚举每一列
            if (G.Edge[i][j] != 0)
            {
                outD[i]++;                        // 行 = 出度
                inD[j]++;                         // 列 = 入度
            }
    int cnt = 0;
    for (int i = 0; i < G.numVertices; i++)       // 枚举每个顶点找 K 顶点
        if (outD[i] > inD[i])
        {
            printf("%c ", G.VerticesList[i]);     // 输出 K 顶点
            cnt++;
        }
    return cnt;                                   // 返回 K 顶点个数
}""")

# ---------------- 2024 唯一拓扑序列：枚举法 ----------------
add('ds_code_2024', '枚举法',
    "1. 先枚举邻接矩阵的每一列，统计每个顶点的入度（列和即入度）。<br>"
    "2. 每一轮枚举所有顶点，找出当前入度为 0 的顶点：若找到的个数大于 1，说明拓扑序列不唯一，返回 0；若一个都没有，说明有环，返回 0。<br>"
    "3. 若恰好找到一个，输出它，并枚举它的所有邻接点把它们的入度减 1（相当于删除它发出的边），同时把它标记为已输出。<br>"
    "4. 重复 n 轮，若每轮都恰好只有一个入度为 0 的顶点，则拓扑序列唯一，返回 1。",
    """int uniquely(MGraph G)
{
    int n = G.numVertices;
    int inD[MAXV] = {0};
    for (int j = 0; j < n; j++)                   // 枚举每一列
        for (int i = 0; i < n; i++)               // 枚举每一行
            if (G.Edge[i][j] != 0) inD[j]++;      // 列和 = 入度
    for (int k = 0; k < n; k++)                   // 共 n 轮
    {
        int cnt = 0, v = -1;
        for (int i = 0; i < n; i++)               // 枚举所有顶点找入度为 0 的
            if (inD[i] == 0) { cnt++; v = i; }
        if (cnt != 1) return 0;                   // 0 个=有环；多于 1 个=不唯一
        printf("%c ", G.VerticesList[v]);
        inD[v] = -1;                              // 标记已输出，不再参与
        for (int j = 0; j < n; j++)               // 枚举删除 v 发出的边
            if (G.Edge[v][j] != 0) inD[j]--;
    }
    return 1;                                     // 每轮唯一，拓扑序列唯一
}""")

# ---------------- 2025 res[i]=max A[i]*A[j](j>=i)：枚举法 ----------------
add('ds_code_2025', '枚举法',
    "1. 用双重循环枚举所有满足 0 <= i <= j <= n-1 的下标对：外层枚举 i，内层枚举 j 从 i 到 n-1。<br>"
    "2. 对每一对下标 (i, j) 计算乘积 A[i] * A[j]。<br>"
    "3. 用 res[i] 记录当前 i 对应的最大乘积，若新算出的乘积更大就更新 res[i]。<br>"
    "4. 两层循环结束后，res 数组即为所求。",
    """void calcMax(int A[], int res[], int n)
{
    for (int i = 0; i < n; i++)                   // 第一层：枚举每个起点 i
    {
        res[i] = A[i] * A[i];                     // 初始取 j == i 的情况
        for (int j = i + 1; j < n; j++)           // 第二层：枚举 j（j >= i）
        {
            int t = A[i] * A[j];
            if (t > res[i]) res[i] = t;           // 取最大值
        }
    }
}""")

# ---------------- 2026 BST 找与 k 最接近的结点：枚举法 ----------------
add('ds_code_2026', '枚举法',
    "1. 用递归遍历枚举二叉搜索树中的每一个结点（先序、中序、后序均可）。<br>"
    "2. 对枚举到的每个结点，计算它与 k 的差值绝对值 d = abs(root->data - k)。<br>"
    "3. 若 d 比当前记录的最小差值小，则更新最小差值，并清空已有答案、把该结点记为答案。<br>"
    "4. 若 d 与最小差值相等，说明存在并列，也把该结点加入答案。<br>"
    "5. 遍历完整棵树后，输出最小差值以及所有答案结点的关键字值。",
    """int minGap = 0x7fffffff;                      // 全局最小差值
BTNode* ans[MAXSIZE];
int cnt = 0;

void SearchX(BTNode *root, int k)
{
    if (root == NULL) return;
    int d = abs(root->data - k);                 // 计算与 k 的差值
    if (d < minGap)                              // 发现更小的差值，重新记录
    {
        minGap = d;
        cnt = 0;
        ans[cnt++] = root;
    }
    else if (d == minGap)                        // 差值并列，一并记录
        ans[cnt++] = root;
    SearchX(root->left, k);                      // 枚举左子树
    SearchX(root->right, k);                     // 枚举右子树
}""")


# ============ 写入 ============
def main():
    with open(PATH, encoding='utf-8') as f:
        data = json.load(f)
    qs = data['questions']
    hit, miss = [], []
    for q in qs:
        qid = q['id']
        if qid in BRUTE:
            q['brute'] = BRUTE[qid]
            hit.append(qid)
        else:
            miss.append(qid)
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('已写入 brute:', len(hit))
    print('未匹配:', miss)
    # 校验
    d2 = json.load(open(PATH, encoding='utf-8'))
    print('JSON 合法，questions:', len(d2['questions']))
    print('含 brute 的题数:', sum(1 for q in d2['questions'] if q.get('brute')))
    from collections import Counter
    print('方法分布:', Counter(q['brute']['method'] for q in d2['questions'] if q.get('brute')))


if __name__ == '__main__':
    main()
