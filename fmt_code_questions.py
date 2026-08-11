# -*- coding: utf-8 -*-
"""
代码题还原脚本 v2：把 OCR 压扁的单行代码还原成多行缩进代码块（<pre class="code-block">）。
- 自动还原：粘连补空格（多轮）→ 语句切分 → 花括号缩进 + 嵌套控制语句悬挂缩进 → 逐行HTML转义
- 手工重建：双栏排版被 OCR 交错的并发题等 12 题，用 MANUAL 表直接替换
用法：
    python fmt_code_questions.py            # 预览：写 _preview_codefmt.txt，不改数据
    python fmt_code_questions.py --apply    # 应用：备份后写回四科 JSON 并同步 pwa/data
"""
import json
import re
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
QDIR = os.path.join(ROOT, 'data', 'questions')
BACKUP_DIR = os.path.join(QDIR, 'backup_codefmt')
PWA_DATA = os.path.join(ROOT, 'pwa', 'data')
SUBJECTS = ['ds', 'os', 'co', 'cn']

# ---------- 自动还原 ----------

CAND = re.compile(
    r'for\s*\(|while\s*\(|void\s*\w*\s*\(|int\s*\w+\s*[=;(]|typedef|'
    r'struct\s|printf|switch\s*\(|case\s*\'|\w\+\+|#define|malloc|'
    r'unsigned|short\s*\w+\s*=')

# 代码区起点：类型声明 / 控制结构 / 自增 / printf / 紧跟分号的简单赋值（如 x=2;）
STRONG_START = re.compile(
    r'\b(?:void|int|char|bool(?!ean)|float|double|short|unsigned|typedef|struct)\s*[A-Za-z_]|'
    r'\b(?:for|while|if|switch|do)\s*\(|\w\+\+|printf\s*\(|#define|'
    r'\b[A-Za-z_]\w*=[\w\[\]\*\+\-\.]+;')

# OCR 粘连修复（多轮执行直到稳定）
GLUE_FIXES = [
    (re.compile(r'\b(void|int|char|float|double|long|short|unsigned|struct|typedef|static|const)(?=[A-Za-z_])'), r'\1 '),
    (re.compile(r'\b(bool)(?!ean)(?=[A-Za-z_])'), r'\1 '),
    (re.compile(r'\b(return)(?=[A-Za-z_0-9(\'"])'), r'\1 '),
    (re.compile(r'\b(else)(?=[A-Za-z_\u4e00-\u9fff])'), r'\1 '),
    (re.compile(r'\b(case)(?=[\'"A-Za-z_0-9])'), r'\1 '),
    (re.compile(r'\b(break|continue)(?=[A-Za-z_])'), r'\1 '),
]

CTRL_LEAD = re.compile(r'^((?:else\s+)?(?:for|while|if)\s*\((?:[^()]|\([^()]*\))*\))\s*(.+)$')
IDENT_LINE = re.compile(r'^[A-Za-z_]\w*(?:\[\w*\])*\s*;$')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def fix_glue(code):
    for _ in range(4):
        before = code
        for pat, rep in GLUE_FIXES:
            code = pat.sub(rep, code)
        if code == before:
            break
    return code


def split_statements(code):
    """按 ; { } 切语句（圆括号内的 ; 不切）"""
    stmts, buf, depth = [], '', 0
    for c in code:
        if c == '(':
            depth += 1
        elif c == ')':
            depth = max(depth - 1, 0)
        if c == ';' and depth == 0:
            stmts.append((buf + c).strip())
            buf = ''
        elif c == '{':
            stmts.append((buf + c).strip())
            buf = ''
        elif c == '}':
            if buf.strip():
                stmts.append(buf.strip())
            stmts.append('}')
            buf = ''
        else:
            buf += c
    if buf.strip():
        stmts.append(buf.strip())
    return [s for s in stmts if s]


def break_ctrl_chain(stmt):
    """把 for(...) for(...) xxx; 拆成悬挂缩进的多行；仅当剩余部分仍以控制结构开头才继续拆"""
    parts, cur = [], stmt
    while True:
        m = CTRL_LEAD.match(cur)
        if not m:
            parts.append(cur)
            break
        rest = m.group(2).strip()
        # 剩余是空语句体（单独的;）时不拆
        if rest == ';' or not re.match(r'(?:else\s+)?(?:for|while|if)\s*\(', rest):
            parts.append(cur)
            break
        parts.append(m.group(1))
        cur = rest
    return parts


def format_code(code):
    code = fix_glue(code).replace('；', ';')
    code = re.sub(r'\s+', ' ', code).strip()
    lines, depth = [], 0
    for s in split_statements(code):
        if s == '}' or s.startswith('}'):
            depth = max(depth - 1, 0)
            lines.append('    ' * depth + s)
            continue
        for j, part in enumerate(break_ctrl_chain(s)):
            lines.append('    ' * (depth + j) + part)
        if s.endswith('{'):
            depth += 1
    # 合并 "}" + "record;" 这类结构体收尾
    merged = []
    for ln in lines:
        if merged and merged[-1].strip() == '}' and IDENT_LINE.match(ln.strip()):
            merged[-1] = merged[-1] + ' ' + ln.strip()
        else:
            merged.append(ln)
    return '\n'.join(esc(x) for x in merged)


def transform(content):
    """自动模式：定位代码区 → 还原 → 包 <pre>。返回 None 表示不改。"""
    if '<pre' in content:
        return None
    m = STRONG_START.search(content)
    if not m:
        return None
    start = m.start()
    rest = content[start:]
    norm = rest.replace('；', ';')
    tail_pos = max(norm.rfind(';'), norm.rfind('}'))
    if tail_pos < 0:
        return None
    code_raw = rest[:tail_pos + 1]
    trailing = rest[tail_pos + 1:].strip()
    stem = content[:start].strip()
    formatted = format_code(code_raw)
    if formatted.count('\n') < 1:
        return None
    out = stem + '\n<pre class="code-block">' + formatted + '</pre>'
    if trailing:
        out += '\n' + trailing
    return out


# ---------- 手工重建（双栏 OCR 交错 / 内联引用题） ----------
# 段列表：('t', 文本) 或 ('c', 原始代码——写入时自动转义并包 <pre>)

MANUAL = {
    'ds_0146': [
        ('t', '【2015统考真题】已知程序如下:'),
        ('c', 'int S(int n) {\n    return (n<=0)?0:S(n-1)+n;\n}\nvoid main() {\n    cout<<S(1);\n}'),
        ('t', '程序运行时使用栈来保存调用过程的信息，自栈底到栈顶保存的信息依次对应的是( )。'),
    ],
    'os_0248': [
        ('t', '有两个并发进程P1和P2,其程序代码如下:'),
        ('c', 'P1(){\n    x=1;       //A1\n    y=2;\n    z=x+y;\n    print z;   //A2\n}\nP2(){\n    x=-3;      //B1\n    c=x*x;\n    print c;   //B2\n}'),
        ('t', '可能打印出的z值有( ),可能打印出的c值有( )(其中x为P1,P2的共享变量)。'),
    ],
    'os_0251': [
        ('t', '两个进程P0和P1互斥的Peterson算法描述如下:'),
        ('c', '// 进程P0                    // 进程P1\nflag[0]=1;                   flag[1]=1;\n(1);                         (2);\nwhile(flag[1]&&turn==1);     while(flag[0]&&turn==0);\n临界区;                       临界区;\nflag[0]=0;                   flag[1]=0;\n其余代码;                     其余代码;'),
        ('t', '其中，(1)和(2)处的代码分别为( )'),
    ],
    'os_0263': [
        ('t', '【2010统考真题】进程P0和进程P1的共享变量定义及其初值为:'),
        ('c', 'boolean flag[2];\nint turn=0;\nflag[0]=false; flag[1]=false;'),
        ('t', '若进程P0和进程P1访问临界资源的类C代码如下：'),
        ('c', 'void P0()    // 进程P0\n{\n    while(true) {\n        flag[0]=true; turn=1;\n        while(flag[1]&&(turn==1));\n        临界区;\n        flag[0]=false;\n    }\n}\nvoid P1()    // 进程P1\n{\n    while(true) {\n        flag[1]=true; turn=0;\n        while(flag[0]&&(turn==0));\n        临界区;\n        flag[1]=false;\n    }\n}'),
        ('t', '则并发执行进程P0和进程P1时产生的情况是( )'),
    ],
    'os_0265': [
        ('t', '【2016统考真题】进程P1和P2均包含并发执行的线程,部分伪代码描述如下所示。'),
        ('c', '// 进程P1\nint x=0;\nThread1(){\n    int a;\n    a=1; x+=1;\n}\nThread2(){\n    int a;\n    a=2; x+=2;\n}\n\n// 进程P2\nint x=0;\nThread3(){\n    int a;\n    a=x; x+=3;\n}\nThread4(){\n    int b;\n    b=x; x+=4;\n}'),
        ('t', '下列选项中,需要互斥执行的操作是( )'),
    ],
    'os_0266': [
        ('t', '【2016统考真题】使用TSL(Test and Set Lock)指令实现进程互斥的伪代码如下所示。'),
        ('c', 'do{\n    ...\n    while(TSL(&lock));\n    critical section;\n    lock=FALSE;\n    ...\n}while(TRUE);'),
        ('t', '下列与该实现机制相关的叙述中,正确的是( )'),
    ],
    'os_0294': [
        ('t', '下面是一个并发进程的程序代码,正确的是( )'),
        ('c', 'Semaphore x1=x2=y=1;\nint c1=c2=0;\nP1(){\n    while(1){\n        P(x1);\n        if(++c1==1) P(y);\n        V(x1);\n        computer(A);\n        P(x1);\n        if(--c1==0) V(y);\n        V(x1);\n    }\n}\nP2(){\n    while(1){\n        P(x2);\n        if(++c2==1) P(y);\n        V(x2);\n        computer(B);\n        P(x2);\n        if(--c2==0) V(y);\n        V(x2);\n    }\n}'),
    ],
    'os_0295': [
        ('t', '有两个并发进程,对于如下这段程序的运行,正确的说法是( )'),
        ('c', 'int x,y,z,t,u;\nP1(){\n    while(1){\n        x=1;\n        y=0;\n        if x>=1 then y=y+1;\n        z=y;\n    }\n}\nP2(){\n    while(1){\n        x=0;\n        t=0;\n        if x<=1 then t=t+2;\n        u=t;\n    }\n}'),
    ],
    'co_0133': [
        ('t', '【2012统考真题】某计算机存储器按字节编址,采用小端方式存放数据。假定编译器规定int型和short型长度分别为32位和16位,并且数据按边界对齐存储。某C语言程序段如下:'),
        ('c', 'struct{\n    int a;\n    char b;\n    short c;\n} record;\nrecord.a=273;'),
        ('t', '若record变量的首地址为0xC008,地址0xC008中的内容及record.c的地址分别为( )'),
    ],
    'co_0139': [
        ('t', '【2018统考真题】某32位计算机按字节编址,采用小端方式。若语句“int i=0;”对应指令的机器代码为“C745FC 00000000”，则语句“int i=-64;”对应指令的机器代码是( )'),
    ],
    'co_0254': [
        ('t', '【2016统考真题】有如下C语言程序段:'),
        ('c', 'for(k=0;k<1000;k++)\n    a[k]=a[k]+32;'),
        ('t', '若数组a和变量k均为int型,int型数据占4B,数据Cache采用直接映射方式,数据区大小为1KB、块大小为16B，该程序段执行前Cache为空，则该程序段执行过程中访问数组a的Cache缺失率约为( )'),
    ],
    'co_0330': [
        ('t', '某C语言程序中对数组变量b的声明为“int b[10][5];”,有一条for语句如下:'),
        ('c', 'for(i=0;i<10;i++)\n    for(j=0;j<5;j++)\n        sum+=b[i][j];'),
        ('t', '假设执行到“sum+=b[i][j];”时,sum的值在eax中,b[i][0]所在地址在edx中,j在esi中,则“sum+=b[i][j];”所对应的指令(Intel格式)可以是( )'),
    ],
}


def build_manual(segs):
    parts = []
    for kind, val in segs:
        if kind == 't':
            parts.append(val)
        else:
            parts.append('<pre class="code-block">' + esc(val) + '</pre>')
    return '\n'.join(parts)


# ---------- 主流程 ----------

def main():
    apply_mode = '--apply' in sys.argv
    if apply_mode:
        os.makedirs(BACKUP_DIR, exist_ok=True)
    report, total = [], 0
    for s in SUBJECTS:
        path = os.path.join(QDIR, f'{s}.json')
        data = json.load(open(path, encoding='utf-8'))
        changed = 0
        for q in data['questions']:
            content = q.get('content', '')
            if q['id'] in MANUAL:
                new = build_manual(MANUAL[q['id']])
                tag = '手工'
            elif CAND.search(content):
                new = transform(content)
                tag = '自动'
            else:
                continue
            if new is None or new == content:
                report.append(f"\n==== {q['id']} [跳过] ====\n{content[:150]}")
                continue
            changed += 1
            report.append(f"\n==== {q['id']} [{tag}] ====\n--- 原文 ---\n{content}\n--- 还原 ---\n{new}")
            if apply_mode:
                q['content'] = new
        if apply_mode and changed:
            shutil.copy2(path, os.path.join(BACKUP_DIR, f'{s}.json'))
            json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            shutil.copy2(path, os.path.join(PWA_DATA, f'{s}.json'))
        report.append(f"\n>>> {s}: 改动 {changed} 题")
        total += changed
    report.append(f"\n总计改动 {total} 题" + ('（已写回+同步pwa）' if apply_mode else '（预览模式）'))
    out = '\n'.join(report)
    open(os.path.join(ROOT, '_preview_codefmt.txt'), 'w', encoding='utf-8').write(out)
    print(f"total changed: {total}, report -> _preview_codefmt.txt")


if __name__ == '__main__':
    main()
