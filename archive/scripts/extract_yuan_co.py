#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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

def split_sections(ch_text, ch_num):
    """按小节标题切分：'X.Y 中文' 开头，长度>50"""
    sec_re = re.compile(
        rf'^{ch_num}\.\d+\s+[\u4e00-\u9fff][^\n]{{2,40}}\n',
        re.MULTILINE
    )
    matches = list(sec_re.finditer(ch_text))
    sections = []
    for i, m in enumerate(matches):
        header = m.group(0).strip()
        sec_num = header.split()[0].rstrip()
        sec_title = header[len(sec_num):].strip()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(ch_text)
        sec_text = ch_text[start:end].strip()
        if len(sec_text) > 50:
            sections.append({
                'section_num': sec_num,
                'title': sec_title,
                'text': sec_text
            })
    # fallback: 如果一节的正文包含了所有其他内容，用更细的切分
    if len(sections) <= 1:
        # 尝试更宽松的匹配
        sec_re2 = re.compile(rf'({ch_num}\.\d+)\s+([\u4e00-\u9fff][^\n]{{2,40}})\n', re.MULTILINE)
        matches2 = list(sec_re2.finditer(ch_text))
        sections = []
        for i, m in enumerate(matches2):
            sec_num = m.group(1)
            sec_title = m.group(2)
            start = m.end()
            end = matches2[i+1].start() if i+1 < len(matches2) else len(ch_text)
            sec_text = ch_text[start:end].strip()
            if len(sec_text) > 30:
                sections.append({
                    'section_num': sec_num,
                    'title': sec_title,
                    'text': sec_text
                })
    return sections

def main():
    doc = fitz.open(PDF_PATH)
    chapters = sorted(MANUAL_CHAPTERS, key=lambda x: x['ch_num'])
    organized = {}
    for i, ch in enumerate(chapters):
        start = ch['page']
        end = chapters[i+1]['page'] - 1 if i+1 < len(chapters) else len(doc)
        texts = [doc[p].get_text() for p in range(start-1, min(end, len(doc)))]
        ch_text = '\n'.join(texts)
        sections = split_sections(ch_text, ch['ch_num'])
        key = f"第{ch['ch_num']}章 {ch['title']}"
        organized[key] = {
            'chapter': ch['ch_num'], 'title': key,
            'start_page': start, 'end_page': end,
            'total_chars': len(ch_text), 'sections': sections
        }
        print(f"{key}: {len(ch_text)} chars, {len(sections)} sections")
    out = os.path.join(OUT_DIR, 'yuan_co_structured.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(organized, f, ensure_ascii=False, indent=2)
    print(f"\nSaved: {out}")
    print(f"Total: {len(organized)} ch, {sum(len(v['sections']) for v in organized.values())} sec, {sum(v['total_chars'] for v in organized.values())} chars")

if __name__ == '__main__':
    main()
