#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

FILE = r'D:/ai code/408-quiz-app/data/notes/ds_notes.json'

def is_code_line(line):
    """严格判断单行是否为代码"""
    line = line.strip()
    if not line or len(line) < 3: return False
    pats = [r'(typedef\s+)?struct\s+\w*\s*\{', r'(void|int|char|float|double|long|bool)\s+\w+\s*\([^)]*\)\s*\{',
            r'#(include|define)\s+', r'for\s*\([^;]+;[^;]+;[^)]+\)', r'while\s*\([^)]+\)',
            r'if\s*\([^)]+\)', r'switch\s*\([^)]+\)', r'case\s+.+:',
            r'printf\s*\(|scanf\s*\(|malloc\s*\(|free\s*\(', r'else\{', r'else \{', r'do \{']
    for p in pats:
        if re.search(p, line): return True
    ops = ['->','<<','>>','==','!=','<=','>=','&&','||','++','--','+=','-=','*=','/=']
    if sum(1 for op in ops if op in line) >= 2: return True
    if len(re.findall(r'\b\w+\s*\([^)]*\)', line)) >= 2: return True
    if re.match(r'^\s*(int|char|float|double|long|unsigned)\s+\w+', line) and ';' in line: return True
    return False

def is_chinese_noise(text):
    """含考点追踪/算法题等关键词 -> 中文描述而非代码"""
    return any(kw in text for kw in ['考点追踪','算法题','视频讲解','扫一扫','本章疑难点'])

def merge_code_blocks(html):
    """合并<pre><code>块：中文噪声转<p>，碎片代码合并"""
    pattern = r'<pre><code>(.*?)</code></pre>'
    matches = list(re.finditer(pattern, html, re.DOTALL))
    if not matches: return html, 0, 0
    
    orig_count = len(matches)
    # 拆分为代码块与非代码块区间
    segments = []
    last = 0
    for m in matches:
        segments.append(('text', html[last:m.start()]))
        code = m.group(1)
        if is_chinese_noise(code):
            segments.append(('noise', code))
        elif is_code_line(code) or '\n' in code:
            segments.append(('code', code))
        else:
            segments.append(('noise', code))
        last = m.end()
    segments.append(('text', html[last:]))
    
    # 合并相邻代码片段
    merged = []
    code_buf = []
    for typ, content in segments:
        if typ == 'code':
            code_buf.append(content)
        else:
            if code_buf:
                merged_code = '\n'.join(code_buf)
                # 过滤噪声行
                lines = [l for l in merged_code.split('\n') if l.strip()]
                real_lines = [l for l in lines if is_code_line(l) or any(c in l for c in ['{',';','=', '('])]
                if len(real_lines) >= 2:
                    merged.append(('<pre><code>', '\n'.join(lines), '</code></pre>'))
                else:
                    merged.append(('<p>', '\n'.join(lines), '</p>'))
                code_buf = []
            if typ == 'noise':
                merged.append(('<p>', content.strip(), '</p>'))
            else:
                merged.append((None, content, None))
    if code_buf:
        lines = [l for l in '\n'.join(code_buf).split('\n') if l.strip()]
        merged.append(('<pre><code>', '\n'.join(lines), '</code></pre>'))
    
    # 重建HTML
    final_blocks = [b for b in merged if b[0] is not None and b[0] == '<pre><code>']
    final_html = ''
    for seg in merged:
        if seg[0] is None:
            final_html += seg[1]
        else:
            tag_open, content, tag_close = seg
            final_html += tag_open + content + tag_close
    
    return final_html, orig_count, len(final_blocks)

data = json.load(open(FILE, 'r', encoding='utf-8'))
total_orig, total_final, sec_count = 0, 0, 0
for ch in data['chapters']:
    for sec in ch['sections']:
        html = sec['html']
        if '<pre><code>' not in html: continue
        new_html, orig_c, final_c = merge_code_blocks(html)
        sec['html'] = new_html
        total_orig += orig_c
        total_final += final_c
        sec_count += 1

with open(FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'处理节数: {sec_count}')
print(f'代码块: {total_orig} -> {total_final}')
print(f'平均行数: {total_orig/max(sec_count,1):.1f} -> {total_final/max(sec_count,1):.1f}')
