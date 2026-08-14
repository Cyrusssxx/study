#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
激进清理笔记：移除所有题目/答案/解析/计算过程，只留知识点
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

def is_knowledge_line(line):
    """判断是否是纯知识点（保留）还是题目/解析（删除）"""
    line = line.strip()
    if not line or len(line) < 3:
        return True  # 空行不删
    
    # 明显题目模式（直接删除）
    delete_patterns = [
        r'^\d+[.．]\s*[A-D]',           # 1.A  2.B 题号+选项
        r'^[A-D][.．]\s+\S',            # A.xxx B.xxx 选项
        r'^【答案】',                    # 【答案】标记
        r'^\s*解[：:]',                  # 解：/解:
        r'^\s*解析[：:]',                # 解析：
        r'^\s*答案[：:]',                # 答案：
        r'^试题精选$',                   # 纯标签
        r'^答案解析$',
        r'^考研真题$',
        r'^模拟题$',
        r'^视频讲解$',
        r'^扫一扫$',
        r'^考点追踪$',
        r'^本章疑难点$',
        r'^复习提示$',
        r'^\d+\s*[.．]\s*\d+',          # 题号如 1．1
        r'^（\d+）',                     # （1）题号
        r'^图\s*\d+[．\-]',              # 图1.1 引用（题目中的图引用）
        r'^例\s*\d+[．:]',              # 例1. 例2.
        r'^题\s*\d+[．:]',              # 题1. 题2.
        r'^\(\d+\)',                     # (1) 题号
        r'^计算：',                      # 计算：
        r'^证明：',                      # 证明：
        r'^\s*假设',                     # 假设（题目开头）
        r'^\s*已知',                     # 已知（题目开头）
        r'^\s*求[:：]',                  # 求:（题目开头）
    ]
    
    for pat in delete_patterns:
        if re.match(pat, line):
            return False
    
    # 含=和×10的科学计算（计算题过程）
    if '=' in line and ('×10' in line or '÷' in line or '+' in line or '-' in line):
        # 检查是否有中文（有中文可能是知识描述）
        cn_chars = len(re.findall(r'[\u4e00-\u9fff]', line))
        if cn_chars < 5:
            return False
    
    # 含括号和问号（选择题特征）
    if '(' in line and ')' in line and '？' in line:
        return False
    
    # 含"A."/"B."/"C."/"D." 且行短（选项行）
    if re.search(r'[A-D][.．]', line) and len(line) < 100:
        return False
    
    return True

def clean_section_html(html):
    """清理单个节的HTML"""
    lines = html.split('\n')
    result = []
    skip_block = False
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # 跳过空行
        if not stripped:
            if skip_block:
                skip_block = False
                i += 1
                continue
            result.append(line)
            i += 1
            continue
        
        # 检查是否是题目块开始
        if not is_knowledge_line(stripped):
            # 跳过整个题目块（连续的多行题目）
            skip_block = True
            i += 1
            continue
        
        if skip_block:
            # 检查是否回到知识点
            if stripped.startswith('<p>') or stripped.startswith('<h'):
                skip_block = False
            else:
                i += 1
                continue
        
        # 移除HTML标签内的纯题目内容
        # 如果<p>内容以数字+点开头（如"02.B"），移除
        p_match = re.match(r'^<p>(\d+[.．][A-D].*)</p>$', stripped)
        if p_match:
            i += 1
            continue
        
        # 如果<p>内容是选项行，移除
        p_match2 = re.match(r'^<p>([A-D][.．].*)</p>$', stripped)
        if p_match2 and len(stripped) < 100:
            i += 1
            continue
        
        # 移除纯题目标签
        tag_match = re.match(r'^<p>(试题精选|答案解析|考研真题|模拟题|视频讲解|扫一扫|考点追踪|本章疑难点|复习提示)</p>$', stripped)
        if tag_match:
            i += 1
            continue
        
        result.append(line)
        i += 1
    
    return '\n'.join(result)

def clean_subject(subj):
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    total_cleaned = 0
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            original = sec['html']
            cleaned = clean_section_html(original)
            sec['html'] = cleaned
            
            if len(original) != len(cleaned):
                total_cleaned += 1
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()}: 清理了 {total_cleaned} 节')

for subj in ['ds', 'cn', 'os']:
    clean_subject(subj)
