#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 os_notes.json 抽取精选流程/步骤配图，生成 OS 流程图专页数据 os_flow.json。

设计要点：
- 精选清单按「主题分组」组织，每条 = (图标识, 标题, 一句话顺序, 跳转节号)。
  图标识两种：'img/xxx.svg'(独立配图，直接引用路径) 或 'sec=2.2.4#0'(该节第 N 个内联 figure)。
- 独立图只存路径；内联图抽 <figure>…</figure> 原文存入 inline 字段——map.html 直接
  innerHTML 注入，复用 style.css 的 .struct-fig/.ctxsw-fig 着色与 lightbox 的放大委托，
  不生成任何新图片文件（SW 图片清单、fig 图集基线 259 均不受影响）。
- 写盘口径与 os_notes 一致：indent=1 / LF / 尾换行。
"""
import json
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'pwa', 'data', 'notes', 'os_notes.json')
OUT = os.path.join(ROOT, 'pwa', 'data', 'os_flow.json')

# 精选清单：分组 -> [(图标识, 标题, 一句话顺序/用途, 跳转节号)]
GROUPS = [
    ("1 · 中断 · 异常 · 系统调用", [
        ("img/os_fig_dual_mode.svg", "用户态 ⇄ 内核态切换", "PSW 模式位唯一开关：系统调用/中断陷入内核，IRET 返回用户态", "1.3.2"),
        ("img/os_fig_int_type.svg", "中断/异常返回点", "故障回 i、自陷/外中断回 i+1、终止不返回", "1.3.3"),
        ("img/os_fig_syscall.svg", "系统调用四步", "传参 → Trap 陷入 → 查表执行 → IRET 返回", "1.3.4"),
        ("sec=1.5#0", "操作系统引导流程", "ROM BIOS → 磁盘引导块 → 装入 OS → 初始化 → 用户登录", "1.5"),
    ]),
    ("2 · 进程状态 · 创建撤销 · 调度切换", [
        ("img/os_fig_2_2_state.png", "进程五态转换", "创建→就绪→运行；运行↔就绪/阻塞；运行→终止（注意单向箭头）", "2.1.4"),
        ("img/os_fig_proc_ctrl.svg", "创建四步 / 撤销五步", "创建：申请PCB→分配资源→初始化→入就绪队列；撤销：检索→剥夺→释放→级联→回收PCB", "2.1.5"),
        ("sec=2.2.4#0", "进程切换六步", "保存PC/寄存器→更新PCB→选新进程→恢复上下文→切换地址空间→返回用户态", "2.2.4"),
        ("img/os_fig_mlfq.svg", "多级反馈队列", "新进程进1级；用完时间片未完则降级；高优先级可抢占低优先级", "2.2.5"),
        ("img/os_fig_sched_gantt.svg", "FCFS 与 SJF 甘特图", "同一组作业：先来先服务顺序 vs 短作业优先顺序，对照等待时间", "2.2.5"),
        ("sec=2.2.6#0", "多处理机调度", "单处理机队列 vs 多处理机：私有队列/公共队列、负载分配与亲和性", "2.2.6"),
    ]),
    ("3 · 同步互斥 · PV 经典问题", [
        ("img/os_fig_peterson.svg", "Peterson 算法", "flag[i]=true → turn=j → while(flag[j]&&turn==j) → 临界区 → flag[i]=false", "2.3.2"),
        ("img/os_fig_sem_state.svg", "信号量取值与排队", "wait 减1、signal 加1；S<0 时 |S| = 阻塞进程数", "2.3.4"),
        ("img/os_fig_pc_buffer.svg", "生产者-消费者", "empty=n、full=0、mutex=1；生产者 P(empty)→P(mutex)→放→V(mutex)→V(full)", "2.3.5"),
        ("img/os_fig_rw_count.svg", "读者-写者", "第一个读者 P(rw)、最后一个读者 V(rw)；mutex 保护 count", "2.3.5"),
        ("img/os_fig_precedence.svg", "前趋图转 PV", "一条边一个信号量：箭头尾执行完 V，箭头头开始前 P，初值 0", "2.4"),
    ]),
    ("4 · 死锁", [
        ("img/os_fig_deadlock_rag.svg", "资源分配图判死锁", "蓝实线=分配边、红虚线=请求边；单实例有环必死锁，多实例有环未必", "2.5.1"),
        ("img/os_fig_banker.svg", "银行家算法安全性检查", "Work=Available → 找 Need≤Work 的进程 → 收回其 Allocation → 循环至安全序列", "2.5.3"),
        ("img/os_fig_rag_reduce.svg", "资源分配图化简", "逐步消去只有分配边的进程节点，能全部消去则无死锁", "2.5.4"),
    ]),
    ("5 · 内存 · 地址变换 · 页面置换", [
        ("img/os_fig_3_8_paging.png", "基本分页地址变换", "页号查页表得块号 + 页内偏移；越界检查在查表前", "3.1.3"),
        ("img/os_fig_3_9_tlb.png", "快表 TLB 地址变换", "页号先查快表，命中直接拼物理地址；未命中查页表并写入快表", "3.1.3"),
        ("img/os_fig_3_18_segpaged.png", "段页式地址变换", "段号查段表得页表始址 → 页号查页表得块号 → 拼偏移（三次访存）", "3.1.4"),
        ("img/os_fig_3_20_pagereq.png", "请求分页地址变换", "查页表 → 缺页则中断 → 调页 → 更新页表 → 重访存", "3.2.2"),
        ("sec=3.2.2#0", "缺页处理流程", "查页表发现缺页 → 磁盘I/O调页 → 分配页框 → 修改页表 → 重新执行指令", "3.2.2"),
        ("img/os_fig_clock.svg", "CLOCK / NRU 置换", "环形扫描：A=1 清0放行（第二次机会），A=0 当场淘汰；改进型看修改位", "3.2.4"),
        ("img/os_fig_page_replace.svg", "页面置换手算过程", "按引用串逐格画页框状态，数缺页次数（FIFO/LRU/OPT 对照）", "3.2.4"),
    ]),
    ("6 · 文件与 I/O", [
        ("img/os_fig_fcb_inode.svg", "FCB 与索引节点", "目录项=文件名+inode号；inode 存元数据+数据块地址（加快目录检索）", "4.2.2"),
        ("sec=4.2.7#0", "文件操作流程", "create 建FCB → open 复制到打开文件表 → read/write 按fd操作 → close 写回", "4.2.7"),
        ("img/os_fig_group_link.svg", "成组链接法分配回收", "超级块存第一组栈；分配从栈顶取，取空时读入下一组索引块", "4.3.2"),
        ("img/os_fig_io_control.svg", "四种 I/O 控制方式", "程序直接控制(轮询)→中断驱动→DMA(块/不经CPU)→通道，CPU干预递减", "5.1.2"),
        ("img/os_fig_io_layer.svg", "I/O 软件四层", "用户层→设备独立性软件→设备驱动→中断处理；一次 write 下行、返回上行", "5.1.3"),
        ("img/os_fig_dev_alloc.svg", "设备分配寻访链", "SDT → DCT → COCT → CHCT，四张表逐级找到设备并建通道", "5.2.3"),
        ("img/os_fig_5_15_spool.png", "SPOOLing 假脱机", "输入井/输出井 + 输入/输出进程，把独占设备改造成虚拟共享设备", "5.2.4"),
        ("sec=5.2.6#0", "一次 I/O 操作举例", "用户请求→设备独立性软件→驱动写寄存器→设备完成→中断处理→返回", "5.2.6"),
    ]),
]


def load_nodes():
    d = json.load(open(SRC, encoding='utf-8'))
    # 返回 {节号前缀: [该节的 inline figure HTML 列表]}，节与子节都收
    by_sec = {}
    def walk(ch):
        for s in ch.get('sections', []):
            collect(s)
            for sub in s.get('subsections', []):
                collect(sub)
    def collect(s):
        sec = s.get('section', '')
        m = re.match(r'(\d+(?:\.\d+)*)', sec)
        if not m:
            return
        figs = re.findall(r'<figure class="struct-fig[^"]*"[^>]*>[\s\S]*?</figure>', s.get('html', ''))
        if figs:
            by_sec[m.group(1)] = figs
    for ch in d.get('chapters', []):
        walk(ch)
    return by_sec


def resolve(ident, by_sec):
    if ident.startswith('img/'):
        assert os.path.exists(os.path.join(ROOT, 'pwa', ident)), '缺图 ' + ident
        return {'src': ident}
    m = re.match(r'sec=([\d.]+)#(\d+)', ident)
    assert m, '无法识别图标识 ' + ident
    sec, idx = m.group(1), int(m.group(2))
    figs = by_sec.get(sec, [])
    assert idx < len(figs), '节 %s 没有第 %d 个内联图（共 %d）' % (sec, idx, len(figs))
    return {'inline': figs[idx]}


def main():
    by_sec = load_nodes()
    groups = []
    total = 0
    for gname, items in GROUPS:
        out_items = []
        for ident, title, order, sec in items:
            one = {'n': title, 'order': order, 'sec': sec}
            one.update(resolve(ident, by_sec))
            out_items.append(one)
        total += len(out_items)
        groups.append({'name': gname, 'items': out_items})
    data = {
        'title': '操作系统 · 流程图速查',
        'subtitle': '从讲义配图精选，按流程/顺序主题归类 · 共 %d 张 · 点图放大 / 点标题跳回讲义' % total,
        'groups': groups,
    }
    text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('[完成] %s：%d 组 / %d 图 / %d 字节' % (OUT, len(groups), total, len(text.encode('utf-8'))))


if __name__ == '__main__':
    main()
