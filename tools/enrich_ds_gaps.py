# -*- coding: utf-8 -*-
"""ds 笔记"照例优化"(对计网流程的 ds 版):
1) 教材全量补缺:1.1.2 数据类型三分类、1.2.2 渐近复杂度引入原因(教材有、笔记缺)
2) 对比表格化:3.3.2 三表达式 / 5.3.1 四遍历 / 6.2.4 四存储结构 / 6.3.2 BFS-DFS /
   7.2.3 三查找 / 4.2.2 BF-KMP 等"几类东西对比"列表 → 真表格
幂等:重复跑不重复追加。
"""
import json, re, sys

P = "pwa/data/notes/ds_notes.json"
d = json.load(open(P, encoding="utf-8"))

# ---------- 1) 教材全量补缺块 ----------
GAP = {
"1.1.2 数据结构三要素": """<h4>📌 教材全量补全</h4><ul><li><b>数据类型（教材三分类，笔记原缺）</b>：数据类型 = <b>一个值的集合 ＋ 定义在该集合上的一组操作</b> 的总称。分三类：<ul><li><b>原子类型</b>：其值<b>不可再分</b>的数据类型（如 int）；</li><li><b>结构类型</b>：其值可<b>进一步分解为若干成分（分量）</b>的数据类型（如结构体）；</li><li><b>抽象数据类型（ADT）</b>：一个数学模型以及定义在该模型上的一组操作——对数据的一种抽象，规定了<b>取值范围、结构形式、可执行的操作集合</b>（如栈/队列就是 ADT）。</li></ul></li><li><b>数据对象 vs 数据类型（易混）</b>：数据对象是<b>值的集合</b>（同类元素的集合）；数据类型是<b>值集合＋操作</b>——多了一个操作维度。</li><li><b>逻辑结构与存储结构的关系（教材原话）</b>：<b>算法的设计取决于逻辑结构，算法的实现取决于存储结构</b>；存储结构不能独立于逻辑结构而存在（逻辑结构是抽象描述，存储结构是其在计算机中的映射）。</li></ul>""",
"1.2.2 算法效率的度量": """<h4>📌 教材全量补全</h4><ul><li><b>为什么要用渐近复杂度（教材引入理由）</b>：算法<b>实际运行时间受硬件、编译器、语言等因素影响</b>，无法作为通用比较标准 → 引入<b>渐近复杂度分析</b>：用时间复杂度/空间复杂度<b>抽象描述算法随问题规模 n 增长的资源消耗趋势</b>（只关心增长最快的项，忽略低阶项与常数系数）。</li><li><b>语句频度 T(n)</b>：算法执行时间通常由<b>语句频度</b>（某条语句的执行次数）衡量；设所有语句频度之和为 T(n)，它是问题规模 n 的函数，T(n) 中增长最快的项决定渐近复杂度。</li><li><b>正确性只是基础、效率才是关键指标</b>（教材强调）：评价算法先看正确性，再用渐近复杂度衡量效率优劣。</li></ul>""",
}

# ---------- 2) 对比表格块 ----------
TBL = {
"3.3.2 栈在表达式求值中的应用": """<h4>三种表达式对比（必背表格）</h4><table class="mc-table"><tr><th>表达式</th><th>形式（例）</th><th>括号/优先级</th><th>求值方式</th></tr><tr><td>中缀</td><td>a+b×c</td><td>需要括号与优先级规则</td><td>人习惯的写法；机器需转换后再求值</td></tr><tr><td>后缀（逆波兰）</td><td>abc×+</td><td>无括号、无优先级歧义</td><td><b>从左到右扫一遍</b>：操作数进栈，遇运算符弹两操作数运算再压回</td></tr><tr><td>前缀（波兰）</td><td>+a×bc</td><td>无括号、无优先级歧义</td><td>从右到左扫（与后缀对称）</td></tr></table>""",
"5.3.1 二叉树的遍历": """<h4>四种遍历对比（必背表格）</h4><table class="mc-table"><tr><th>遍历</th><th>访问顺序（N=根 L=左 R=右）</th><th>实现工具</th><th>典型应用</th></tr><tr><td>先序 NLR</td><td>根 → 左 → 右</td><td>递归 / 栈（弹栈时访问）</td><td>复制二叉树；先序序列首元素 = 根</td></tr><tr><td>中序 LNR</td><td>左 → 根 → 右</td><td>递归 / 栈（沿左链下压）</td><td><b>BST 中序 = 递增序列</b>；中序配合先/后序可唯一确定二叉树</td></tr><tr><td>后序 LRN</td><td>左 → 右 → 根</td><td>递归 / 栈（需记录右孩子是否已访问或双栈法）</td><td>求树高、自底向上计算（表达式求值树的后序遍历）</td></tr><tr><td>层序</td><td>按层从左到右</td><td><b>队列</b></td><td>判完全二叉树（入队含空指针）；层序序列首个 = 根</td></tr></table>""",
"6.2.4 邻接多重表": """<h4>四种图存储结构对比（必背表格）</h4><table class="mc-table"><tr><th>结构</th><th>适用图</th><th>空间</th><th>求度/特点</th></tr><tr><td>邻接矩阵</td><td>有向/无向</td><td>O(n²)（与边数无关）→ <b>稠密图</b></td><td>表示唯一；行=出度、列=入度；Aᵏ[i][j]=长度 k 路径数</td></tr><tr><td>邻接表</td><td>有向/无向</td><td>O(V+E) → <b>稀疏图</b></td><td>表示不唯一；无向图边结点 2E；有向图求入度需扫全表</td></tr><tr><td>十字链表</td><td><b>有向图专用</b></td><td>O(V+E)</td><td>弧结点同时挂入弧链＋出弧链，<b>入度出度都方便</b></td></tr><tr><td>邻接多重表</td><td><b>无向图专用</b></td><td>O(V+E)</td><td>每条边只存 1 个结点被两顶点共享，<b>删边/标记边方便</b></td></tr></table>""",
"6.3.2 深度优先搜索": """<h4>BFS vs DFS 对比（必背表格）</h4><table class="mc-table"><tr><th>维度</th><th>BFS（广度优先）</th><th>DFS（深度优先）</th></tr><tr><td>思想</td><td>类似<b>树的层次遍历</b>，逐层扩展</td><td>类似<b>树的先序遍历</b>，一路到底再回退</td></tr><tr><td>辅助结构</td><td><b>队列</b></td><td><b>栈（递归系统栈/显式栈）</b></td></tr><tr><td>辅助空间</td><td>O(队列宽度)</td><td>O(深度)</td></tr><tr><td>序列</td><td>不唯一（起点＋存储次序决定）</td><td>不唯一；<b>邻接矩阵＋固定起点时唯一</b></td></tr><tr><td>典型应用</td><td><b>无权图最短路径</b>（按层天然最短）、连通分量计数</td><td>判环、<b>拓扑排序（逆后序）</b>、强连通分量（Kosaraju）</td></tr></table>""",
"7.2.3 分块查找": """<h4>三种查找方法对比（必背表格）</h4><table class="mc-table"><tr><th>方法</th><th>前提</th><th>平均查找长度 ASL（等概率）</th><th>时间</th><th>适用</th></tr><tr><td>顺序查找</td><td>无要求（无序也可）</td><td>(n+1)/2；失败 n+1</td><td>O(n)</td><td>小表、无序表、链式存储</td></tr><tr><td>折半查找</td><td><b>顺序存储＋有序</b></td><td>⌈log₂(n+1)⌉ 层判定树加权；失败 n+1 个外部结点</td><td>O(log₂n)</td><td>静态有序表（不可插删频繁）</td></tr><tr><td>分块查找</td><td>块间有序、块内可无序</td><td>查索引＋查块内；<b>s=√n 时最小 ≈√n+1</b></td><td>O(√n)</td><td>块间插删不频繁、块内变动多的场景</td></tr></table>""",
"4.2.2 串的模式匹配算法——KMP算法": """<h4>BF vs KMP vs KMP优化对比（必背表格）</h4><table class="mc-table"><tr><th>算法</th><th>主串指针</th><th>模式串指针回退依据</th><th>最坏时间</th><th>特点</th></tr><tr><td>BF 暴力</td><td><b>回溯</b>到本趟起点下一位置</td><td>回到开头</td><td>O(nm)</td><td>简单直观；主串指针回溯是低效根源</td></tr><tr><td>KMP</td><td><b>不回溯</b></td><td>按 next[j] 移动</td><td><b>O(n+m)</b></td><td>利用模式串自身最长相等前后缀；大量部分匹配时才显著优于 BF</td></tr><tr><td>KMP 优化（nextval）</td><td>不回溯</td><td>按 nextval[j]（tⱼ==t[next[j]] 时递归改小）</td><td>O(n+m)</td><td>避免 tⱼ 与 t[next[j]] 相同导致的必然失配</td></tr></table>""",
}

def find_ss(sec):
    for c in d["chapters"]:
        for s in c["sections"]:
            for ss in s.get("subsections", []):
                if ss["section"].strip() == sec:
                    return ss
    return None

def run(dry=False):
    done_gap, done_tbl, miss = [], [], []
    # 1) 教材补缺块:追加到小节末尾
    for sec, html in GAP.items():
        ss = find_ss(sec)
        if not ss:
            miss.append("gap:" + sec); continue
        h = ss.get("html") or ""
        if "📌 教材全量补全" in h:
            continue
        ss["html"] = h + html
        done_gap.append(sec)
    # 2) 对比表格:插到该小节题库块之前(若无题库块则追加末尾)
    for sec, html in TBL.items():
        ss = find_ss(sec)
        if not ss:
            miss.append("tbl:" + sec); continue
        h = ss.get("html") or ""
        if "<table class=\"mc-table\">" in h and "三种表达式对比" in h or \
           ("对比（必背表格）" in h and "<table" in h):
            # 幂等:含同名表格标题则跳过
            title = html.split("</h4>")[0].replace("<h4>", "")
            if title in h:
                continue
        i = h.find("<h4>📌 题库考点补充</h4>")
        if i >= 0:
            ss["html"] = h[:i] + html + h[i:]
        else:
            ss["html"] = h + html
        done_tbl.append(sec)
    print(f"教材补缺: {len(done_gap)} 处 {done_gap}")
    print(f"对比表格: {len(done_tbl)} 处 {done_tbl}")
    print(f"未命中: {miss if miss else '无'}")
    if not dry:
        out = json.dumps(d, ensure_ascii=False, indent=2) + "\n"
        open(P, "wb").write(out.encode("utf-8"))
        print("已写入", P)

if __name__ == "__main__":
    run(dry="--dry" in sys.argv)
