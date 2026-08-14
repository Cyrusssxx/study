#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
直接后处理DS笔记：合并相邻<pre><code>块 + 移除误判中文
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

FILE = r'D:/ai code/408-quiz-app/data/notes/ds_notes.json'

def is_real_code_line(line):
    """严格判断：真正的代码行"""
    line = line.strip()
    if not line or len(line) < 3: return False
    
    # 强代码模式
    strong = [r'(typedef\s+)?struct\s+\w*\s*\{', r'(void|int|char|float|double|long|bool)\s+\w+\s*\([^)]*\)\s*\{',
              r'#(include|define)\s+', r'for\s*\([^;]+;[^;]+;[^)]+\)', r'while\s*\([^)]+\)',
              r'if\s*\([^)]+\)', r'switch\s*\([^)]+\)', r'printf\s*\(|scanf\s*\(|malloc\s*\(|free\s*\(']
    for p in strong:
        if re.search(p, line): return True
    
    # 含类型前缀的声明
    if re.match(r'^\s*(int|char|float|double|long|unsigned|struct\s+\w+)\s+\w+', line) and ';' in line:
        return True
    
    # 多符号
    ops = ['->','<<','>>','==','!=','<=','>=','&&','||','++','--','+=','-=','*=','/=']
    if sum(1 for op in ops if op in line) >= 2: return True
    
    return False

def is_chinese_noise(text):
    """纯中文描述噪声"""
    if any(kw in text for kw in ['考点追踪','算法题','视频讲解','扫一扫','本章疑难点']): return True
    # 中文字符比例高 -> 中文描述
    cn = len(re.findall(r'[\u4e00-\u9fff]', text))
    total = len(text.replace('\n','').replace(' ',''))
    if total > 0 and cn / total > 0.5: return True
    return False

def process_section(html):
    """处理单个节的HTML：合并相邻代码块"""
    # 找到所有<pre><code>...</code></pre>及其位置
    pattern = re.compile(r'<pre><code>(.*?)</code></pre>', re.DOTALL)
    matches = list(pattern.finditer(html))
    if not matches: return html
    
    # 拆分为区间
    segments = []
    last = 0
    for m in matches:
        if m.start() > last:
            segments.append(('text', html[last:m.start()]))
        segments.append(('code', m.group(1), m.start(), m.end()))
        last = m.end()
    if last < len(html):
        segments.append(('text', html[last:]))
    
    # 处理代码块：合并相邻
    merged = []
    i = 0
    while i < len(segments):
        seg = segments[i]
        if seg[0] == 'code':
            # 收集连续代码块
            code_buf = [seg[1]]
            j = i + 1
            while j < len(segments):
                if segments[j][0] == 'text' and segments[j][1].strip() == '':
                    # 中间只有空白，可能是格式间隙
                    if j + 1 < len(segments) and segments[j+1][0] == 'code':
                        code_buf.append(segments[j+1][1])
                        j += 2
                        continue
                break
            
            # 判断这些代码块是否真正的代码
            all_text = '\n'.join(code_buf)
            lines = [l for l in all_text.split('\n') if l.strip()]
            real_lines = [l for l in lines if is_real_code_line(l)]
            noise_flag = is_chinese_noise(all_text)
            
            if noise_flag or len(real_lines) < 2:
                # 中文噪声或代码行不足 -> 转为普通文本
                for l in lines:
                    merged.append(f'<p>{l}</p>')
            else:
                # 真正的代码块
                merged.append('<pre><code>' + '\n'.join(lines) + '</code></pre>')
            
            i = j
        else:
            merged.append(seg[1])
            i += 1
    
    return ''.join(merged)

# 加载
data = json.load(open(FILE, 'r', encoding='utf-8'))

total_orig = 0
total_final = 0
sec_count = 0

for ch in data['chapters']:
    for sec in ch['sections']:
        html = sec['html']
        if '<pre><code>' not in html: continue
        
        # 统计原始
        orig_blocks = len(re.findall(r'<pre><code>', html))
        total_orig += orig_blocks
        sec_count += 1
        
        # 处理
        new_html = process_section(html)
        sec['html'] = new_html
        
        # 统计处理后
        final_blocks = len(re.findall(r'<pre><code>', new_html))
        total_final += final_blocks

# 保存
with open(FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'处理节数: {sec_count}')
print(f'代码块: {total_orig} -> {total_final}')
if sec_count > 0:
    print(f'平均: {total_orig/sec_count:.1f} -> {total_final/sec_count:.1f} 块/节')
