# -*- coding: utf-8 -*-
"""模拟卷（七）重排：图题裁图+fig-img、表格题 HTML table、代码题重写、OCR 噪声清理。
输入 zt_mock7.json（inject_mock7_ans.py 之后），原地写回。

图：zt_img/zt_mock7_{7,46,47,47b}.png
  - 7：题7 AVL树（合订本 p64 矢量裁切，fitz 4x）
  - 46：题46 成组链接法空闲盘块图（p71 xref424）
  - 47：题47 IP数据报十六进制表（p72 xref431）
  - 47b：题47 IP/TCP 首部结构图（p72 xref432）
题15 页表、题44 汇编表/bne 格式按规范文字化为 HTML table。
约束：只自绘/裁真图，文字全部提取；fig-img 放大走 common.js lightbox。
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock7.json')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def fig(n, alt):
    return ('<figure class="struct-fig" data-fig="1">'
            '<img class="fig-img" src="data/zt_img/zt_mock7_%s.png" alt="%s" style="cursor:zoom-in">'
            '</figure>' % (n, esc(alt)))


def table(headers, rows):
    h = '<thead><tr>' + ''.join('<th>%s</th>' % x for x in headers) + '</tr></thead>'
    b = '<tbody>' + ''.join('<tr>' + ''.join('<td>%s</td>' % x for x in row) + '</tr>' for row in rows) + '</tbody>'
    return '<table>' + h + b + '</table>'


# ============ 题干覆盖 ============
Q = {}

# 题7：AVL树真图（引导后插图，字母非关键字）
Q[7] = ('<p>右图所示为一棵平衡二叉树（字母不是关键字），在结点D 的右子树上插入结点F 后，'
         '会导致该平衡二叉树失去平衡，则调整后的平衡二叉树中平衡因子的绝对值为1 的分支'
         '结点数为（ ）。</p>' + fig('7', '题7 平衡二叉树（根A，左B，右C，C的左E右D）'))

# 题9：首行含 int/buf 被误判 pre，回退正文
Q[9] = ('<p>设对数组𝐴[1 ⋯𝑛] 进行折半插入排序（升序）。对于第𝑖（𝑖=2,3,⋯,𝑛）个元素key，'
        '先在已排序子数组𝐴[1 ⋯𝑖−1] 中使用二分查找确定其插入位置。在二分查找过程中，每次执行'
        '比较操作𝐴[mid]&gt;key 记为1 次比较，其中mid=⌊(low+high)/2⌋（向下取整），且不统计循环'
        '控制、边界判断、赋值与元素移动等操作的次数。给定待排序序列为{6,2,9,1,5}，则整个折半'
        '插入排序过程中，比较操作𝐴[mid]&gt;key 的总执行次数为（ ）。</p>')

# 题12：首行误判 pre，回退正文
Q[12] = ('<p>在某32 位计算机中，全局变量buf 的声明为int buf[4]={−2,103,−10,−20};，'
         '假定buf 的地址为0x8049320，则地址0x804932a 中的内容为（ ）。</p>')

# 题15：页表 HTML table（从题干压行数据还原）
Q[15] = ('<p>在页面尺寸为4KB 的页式存储器中，按字节编址，页表中的内容如下表所示，则物理地址'
         '32773 对应的逻辑地址为（ ）。（本题中的所有数字均为十进制数。）</p>'
         + table(['虚页号', '页框号', '有效位', '虚页号', '页框号', '有效位'], [
             ['0', '2', '1', '3', '8', '1'],
             ['1', '5', '1', '4', '7', '1'],
             ['2', '7', '0', '5', '11', '1'],
         ]))

# 题44：汇编代码文字化表格 + bne 指令格式表 + 四问
ASM_ROWS = [
    ['1', '00003000H', '00000820H', 'add R1,R0,R0', '0→R1'],
    ['2', '00003004H', '00012880H', 'sll R5,R1,2', '(R1)≪2→R5'],
    ['3', '00003008H', '00A32820H', 'add R5,R5,R3', '(R5)+(R3)→R5'],
    ['4', '0000300CH', '8CA60000H', 'lw R6,0(R5)', '((R5)+0)→R6'],
    ['5', '00003010H', '00461020H', 'add R2,R2,R6', '(R2)+(R6)→R2'],
    ['6', '00003014H', '20210001H', 'addi R1,R1,1', '(R1)+1→R1'],
    ['7', '00003018H', '28240005H', 'slti R4,R1,5', '若(R1)&lt;5 则1→R4'],
    ['8', '0000301CH', '1480FFF9H', 'bne R4,R0,loop', '若(R4)≠0 则转loop'],
]
Q[44] = ('<p>某C 程序中包含代码for(i=0;i&lt;5;i++) j=j+B[i];，假设编译时变量i、j 分别保存在'
         '寄存器R1 和R2 中，int 型数组B 的首地址分配在寄存器R3 中，这段代码对应的汇编代码和'
         '机器代码如下表所示。</p>'
         + table(['编号', '地址', '机器代码', '汇编代码', '注释'], ASM_ROWS)
         + '<p>这段代码在某台主频为100MHz 且采用32 位定长指令字的计算机上运行，其中的bne 指令'
         '格式如下表所示。</p>'
         + '<div class="bne-format"><table><thead><tr>'
         + ''.join('<th>%s</th>' % x for x in ['OP(31–26)', 'Rs(25–21)', 'Rt(20–16)', 'OFFSET(15–0)'])
         + '</tr></thead></table></div>'
         + '<p>OP 为操作码，Rs 和Rt 为寄存器编号，OFFSET 为偏移量，用补码表示。回答下列问题。</p>'
         + '<p>1）该计算机的CPU 中包含多少个通用寄存器？存储器编址单位是多少？<br/>'
         '2）bne 指令采用相对寻址，OFFSET 部分存放的是字偏移量，给出指令中loop 指向的地址。<br/>'
         '3）该计算机的各类指令所花费的时钟周期数如下：运算类指令4 个，分支跳转类指令3 个，'
         '访存类指令（可以包含计算）5 个，计算这段代码的平均CPI、MIPS 及总执行时间。<br/>'
         '4）若该计算机采用五级流水线，且硬件不使用任何转发措施，则bne 指令的执行会引起两个'
         '时钟周期的阻塞。这段代码中哪些编号的指令执行会由于数据相关导致阻塞？哪些编号的指令'
         '执行会引起控制相关？</p>')

# 题46：成组链接法真图（引导语后插图）
Q[46] = ('<p>某系统采用成组链接法来管理磁盘的空闲空间，当前磁盘的状态如下图所示。</p>'
         + fig('46', '题46 成组链接法空闲盘块结构')
         + '<p>1）该磁盘中目前还有多少个空闲盘块？<br/>'
         '2）在为某个文件F1 分配3 个盘块后，写出空闲盘块号栈的栈顶盘块号。<br/>'
         '3）在上一问的基础上，删除另一文件F2 并回收它所占的5 个盘块，盘块号分别是700，711，'
         '703，788，701，写出回收后空闲盘块号栈的栈顶指针的值和空闲盘块号。</p>')

# 题47：IP数据报表 + IP/TCP 首部结构图
Q[47] = ('<p>本地主机A 的一个应用程序使用TCP 与同一个局域网内的另一台主机B 通信。用Sniffer '
         '工具捕获主机A 以太网发送和接收的所有通信流量，目前已得到8 个IP 数据报。下表以十六进制'
         '数据格式逐字节列出了这些IP 数据报的全部内容，其中编号2、3、6 为主机A 接收的IP 数据报，'
         '其余为主机A 发送的IP 数据报。假定所有数据报的IP 和TCP 检验和均是正确的。</p>'
         + fig('47', '题47 八个IP数据报的十六进制内容表')
         + '<p>注意，IP 分组头结构和TCP 段头结构分别如图1 和图2 所示。协议域为1、6、17、89，'
         '它们分别对应ICMP、TCP、UDP、OSPF 协议。</p>'
         + fig('47b', '题47 图1 IP分组头结构与图2 TCP段头结构')
         + '<p>本题中窗口域描述窗口时使用的计量单位为1B。回答下列问题。<br/>'
         '1）在表所示的IP 分组中，哪几个分组完成了TCP 连接建立过程中的三次握手？根据三次握手'
         '报文提供的信息，连接建立后，如果B 发送数据给A，那么首字节的编号是多少？<br/>'
         '2）根据表中的IP 分组，A 上的应用程序已经请求TCP 发送的应用层数据的总字节是多少？<br/>'
         '3）若在8 号IP 分组后，B 正确接收了A 发送的所有IP 分组，则B 新送给A 的TCP 报文段中的'
         '确认号应当是多少（十六进制数）？若在8 号IP 分组后，A 上的应用程序请求TCP 发送新的'
         '65495B 的应用层数据，则按TCP，在A 未能得到B 的任何确认报文之前，TCP 可以发送到'
         '网络中的应用层数据最多是多少字节？</p>')

# ============ 解析覆盖 ============
AN = {}

# 题4：next 数组推导图散字清理，保留逐步推导结论
AN[4] = ('<div class="analysis-content">'
         '<p>【解析】本题考查串的next数组。设next[1]=0，next[2]=1。按 next 定义逐步推导（j 从3 到5）：</p>'
         '<p>• j=3：k=next[2]=1，比较S[2]=c 与S[1]=a，不等，k=next[1]=0，故 next[3]=1。<br/>'
         '• j=4：k=next[3]=1，比较S[3]=a 与S[1]=a，相等，故 next[4]=k+1=2。<br/>'
         '• j=5：k=next[4]=2，比较S[4]=b 与S[2]=c，不等，k=next[2]=1；再比较S[4]=b 与S[1]=a，'
         '仍不等，k=next[1]=0，故 next[5]=1。</p>'
         '<p>所以串 acaba 的 next 数组值为 0 1 1 2 1。答案D。</p></div>')

# 题24：临界区算法伪代码重写，去掉 OCR 乱码
AN[24] = ('<div class="analysis-content">'
          '<p>【解析】本题考查进程的同步与互斥。将两进程的代码规整如下（i=0 或1，j=1−i）：</p>'
          '<pre><code>P(i):\n'
          '    do {\n'
          '        retry: if (turn != i) turn = i;\n'
          '               if (turn != i) goto retry;\n'
          '               // 临界区\n'
          '               turn = j;\n'
          '               // 剩余区\n'
          '    } while (true);</code></pre>'
          '<p>该算法不能保证互斥：当执行顺序为 P0 的①、P1 的④、P1 的⑤(turn=0)、'
          'P0 的②、P1 的②、P0 的③ 时，两个进程会同时进入临界区。</p>'
          '<p>注意：本题不算“饥饿”。饥饿是由资源分配策略本身不公平造成的等待无上界；'
          '本题中两进程地位平等、策略公平，只有极特殊的推进序列才出现长时间等待，'
          '不具备策略性的不公平，故不选饥饿相关说法。</p></div>')

# 题28：LRU 置换表（物理块3和4）从解析册还原，去 OCR 乱码
AN[28] = ('<div class="analysis-content">'
          '<p>【解析】本题考查页面置换的相关计算。访问串：1,3,2,1,1,3,5,1,3,2,1,5。</p>'
          '<p>当物理块数为3 时，采用LRU，缺页6次，缺页率6/12=50%。按访问顺序模拟：'
          '1(缺)、3(缺)、2(缺)、1(命中)、1(命中)、3(命中)、5(缺，淘汰2)、1(命中)、'
          '3(命中)、2(缺，淘汰5)、1(命中)、5(缺，淘汰3)。</p>'
          '<p>当物理块数为4 时，作业请求页面序列只有4 个不同页面（1,2,3,5），前4次访问'
          '依次装入后均命中，故缺页4次，缺页率4/12=33%，无需逐项列表。</p></div>')

# 题42：孩子兄弟链表定义 + 求树的度算法代码重写
AN[42] = ('<div class="analysis-content">'
          '<p>1）孩子兄弟链表结点定义：</p>'
          '<pre><code class="language-c">typedef struct node {\n'
          '    int data;\n'
          '    struct node *firstchild, *nextbro;\n'
          '} TNode;</code></pre>'
          '<p>2）结点p 的度 = 1 + p 的第一个孩子之后沿 nextbro 链的兄弟数。对树做后序遍历：'
          '沿 firstchild 递归时度d 不增加，沿 nextbro 递归时度d 加1；对每个结点求得其度，'
          '取最大值即为树T 的度。</p>'
          '<pre><code class="language-c">int degree = 0;  // 全局变量，最终输出树T的度\n'
          'int Post(TNode *p) {          // 后序遍历\n'
          '    if (p == NULL) return 0;  // 该结点不存在\n'
          '    Post(p-&gt;firstchild);        // 先递归处理孩子子树\n'
          '    int d = 1 + Post(p-&gt;nextbro); // 每经过一个兄弟度加1\n'
          '    if (d &gt; degree) degree = d;\n'
          '    return d;\n'
          '}</code></pre></div>')

# 题45：PV 同步代码重写（三进程两缓冲区）
AN[45] = ('<div class="analysis-content">'
          '<p>【解析】PA 与PB 共用缓冲区1，PB 与PC 共用缓冲区2，是两级生产者-消费者问题。'
          '设信号量 empty1、empty2 表示缓冲区是否为空（初值1），full1、full2 表示是否有记录'
          '可供处理（初值0）。</p>'
          '<pre><code class="language-c">semaphore empty1 = 1, empty2 = 1;\n'
          'semaphore full1 = 0, full2 = 0;\n'
          'cobegin\n'
          'process PA() {                 // 从磁盘读入→缓冲区1\n'
          '    while (TRUE) {\n'
          '        从磁盘读入一条记录;\n'
          '        P(empty1);\n'
          '        将记录存入缓冲区1;\n'
          '        V(full1);\n'
          '    }\n'
          '}\n'
          'process PB() {                 // 缓冲区1→缓冲区2\n'
          '    while (TRUE) {\n'
          '        P(full1);\n'
          '        从缓冲区1取出一条记录;\n'
          '        V(empty1);\n'
          '        P(empty2);\n'
          '        将取出的记录存入缓冲区2;\n'
          '        V(full2);\n'
          '    }\n'
          '}\n'
          'process PC() {                 // 缓冲区2→打印\n'
          '    while (TRUE) {\n'
          '        P(full2);\n'
          '        从缓冲区2取出一条记录;\n'
          '        V(empty2);\n'
          '        将取出的记录打印出来;\n'
          '    }\n'
          '}\n'
          'coend</code></pre></div>')


def strip_stale(it):
    it['q'] = it['q'].replace('\x00', '')
    it['an'] = it['an'].replace('\x00', '')


def main():
    d = json.load(open(F, encoding='utf-8'))
    for it in d['items']:
        n = it['i']
        if n in Q:
            it['q'] = Q[n]
        else:
            strip_stale(it)
        if n in AN:
            it['an'] = AN[n]
        else:
            it['an'] = it['an'].replace('\x00', '')
    with open(F, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print('题数', len(d['items']))
    for n in [7, 15, 44, 46, 47]:
        it = d['items'][n - 1]
        print('题%d q长=%d fig=%d table=%d pre=%d' % (
            n, len(it['q']), it['q'].count('fig-img'), it['q'].count('<table'), it['q'].count('<pre')))
    for n in [4, 24, 28, 42, 45]:
        it = d['items'][n - 1]
        print('题%d an长=%d anpre=%d' % (n, len(it['an']), it['an'].count('<pre')))


if __name__ == '__main__':
    main()
