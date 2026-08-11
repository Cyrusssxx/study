#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 wangdao_xxx_full.json 转换为 xxx_notes.json 格式
过滤掉"试题精选"、"答案解析"等非考点内容
保留考点讲解 + 代码/表格
"""
import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

OUT_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'
NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

# 需要过滤的小节标题（试题、答案、练习等）
FILTER_SECTIONS = [
    r'试题精选', r'答案与解析', r'本节试题', r'本节练习',
    r'综合应用题', r'单项选择题', r'归纳总结', r'思维拓展',
    r'考点追踪', r'考点追综', r'考点链接', r'复习提示',
    r'扫一扫', r'视频讲解', r'【考纲内容】', r'【知识框架】',
    r'【复习提示】',
]

def should_filter_section(title):
    """检查是否应该过滤该小节"""
    for pattern in FILTER_SECTIONS:
        if re.search(pattern, title):
            return True
    return False

def clean_html(html):
    """清理HTML中的噪声"""
    # 移除纯噪声行
    lines = html.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # 跳过页眉页脚
        if re.match(r'^\d{4}年.*考研复习指导$', stripped):
            continue
        if re.match(r'^\d+$', stripped):
            continue
        # 跳过扫一扫/视频讲解等
        if stripped in ['扫一扫', '视频讲解']:
            continue
        # 跳过纯标题行（如"第7 章"、"绪 论"）
        if re.match(r'^第\s*\d+\s*章$', stripped):
            continue
        if stripped == '绪 论':
            continue
        cleaned.append(line)
    return '\n'.join(cleaned)

def convert(subj):
    src = os.path.join(OUT_DIR, f'wangdao_{subj}_full.json')
    dst = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    
    data = json.load(open(src, 'r', encoding='utf-8'))
    
    notes = {'chapters': []}
    for ch in data:
        ch_data = {
            'chapter': ch['chapter'],
            'sections': []
        }
        for sec in ch['sections']:
            # 过滤试题/答案小节
            if should_filter_section(sec['section']):
                continue
            
            html = clean_html(sec['html'])
            if not html.strip():
                continue
                
            ch_data['sections'].append({
                'section': sec['section'],
                'html': html,
            })
        
        # 只保留有内容的章节
        if ch_data['sections']:
            notes['chapters'].append(ch_data)
    
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)
    
    # 统计
    ch_count = len(notes['chapters'])
    sec_count = sum(len(c['sections']) for c in notes['chapters'])
    size = os.path.getsize(dst)
    print(f'{subj.upper()}: {ch_count}章 {sec_count}节 -> {dst} ({size} bytes)')

if __name__ == '__main__':
    for subj in ['ds', 'cn', 'os']:
        convert(subj)
