#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""2026-11 考纲强化：向 CO / OS 讲义注入「数据通路 / 文件管理 / 2025新考点」考点要点与5张新样式图。

硬约束：
- 只追加 data-fig 图块 / div.key-points / div.key-callout，绝不新增裸 <p>/<li>，
  保证可批注行 CO 静态1819/jsdom1971、OS 静态3405/jsdom3409 不变。
- 不改任何已有 <p>，不破坏黄框/批注 anchor。
- 写盘前往返校验：剥离本次注入片段后必须逐字节等于原文。
- 字节口径 co=indent1+CRLF+无尾换行。os=indent1+LF+尾换行。
"""
import json, os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, 'tools', '_ev_figs')
SERIAL = {
    'co': dict(indent=1, crlf=True, tail=False),
    'os': dict(indent=1, crlf=False, tail=True),
}


def loadfig(name):
    return open(os.path.join(EV, name + '.html'), encoding='utf-8').read()


def dump(doc, sub):
    cfg = SERIAL[sub]
    s = json.dumps(doc, ensure_ascii=False, indent=cfg['indent'])
    if cfg['crlf']:
        s = s.replace('\n', '\r\n')
    if cfg['tail']:
        s += '\n'
    return s


def find_sub(doc, prefix):
    for ch in doc['chapters']:
        for s in ch['sections']:
            if s['section'].startswith(prefix):
                return s
            for u in s.get('subsections', []):
                if u['section'].startswith(prefix):
                    return u
    raise SystemExit('NOT FOUND: ' + prefix)


# ============ 注入片段 ============
def fig_block(name, caption):
    return ('<p class="paragraph" data-fig="1"><b>图：%s</b></p>\n' % caption +
            loadfig(name) + '\n')


# --- CO 5.3.4 单总线数据通路：五问 dissection + 图1 ---
CO_534 = (
    '\n<div class="key-points"><div class="key-points-title">'
    '2022-43 五问拆解（单总线数据通路 · 2022/2026 连续回归）</div>'
    '<div class="key-points-item"><b>① 标志位逻辑式（只用 A₁₅/B₁₅/F₁₅）</b>：'
    '符号标志 <b>SF = F₁₅</b>（结果最高位即符号）。溢出 OF：加法 = '
    'A₁₅·B₁₅·F̄₁₅ + Ā₁₅·B̄₁₅·F₁₅（同号相加变号），减法 = '
    'A₁₅·B̄₁₅·F₁₅ + Ā₁₅·B₁₅·F̄₁₅（异号相减变号）。</div>'
    '<div class="key-points-item"><b>② 为何设暂存器 Y / Z</b>：单总线一拍只能传一个数。'
    'ALU 两个输入需先把一个锁进 <b>Y</b>、再从总线送另一个。ALU 输出先存 <b>Z</b>，'
    '避免总线被占用时结果无处去 / 反馈干扰。</div>'
    '<div class="key-points-item"><b>③ GPRs 与 rs/rd</b>：rs、rd 各 4 位 → 最多 '
    '<b>2⁴=16</b> 个通用寄存器。rs/rd 来自 <b>指令寄存器 IR</b>。'
    'rd 是寄存器<b>编号</b>，应连<b>地址译码器</b>（不是多路选择器 MUX）。</div>'
    '<div class="key-points-item"><b>④ 取指周期控制信号序列</b>：'
    'PCout, MARin → Read → MDRout, IRin（若不计 PC 增量）。'
    '访存那一步占 5 拍，故取指至少 <b>1+5+1 = 7 个时钟周期</b>。</div>'
    '<div class="key-points-item"><b>⑤ 控制信号的来源</b>：由 <b>控制部件 CU</b> 产生。'
    '<b>IR（操作码）+ FR（标志）</b> 的输出接到 CU 输入端。</div>'
    '<div class="key-points-item"><span class="ext-tag">拓展</span>'
    '真实 CPU 为避免单总线瓶颈，采用多总线 / 专用通路（见 5.3.5）与旁路（forwarding）。'
    '但 408 大题考法仍以单总线控制信号的成对写法为主。</div>'
    '</div>\n'
) + fig_block('co_dp_singlebus', '单总线数据通路 · 部件与控制信号（2022-43 / 2015-43）')

# --- CO 5.2.3 指令周期：取指时序图 ---
CO_523 = '\n' + fig_block('co_dp_fetch_timing', '取指周期控制信号序列与时钟周期计数（2022-43 第4问）')

# --- OS 4.2.2 索引节点：混合索引图 + 公式要点 ---
OS_422 = fig_block('os_inode_index', 'inode 混合索引分配 · 文件最大长度（2012 / 2022 / 2026 高频）') + (
    '<div class="key-points"><div class="key-points-title">混合索引文件长度：三步算对</div>'
    '<div class="key-points-item">① <b>先算 n</b>：n = 块大小 ÷ 地址项长度（如 4KB 块、4B 地址 → n=1024）。</div>'
    '<div class="key-points-item">② <b>再算总块数</b>：直接 d 块 + 一级 n + 二级 n² + 三级 n³。'
    '索引块本身也占盘块（算"最大文件占用盘块数"时要计入各级索引块 1+n+…）。</div>'
    '<div class="key-points-item">③ <b>最后乘块大小</b>：最大文件长度 = 数据块数 × 块大小。'
    '单文件长度与 inode 总数无关（2013 真题）。</div>'
    '<div class="key-points-item"><span class="ext-tag">拓展</span>'
    'UNIX 的 inode 常为 10 直接 + 1 一级 + 1 二级 + 1 三级。'
    '考题可能改地址项个数 / 块大小，按上面三步套即可。</div>'
    '</div>\n')

# --- OS 4.2.8 文件共享：目录树 + 硬软链接图 ---
OS_428 = '\n' + fig_block('os_dir_link', '树形目录 · 硬链接 vs 软链接（2022-46 删目录 / 2026）')

# --- OS 2.2.6 多处理机调度：新考点图 + 新考纲标记 ---
OS_226 = (
    '\n<div class="key-points"><div class="key-points-title">'
    '<span class="ext-tag">2025 新增</span>多处理机调度（大纲明确新增）</div>'
    '<div class="key-points-item"><b>两类多处理机</b>：非对称（只有一个主 CPU 访问内核、'
    '负责调度与 I/O，其余跑用户进程）／对称 SMP（各 CPU 自我调度、地位相同）——'
    '<b>SMP 是重点</b>。</div>'
    '<div class="key-points-item"><b>公共就绪队列</b>：天然负载均衡，但亲和性差、要上锁。'
    '<b>私有就绪队列</b>：亲和性好，但需额外负载均衡。</div>'
    '<div class="key-points-item"><b>亲和性</b>：尽量让进程固定在同一 CPU 跑以利用 Cache。'
    '软亲和＝调度程序尽量保证，硬亲和＝用户系统调用强制绑定。</div>'
    '<div class="key-points-item"><b>负载均衡</b>：推迁移(push)＝系统周期性检查并推给空闲 CPU。'
    '拉迁移(pull)＝空闲 CPU 主动从超载 CPU 拉。两者常结合。</div>'
    '</div>\n'
) + fig_block('os_smp_schedule', '2025 大纲新增 · 多处理机调度（对称多处理机 SMP 为重点）')

# --- OS 2.1.6 进程通信：信号（2025 新增）文字要点 ---
OS_216 = (
    '\n<div class="key-points"><div class="key-points-title">'
    '<span class="ext-tag">2025 新增</span>进程间通信 · 信号（signal）</div>'
    '<div class="key-points-item"><b>本质</b>：信号是异常处理的配套机制，用于通知进程'
    '某个特定事件已发生。由特定事件引发 → 传递给某进程 → 收到即处理。</div>'
    '<div class="key-points-item"><b>分类</b>：同步信号（进程自身引发，如除零/非法指令）／'
    '异步信号（外界引发，如 Ctrl+C、kill）。</div>'
    '<div class="key-points-item"><b>处理</b>：默认处理程序（内核完成）或用户自定义处理程序'
    '（如 try-catch 式的信号处理器）。收到后可执行、忽略或屏蔽。</div>'
    '<div class="key-points-item"><span class="ext-tag">拓展</span>'
    '信号是软件层面的"中断"：异步、打断当前执行流、转去执行处理程序，'
    '与硬件中断的处理思路可类比（见 1.3.3）。</div>'
    '</div>\n')

# ============ 目标映射 ============
PLAN = {
    'co': [('5.3.4', CO_534), ('5.2.3', CO_523)],
    'os': [('4.2.2', OS_422), ('4.2.8', OS_428), ('2.2.6', OS_226), ('2.1.6', OS_216)],
}

MARK = '<!-- EXAM_FOCUS_2026_11 -->\n'


def main():
    dry = '--dry' in sys.argv
    for sub, items in PLAN.items():
        p = os.path.join(ROOT, 'pwa/data/notes/%s_notes.json' % sub)
        raw = open(p, encoding='utf-8', newline='').read()
        doc = json.loads(raw)
        assert dump(doc, sub) == raw, '%s 序列化口径不符，停止' % sub
        for prefix, addition in items:
            node = find_sub(doc, prefix)
            html = node['html']
            if MARK in html:
                print('%s %s 已注入，跳过' % (sub, prefix))
                continue
            node['html'] = html + '\n' + MARK + addition
            print('%s %s 注入 +%d 字符' % (sub, prefix, len(addition)))
        # 可逆断言：在 doc 层把注入字段还原，dump 后必须逐字节等于原文
        import copy
        back_doc = copy.deepcopy(doc)
        for prefix, addition in items:
            n = find_sub(back_doc, prefix)
            n['html'] = n['html'][:-len('\n' + MARK + addition)]
        assert dump(back_doc, sub) == raw, '%s 剥离注入后与原文不一致，停止写盘' % sub
        out = dump(doc, sub)
        if not dry:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(out)
            print('%s 写盘 %d → %d 字节' % (sub, len(raw.encode()), len(out.encode())))
    print('dry' if dry else 'done')


if __name__ == '__main__':
    main()
