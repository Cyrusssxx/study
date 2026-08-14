# -*- coding: utf-8 -*-
"""从已写入的解析中剔除混入的页眉"第X章 章名"字串。

成因：教材每页页眉是"第X章 章名"，OCR后混进解析文字（有的自成段落，
有的粘在跨页解析的中间）。按各科已知章名精确匹配删除，不误伤正文。
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / 'data' / 'questions'
OUT = Path(__file__).parent / 'clean_headers_out.txt'

CHAPTER_PATTERNS = {
    'os': ['计算机系统概述', '进程与线程', '内存管理', '文件管理',
           r'输入[/／]?输出[（(]?[I1l/O0]{0,4}[）)]?管理'],
    'ds': ['绪论', '线性表', r'栈、?队列和数组', '串', '树与二叉树', '图', '查找', '排序'],
    'co': ['计算机系统概述', '数据的表示和运算', '存储系统', '指令系统',
           '中央处理器', '总线', r'输入[/／]?输出系统'],
    'cn': ['计算机网络体系结构', '物理层', '数据链路层', '网络层', '传输层', '应用层'],
}

lines_out = []


def log(s):
    lines_out.append(s)
    print(s)


total = 0
for subj, titles in CHAPTER_PATTERNS.items():
    fp = DATA / f'{subj}.json'
    data = json.loads(fp.read_text(encoding='utf-8'))
    questions = data['questions'] if isinstance(data, dict) else data
    pat = re.compile(r'第\s*\d\s*章\s*(' + '|'.join(titles) + ')')
    fixed = 0
    for q in questions:
        expl = q.get('explanation') or ''
        if not expl or not pat.search(expl):
            continue
        new = pat.sub('', expl)
        # 删除因剔除页眉而变空的段落
        new = re.sub(r'<p>\s*</p>', '', new)
        if new != expl:
            q['explanation'] = new
            fixed += 1
            log(f"[清除页眉] {q['id']} 删除{len(expl) - len(new)}字")
    if fixed:
        fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    log(f"== {subj}: 清除 {fixed} 题 ==")
    total += fixed

log(f"\n合计清除页眉 {total} 题")
OUT.write_text('\n'.join(lines_out), encoding='utf-8')
