# -*- coding: utf-8 -*-
"""补 6 道计网缺失的多空综合题 + 全库重编号 + 5 节 _pdf_qno 赋值。
写入 pwa/data/cn.json（精确格式：indent=2, separators=(',',': '), LF, 尾换行）
并输出旧 id → 新 id 映射 tools/_cn_id_map.json。"""
import json

SRC = 'pwa/data/cn.json'
d = json.load(open(SRC, encoding='utf-8'))
qs = d['questions']
assert d['total'] == len(qs) == 558

def newq(content, blank_opts, answer, explanation, chapter, section, subsection):
    return {
        'id': None,  # 重编号时填
        'number': None,
        'content': content,
        'options': dict(blank_opts[0]),       # 兜底：第一空选项
        'answer': answer,
        'explanation': explanation,
        'multi_blank': True,
        'blank_opts': blank_opts,
        'chapter': chapter,
        'section': section,
        'subsection': subsection,
        '_pdf_qno': None,
    }

def sec_qs(sec):
    return [(i, q) for i, q in enumerate(qs) if q.get('section') == sec]

# ---------- 6 道新题 ----------
# 1.1-06
new11 = newq(
    '不同的数据交换方式有不同的性能。为了使数据在传输期间的时延最小，首选的交换方式是(①)；为保证数据无差错地传送，不应选用的交换方式是(②)；分组交换对报文交换的主要改进是(③)，这种改进产生的直接结果是(④)。',
    [{'A': '电路交换', 'B': '报文交换', 'C': '分组交换'},
     {'A': '电路交换', 'B': '报文交换', 'C': '分组交换'},
     {'A': '传输单位更小且有固定的最大长度', 'B': '传输单位更大且有固定的最大长度', 'C': '差错控制更完善', 'D': '路由算法更简单'},
     {'A': '降低了误码率', 'B': '提高了数据传输速率', 'C': '减少传输时延', 'D': '增加传输时延'}],
    'AAAC',
    '<p>本题综合考查几种数据交换方式的特点。电路交换虽然建立连接的时延较大，但在数据传输期间一直占据链路，优点是传输时延小、通信实时性强，适用于交互式会话类通信。缺点是建立连接时间长，系统效率低，不具备存储数据的能力，不具备差错控制的能力。</p><p>报文交换和分组交换都采用存储转发，传送的数据都要经过中间节点的若干存储、转发才能到达目的地，因此传输时延较大。报文交换传送数据的长度不固定且较长，分组交换要将传送的长报文分割为多个固定且长度有限的分组，因此传输时延较报文交换的小。</p>',
    '第1章 计算机网络体系结构', '1.1 计算机网络概述', '1.1.4 电路交换、报文交换与分组交换')

# 1.2-23
new1223 = newq(
    '在OSI参考模型中，提供流量控制功能的层是第(①)层；提供建立、维护和拆除端到端的连接的层是(②)；为数据分组提供在网络中路由功能的是(③)；传输层提供(④)的数据传送；为网络层实体提供数据发送和接收功能及过程的是(⑤)。',
    [{'A': '1、2、3', 'B': '2、3、4', 'C': '3、4、5', 'D': '4、5、6'},
     {'A': '物理层', 'B': '数据链路层', 'C': '会话层', 'D': '传输层'},
     {'A': '物理层', 'B': '数据链路层', 'C': '网络层', 'D': '传输层'},
     {'A': '主机进程之间', 'B': '网络之间', 'C': '数据链路之间', 'D': '物理线路之间'},
     {'A': '物理层', 'B': '数据链路层', 'C': '会话层', 'D': '传输层'}],
    'BDCAB',
    '<p>在计算机网络中，流量控制指的是通过限制发送方发出的数据流量，使得其发送速率不超过接收方接收速率的一种技术。流量控制功能可存在于数据链路层及其之上的各层中。目前提供流量控制功能的主要是数据链路层、网络层和传输层。不过，各层的流量控制对象不一样，各层的流量控制功能是在各层实体之间进行的。</p><p>在OSI参考模型中，物理层实现比特流在传输介质上的透明传输；数据链路层将有差错的物理线路变成无差错的数据链路，实现相邻节点之间即点到点的数据传输。网络层的主要功能是路由选择、拥塞控制和网际互联等，实现主机到主机的通信；传输层实现主机的进程之间即端到端的数据传输。</p><p>下一层为上一层提供服务，而网络层的下一层是数据链路层，所以为网络层实体提供数据发送和接收功能及过程的是数据链路层。</p>',
    '第1章 计算机网络体系结构', '1.2 计算机网络体系结构与参考模型', '1.2.3 OSI参考模型和TCP/IP模型')

# 1.2-28（教材无解析）
new1228 = newq(
    '在OSI参考模型中，各层都有差错控制过程，指出以下每种差错发生在哪些层中：噪声使传输链路上的一个0变成1或一个1变成0(①)。收到一个序号错误的目的帧(②)。一台打印机正在打印，突然收到一个错误指令要打印头回到本行的开始位置(③)。',
    [{'A': '物理层', 'B': '网络层', 'C': '数据链路层', 'D': '会话层'},
     {'A': '物理层', 'B': '网络层', 'C': '数据链路层', 'D': '会话层'},
     {'A': '物理层', 'B': '网络层', 'C': '应用层', 'D': '会话层'}],
    'ACC',
    '',
    '第1章 计算机网络体系结构', '1.2 计算机网络体系结构与参考模型', '1.2.3 OSI参考模型和TCP/IP模型')

# 4.2-27
new42 = newq(
    'CIDR地址块192.168.10.0/20所包含的IP地址范围是(①)。与地址192.16.0.19/28同属于一个子网的主机地址是(②)。',
    [{'A': '192.168.0.0～192.168.12.255', 'B': '192.168.10.0～192.168.13.255', 'C': '192.168.10.0～192.168.14.255', 'D': '192.168.0.0～192.168.15.255'},
     {'A': '192.16.0.17', 'B': '192.16.0.31', 'C': '192.16.0.15', 'D': '192.16.0.14'}],
    'DA',
    '<p>CIDR地址由网络前缀和主机号两部分组成，CIDR将网络前缀都相同的连续IP地址组成“CIDR地址块”。网络前缀的长度为20位，主机号为12位，因此192.168.0.0/20地址块中的地址数为2^12个。其中，当主机号为全0时，取最小地址192.168.0.0；当主机号全为1时，取最大地址192.168.15.255。注意，这里并不是指可分配的主机地址。</p><p>对于192.16.0.19/28，表示子网掩码为255.255.255.240。IP地址192.16.0.19与IP地址192.16.0.17所对应的前28位数相同，所以IP地址192.16.0.17是子网192.16.0.19/28的一台主机地址。注意，主机号全0和全1的地址不使用。</p>',
    '第4章 网络层', '4.2 IPv4', None)  # subsection 由前一题复制

# 5.3-18
new53 = newq(
    'TCP使用三次握手协议来建立连接，设A、B双方发送报文的初始序号分别为X和Y，A发送(①)的报文给B，B接收到报文后发送(②)的报文给A，然后A发送一个确认报文给B便建立了连接(注意，ACK的下标为捎带的序号)。',
    [{'A': 'SYN=1，序号=X', 'B': 'SYN=1，序号=X+1，ACKx=1', 'C': 'SYN=1，序号=Y', 'D': 'SYN=1，序号=Y，ACKr+1=1'},
     {'A': 'SYN=1，序号=X+1', 'B': 'SYN=1，序号=X+1，ACKx=1', 'C': 'SYN=1，序号=Y，ACKx+1=1', 'D': 'SYN=1，序号=Y，ACKy+1=1'}],
    'AC',
    '<p>TCP使用三次握手来建立连接，第一次握手时，A发给B的TCP报文中应置其首部SYN位为1，并选择序号seq=X，表明传送数据时的第一个数据字节的序号是X；在第二次握手中，即B接收到报文后，发给A的确认报文段中应使SYN=1、ACK=1，且序号ACKx+1=1（ACK的下标为捎带的序号），同时告诉自己选择的序号seq=Y。</p>',
    '第5章 传输层', '5.3 TCP', None)

# 6.5-04（教材题干用空括号）
new65 = newq(
    '从某个已知的URL获得一个万维网文档时，若该万维网服务器的IP地址开始时并不知道，则需要用到的应用层协议有( )，需要用到的传输层协议有( )。',
    [{'A': 'FTP、HTTP', 'B': 'DNS、FTP', 'C': 'DNS、HTTP', 'D': 'TELNET、HTTP'},
     {'A': 'UDP', 'B': 'TCP', 'C': 'UDP、TCP', 'D': 'TCP、IP'}],
    'CC',
    '<p>因为不知道服务器的IP地址，所以先要用DNS进行域名解析，然后使用HTTP进行客户和服务器之间的交互。需要用到的传输层协议是UDP（DNS使用）和TCP（HTTP使用）。</p>',
    '第6章 应用层', '6.5 万维网', None)

# ---------- 定位插入点（原始列表坐标，插入后统一重编号） ----------
def insert_after(sec, kth):
    idxs = [i for i, q in enumerate(qs) if q.get('section') == sec]
    return idxs[kth - 1] + 1  # 在第 kth 个该节题之后插入

# (新题, 插入位置, 所属节, 该节第几题之后)
plan = [
    (new11,  insert_after('1.1 计算机网络概述', 5),   '1.1 计算机网络概述'),
    (new1223,insert_after('1.2 计算机网络体系结构与参考模型', 22), '1.2 计算机网络体系结构与参考模型'),
    (new1228,insert_after('1.2 计算机网络体系结构与参考模型', 27), '1.2 计算机网络体系结构与参考模型'),
    (new42,  insert_after('4.2 IPv4', 26),            '4.2 IPv4'),
    (new53,  insert_after('5.3 TCP', 17),             '5.3 TCP'),
    (new65,  insert_after('6.5 万维网', 3),            '6.5 万维网'),
]

# 从后往前插入，避免坐标失效
for q, pos, sec in sorted(plan, key=lambda x: -x[1]):
    # 未指定 subsection 的，复制该节前一题的 subsection
    if not q['subsection']:
        prev = qs[pos - 1]
        q['subsection'] = prev.get('subsection')
    qs.insert(pos, q)

# ---------- 重编号 number/id + 旧→新 id 映射 ----------
old_to_new = {}
new_total = len(qs)
for idx, q in enumerate(qs, start=1):
    old_to_new[q['id']] = 'cn_%04d' % idx
    q['id'] = 'cn_%04d' % idx
    q['number'] = idx
d['total'] = new_total

# ---------- 5 个补齐节的 _pdf_qno（按新顺序 1..N，即教材题号） ----------
PDFQNO_SECTIONS = ['1.1 计算机网络概述', '1.2 计算机网络体系结构与参考模型', '4.2 IPv4', '5.3 TCP', '6.5 万维网']
for sec in PDFQNO_SECTIONS:
    n = 0
    for q in qs:
        if q.get('section') == sec:
            n += 1
            q['_pdf_qno'] = n

# ---------- 写出（精确格式） ----------
out = json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n'
open(SRC, 'w', encoding='utf-8', newline='\n').write(out)
json.dump(old_to_new, open('tools/_cn_id_map.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

print('新总数:', d['total'])
print('新增6题id:', [q['id'] for q in qs if q.get('multi_blank') and q['id'].startswith('cn_') and q['id'] in [old_to_new.get(k) for k in old_to_new if k != old_to_new[k]]][:12])
for q in qs:
    if q.get('multi_blank') and q.get('chapter')=='第1章 计算机网络体系结构' and q['content'].startswith('不同的数据交换方式'):
        print('示例:', q['id'], q['number'], q['_pdf_qno'], q['answer'])
print('id映射条数:', len(old_to_new))
# 校验：number 连续、id 对应
nums = [q['number'] for q in qs]
assert nums == list(range(1, new_total + 1)), 'number 不连续!'
assert all(q['id'] == 'cn_%04d' % q['number'] for q in qs), 'id 与 number 不对应!'
print('校验通过: number 1..%d 连续唯一，id 对应' % new_total)
