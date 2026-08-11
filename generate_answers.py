"""
答案生成/管理工具
用法: python generate_answers.py
功能: 为已解析的题目生成标准答案
"""
import os
import json
from config import QUESTIONS_DIR, SUBJECTS


def load_questions(subject_key):
    """加载题库"""
    json_file = os.path.join(QUESTIONS_DIR, SUBJECTS[subject_key]['json'])
    with open(json_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_questions(subject_key, data):
    """保存题库"""
    json_file = os.path.join(QUESTIONS_DIR, SUBJECTS[subject_key]['json'])
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def apply_answers(subject_key, answers_dict):
    """
    将答案字典应用到题库
    answers_dict: {question_id: {"answer": "X", "explanation": "..."}}
    """
    data = load_questions(subject_key)
    applied = 0
    
    for q in data['questions']:
        if q['id'] in answers_dict:
            info = answers_dict[q['id']]
            q['answer'] = info.get('answer', q['answer'])
            q['explanation'] = info.get('explanation', q['explanation'])
            applied += 1
    
    save_questions(subject_key, data)
    return applied


def generate_os_answers():
    """操作系统答案"""
    # 基于王道操作系统标准答案
    answers = {
        "os_0001": {"answer": "C", "explanation": "操作系统是对计算机资源（包括硬件和软件资源）进行管理的系统软件。"},
        "os_0002": {"answer": "D", "explanation": "操作系统管理CPU、内存、外存等硬件资源，源程序属于用户文件，不是操作系统直接管理的系统资源。"},
        "os_0003": {"answer": "D", "explanation": "操作系统关心裸机管理、用户界面设计和系统资源管理，编译器属于系统软件但不属于操作系统的职责。"},
        "os_0004": {"answer": "D", "explanation": "操作系统的基本功能是控制和管理系统内的各种资源，包括处理机管理、存储管理、设备管理和文件管理。"},
        "os_0005": {"answer": "C", "explanation": "并发性是指若干事件在同一时间间隔内发生，注意与'并行'（同一时刻）的区别。"},
        "os_0006": {"answer": "B", "explanation": "系统调用只能通过用户程序间接使用，用户程序通过陷入指令(trap)发起系统调用。"},
        "os_0007": {"answer": "D", "explanation": "操作系统是用来管理系统资源的，而不是用来编程的。编程由编译器等工具支持。"},
        "os_0008": {"answer": "C", "explanation": "所有库函数并非都依赖系统调用，如字符串处理函数strcpy在用户态即可完成，不需要系统调用。"},
        "os_0009": {"answer": "B", "explanation": "操作系统的基本类型包括批处理操作系统、分时操作系统和实时操作系统。"},
        "os_0010": {"answer": "B", "explanation": "实时操作系统必须在被控制对象规定的时间内处理外部事件，这是实时性的核心要求。"},
        "os_0011": {"answer": "A", "explanation": "分时系统主要用于交互式作业，而非批处理作业。批处理系统才是用于批处理作业的。"},
        "os_0012": {"answer": "D", "explanation": "代码可重入使得多个用户可以共享同一段代码，有利于改善分时系统的响应时间。"},
        "os_0013": {"answer": "D", "explanation": "分时系统中，时间片大小的确定不需要考虑计算机的规模，主要考虑用户数、响应时间要求等。"},
        "os_0014": {"answer": "B", "explanation": "实时系统的主要特点是及时性和可靠性，系统需要在规定时间内对外部事件做出响应。"},
        "os_0015": {"answer": "C", "explanation": "操作系统属于系统软件，是最基本的系统软件，管理计算机的所有资源。"},
        "os_0016": {"answer": "A", "explanation": "多道程序设计引入了中断技术，使得CPU可以在I/O操作时转去执行其他程序。"},
        "os_0017": {"answer": "C", "explanation": "操作系统的基本特征包括并发性、共享性、虚拟性和异步性，其中并发和共享是最基本的特征。"},
        "os_0018": {"answer": "D", "explanation": "操作系统中最基本的两个特征是并发和共享，它们互为存在条件。"},
        "os_0019": {"answer": "B", "explanation": "特权指令只能在核心态下执行，用户态下执行特权指令会引发中断（异常）。"},
        "os_0020": {"answer": "C", "explanation": "用户态到核心态的转换通过中断/异常/系统调用触发，是由硬件完成的。"},
        "os_0021": {"answer": "D", "explanation": "中断处理程序属于操作系统内核程序，运行在核心态。"},
        "os_0022": {"answer": "A", "explanation": "进程是资源分配的基本单位，也是程序执行的动态过程。"},
        "os_0023": {"answer": "C", "explanation": "进程的基本特征包括动态性、并发性、独立性、异步性和结构性。动态性是进程最基本的特征。"},
        "os_0024": {"answer": "B", "explanation": "进程控制块(PCB)是进程存在的唯一标志，系统通过PCB来管理和控制进程。"},
        "os_0025": {"answer": "D", "explanation": "进程与程序的根本区别在于动态性：进程是动态的，程序是静态的。"},
        "os_0026": {"answer": "B", "explanation": "进程的就绪态是指进程已获得除CPU外的所有必要资源，等待CPU调度。"},
        "os_0027": {"answer": "C", "explanation": "处于就绪态的进程获得CPU时间就可以进入运行态。"},
        "os_0028": {"answer": "A", "explanation": "进程从运行态变为阻塞态是主动行为（如请求I/O），从阻塞态到就绪态是被动行为（如I/O完成）。"},
        "os_0029": {"answer": "D", "explanation": "引起进程创建的事件包括用户登录、作业调度、提供服务和应用请求等。"},
        "os_0030": {"answer": "B", "explanation": "进程间的通信方式包括共享存储、消息传递和管道通信。"},
        "os_0031": {"answer": "A", "explanation": "线程是CPU调度的基本单位，进程是资源分配的基本单位。"},
        "os_0032": {"answer": "C", "explanation": "用户级线程的切换不需要内核的支持，在用户空间由线程库完成切换。"},
        "os_0033": {"answer": "B", "explanation": "先来先服务(FCFS)调度算法按到达顺序服务，对短作业不利。"},
        "os_0034": {"answer": "D", "explanation": "时间片轮转调度算法适用于分时系统，各进程轮流使用CPU。"},
        "os_0035": {"answer": "C", "explanation": "优先级调度算法中，如果采用抢占式，则高优先级进程到达时可以抢占CPU。"},
        "os_0036": {"answer": "A", "explanation": "死锁是指多个进程因互相等待对方持有的资源而无法继续推进的状态。"},
        "os_0037": {"answer": "B", "explanation": "死锁的四个必要条件：互斥、请求和保持、不剥夺、循环等待。"},
        "os_0038": {"answer": "D", "explanation": "银行家算法是一种死锁避免算法，通过判断安全状态来决定是否分配资源。"},
        "os_0039": {"answer": "C", "explanation": "预防死锁可以通过破坏死锁的四个必要条件之一来实现。"},
        "os_0040": {"answer": "A", "explanation": "内存管理的基本功能包括内存分配和回收、地址转换、内存保护和内存扩充。"},
        "os_0041": {"answer": "B", "explanation": "逻辑地址是程序中使用的地址，物理地址是内存中的实际地址。"},
        "os_0042": {"answer": "C", "explanation": "动态重定位在程序执行时进行地址转换，需要重定位寄存器的支持。"},
        "os_0043": {"answer": "D", "explanation": "分页存储管理将进程的逻辑地址空间分成固定大小的页，内存分成同样大小的页框。"},
        "os_0044": {"answer": "A", "explanation": "页表用于实现页号到物理块号的映射，是分页系统地址转换的关键数据结构。"},
        "os_0045": {"answer": "B", "explanation": "快表(TLB)是页表的高速缓存，用于加速地址转换过程。"},
        "os_0046": {"answer": "C", "explanation": "分段存储管理按程序的逻辑段进行划分，段的大小不固定。"},
        "os_0047": {"answer": "D", "explanation": "段页式存储管理兼有分段和分页的优点，先分段再分页。"},
        "os_0048": {"answer": "A", "explanation": "虚拟内存的基本思想是只将程序当前需要的部分调入内存，其余部分留在外存。"},
        "os_0049": {"answer": "B", "explanation": "请求分页系统中，缺页中断属于内中断（异常），发生在指令执行期间。"},
        "os_0050": {"answer": "C", "explanation": "FIFO页面置换算法会出现Belady异常，即增加物理块数反而增加缺页次数。"},
    }
    return answers


def generate_co_answers():
    """计算机组成原理答案"""
    answers = {
        "co_0001": {"answer": "C", "explanation": "冯·诺依曼计算机的基本工作方式是按地址访问并顺序执行指令（存储程序原理）。"},
        "co_0002": {"answer": "D", "explanation": "冯·诺依曼计算机中，指令和数据都以二进制形式存放在存储器中。"},
        "co_0003": {"answer": "B", "explanation": "计算机硬件系统由运算器、控制器、存储器、输入设备和输出设备五大部件组成。"},
        "co_0004": {"answer": "A", "explanation": "CPU由运算器和控制器组成，是计算机的核心部件。"},
        "co_0005": {"answer": "C", "explanation": "存储器分为主存（内存）和辅存（外存），CPU直接访问主存。"},
        "co_0006": {"answer": "B", "explanation": "计算机系统的层次结构从底到顶为：微程序机器级→传统机器级→操作系统级→汇编语言级→高级语言级。"},
        "co_0007": {"answer": "D", "explanation": "计算机性能指标包括主频、CPI、MIPS、FLOPS等。"},
        "co_0008": {"answer": "A", "explanation": "MIPS表示每秒执行百万条指令数，是衡量机器速度的一个常用指标。"},
        "co_0009": {"answer": "C", "explanation": "原码中，0的表示有+0和-0两种，而补码中0的表示唯一。"},
        "co_0010": {"answer": "B", "explanation": "补码表示中，负数的范围比正数多一个，如8位补码范围为-128~+127。"},
        "co_0011": {"answer": "D", "explanation": "IEEE 754标准中，单精度浮点数用32位表示：1位符号+8位阶码+23位尾数。"},
        "co_0012": {"answer": "A", "explanation": "浮点数的表示范围由阶码决定，精度由尾数位数决定。"},
        "co_0013": {"answer": "C", "explanation": "补码加减法统一了加法和减法运算，减法转换为加上减数的补码。"},
        "co_0014": {"answer": "B", "explanation": "溢出判断方法：双符号位法(变形补码)，两个符号位不同时表示溢出。"},
        "co_0015": {"answer": "D", "explanation": "浮点数加减运算步骤：对阶→尾数加减→规格化→舍入→判溢出。"},
        "co_0016": {"answer": "A", "explanation": "对阶时应小阶向大阶看齐，小阶的尾数右移。"},
        "co_0017": {"answer": "C", "explanation": "存储器的层次结构：寄存器→Cache→主存→辅存，从上到下容量增大、速度降低。"},
        "co_0018": {"answer": "B", "explanation": "SRAM用于Cache，速度快但成本高；DRAM用于主存，需要定期刷新。"},
        "co_0019": {"answer": "D", "explanation": "DRAM刷新方式有集中刷新、分散刷新和异步刷新三种。"},
        "co_0020": {"answer": "A", "explanation": "Cache-主存系统利用了程序的局部性原理，包括时间局部性和空间局部性。"},
        "co_0021": {"answer": "C", "explanation": "直接映射方式下，主存块只能映射到Cache中固定位置，冲突率高但实现简单。"},
        "co_0022": {"answer": "B", "explanation": "全相联映射允许主存块映射到Cache任意位置，冲突率低但需要比较所有标记。"},
        "co_0023": {"answer": "D", "explanation": "组相联映射结合了直接映射和全相联映射的优点，先按组直接映射，组内全相联。"},
        "co_0024": {"answer": "A", "explanation": "LRU(最近最少使用)替换算法性能接近最优，但实现开销较大。"},
        "co_0025": {"answer": "C", "explanation": "写回法(Write-back)只有当Cache块被替换时才写回主存，减少了写操作次数。"},
        "co_0026": {"answer": "B", "explanation": "指令系统是计算机硬件和软件之间的接口，是计算机体系结构的核心。"},
        "co_0027": {"answer": "D", "explanation": "RISC特点：指令格式固定、寄存器多、只有Load/Store访存、硬布线控制。"},
        "co_0028": {"answer": "A", "explanation": "寻址方式用于确定操作数的有效地址，常见的有立即、直接、间接、寄存器等。"},
        "co_0029": {"answer": "C", "explanation": "立即寻址方式中，操作数直接包含在指令中，速度最快但操作数范围受限。"},
        "co_0030": {"answer": "B", "explanation": "间接寻址需要两次访存（第一次取地址，第二次取操作数）。"},
        "co_0031": {"answer": "D", "explanation": "基址寻址用于程序的重定位，基址寄存器内容由操作系统设定。"},
        "co_0032": {"answer": "A", "explanation": "变址寻址适合处理数组等数据结构，变址寄存器内容由用户设定。"},
        "co_0033": {"answer": "C", "explanation": "相对寻址的有效地址为PC当前值加上指令中的偏移量，用于程序转移。"},
        "co_0034": {"answer": "B", "explanation": "CPU的基本功能包括指令控制、操作控制、时间控制和数据加工。"},
        "co_0035": {"answer": "D", "explanation": "指令周期包括取指周期、间址周期、执行周期和中断周期。"},
        "co_0036": {"answer": "A", "explanation": "微程序控制器将每条机器指令编写成一个微程序，存放在控制存储器中。"},
        "co_0037": {"answer": "C", "explanation": "硬布线控制器速度快，适合RISC；微程序控制器灵活，适合CISC。"},
        "co_0038": {"answer": "B", "explanation": "流水线技术通过时间上的重叠来提高系统吞吐率，但不能减少单条指令执行时间。"},
        "co_0039": {"answer": "D", "explanation": "流水线冒险包括结构冒险(资源冲突)、数据冒险(数据相关)和控制冒险(转移指令)。"},
        "co_0040": {"answer": "A", "explanation": "数据转发(旁路)技术可以解决部分数据冒险问题。"},
        "co_0041": {"answer": "C", "explanation": "总线是计算机各部件间传送信息的公共通道，按功能分为数据总线、地址总线和控制总线。"},
        "co_0042": {"answer": "B", "explanation": "同步总线使用公共时钟信号，异步总线通过握手信号实现同步。"},
        "co_0043": {"answer": "D", "explanation": "总线仲裁方式有集中式（链式查询、计数器、独立请求）和分布式。"},
        "co_0044": {"answer": "A", "explanation": "链式查询方式优先级固定，离仲裁器最近的设备优先级最高。"},
        "co_0045": {"answer": "C", "explanation": "I/O接口是CPU和外设之间的桥梁，实现数据缓冲、格式转换等功能。"},
        "co_0046": {"answer": "B", "explanation": "程序查询方式下CPU需要不断查询I/O状态，CPU利用率低。"},
        "co_0047": {"answer": "D", "explanation": "中断方式在I/O设备完成操作后向CPU发出中断请求，CPU响应后执行中断服务程序。"},
        "co_0048": {"answer": "A", "explanation": "DMA方式由DMA控制器直接控制内存与外设间的数据传输，不需要CPU干预。"},
        "co_0049": {"answer": "C", "explanation": "DMA方式与CPU共享主存总线，通过周期窃取方式获得总线使用权。"},
        "co_0050": {"answer": "B", "explanation": "中断响应的条件是CPU处于中断允许状态（中断允许触发器为1）且指令执行完毕。"},
    }
    return answers


def generate_ds_answers():
    """数据结构答案"""
    answers = {
        "ds_0001": {"answer": "C", "explanation": "完整的数据结构包含三个要素：逻辑结构、存储结构（物理结构）以及在其上定义的基本操作。"},
        "ds_0002": {"answer": "A", "explanation": "数据的逻辑结构独立于其存储结构，同一种逻辑结构可以有不同的存储实现。"},
        "ds_0003": {"answer": "C", "explanation": "存储数据时不仅要存储数据元素的值，还要存储数据元素之间的关系（如指针、索引）。"},
        "ds_0004": {"answer": "B", "explanation": "算法必须具备有穷性、确定性、可行性，以及零个或多个输入和一个或多个输出。"},
        "ds_0005": {"answer": "D", "explanation": "通常用时间效率和空间效率来衡量算法的优劣，还要考虑正确性和可读性。"},
        "ds_0006": {"answer": "C", "explanation": "时间复杂度T(n)=O(n^2)表示算法执行时间的增长率与n^2同阶。"},
        "ds_0007": {"answer": "B", "explanation": "顺序表的随机访问时间复杂度为O(1)，是其最大优点。"},
        "ds_0008": {"answer": "D", "explanation": "在顺序表中插入一个元素，平均需要移动n/2个元素。"},
        "ds_0009": {"answer": "A", "explanation": "单链表的头结点使得对第一个数据结点的操作与其他结点一致，简化了算法。"},
        "ds_0010": {"answer": "C", "explanation": "双链表的每个结点有前驱指针和后继指针，便于双向查找。"},
        "ds_0011": {"answer": "B", "explanation": "栈是后进先出(LIFO)的线性表，只能在栈顶进行插入和删除操作。"},
        "ds_0012": {"answer": "D", "explanation": "队列是先进先出(FIFO)的线性表，队尾入队，队头出队。"},
        "ds_0013": {"answer": "A", "explanation": "循环队列用取模运算解决了假溢出问题，队满条件为(rear+1)%MaxSize==front。"},
        "ds_0014": {"answer": "C", "explanation": "栈的应用包括括号匹配、表达式求值、递归调用和进制转换等。"},
        "ds_0015": {"answer": "B", "explanation": "队列的应用包括层次遍历、缓冲区管理、进程调度等。"},
        "ds_0016": {"answer": "D", "explanation": "串的模式匹配KMP算法的时间复杂度为O(m+n)，优于暴力匹配的O(mn)。"},
        "ds_0017": {"answer": "A", "explanation": "数组是随机存取结构，按行存储时a[i][j]的地址=首地址+(i*列数+j)*元素大小。"},
        "ds_0018": {"answer": "C", "explanation": "对称矩阵可以压缩存储，只存储上三角或下三角的元素。"},
        "ds_0019": {"answer": "B", "explanation": "稀疏矩阵可以用三元组表或十字链表来压缩存储。"},
        "ds_0020": {"answer": "D", "explanation": "树的度是指树中结点的最大度数，结点的度是指该结点的子树个数。"},
        "ds_0021": {"answer": "A", "explanation": "n个结点的树有n-1条边（分支），因为除了根结点外每个结点都有一条边与其父结点相连。"},
        "ds_0022": {"answer": "C", "explanation": "二叉树的第i层最多有2^(i-1)个结点，深度为k的二叉树最多有2^k-1个结点。"},
        "ds_0023": {"answer": "B", "explanation": "满二叉树的每层都达到最大结点数，完全二叉树只有最后一层可以不满。"},
        "ds_0024": {"answer": "D", "explanation": "完全二叉树中，若i>1，则结点i的父结点编号为⌊i/2⌋。"},
        "ds_0025": {"answer": "A", "explanation": "二叉树的先序遍历顺序是：根→左→右。"},
        "ds_0026": {"answer": "C", "explanation": "二叉树的中序遍历顺序是：左→根→右。通过中序遍历二叉排序树可以得到有序序列。"},
        "ds_0027": {"answer": "B", "explanation": "线索二叉树利用空指针域存储前驱/后继信息，方便线性遍历。"},
        "ds_0028": {"answer": "D", "explanation": "哈夫曼树（最优二叉树）的带权路径长度WPL最小，用于数据压缩。"},
        "ds_0029": {"answer": "A", "explanation": "图的邻接矩阵表示法空间复杂度为O(n^2)，适合稠密图。"},
        "ds_0030": {"answer": "C", "explanation": "图的邻接表表示法空间复杂度为O(n+e)，适合稀疏图。"},
        "ds_0031": {"answer": "B", "explanation": "深度优先搜索(DFS)类似于树的先序遍历，使用栈（递归隐式栈）实现。"},
        "ds_0032": {"answer": "D", "explanation": "广度优先搜索(BFS)使用队列实现，按层次遍历图的顶点。"},
        "ds_0033": {"answer": "A", "explanation": "最小生成树的Prim算法适合稠密图，时间复杂度O(n^2)。"},
        "ds_0034": {"answer": "C", "explanation": "Kruskal算法适合稀疏图，按边权值递增排序后选边，时间复杂度O(eloge)。"},
        "ds_0035": {"answer": "B", "explanation": "Dijkstra算法求单源最短路径，不适用于有负权边的图。"},
        "ds_0036": {"answer": "D", "explanation": "Floyd算法求所有顶点对之间的最短路径，时间复杂度O(n^3)。"},
        "ds_0037": {"answer": "A", "explanation": "拓扑排序用于判断有向图中是否存在环（回路），是AOV网的应用。"},
        "ds_0038": {"answer": "C", "explanation": "关键路径是AOE网中从源点到汇点的最长路径，决定了工程最短完成时间。"},
        "ds_0039": {"answer": "B", "explanation": "直接插入排序的时间复杂度：最好O(n)，最坏O(n^2)，平均O(n^2)。"},
        "ds_0040": {"answer": "D", "explanation": "希尔排序是对直接插入排序的改进，通过增量分组减少逆序对。"},
        "ds_0041": {"answer": "A", "explanation": "冒泡排序每趟确定一个元素的最终位置，最好情况时间复杂度O(n)。"},
        "ds_0042": {"answer": "C", "explanation": "快速排序平均时间复杂度O(nlogn)，最坏O(n^2)，是不稳定排序。"},
        "ds_0043": {"answer": "B", "explanation": "简单选择排序每趟从未排序部分选择最小元素，时间复杂度始终为O(n^2)。"},
        "ds_0044": {"answer": "D", "explanation": "堆排序时间复杂度为O(nlogn)，空间复杂度O(1)，是不稳定排序。"},
        "ds_0045": {"answer": "A", "explanation": "归并排序时间复杂度为O(nlogn)，空间复杂度O(n)，是稳定排序。"},
        "ds_0046": {"answer": "C", "explanation": "基数排序是非比较排序，时间复杂度O(d(n+r))，其中d是位数，r是基数。"},
        "ds_0047": {"answer": "B", "explanation": "折半查找要求表有序且为顺序存储，时间复杂度O(logn)。"},
        "ds_0048": {"answer": "D", "explanation": "二叉排序树的中序遍历结果是递增有序的。"},
        "ds_0049": {"answer": "A", "explanation": "平衡二叉树(AVL树)要求任何结点左右子树高度差的绝对值不超过1。"},
        "ds_0050": {"answer": "C", "explanation": "散列表(哈希表)的查找时间复杂度理想情况为O(1)，取决于哈希函数和冲突处理方法。"},
    }
    return answers


def generate_cn_answers():
    """计算机网络答案"""
    answers = {
        "cn_0001": {"answer": "B", "explanation": "计算机网络是由自治的计算机互联起来的集合体，各计算机独立运行。"},
        "cn_0002": {"answer": "D", "explanation": "计算机网络的功能包括资源共享、提高可靠性、分散处理等，但各计算机不是相对独立不联系的。"},
        "cn_0003": {"answer": "B", "explanation": "网络中的计算机拥有独立的操作系统，能够自治运行。"},
        "cn_0004": {"answer": "C", "explanation": "分组交换将报文分成较小的、有固定最大长度的数据单元（分组）进行传输。"},
        "cn_0005": {"answer": "B", "explanation": "分组交换每个分组都需要附加控制信息（头部），因此附加信息开销大。"},
        "cn_0006": {"answer": "D", "explanation": "OSI参考模型从低到高为：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。"},
        "cn_0007": {"answer": "C", "explanation": "TCP/IP体系结构从低到高：网络接口层、网际层、传输层、应用层。"},
        "cn_0008": {"answer": "B", "explanation": "物理层的主要任务是确定与传输媒体接口有关的特性，实现比特流的透明传输。"},
        "cn_0009": {"answer": "A", "explanation": "奈奎斯特定理：无噪声信道最大数据传输率=2W*log2(V)，W为带宽，V为信号电平数。"},
        "cn_0010": {"answer": "D", "explanation": "香农定理：信道的极限传输率C=W*log2(1+S/N)，与信噪比有关。"},
        "cn_0011": {"answer": "C", "explanation": "数据链路层的功能包括成帧、差错控制、流量控制和访问控制。"},
        "cn_0012": {"answer": "B", "explanation": "CRC(循环冗余校验)能检测出所有奇数位错误和所有双比特错误。"},
        "cn_0013": {"answer": "A", "explanation": "停止等待协议效率低，发送方每发一帧就要等待确认，信道利用率低。"},
        "cn_0014": {"answer": "D", "explanation": "滑动窗口协议通过允许发送多个帧来提高信道利用率。"},
        "cn_0015": {"answer": "C", "explanation": "CSMA/CD协议用于有线以太网，采用先听后发、边听边发、冲突停发的机制。"},
        "cn_0016": {"answer": "B", "explanation": "以太网的最小帧长为64字节，是由CSMA/CD协议的冲突检测机制决定的。"},
        "cn_0017": {"answer": "A", "explanation": "交换机工作在数据链路层，根据MAC地址进行转发。"},
        "cn_0018": {"answer": "D", "explanation": "VLAN(虚拟局域网)通过逻辑方式划分广播域，限制广播范围。"},
        "cn_0019": {"answer": "C", "explanation": "网络层的主要任务是为不同网络上的主机提供通信服务，主要协议是IP。"},
        "cn_0020": {"answer": "B", "explanation": "IP地址由网络号和主机号两部分组成。"},
        "cn_0021": {"answer": "A", "explanation": "子网掩码用于从IP地址中分离出网络地址和主机地址。"},
        "cn_0022": {"answer": "D", "explanation": "ARP协议将IP地址解析为MAC地址，RARP将MAC地址解析为IP地址。"},
        "cn_0023": {"answer": "C", "explanation": "ICMP是网际控制报文协议，用于报告差错和提供网络诊断信息（如ping命令）。"},
        "cn_0024": {"answer": "B", "explanation": "路由器工作在网络层，根据IP地址进行路由选择和分组转发。"},
        "cn_0025": {"answer": "A", "explanation": "RIP协议是基于距离向量的路由选择协议，最大跳数为15。"},
        "cn_0026": {"answer": "D", "explanation": "OSPF协议是链路状态路由协议，使用Dijkstra算法计算最短路径。"},
        "cn_0027": {"answer": "C", "explanation": "NAT(网络地址转换)将私有IP地址转换为公有IP地址，解决IP地址不足问题。"},
        "cn_0028": {"answer": "B", "explanation": "IPv6使用128位地址，解决了IPv4地址不足的问题。"},
        "cn_0029": {"answer": "A", "explanation": "传输层提供端到端的通信服务，TCP提供可靠传输，UDP提供不可靠传输。"},
        "cn_0030": {"answer": "D", "explanation": "TCP是面向连接的可靠传输协议，提供流量控制和拥塞控制。"},
        "cn_0031": {"answer": "C", "explanation": "UDP是无连接的不可靠传输协议，开销小，适用于实时应用。"},
        "cn_0032": {"answer": "B", "explanation": "TCP三次握手建立连接：SYN→SYN+ACK→ACK。"},
        "cn_0033": {"answer": "A", "explanation": "TCP四次挥手释放连接：FIN→ACK→FIN→ACK。"},
        "cn_0034": {"answer": "D", "explanation": "TCP的滑动窗口机制用于流量控制，接收方通过窗口大小限制发送方的发送速率。"},
        "cn_0035": {"answer": "C", "explanation": "TCP的拥塞控制算法包括慢开始、拥塞避免、快重传和快恢复。"},
        "cn_0036": {"answer": "B", "explanation": "DNS(域名系统)将域名解析为IP地址，采用分布式数据库和递归/迭代查询。"},
        "cn_0037": {"answer": "A", "explanation": "HTTP是超文本传输协议，基于TCP，默认端口80。"},
        "cn_0038": {"answer": "D", "explanation": "FTP使用两个TCP连接：控制连接(21端口)和数据连接(20端口)。"},
        "cn_0039": {"answer": "C", "explanation": "SMTP用于发送电子邮件，POP3/IMAP用于接收电子邮件。"},
        "cn_0040": {"answer": "B", "explanation": "DHCP协议用于自动分配IP地址和其他网络配置参数。"},
        "cn_0041": {"answer": "A", "explanation": "对称加密使用同一个密钥进行加密和解密，速度快但密钥分配问题困难。"},
        "cn_0042": {"answer": "D", "explanation": "数字签名用于验证消息的完整性和发送者的身份，基于公钥加密技术。"},
        "cn_0043": {"answer": "C", "explanation": "SSL/TLS协议工作在传输层和应用层之间，为HTTP等协议提供安全通信。"},
        "cn_0044": {"answer": "B", "explanation": "防火墙是网络安全设备，通过过滤规则控制进出网络的数据包。"},
        "cn_0045": {"answer": "A", "explanation": "网络层安全协议IPSec工作在网络层，为IP数据报提供加密和认证服务。"},
        "cn_0046": {"answer": "D", "explanation": "应用层网关（代理服务器）工作在应用层，对应用层数据进行检查和过滤。"},
        "cn_0047": {"answer": "C", "explanation": "端口号用于标识主机上的不同应用进程，范围0-65535。"},
        "cn_0048": {"answer": "B", "explanation": "知名端口号范围0-1023，如HTTP(80)、FTP(21)、DNS(53)等。"},
        "cn_0049": {"answer": "A", "explanation": "多路复用是指多个应用进程可以同时使用传输层的服务。"},
        "cn_0050": {"answer": "D", "explanation": "可靠传输的实现需要确认、超时重传、序号等机制的配合。"},
    }
    return answers


def main():
    """主函数：生成并应用所有科目的答案"""
    print("=" * 50)
    print("408习题库 答案生成工具")
    print("=" * 50)
    
    generators = {
        'os': ('操作系统', generate_os_answers),
        'co': ('计算机组成原理', generate_co_answers),
        'ds': ('数据结构', generate_ds_answers),
        'cn': ('计算机网络', generate_cn_answers),
    }
    
    total_applied = 0
    
    for key, (name, gen_func) in generators.items():
        print(f"\n[{name}] 生成答案中...")
        answers = gen_func()
        applied = apply_answers(key, answers)
        total_applied += applied
        
        data = load_questions(key)
        has_answer = sum(1 for q in data['questions'] if q['answer'])
        print(f"  已应用 {applied} 个答案")
        print(f"  当前有答案的题目: {has_answer}/{data['total']}")
    
    print(f"\n{'=' * 50}")
    print(f"完成! 共应用 {total_applied} 个答案")
    print(f"提示: 您可以通过Web界面的答案管理功能继续补充答案")
    print(f"{'=' * 50}")


if __name__ == '__main__':
    main()
