#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
建立题目旧 section 名到新笔记 section 名的映射表。
王道和袁书章节结构不同，需要手动映射。
"""
import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 手动建立的映射关系（旧名 → 新名）
# 王道章节：1概述 2数据 3存储器 4指令 5CPU 6总线 7I/O
# 袁书章节：1概述 2数据 3运算 4指令 5CPU 6流水线 7存储器 8I/O 9并行
ALIASES = {
    # 第1章（概述）
    "1.2 计算机系统层次结构": "1.3 计算机系统层次结构",
    "1.3 计算机的性能指标": "1.2 计算机系统的基本组成",
    # 第2章（数据表示）
    "2.1 数制与编码": "2.1 数制和编码",
    "2.2 运算方法和运算电路": "3.2 定点数运算",
    "2.3 浮点数的表示与运算": "2.3 浮点数表示与运算",
    # 第3章（存储器）→ 袁书第7章
    "3.1 存储器概述": "7.1 存储器层次结构概述",
    "3.2 主存储器": "7.2 主存储器",
    "3.3 主存储器与CPU的连接": "7.2 主存储器",
    "3.4 外部存储器": "8.4 外部存储器",
    "3.5 高速缓冲存储器": "7.3 高速缓冲存储器(Cache)",
    "3.6 虚拟存储器": "7.4 虚拟存储器",
    # 第4章（指令系统）
    "4.1 指令系统": "4.1 指令格式和指令系统",
    "4.2 指令的寻址方式": "4.2 指令寻址方式",
    "4.3 程序的机器级代码表示": "4.3 程序的机器级代码表示",
    "4.4 CISC和RISC的基本概念": "4.4 指令集结构设计",
    # 第5章（CPU）
    "5.1 CPU的功能和基本结构": "5.1 CPU的基本组成",
    "5.2 指令执行过程": "5.3 指令执行过程",
    "5.3 数据通路的功能和基本结构": "5.2 数据通路",
    "5.4 控制器的功能和工作原理": "5.4 控制单元",
    "5.5 异常和中断机制": "8.3 I/O控制方式",
    "5.6 指令流水线": "6.1 流水线概念与分类",
    "5.7 多处理器的基本概念": "9.2 多处理器系统",
    # 第6章（总线）→ 袁书第8章
    "6.1 总线概述": "8.2 总线",
    "6.2 总线事务和定时": "8.2 总线",
    # 第7章（I/O）→ 袁书第8章
    "7.1 I/O系统基本概念": "8.1 系统互连及I/O系统概述",
    "7.2 I/O接口": "8.1 系统互连及I/O系统概述",
    "7.3 I/O方式": "8.3 I/O控制方式",
}

# 读取笔记数据，验证映射的新名都存在
n_data = json.load(open(r'D:/ai code/408-quiz-app/pwa/data/notes/co_notes.json', 'r', encoding='utf-8'))
valid_secs = set()
for c in n_data['chapters']:
    for s in c['sections']:
        valid_secs.add(s['section'])

print("=== 映射验证 ===")
ok = 0
fail = 0
for old, new in ALIASES.items():
    if new in valid_secs:
        print(f"  OK: {old} → {new}")
        ok += 1
    else:
        print(f"  FAIL: {old} → {new} (新名不存在!)")
        fail += 1

print(f"\n通过: {ok}, 失败: {fail}")

# 读取题目数据，验证所有题目 section 都有映射
q_data = json.load(open(r'D:/ai code/408-quiz-app/pwa/data/co.json', 'r', encoding='utf-8'))
questions = q_data.get('questions', q_data) if isinstance(q_data, dict) else q_data
q_secs = set(q.get('section', '') for q in questions if q.get('section'))

print(f"\n=== 题目 section 覆盖检查 ===")
uncovered = []
for s in sorted(q_secs):
    if s not in ALIASES:
        uncovered.append(s)
        print(f"  未覆盖: {s}")

if not uncovered:
    print("  全部覆盖!")
