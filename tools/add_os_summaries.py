# -*- coding: utf-8 -*-
"""给 OS 的「零黄框 + 长文字」大节补一条节级速览（section.summary）。

为什么用新字段、不改 html：
  · 节级 html 在 notes.html 里渲染在所有子节之后，往里插黄框会被推到整节末尾；
  · 改任何已有 <p> 都会让 fmtNotes 按「；」拆行，已存行级批注会错位；
  · summary 渲染在 <h3> 标题正下方、.notes-body 之外，天然不进 .anno-line。

用法：python tools/add_os_summaries.py [--dry]
"""
import io, json, sys

P = 'pwa/data/notes/os_notes.json'

# 每条都只取该节正文里已经写过的口径，不引入新概念 / 新数值
SUMMARIES = {
    '1.1.3': '四大特征 = 并发、共享、虚拟、异步；并发与共享是最基本的两个、互为存在条件。'
             '并发是宏观同时、微观交替（单处理机也能有），并行才是同一时刻真正同时（要硬件多核）。',
    '1.3': 'CPU 用 PSW 区分内核态/用户态，特权指令只在内核态执行；'
           '中断（外）异步、异常（内）同步，系统调用是主动陷入（自陷）。'
           '响应过程（检测、保护断点、找入口）由硬件做，进程上下文切换由 OS 软件做。',
    '1.4': '两条轴分开记：分层法/模块化回答「内部怎么组织」，宏内核/微内核/外核回答「内核做多少」。'
           '分层只调紧邻下层；微内核机制在内核、策略在用户态服务器，唯一主要缺点是态切换性能。',
    '1.6': '第一类 VMM 直接跑在裸硬件上，第二类 VMM 跑在宿主 OS 上（VMware Workstation 属第二类）。'
           'VMM 特权级必须高于客户 OS 才能截获敏感指令；客户 OS 的系统调用仍陷入它自己的内核。',
    '2.3': '互斥四准则：空闲让进、忙则等待、有限等待、让权等待。'
           '手段从软件（Peterson）、硬件（TSL/Swap）到信号量 PV 与管程；'
           '前趋图按每条边设一个初值 0 的同步信号量，前驱末尾 V、后继开头 P。',
    '3.1': '连续分配（单一/固定/动态分区）→ 非连续（分页/分段/段页式）。'
           '分页一维地址、页大小固定、只剩内部碎片；分段二维地址、按逻辑单位、有外部碎片。'
           '分页求物理地址：页号查页表得块号，块号×页面大小 + 页内偏移。',
    '3.2': '主线：局部性原理 → 请求分页（页表扩展 + 缺页中断 + 地址变换）→ 四大置换算法 → '
           '页框分配/置换策略 → 抖动 → 缺页率与 EAT。FIFO 有 Belady 异常，CLOCK 是 LRU 的近似；'
           '缺页处理完重执行原指令。',
    '4.1': '逻辑结构看「有没有记录概念」：无结构（流式）/ 顺序 / 索引 / 索引顺序文件。'
           '索引顺序文件最优分组 √N，10000 条记录平均查 100 次；'
           '「打开文件」把目录检索从每次都做降到一次（打开文件表）。',
    '4.2': '目录项拆成「文件名 + inode 号」后可大幅减少目录检索访盘次数。'
           '口诀：硬链接动 count、软链接不动 count；软链接存路径名，目标删除后成悬挂指针。'
           '删除文件时 count 归 0 才真正回收 inode 与磁盘块。',
    '4.3': '文件系统布局 = 超级块 + 空闲空间管理 + inode 区 + 数据区。'
           '空闲空间管理四法：空闲表法、空闲链表法、位示图法、成组链接法。'
           '位示图换算先看清「从 0 还是从 1 编号」：b = 字长×(字号−1) + 位号。',
    '5.1': 'I/O 软件自上而下四层：用户层软件 → 设备独立性软件 → 设备驱动程序 → 中断处理程序 → 硬件。'
           '控制方式演进 = CPU 干预越来越少：程序直接控制（轮询）→ 中断驱动 → DMA（块）→ 通道。'
           '设备独立性软件管逻辑名映射与缓冲，驱动把逻辑盘块号转成盘面/磁道/扇区。',
    '5.3.4': '读/写以页、擦除以块且先擦后写 ⇒ 写放大；FTL 管地址映射、坏块管理、磨损均衡与垃圾回收。'
             '磨损均衡是延长寿命不是加速，静态（连冷数据也搬）优于动态；'
             'SSD 无寻道与旋转延迟，所以随机读极快、磁盘调度算法对它意义不大。',
}


def dump(d):
    return (json.dumps(d, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def main():
    dry = '--dry' in sys.argv
    raw = io.open(P, 'rb').read()
    d = json.loads(raw.decode('utf-8'))
    assert dump(d) == raw, 'OS 序列化不可逆，先确认 indent=1 + LF + 尾换行'
    assert b'\r\n' not in raw, 'OS 不该有 CRLF'

    hit = set()
    for ch in d['chapters']:
        for sec in ch.get('sections', []):
            # 1.1.3 / 5.3.4 是「有子节的编号块」，其正文挂在 subsection 上；
            # notes.html 对 section 和 subsection 都渲染 summary，故两类都能接。
            for s in [sec] + sec.get('subsections', []):
                num = (s.get('section') or '').split(' ')[0]
                if num not in SUMMARIES:
                    continue
                hit.add(num)
                old = s.get('summary')
                if not dry:
                    s['summary'] = SUMMARIES[num]
                print('%s %s | %s' % (num, s['section'], '改写' if old else '新增'))
    missing = set(SUMMARIES) - hit
    assert not missing, '找不到小节: %s' % sorted(missing)
    print('命中 %d 节；summary 最长 %d 字' % (len(hit), max(len(v) for v in SUMMARIES.values())))
    if dry:
        return
    out = dump(d)
    io.open(P, 'wb').write(out)
    print('已写盘 %d -> %d' % (len(raw), len(out)))


if __name__ == '__main__':
    main()
