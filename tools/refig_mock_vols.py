# -*- coding: utf-8 -*-
"""重做卷（三）/卷（五）含图题题干：删除 OCR 混入的图内文字，插入真图(fig-img 可放大)。

只改 q 字段；kp / sid / a / an / o 不动。
写盘：indent=1 / LF / 无尾换行（与卷一一致）。
"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def IMG(vol, n, alt):
    return ('<div class="svg-wrapper"><div class="svg-container" style="height:auto;width:100%%">'
            '<img class="fig-img" src="data/zt_img/zt_mock%d_%d.png" alt="%s" '
            'style="display:block;max-width:100%%;border:1px solid var(--border);border-radius:6px;cursor:zoom-in">'
            '</div></div>') % (vol, n, alt)


Q = {
3: {
 7: '<p>已知一个有向图的邻接表存储结构如下图所示，根据有向图的深度优先遍历算法，从顶点1出发，所得到的顶点序列是（）。</p>'
    + IMG(3, 7, '有向图邻接表'),
 13: '<p>下图所示为一个采用“移位+条件加法”实现的32位无符号整数乘法器。关于该结构的工作过程以及32位无符号乘法的溢出判定，下列说法中正确的是（）。</p>'
    + IMG(3, 13, '32位无符号乘法器结构'),
 34: '<p>右图为一段差分曼彻斯特编码的信号波形，其编码的比特流是（）。</p>'
    + IMG(3, 34, '差分曼彻斯特编码波形'),
 41: '<p>（10分）如右图所示，请回答下列问题：</p>'
    + IMG(3, 41, '有向图')
    + '<p>1）写出该图的邻接矩阵。<br/>2）写出全部拓扑序列。<br/>'
      '3）以 V₁ 为源点、V₆ 为终点，给出所有事件（和活动）允许发生的最早时间和最晚时间，并给出关键路径。<br/>'
      '4）求 V₁ 到各点的最短路径和距离。</p>',
 47: '<p>（9分）下图是一个网络拓扑图，根据该图回答下列问题。</p>'
    + IMG(3, 47, '网络拓扑图')
    + '<p>1）设备 X1 是交换机还是路由器？<br/>'
      '2）M1 向 PC2 发送数据，PC2 收到的数据帧中的源 MAC 地址是什么？PC2 向 M1 返回数据，M1 收到的数据帧中的地址3是什么？<br/>'
      '3）通常把子网映射地址中的第一个 IP 地址分配给默认网关，则 PC1 所在子网的默认网关是什么？该子网还有多少个空闲的 IP 地址可供分配？给出分析过程。<br/>'
      '4）路由表的结构如下，请给出 R1 的路由表，要求尽可能采用路由聚合以减少表项数。</p>'
      '<table class="table td-initial"><tr><th>目的网络</th><th>子网掩码（点分十进制数表示）</th><th>接口</th></tr>'
      '<tr><td></td><td></td><td></td></tr></table>',
},
5: {
 10: '<p>如果从下图的堆中删除值为11的结点，那么值为70的结点将出现在图中的（）位置。</p>'
    + IMG(5, 10, '堆结构'),
 47: '<p>（9分）某企业网络的拓扑结构如下图所示。该企业的3个部门分别使用以太网交换机 S1、S2、S3 组建局域网，'
     '3个部门的局域网均连接到核心路由器 R1 上，并经路由器 R2 接入 Internet。路由器 R1 的对外接口 WAN1 与 Internet '
     '的路由器 R2 接口 WAN2 相连，链路层协议采用 PPP，企业内网的网络设备之间互连均使用以太网技术。'
     '已知分配给企业内网的 IP 地址块为 160.10.10.0/24，部门1～3的计算机数量分别为112台、60台、29台，'
     '其中部门1的计算机中有一台是对外提供服务的 Web 服务器，各部门的计算机均需访问 Internet。回答下列问题。</p>'
    + IMG(5, 47, '企业网络拓扑图')
    + '<p>1）请为3个部门分配 IP 地址，用 CIDR 表示，并给出部门1的计算机的默认网关地址（要求尽可能节省 IP 地址以留作扩展，且部门1～3按地址值从小到大分配）。<br/>'
      '2）已知路由器 R1 接口 WAN1 的 IP 地址和子网掩码用 CIDR 表示为 198.10.10.18/30，请给出路由器 R2 接口 WAN2 的 IP 地址和子网掩码（用 CIDR 表示），并给出计算过程。<br/>'
      '3）要确保企业网络能正常访问 Internet，路由器 R2 中至少应该有哪些路由表项？要求尽可能地进行路由聚合以减少表项数，路由表的格式如下所示。<br/>'
      '4）假设 Internet 中的某主机向该企业部门1中的 Web 服务器发出了1个请求报文，该报文所对应的 IP 分组在从路由器 R2 到 Web 服务器的转发过程中，需要经过几次 ARP 地址解析？说明理由（假设此时所有设备的 ARP 缓存均初始为空）。</p>'
      '<table class="table td-initial"><tr><th>目的网络</th><th>子网掩码（点分十进制表示）</th></tr>'
      '<tr><td>…</td><td>…</td></tr></table>',
},
}


def main():
    for vol in (3, 5):
        p = os.path.join(ROOT, 'pwa', 'data', 'zt', 'zt_mock%d.json' % vol)
        d = json.load(open(p, encoding='utf-8'))
        for it in d['items']:
            if it['i'] in Q[vol]:
                it['q'] = Q[vol][it['i']]
        with open(p, 'w', encoding='utf-8', newline='') as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        b = open(p, 'rb').read()
        print('卷%d 写入完成：%d 题含图重做；tail=%r CRLF=%d' % (vol, len(Q[vol]), b[-12:], b.count(b'\r\n')))


if __name__ == '__main__':
    main()
