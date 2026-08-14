# -*- coding: utf-8 -*-
"""
二次精修：OCR 语序残留
1. 选项字段末尾/中部的空括号对（⌈⌉ ⌊⌋ {}）是被 OCR 挪走的外层括号 → 包回整个前缀
2. 题干中漂浮的空括号对直接删除
3. 选项 'log p=log₂q 2' 这类行尾错位下标 → log₂p=...
4. ') ,' 与 ') 中文' 的多余空格
5. 选项中 '是/于/与 n2' → n²
（原始备份已在 data/questions/backup_pua/，本脚本不再覆盖备份）
"""
import json
import io
import re

BASE = r'D:\ai code\408-quiz-app\data\questions'
EMPTY_PAIR = re.compile(r'\s+(⌈⌉|⌊⌋|\{\})(?=[\s,，。]|$)')
WRAP = {'⌈⌉': ('⌈', '⌉'), '⌊⌋': ('⌊', '⌋'), '{}': ('{', '}')}
cnt = {'wrap': 0, 'drop': 0, 'log': 0, 'space': 0, 'n2': 0}


def polish_common(txt):
    t = re.sub(r'\)\s+(?=[,，。;；)])', ')', txt)
    t2 = re.sub(r'\)\s+(?=[\u4e00-\u9fff])', ')', t)
    if t2 != txt:
        cnt['space'] += 1
    return t2


def polish_option(txt):
    if not txt:
        return txt
    # 空括号对：包回整个前缀（选项是短公式，OCR 把外层括号挪到了后面）
    m = re.search(r'^(.*\S)\s+(⌈⌉|⌊⌋|\{\})\s*(.*)$', txt)
    if m and m.group(1):
        o, c = WRAP[m.group(2)]
        txt = f'{o}{m.group(1)}{c}{m.group(3)}'
        cnt['wrap'] += 1
    # 行尾错位的下标2：log p=log₂q 2 → log₂p=log₂q
    m = re.match(r'^log ([nmpq])(.*) 2$', txt)
    if m:
        txt = f'log₂{m.group(1)}{m.group(2)}'
        cnt['log'] += 1
    t2 = re.sub(r'([是于与])n2(?![0-9])', '\\1n²', txt)
    if t2 != txt:
        cnt['n2'] += 1
        txt = t2
    return polish_common(txt)


def polish_content(txt):
    if not txt:
        return txt
    t = EMPTY_PAIR.sub(' ', txt)
    if t != txt:
        cnt['drop'] += 1
    return polish_common(re.sub(r'  +', ' ', t).rstrip())


for k in ['ds', 'co', 'os', 'cn']:
    src = rf'{BASE}\{k}.json'
    d = json.load(io.open(src, encoding='utf-8'))
    for q in d['questions']:
        q['content'] = polish_content(q.get('content', ''))
        if q.get('explanation'):
            q['explanation'] = polish_content(q['explanation'])
        if q.get('options'):
            for ok_ in list(q['options'].keys()):
                q['options'][ok_] = polish_option(q['options'][ok_])
    with io.open(src, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(k, 'done')

print(cnt)
