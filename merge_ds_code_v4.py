#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DS代码块碎片化修复v4：激进合并 + 严格判断
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

FILE = r'D:/ai code/408-quiz-app/data/notes/ds_notes.json'

def is_real_code_line(line):
    """非常严格的代码行判断"""
    line = line.strip()
    if not line or len(line) < 3: return False
    
    # 强模式（才认为是代码）
    strong = [
        r'(typedef\s+)?struct\s+\w*\s*\{',           # struct
        r'(void|int|char|float|double|long|bool)\s+\w+\s*\([^)]*\)\s*\{',  # 函数
        r'#(include|define)\s+',                      # 预处理
        r'for\s*\([^;]+;[^;]+;[^)]+\)',               # for
        r'while\s*\([^)]+\)',                         # while
        r'if\s*\([^)]+\)',                            # if
        r'switch\s*\([^)]+\)',                        # switch
        r'printf\s*\(|scanf\s*\(|malloc\s*\(|free\s*\(',  # 库函数
    ]
    for p in strong:
        if re.search(p, line): return True
    
    # 含类型前缀的声明（int x;）
    if re.match(r'^\s*(int|char|float|double|long|unsigned)\s+\w+', line) and ';' in line:
        return True
    
    return False

def is_chinese_noise(text):
    """中文噪声"""
    if any(kw in text for kw in ['考点追踪','算法题','视频讲解','扫一扫','本章疑难点','考点追综']): return True
    cn = len(re.findall(r'[\u4e00-\u9fff]', text))
    total = len(text.replace('\n','').replace(' ',''))
    if total > 10 and cn / total > 0.4: return True
    return False

def process_section(html):
    """合并相邻<pre><code>块，过滤噪声"""
    pattern = re.compile(r'<pre><code>(.*?)</code></pre>', re.DOTALL)
    matches = list(pattern.finditer(html))
    if not matches: return html, 0, 0
    
    orig_count = len(matches)
    
    # 收集所有代码块区间
    segments = []
    last = 0
    for m in matches:
        if m.start() > last:
            segments.append(('text', html[last:m.start()]))
        segments.append(('code', m.group(1)))
        last = m.end()
    if last < len(html):
        segments.append(('text', html[last:]))
    
    # 合并连续代码块
    merged = []
    i = 0
    while i < len(segments):
        if segments[i][0] == 'code':
            # 收集连续code
            codes = []
            while i < len(segments) and segments[i][0] == 'code':
                codes.append(segments[i][1])
                i += 1
            
            all_text = '\n'.join(codes)
            lines = [l for l in all_text.split('\n') if l.strip()]
            real_lines = [l for l in lines if is_real_code_line(l)]
            
            # 真正代码行>=3 且 不是中文噪声 -> 保留为代码块
            if len(real_lines) >= 3 and not is_chinese_noise(all_text):
                merged.append('<pre><code>' + '\n'.join(lines) + '</code></pre>')
            else:
                # 转为普通段落
                for l in lines:
                    merged.append(f'<p>{l}</p>')
        else:
            merged.append(segments[i][1])
            i += 1
    
    new_html = ''.join(merged)
    final_count = len(re.findall(r'<pre><code>', new_html))
    return new_html, orig_count, final_count

# 加载
data = json.load(open(FILE, 'r', encoding='utf-8'))

total_orig = 0
total_final = 0
sec_count = 0

for ch in data['chapters']:
    for sec in ch['sections']:
        html = sec['html']
        if '<pre><code>' not in html: continue
        
        new_html, orig_c, final_c = process_section(html)
        sec['html'] = new_html
        total_orig += orig_c
        total_final += final_c
        sec_count += 1

# 保存
with open(FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'处理节数: {sec_count}')
print(f'代码块: {total_orig} -> {total_final}')
if sec_count > 0:
    print(f'平均: {total_orig/sec_count:.1f} -> {total_final/sec_count:.1f} 块/节')
