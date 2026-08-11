# -*- coding: utf-8 -*-
"""
修复题库 OCR 私有区(PUA)字符与无歧义的上标丢失：
1. 成对括号字符（同一字符既当左括号又当右括号，按出现顺序奇偶配对）：
   F0EE→()  F0F6→[]  F0F7→⌊⌋  F0F8→⌈⌉  F0E4→{}
2. 单字符映射：F00A→′  F0F4→|  F0B1→∑  F0E0→{  F0E1→}  F0E8→[  F0E9→]
3. 纯排版残渣删除：F0E2 F0EA F0DC
4. 无歧义上标/下标还原：log n 2→log₂n、log 2(→log₂(、O(n2)→O(n²)、O(2n)→O(2ⁿ)
修改前自动备份到 data/questions/backup_pua/
"""
import json
import io
import os
import re
import shutil

BASE = r'D:\ai code\408-quiz-app\data\questions'
BACKUP = os.path.join(BASE, 'backup_pua')

PAIRED = {'\uf0ee': ('(', ')'), '\uf0f6': ('[', ']'), '\uf0f7': ('⌊', '⌋'),
          '\uf0f8': ('⌈', '⌉'), '\uf0e4': ('{', '}')}
SINGLE = {'\uf00a': '′', '\uf0f4': '|', '\uf0b1': '∑',
          '\uf0e0': '{', '\uf0e1': '}', '\uf0e8': '[', '\uf0e9': ']'}
JUNK = {'\uf0e2', '\uf0ea', '\uf0dc'}
PUA_RE = re.compile(r'[\ue000-\uf8ff]')

SUP_FIXES = [
    (re.compile(r'log\s*([nmpq])\s+2(?![0-9])'), r'log₂\1'),   # log n 2 → log₂n
    (re.compile(r'log\s+2\s*\('), 'log₂('),                     # log 2( → log₂(
    (re.compile(r'O\(\s*n\s*2\s*\)'), 'O(n²)'),
    (re.compile(r'O\(\s*n\s*3\s*\)'), 'O(n³)'),
    (re.compile(r'O\(\s*2\s*n\s*\)'), 'O(2ⁿ)'),
]

stats = {'pua': 0, 'sup': 0, 'fields': 0}


def fix_text(txt):
    if not txt:
        return txt
    changed = False
    if PUA_RE.search(txt):
        out = []
        toggle = {}  # 每个成对字符在本字段内的开/闭状态
        for ch in txt:
            if ch in PAIRED:
                is_open = not toggle.get(ch, False)
                toggle[ch] = is_open
                if is_open:
                    out.append(PAIRED[ch][0] + '\x01')   # \x01=吃掉后续空格标记
                else:
                    out.append('\x02' + PAIRED[ch][1])   # \x02=吃掉前面空格标记
                stats['pua'] += 1
            elif ch in SINGLE:
                out.append(SINGLE[ch])
                stats['pua'] += 1
            elif ch in JUNK:
                stats['pua'] += 1
            else:
                out.append(ch)
        txt = ''.join(out)
        txt = re.sub(r'\x01 +', '', txt).replace('\x01', '')
        txt = re.sub(r' +\x02', '', txt).replace('\x02', '')
        txt = re.sub(r'  +', ' ', txt).rstrip()
        changed = True
    for p, r in SUP_FIXES:
        txt2 = p.sub(r, txt)
        if txt2 != txt:
            stats['sup'] += 1
            txt = txt2
            changed = True
    if changed:
        stats['fields'] += 1
    return txt


os.makedirs(BACKUP, exist_ok=True)
for k in ['ds', 'co', 'os', 'cn']:
    src = os.path.join(BASE, f'{k}.json')
    shutil.copy2(src, os.path.join(BACKUP, f'{k}.json'))
    d = json.load(io.open(src, encoding='utf-8'))
    for q in d['questions']:
        q['content'] = fix_text(q.get('content', ''))
        if q.get('explanation'):
            q['explanation'] = fix_text(q['explanation'])
        if q.get('options'):
            for ok_ in list(q['options'].keys()):
                q['options'][ok_] = fix_text(q['options'][ok_])
    with io.open(src, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(k, 'done')

print('PUA字符处理:', stats['pua'], '上标修复:', stats['sup'], '涉及字段:', stats['fields'])
