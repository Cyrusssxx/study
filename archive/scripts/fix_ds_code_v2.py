#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复DS笔记：改进代码检测逻辑，合并碎片化代码块
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

def merge_ds_code(html):
    """合并DS碎片化代码块"""
    lines = html.split('\n')
    result = []
    in_code = False
    code_buffer = []
    
    for line in lines:
        stripped = line.strip()
        
        # 匹配 <pre><code>...</code></pre>
        pre_match = re.match(r'^<pre><code>(.*?)</code></pre>$', stripped, re.DOTALL)
        if pre_match:
            code_content = pre_match.group(1)
            # 检查是否是真正的代码（多行或含关键字）
            code_lines = [l.strip() for l in code_content.split('\n') if l.strip()]
            if len(code_lines) >= 2 or any(kw in code_content for kw in ['typedef', 'struct', 'void ', 'int ', 'for(', 'while(', 'if(']):
                # 真正的代码块
                if in_code and code_buffer:
                    # 合并之前的
                    merged = '\n'.join(code_buffer)
                    result.append('<pre><code>' + merged + '</code></pre>')
                    code_buffer = []
                result.append('<pre><code>' + code_content + '</code></pre>')
                in_code = False
                continue
            else:
                # 单行伪代码，还原为普通文本
                if code_content.strip():
                    result.append('<p>' + code_content.strip() + '</p>')
                continue
        
        # 匹配 <code>...</code>
        code_match = re.match(r'^<code>(.*?)</code>$', stripped, re.DOTALL)
        if code_match:
            code_content = code_match.group(1)
            # 单行代码，还原为普通文本或合并
            if code_content.strip() and not code_content.strip().startswith('//'):
                code_buffer.append(code_content.strip())
                in_code = True
            continue
        
        # 普通行
        if in_code and code_buffer:
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
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            sec['html'] = merge_ds_code(sec['html'])
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()} fixed')

if __name__ == '__main__':
    fix_subj('ds')
