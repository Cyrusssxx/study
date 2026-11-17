#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 2026-11 考纲强化批次的内联 SVG 结构图（新样式 ev-*：亮底+主色+红色易错点）。

只为产出片段，最终由 _inject_exam_focus.py 内联进 notes JSON。
图约定：viewBox 0 0 720 H，文字用 ev-* class（见 style.css），
禁 HTML 标签（加粗用 font-weight），描边逐条挂 rect，不用深蓝实心底。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', '_ev_figs')
os.makedirs(OUT, exist_ok=True)


def wrap(body, h):
    return ('<figure class="struct-fig ev-fig" data-fig="1">'
            '<svg class="struct-svg" viewBox="0 0 720 %d" '
            'xmlns="http://www.w3.org/2000/svg">%s</svg></figure>' % (h, body))


def T(x, y, txt, cls='ev-label', extra=''):
    return '<text class="%s" x="%s" y="%s"%s>%s</text>' % (cls, x, y, extra, txt)


def R(x, y, w, h, cls='ev-box', rx=8, extra=''):
    return '<rect class="%s" x="%s" y="%s" width="%s" height="%s" rx="%s"%s/>' % (
        cls, x, y, w, h, rx, extra)


def L(x1, y1, x2, y2, extra=''):
    return '<line class="ev-line" x1="%s" y1="%s" x2="%s" y2="%s"%s/>' % (
        x1, y1, x2, y2, extra)


def marker():
    return ('<defs><marker id="evArr" markerWidth="9" markerHeight="9" refX="7" refY="4.5" '
            'orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="var(--primary)"/></marker>'
            '<marker id="evArrR" markerWidth="9" markerHeight="9" refX="7" refY="4.5" '
            'orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="#dc2626"/></marker></defs>')


# ---------- 图1：单总线数据通路 + 控制信号（CO 5.3.4）----------
def fig1():
    b = [marker()]
    b += [T(360, 26, '单总线数据通路 · 部件与控制信号（2022-43 / 2015-43）', 'ev-title')]
    b += [T(360, 46, '同名 "Xout / Xin" 成对出现：Xout 送总线、Xin 从总线写入；一拍总线只能传一个数据', 'ev-sub')]
    # 总线
    b += [R(40, 196, 640, 20, 'ev-head', 4)]
    b += [T(360, 211, '内 部 总 线   BUS', 'ev-headtxt')]
    # 上方部件（输出/输入到总线）
    ups = [
        (70, 'PC', 'PCout / PCin'),
        (215, 'MAR', 'MARin'),
        (360, 'MDR', 'MDRout / MDRin'),
        (505, 'IR', 'IRin'),
        (620, 'FR', '←ALU标志'),
    ]
    for x, name, sig in ups:
        w = 96
        b += [R(x, 96, w, 46, 'ev-box2')]
        b += [T(x + w / 2, 118, name, 'ev-label')]
        b += [T(x + w / 2, 134, sig, 'ev-note')]
        b += [L(x + w / 2, 142, x + w / 2, 196, ' marker-end="url(#evArr)"')]
    # 下方部件
    downs = [
        (60, 'GPRs', 'rs/rd 编号', 120),
        (240, 'Y（暂存）', '锁存左操作数', 130),
        (420, 'ALU', 'A+B / A−B', 110),
        (560, 'Z（暂存）', '锁存 ALU 结果', 130),
    ]
    for x, name, sig, w in downs:
        b += [R(x, 262, w, 48, 'ev-box2')]
        b += [T(x + w / 2, 284, name, 'ev-label')]
        b += [T(x + w / 2, 300, sig, 'ev-note')]
        b += [L(x + w / 2, 216, x + w / 2, 262, ' marker-end="url(#evArr)"')]
    # ALU->Z 直连（不经过总线前先入 Z）
    b += [R(415, 330, 290, 46, 'ev-warnbox')]
    b += [T(425, 349, '易错 · ALU 输出不能直接上总线', 'ev-warn')]
    b += [T(425, 367, '必须先存 Z 再 Zout 送总线；Y 锁存首操作数', 'ev-note', ' style="text-anchor:start"')]
    # 结论条
    b += [R(40, 392, 640, 34, 'ev-concl', 6)]
    b += [T(54, 414, '暂存器 Y/Z 存在的理由：ALU 无存储能力且单总线一拍只能送一个操作数 → 需分拍锁存', 'ev-concltxt')]
    return wrap(''.join(b), 440)


# ---------- 图2：取指周期控制信号序列 + 时钟周期（CO 5.2/5.3，2022-43 第4问）----------
def fig2():
    b = [marker()]
    b += [T(360, 26, '取指周期（不考虑 PC 增量）· 控制信号序列', 'ev-title')]
    b += [T(360, 46, '2022-43 第(4)问：主存读命令到数据送 MDR 需 5 个时钟周期 → 取指至少几个周期？', 'ev-sub')]
    steps = [
        ('①', 'PCout, MARin', 'PC 内容 → 总线 → MAR（地址送地址寄存器）'),
        ('②', 'Read', '发主存读命令（访存开始，此段耗时最长）'),
        ('③', '（主存读出→MDR）', '读出数据经总线写入 MDR，共需 5 个时钟周期'),
        ('④', 'MDRout, IRin', 'MDR 内容 → 总线 → IR（指令字进入指令寄存器）'),
    ]
    y = 66
    for n, sig, desc in steps:
        b += [R(40, y, 640, 52, 'ev-box')]
        b += [R(48, y + 9, 34, 34, 'ev-head', 17)]
        b += [T(65, y + 32, n, 'ev-headtxt')]
        b += [T(96, y + 23, sig, 'ev-val', ' style="text-anchor:start"')]
        b += [T(96, y + 42, desc, 'ev-note', ' style="text-anchor:start"')]
        y += 58
    # 注意：Read 到 MDRin 合并那 5 周期
    b += [R(40, y + 2, 640, 46, 'ev-warnbox')]
    b += [T(54, y + 21, '易错 · 时钟周期计数：访存那一步占 5 个周期', 'ev-warn')]
    b += [T(54, y + 39, '取指至少 = PCout/MARin(1) + Read→MDR(5) + MDRout/IRin(1) = 7 个时钟周期', 'ev-note', ' style="text-anchor:start"')]
    y += 54
    b += [R(40, y + 2, 640, 32, 'ev-concl', 6)]
    b += [T(54, y + 23, '控制信号由「控制单元/控制器」产生：输入来自 指令操作码(IR)、时序信号、标志(FR)、PC 等', 'ev-concltxt')]
    return wrap(''.join(b), y + 46)


# ---------- 图3：inode 混合索引 + 文件最大长度（OS 4.2.2）----------
def fig3():
    b = [marker()]
    b += [T(360, 26, '索引节点 inode · 混合索引分配（2012 / 2022 / 2026 高频）', 'ev-title')]
    b += [T(360, 46, 'inode 存文件的元数据 + 盘块地址；文件最大长度由各级索引项数 × 块大小决定', 'ev-sub')]
    # inode 框
    b += [R(40, 62, 150, 262, 'ev-box2')]
    b += [T(115, 84, 'inode', 'ev-label')]
    rows = [('直接地址 ×10', '10 × 1块'), ('一级间接 ×1', 'n × 1块'),
            ('二级间接 ×1', 'n² × 1块'), ('三级间接 ×1', 'n³ × 1块')]
    yy = 108
    for name, val in rows:
        b += [T(52, yy, name, 'ev-note', ' style="text-anchor:start"')]
        b += [T(52, yy + 15, val, 'ev-val', ' style="text-anchor:start"')]
        yy += 42
    # 右侧各级示意
    ys = [70, 128, 197, 271]
    titles = ['10 个直接地址 → 直接指向 10 个数据块',
              '一级间接：地址项指向 1 个索引块，块内 n 个地址各指 1 块',
              '二级间接：一级索引块 → n 个二级索引块 → n² 个数据块',
              '三级间接：再套一层 → n³ 个数据块']
    for i, (yy2, t) in enumerate(zip(ys, titles)):
        b += [R(210, yy2, 470, 42, 'ev-box')]
        b += [T(222, yy2 + 26, t, 'ev-label', ' style="text-anchor:start"')]
        b += [L(190, 167, 210, yy2 + 21, ' marker-end="url(#evArr)"')]
    # 计算条
    b += [R(40, 322, 640, 52, 'ev-warnbox')]
    b += [T(54, 342, '易错 · n = 块大小 / 地址项长度（如 4KB 块、4B 地址 → n=1024）', 'ev-warn')]
    b += [T(54, 361, '最大文件 = (10 + n + n² + n³) × 块大小；计算别漏直接地址 10 块，也别把 n 当成块数', 'ev-note', ' style="text-anchor:start"')]
    b += [R(40, 384, 640, 30, 'ev-concl', 6)]
    b += [T(54, 404, '区分：inode(索引节点) = 元数据+地址；目录项 = 文件名→inode号；FCB = 文件名+元数据合体', 'ev-concltxt')]
    return wrap(''.join(b), 426)


# ---------- 图4：树形目录 + 硬/软链接（OS 4.2.3/4.2.8）----------
def fig4():
    b = [marker()]
    b += [T(360, 26, '树形目录 · 硬链接 vs 软链接（2022-46 删目录 / 2026）', 'ev-title')]
    b += [T(360, 46, '目录本身也是文件（目录文件）：其内容 = 一组「文件名 → inode号」目录项', 'ev-sub')]
    # 左侧树
    b += [R(40, 62, 250, 278, 'ev-box')]
    b += [T(165, 84, '树形目录（无环）', 'ev-label')]
    nodes = [('根 /', 100), ('usr/', 148), ('etc/', 196), ('a.c', 244), ('bin/', 292)]
    for name, yy in nodes:
        b += [R(70, yy, 120, 34, 'ev-box2')]
        b += [T(130, yy + 22, name, 'ev-label')]
    # 连线（简单父子）
    for y1, y2 in [(134, 148), (182, 196), (196, 244), (134, 292)]:
        b += [L(130, y1, 130, y2, ' marker-end="url(#evArr)"')]
    # 右侧硬软链接对比
    b += [R(305, 62, 375, 118, 'ev-okbox')]
    b += [T(320, 84, '硬链接 Hard Link', 'ev-label', ' style="text-anchor:start"')]
    b += [T(320, 105, '目录项直接指向同一 inode（增加一个目录项）', 'ev-note', ' style="text-anchor:start"')]
    b += [T(320, 124, '删原名不影响：只要仍有链接，文件数据不删', 'ev-note', ' style="text-anchor:start"')]
    b += [T(320, 145, '链接计数 nlink++；不能跨文件系统、不能链目录', 'ev-val', ' style="text-anchor:start"')]
    b += [R(305, 188, 375, 124, 'ev-warnbox')]
    b += [T(320, 210, '软链接 Symbolic Link', 'ev-warn', ' style="text-anchor:start"')]
    b += [T(320, 231, '文件内容 = 另一个文件的「路径名」（是独立文件）', 'ev-note', ' style="text-anchor:start"')]
    b += [T(320, 251, '删原文件 → 路径失效，成「悬空链接」', 'ev-note', ' style="text-anchor:start"')]
    b += [T(320, 272, '可跨文件系统、可链目录；本身占一个 inode', 'ev-warn', ' style="text-anchor:start"')]
    b += [R(40, 350, 640, 34, 'ev-concl', 6)]
    b += [T(54, 372, '易错 · 硬链接=同一 inode 多个名字（nlink 计数）；软链接=存路径的独立文件，删除原文件会悬空', 'ev-concltxt')]
    return wrap(''.join(b), 396)


# ---------- 图5：OS 2025 新考点 · 多处理机调度 ----------
def fig5():
    b = [marker()]
    b += [T(360, 26, '2025 大纲新增 · 多处理机调度（对称多处理机 SMP 为重点）', 'ev-title')]
    b += [T(360, 46, '两类多处理机 + 就绪队列方案 + 亲和性 + 负载均衡（推/拉迁移）', 'ev-sub')]
    # 两类
    b += [R(40, 62, 320, 96, 'ev-box')]
    b += [T(200, 84, '非对称多处理机', 'ev-label')]
    b += [T(56, 106, '一个主 CPU 专门跑内核（调度/I/O）', 'ev-note', ' style="text-anchor:start"')]
    b += [T(56, 126, '其余 CPU 只跑用户进程', 'ev-note', ' style="text-anchor:start"')]
    b += [T(56, 146, '主 CPU 是瓶颈', 'ev-warn', ' style="text-anchor:start"')]
    b += [R(370, 62, 310, 96, 'ev-box2')]
    b += [T(525, 84, '对称多处理机 SMP', 'ev-label')]
    b += [T(386, 106, '每个处理器自我调度（空闲即选就绪进程）', 'ev-note', ' style="text-anchor:start"')]
    b += [T(386, 126, '各 CPU 地位相同，主要关注对象', 'ev-val', ' style="text-anchor:start"')]
    b += [T(386, 146, '访问内核数据结构需上锁', 'ev-note', ' style="text-anchor:start"')]
    # 就绪队列两方案
    b += [R(40, 168, 320, 72, 'ev-box')]
    b += [T(56, 189, '公共就绪队列', 'ev-label', ' style="text-anchor:start"')]
    b += [T(56, 209, '所有 CPU 共享一个队列', 'ev-note', ' style="text-anchor:start"')]
    b += [T(56, 227, '✓天然负载均衡  ✗亲和性差', 'ev-note', ' style="text-anchor:start"')]
    b += [R(370, 168, 310, 72, 'ev-box')]
    b += [T(386, 189, '私有就绪队列', 'ev-label', ' style="text-anchor:start"')]
    b += [T(386, 209, '每个 CPU 一个队列', 'ev-note', ' style="text-anchor:start"')]
    b += [T(386, 227, '✓亲和性好  ✗需额外负载均衡', 'ev-note', ' style="text-anchor:start"')]
    # 亲和性 + 迁移
    b += [R(40, 250, 640, 52, 'ev-box')]
    b += [T(54, 271, '处理机亲和性：尽量让进程固定在同一 CPU 跑，以利用 Cache', 'ev-val', ' style="text-anchor:start"')]
    b += [T(54, 291, '软亲和＝调度程序尽量保证；硬亲和＝用户用系统调用强制绑定固定 CPU', 'ev-note', ' style="text-anchor:start"')]
    b += [R(40, 312, 640, 46, 'ev-warnbox')]
    b += [T(54, 331, '易错 · 负载均衡两方向：推迁移(push)=系统任务周期检查并推给空闲CPU；拉迁移(pull)=空闲CPU主动拉', 'ev-warn')]
    b += [T(54, 349, '公共队列天然均衡但亲和性差；私有队列亲和性好但要靠推/拉迁移补均衡 —— 两者是权衡关系', 'ev-note', ' style="text-anchor:start"')]
    return wrap(''.join(b), 372)


FIGS = {
    'co_dp_singlebus': fig1(),
    'co_dp_fetch_timing': fig2(),
    'os_inode_index': fig3(),
    'os_dir_link': fig4(),
    'os_smp_schedule': fig5(),
}

for name, svg in FIGS.items():
    with open(os.path.join(OUT, name + '.html'), 'w', encoding='utf-8') as f:
        f.write(svg)
    print(name, len(svg))
print('done ->', OUT)
