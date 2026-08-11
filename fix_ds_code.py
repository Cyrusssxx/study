#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复DS笔记：合并碎片化代码块
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

def merge_code_blocks(html):
    """合并相邻的单行代码块为<pre><code>...</code></pre>"""
    lines = html.split('\n')
    result = []
    in_code = False
    code_buffer = []
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('<code>') and stripped.endswith('</code>'):
            # 单行代码块
            code_content = stripped[6:-7]  # 去掉<code>和</code>
            code_buffer.append(code_content)
            in_code = True
        else:
            if in_code:
                # 结束代码块
                if code_buffer:
                    # 合并代码行
                    merged = '\n'.join(code_buffer)
                    result.append('<pre><code>' + merged + '</code></pre>')
                    code_buffer = []
                in_code = False
            result.append(line)
    
    # 处理末尾
    if code_buffer:
        merged = '\n'.join(code_buffer)
        result.append('<pre><code>' + merged + '</code></pre>')
    
    return '\n'.join(result)

def fix_subj(subj):
    path = f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json'
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    total_before = 0
    total_after = 0
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            html = sec['html']
            # 统计原始代码块
            original_codes = len(re.findall(r'<code>', html))
            total_before += original_codes
            
            # 合并
            new_html = merge_code_blocks(html)
            sec['html'] = new_html
            
            # 统计新代码块
            new_codes = len(re.findall(r'<pre><code>', new_html))
            total_after += new_codes
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()}: 代码块 {total_before} -> {total_after}')

if __name__ == '__main__':
    fix_subj('ds')
