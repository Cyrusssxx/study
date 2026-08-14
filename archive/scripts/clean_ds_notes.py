#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并DS碎片化代码块 + 移除误判的中文<pre><code>
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

def clean_ds_notes(html):
    """清理DS笔记：合并碎片化代码块，移除误判"""
    # 找到所有<pre><code>...</code></pre>
    pattern = r'<pre><code>(.*?)</code></pre>'
    matches = list(re.finditer(pattern, html, re.DOTALL))
    
    if not matches:
        return html
    
    result = []
    last_end = 0
    code_buffer = []
    
    for m in matches:
        code_content = m.group(1).strip()
        
        # 判断是否真正的代码（排除纯中文描述）
        # 真正的代码：含关键字、类型定义、函数结构
        is_real_code = False
        code_kw = ['typedef', 'struct', 'void ', 'int ', 'char ', 'float ', 'double',
                   'for(', 'while(', 'if(', 'switch(', 'case ', 'printf(', 'scanf(',
                   'malloc(', 'free(', '#include', '#define', 'return ', 'else{', 'else {',
                   'break;', 'continue;', 'goto ', 'do {']
        
        # 统计代码关键字
        kw_count = sum(1 for kw in code_kw if kw in code_content)
        # 统计中文字符比例
        cn_chars = len(re.findall(r'[\u4e00-\u9fff]', code_content))
        total_chars = len(code_content.replace('\n', '').replace(' ', ''))
        cn_ratio = cn_chars / max(total_chars, 1)
        
        # 真正的代码：关键字>=2 或 (关键字>=1 且 中文比例<0.3)
        if kw_count >= 2 or (kw_count >= 1 and cn_ratio < 0.3):
            is_real_code = True
        
        # 多行且含代码符号
        lines = [l.strip() for l in code_content.split('\n') if l.strip()]
        if len(lines) >= 3 and kw_count >= 1:
            is_real_code = True
        
        if is_real_code:
            # 合并相邻代码块
            code_buffer.append(code_content)
        else:
            # 误判的中文，转为普通段落
            if code_buffer:
                # 先输出缓冲的代码
                merged = '\n'.join(code_buffer)
                result.append(f'<pre><code>{merged}</code></pre>')
                code_buffer = []
            # 把误判内容转为<p>
            result.append(f'<p>{code_content}</p>')
        
        last_end = m.end()
    
    # 处理末尾缓冲
    if code_buffer:
        merged = '\n'.join(code_buffer)
        result.append(f'<pre><code>{merged}</code></pre>')
    
    return '\n'.join(result)

def fix_subj(subj):
    path = f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json'
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            original = sec['html']
            cleaned = clean_ds_notes(original)
            sec['html'] = cleaned
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()} cleaned')

if __name__ == '__main__':
    fix_subj('ds')
