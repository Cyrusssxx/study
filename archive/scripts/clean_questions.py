#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理笔记：只保留知识点，移除所有题目/答案/解析
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

# 需要移除的关键词（题目/答案/解析相关）
REMOVE_KEYWORDS = [
    '试题精选', '答案解析', '考研真题', '模拟题', '【答案】', '题精选',
    '视频讲解', '扫一扫', '考点追踪', '本章疑难点', '复习提示',
    '【考纲内容】', '【知识框架】', '【复习提示】',
    '考点追综', '真题精选', '自测题', '练习题',
    '例1.', '例2.', '例3.', '例4.', '例5.',
    '解:', '解析:', '答案:', '解答:',
    'A.', 'B.', 'C.', 'D.',  # 选项
    '题1.', '题2.', '题3.', '题4.', '题5.',
]

def should_remove_line(line):
    """判断一行是否应该被移除"""
    line = line.strip()
    if not line:
        return False
    
    # 含题目/答案关键词
    for kw in REMOVE_KEYWORDS:
        if kw in line:
            return True
    
    # 匹配题目模式：数字+选项 或 答案解析
    if re.match(r'^\d+[.．]\s*[A-D]', line):  # 1.A  2.B
        return True
    if re.match(r'^[A-D][.．]', line):  # A. B. C. D.
        return True
    if re.match(r'^\d+\s*[.．]\s*\d+', line):  # 题号
        return True
    
    return False

def clean_html(html):
    """清理HTML中的题目和无关内容"""
    lines = html.split('\n')
    result = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # 跳过空行
        if not stripped:
            i += 1
            continue
        
        # 检查是否题目/答案块
        if should_remove_line(stripped):
            # 跳过整个题目块（直到遇到空行或下一个知识点）
            i += 1
            while i < len(lines):
                next_line = lines[i].strip()
                if not next_line:
                    i += 1
                    break
                if should_remove_line(next_line):
                    i += 1
                    continue
                # 检查是否是新的知识点开始
                if next_line.startswith('<p>') and not should_remove_line(next_line):
                    break
                i += 1
            continue
        
        # 跳过纯题目标签
        if stripped in ['<p>试题精选</p>', '<p>答案解析</p>', '<p>考研真题</p>', 
                        '<p>视频讲解</p>', '<p>扫一扫</p>', '<p>考点追踪</p>',
                        '<p>本章疑难点</p>', '<p>复习提示</p>']:
            i += 1
            continue
        
        result.append(line)
        i += 1
    
    return '\n'.join(result)

def clean_subject(subj):
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    total_removed = 0
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            original = sec['html']
            cleaned = clean_html(original)
            sec['html'] = cleaned
            
            # 统计移除量
            if len(original) != len(cleaned):
                total_removed += 1
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()}: 清理了 {total_removed} 节')

for subj in ['ds', 'cn', 'os']:
    clean_subject(subj)
