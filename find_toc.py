#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从王道PDF目录页提取章节结构"""
import fitz, re, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

PDF_DIR = r'D:/ai code/408教材'

PDFS = {
    'ds': '2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    'cn': '2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    'os': '2027王道《操作系统》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
}

def find_toc_pages(doc):
    """找目录页（通常前10页内）"""
    toc_pages = []
    for i in range(min(15, len(doc))):
        text = doc[i].get_text()
        if '目 录' in text or '目录' in text:
            toc_pages.append(i)
    return toc_pages

def parse_toc(text):
    """解析目录文本，提取章节页码"""
    chapters = []
    # 匹配 "第X章 标题............页码"
    pattern = re.compile(r'第\s*(\d+)\s*章\s+(.+?)(?:\.{2,}|\s{3,})(\d+)', re.MULTILINE)
    for m in pattern.finditer(text):
        ch_num = int(m.group(1))
        title = m.group(2).strip()
        page = int(m.group(3))
        chapters.append({'ch_num': ch_num, 'title': title, 'page': page})
    return chapters

for subj, fname in PDFS.items():
    print(f'\n=== {subj.upper()} ===')
    doc = fitz.open(f'{PDF_DIR}/{fname}')
    print(f'总页数: {len(doc)}')
    
    toc_pages = find_toc_pages(doc)
    print(f'目录页: {[p+1 for p in toc_pages]}')
    
    # 合并所有目录页文本
    toc_text = '\n'.join(doc[p].get_text() for p in toc_pages)
    chapters = parse_toc(toc_text)
    
    print(f'解析出 {len(chapters)} 章:')
    for ch in chapters:
        print(f'  第{ch["ch_num"]}章 {ch["title"]} -> 第{ch["page"]}页')
    
    doc.close()
