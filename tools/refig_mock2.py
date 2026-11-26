# -*- coding: utf-8 -*-
"""模拟卷（二）重排：图题用裁图+fig-img、题6邻接矩阵用HTML表格、代码题重写、
跨行选项清理。输入 zt_mock2.json（inject_mock2_ans.py 之后），原地写回。

图：pwa/data/zt_img/zt_mock2_{7,9,28,36,38,47}.png（由 fitz 裁自合订本 p16/16/20/21/22/25）
约束：不重绘存量图；SVG/图放大走 common.js lightbox（fig-img 类）；选项文字化。
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock2.json')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def fig(n, alt):
    return ('<figure class="struct-fig" data-fig="1">'
            '<img class="fig-img" src="data/zt_img/zt_mock2_%s.png" alt="%s" style="cursor:zoom-in">'
            '</figure>' % (n, esc(alt)))


def text_before(it, kw):
    """取题干首个<p>的文字（未转义前）"""
    return kw in (it.get('q') or '')


def strip_p(s):
    """去掉题干里对应的说明文字段（按关键字精确行）。"""
    return s


# 逐题覆盖
Q = {}

# 题6：邻接矩阵 -> HTML 表格（5x5），保留 I/II/III
Q[6] = (
    '<p>有向图的邻接矩阵 𝐴 如右所示，在下列说法中，错误的是（ ）。</p>'
    '<p>𝐴 =</p>'
    '<table><tbody>'
    + ''.join('<tr>' + ''.join('<td>%s</td>' % v for v in row) + '</tr>'
              for row in [
                  ['0', '1', '0', '0', '0'],
                  ['0', '0', '0', '1', '0'],
                  ['0', '0', '0', '0', '1'],
                  ['1', '0', '0', '0', '0'],
                  ['0', '0', '0', '1', '0'],
              ])
    + '</tbody></table>'
    '<p>I. 图中没有环。<br/>II. 该图的强连通分量的数量为2。<br/>III. 拓扑序列存在。</p>'
)

# 题7：AOE 网
Q[7] = ('<p>在右面的 AOE 网中，时间余量最大的活动的时间余量是（ ）。</p>'
        + fig('7', '题7 AOE网'))

# 题9：B树原图+四个备选树（图内含 A/B/C/D），选项文字化
Q[9] = ('<p>对于如下这棵3阶B树，完成“删除71”操作后应该是（ ）。</p>'
        + fig('9', '题9 三阶B树及四个备选')
        + '<p>备选B树如图中 A/B/C/D 所示。</p>')
O9 = [
    '根20；左孩子18、23合为一个结点，右孩子47；47的左孩子55、右孩子60',
    '根47；左孩子20（下有18、23两个孩子），右孩子55、60合为一个结点',
    '根20、47合为一个结点；三个孩子依次为18、23、55与60合为一个结点',
    '根23、55合为一个结点；三个孩子依次为18与20合为一个结点、47、60',
]

# 题28：前驱图（图内含 A/B/C/D），选项文字化
Q[28] = ('<p>对于下面的四条语句，（ ）是对应的前驱图。</p>'
         '<pre><code class="language-c">S1: a=x+y;\nS2: b=z+1;\nS3: c=a-b;\nS4: w=c+1;</code></pre>'
         + fig('28', '题28 四个前驱图选项'))
O28 = [
    'S1、S2 均指向 S3，S3 指向 S4',
    'S1、S2 均指向 S4，S4 指向 S3',
    'S1 指向 S2，S2 指向 S3，S3 指向 S4（串形）',
    'S1 指向 S2，S2 指向 S4，S4 指向 S3',
]

# 题36：CSMA/CD 拓扑
Q[36] = ('<p>如右图所示，主机 H1 通过 CSMA/CD 协议与主机 H2 进行通信，主机 H1 向主机 H2 发送 ARP 请求帧，'
         '数据帧的大小为 64B（最小帧长），且不考虑以太网帧的前导码，信道的数据传输速率为 100Mb/s，'
         '信号传播速率为 200m/µs，数据帧通过每个集线器时有 0.48µs 的延迟，则主机 H1 和主机 H2 理论上的最远距离为（ ）。</p>'
         + fig('36', '题36 H1经两个集线器到H2'))

# 题38：移动 IP
Q[38] = ('<p>右图给出了一个移动IP的示例，移动主机A的归属网络地址、外地网络地址、永久地址以及漫游到外地网络后'
         '从外地代理获得的一个属于该外地网络的转交地址都已在图中标注。假设图中的固定主机B要给处于外地网络的主机A'
         '发送一个IP数据报，则该IP数据报从主机B发送出来时的目的IP地址和从配置有归属代理的路由器转发出来时的目的IP地址分别是（ ）。</p>'
         + fig('38', '题38 移动IP示例'))

# 题47：网络拓扑（题干文字保留，去掉原来的图外残留行）
Q[47] = None  # 见 main 中按关键字插入

# 题19：流水线指令序列 -> 代码块重排（原文"1/loop: add..."被拆行）
Q[19] = (
    '<p>在采用“取指、译码/取数、执行、访存、写回”五段式流水线的处理器中，执行如下指令序列（第一列为指令序号），'
    '其中 t0、t1、s3、s4、s5 表示寄存器编号。</p>'
    '<pre><code class="language-c">1  loop: add  t1,s3,s3      // R[t1]=R[s3]+R[s3]\n'
    '2        add  t1,t1,t1      // R[t1]=R[t1]+R[t1]\n'
    '3        lw   t0,0(t1)      // R[t0]=M[R[t1]+0]\n'
    '4        bne  t0,s5,exit    // if(R[t0]!=R[s5]) goto exit\n'
    '5        add  s3,s3,s4      // R[s3]=R[s3]+R[s4]\n'
    '6        j    loop          // goto loop\n'
    '7        exit:</code></pre>'
    '<p>在上述指令序列中，共有（ ）条指令会产生分支控制冒险。</p>'
)

# 题44：汇编代码重排（lw 与 s0 被拆开）
Q[44] = (
    '<p>假定 A 是一个32位的地址，A_upper 和 A_lower 分别表示地址 A 的高、低16位，以下汇编指令代码用来将'
    '存放在存储器地址 A 中的机器数读入寄存器 s0。</p>'
    '<pre><code class="language-c">lui  t0,A_upper       // 将A_upper的(1)添加16个0，送t0\n'
    'ori  t0,t0,A_lower    // 将A_lower的(2)添加16个0，与t0的内容(3)，送t0\n'
    'lw   s0,0(t0)         // 将t0的内容和0相加得到有效地址，从中取数送s0</code></pre>'
    '<p>上述功能也能用以下两条汇编指令来实现。</p>'
    '<pre><code class="language-c">lui  t0,A_upper_adjusted\n'
    'lw   s0,A_lower(t0)   // 将A_lower进行符号扩展后，和t0的内容相加，得到有效地址，从中取数送s0</code></pre>'
    '<p>回答下列问题：<br/>'
    '1）根据上述指令推断，该指令系统中的立即数占多少位？为什么不能直接将 A 送入寄存器，而要通过上述题干中的方式？<br/>'
    '2）➀处应该填低位还是高位？➁处应该填低位还是高位？➂处应该执行“或”操作还是执行“与”操作？为什么？<br/>'
    '3）A_upper_adjusted 的值应该如何得到？请说明理由（提示：根据 A_lower 的最高位分类讨论）。</p>'
)


def fix_47(q):
    """在题47题干的"各互连链路的网络前缀均为/30。"后插图。"""
    marker = '各互连链路的网络前缀均为/30。'
    idx = q.find(marker)
    if idx < 0:
        return q + '\n' + fig('47', '题47 网络拓扑')
    pos = idx + len(marker)
    # 找到当前 </p> 结束位置
    end = q.find('</p>', pos)
    if end < 0:
        return q + '\n' + fig('47', '题47 网络拓扑')
    end += 4
    return q[:end] + '\n' + fig('47', '题47 网络拓扑') + q[end:]


def clean_option(o):
    """选项里的 <br/> 保留（跨行选项），但去掉重复空行。"""
    s = re.sub(r'(<br/>){2,}', '<br/>', o or '')
    return s.strip()


def main():
    d = json.load(open(F, encoding='utf-8'))
    for it in d['items']:
        n = it['i']
        if n in Q and Q[n] is not None:
            it['q'] = Q[n]
        elif n == 47:
            it['q'] = fix_47(it['q'])
        if n == 9:
            it['o'] = [esc(x) for x in O9]
        if n == 28:
            it['o'] = [esc(x) for x in O28]
        it['o'] = [clean_option(x) for x in it.get('o', [])]
    with open(F, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print('重排完成:', F)


if __name__ == '__main__':
    main()
