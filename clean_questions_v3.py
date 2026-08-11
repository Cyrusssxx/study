#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
终极清理：删除所有题目/答案/解析，只留知识点
策略：用正则匹配题目模式，删除整段
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

def remove_questions(html):
    """用正则删除题目块"""
    # 删除模式：题目+选项+答案+解析
    patterns = [
        # 试题精选/答案解析/考研真题 整块
        r'<p>\s*(试题精选|答案解析|考研真题|模拟题)\s*</p>[\s\S]*?(?=<h\d|$)',
        # 题号+选项 整块 (1.A xxx  B.xxx C.xxx D.xxx)
        r'<p>\s*\d+[.．]\s*[A-D][^<]*</p>\s*<p>\s*[A-D][.．][^<]*</p>\s*<p>\s*[A-D][.．][^<]*</p>\s*<p>\s*[A-D][.．][^<]*</p>',
        # 答案解析行
        r'<p>\s*【答案】[^<]*</p>',
        r'<p>\s*(解|解析|答案)[：:][^<]*</p>',
        # 选项行（A. B. C. D.）
        r'<p>\s*[A-D][.．]\s*\S[^<]{0,80}</p>',
        # 计算题过程（含=、×10、÷等）
        r'<p>\s*\d+[)）][^<]{10,200}</p>',  # 1)xxx 2)xxx
        # 图引用（题目中的）
        r'<p>\s*图\s*\d+[．\-][^<]*</p>',
    ]
    
    for pat in patterns:
        html = re.sub(pat, '', html)
    
    return html

for subj in ['ds', 'cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            sec['html'] = remove_questions(sec['html'])
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'{subj.upper()} 清理完成')
