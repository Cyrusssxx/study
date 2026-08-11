#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为每章生成结构化的纯文本，供子任务生成笔记"""
import fitz, re, json, os, sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

PDF_PATH = r'D:/ai code/408教材/计算机组成原理.pdf'
OUT_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'

MANUAL_CHAPTERS = [
    {'page': 9, 'ch_num': 1, 'title': '计算机系统概述'},
    {'page': 31, 'ch_num': 2, 'title': '数据的机器级表示'},
    {'page': 60, 'ch_num': 3, 'title': '运算方法和运算部件'},
    {'page': 99, 'ch_num': 4, 'title': '指令系统'},
    {'page': 137, 'ch_num': 5, 'title': '中央处理器'},
    {'page': 173, 'ch_num': 6, 'title': '指令流水线'},
    {'page': 214, 'ch_num': 7, 'title': '存储器层次结构'},
    {'page': 281, 'ch_num': 8, 'title': '系统互连及输入输出组织'},
    {'page': 331, 'ch_num': 9, 'title': '并行处理系统'},
]

def clean_text(text):
    """清理PDF提取的文本"""
    # 去掉页眉页脚（如"计算机组成与系统结构(第3版)"）
    text = re.sub(r'计算机组成与系统结构\(第3版\)\n', '', text)
    # 去掉孤立的页码
    text = re.sub(r'^\d+\n', '', text, flags=re.MULTILINE)
    # 合并过短的行
    lines = text.split('\n')
    merged = []
    for line in lines:
        if merged and len(merged[-1]) < 30 and not merged[-1].endswith('。') and not merged[-1].endswith('）'):
            merged[-1] += line
        else:
            merged.append(line)
    return '\n'.join(merged)

def split_to_sections(text, ch_num):
    """尝试按小节标题切分"""
    # 匹配 "X.Y 标题" 或 "X.Y.Z 标题"
    sec_re = re.compile(rf'^({ch_num}\.\d+(?:\.\d+)?)\s+([\u4e00-\u9fff][^\n]{{1,40}})', re.MULTILINE)
    matches = list(sec_re.finditer(text))
    
    sections = []
    for i, m in enumerate(matches):
        sec_num = m.group(1)
        sec_title = m.group(2).strip()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        sec_text = text[start:end].strip()
        if len(sec_text) > 30:
            sections.append({
                'section_num': sec_num,
                'title': sec_text,
                'text': sec_text
            })
    
    if not sections:
        sections = [{'section_num': f'{ch_num}.0', 'title': '全文', 'text': text}]
    
    return sections

def main():
    doc = fitz.open(PDF_PATH)
    chapters = sorted(MANUAL_CHAPTERS, key=lambda x: x['ch_num'])
    
    for i, ch in enumerate(chapters):
        start = ch['page']
        end = chapters[i+1]['page'] - 1 if i+1 < len(chapters) else len(doc)
        texts = [doc[p].get_text() for p in range(start-1, min(end, len(doc)))]
        raw = '\n'.join(texts)
        cleaned = clean_text(raw)
        
        # 保存每章纯文本
        out = os.path.join(OUT_DIR, f'yuan_co_ch{ch["ch_num"]}.txt')
        with open(out, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        print(f"第{ch['ch_num']}章: {len(cleaned)} chars -> {out}")

if __name__ == '__main__':
    main()
