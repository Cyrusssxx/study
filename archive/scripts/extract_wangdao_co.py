#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""王道计组 PDF 提取脚本：复用 v4 逻辑，提取 wangdao_co_full.json"""
import fitz, os, re, json, sys

PDF_PATH = r'D:/ai code/408教材/2027王道《计算机组成原理》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
OUT_PATH = r'D:/ai code/408-quiz-app/data/ocr_cache/wangdao_co_full.json'
FIRST_CH_PDF_PAGE = 12  # 教材page1 = PDF page12（已探测确认）

# 目录页码 OCR 修正（目录文本层个别页码提取有误）
PAGE_CORRECTIONS = {'5.4': 228}

def extract_toc(doc):
    """从目录页解析章节结构"""
    first_toc = None
    for i in range(min(20, len(doc))):
        if '目 录' in doc[i].get_text():
            first_toc = i
            break
    if first_toc is None:
        return [], []
    toc_text = ''
    for i in range(first_toc, min(first_toc + 10, len(doc))):
        text = doc[i].get_text()
        if re.search(r'第\s*\d+\s*章\s*\n', text) and '【考纲内容】' in text:
            break
        toc_text += text + '\n'
    ch_pattern = re.compile(r'第\s*(\d+)\s*章\s+(.+?)(?:⋯{2,}|\.{2,}|\s{3,})(\d+)', re.MULTILINE)
    chapters = []
    for m in ch_pattern.finditer(toc_text):
        chapters.append({
            'num': int(m.group(1)),
            'title': m.group(2).strip(),
            'textbook_page': int(m.group(3)),
        })
    # 小节行：X.Y 标题（容忍行首 * 前缀）
    sec_pattern = re.compile(r'^[*\s]*(\d+\.\d+)\s+(.+?)(?:⋯{2,}|\.{2,}|\s{3,})(\d+)$', re.MULTILINE)
    sections = []
    for m in sec_pattern.finditer(toc_text):
        full_num = m.group(1)
        parts = full_num.split('.')
        if len(parts) == 2:
            sections.append({
                'full_num': full_num,
                'ch_num': int(parts[0]),
                'sec_num': int(parts[1]),
                'title': m.group(2).strip(),
                'textbook_page': PAGE_CORRECTIONS.get(full_num, int(m.group(3))),
            })
    return chapters, sections

def text_to_html(text):
    """正文文本 → 笔记HTML（保留小节标题 h5、列表 ul、段落 p，去页眉页脚）"""
    lines = text.split('\n')
    html_parts = []
    in_list = False
    in_table = False

    def close_all():
        nonlocal in_list, in_table
        if in_list: html_parts.append('</ul>'); in_list = False
        if in_table: html_parts.append('</table>'); in_table = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            close_all()
            continue
        # 遇到习题/答案部分：截断本节点剩余内容（笔记只需考点讲解）
        if '本节习题精选' in stripped or '答案与解析' in stripped:
            break
        # 页眉页脚
        if re.match(r'^\d{4}年.*考研复习指导$', stripped):
            continue
        if re.match(r'^\d+$', stripped) and len(stripped) <= 4:
            continue
        # 小节标题（x.y.z 或 x.y 开头、行较短）
        if re.match(r'^\d+\.\d+\.\d+\s+', stripped) and len(stripped) < 40:
            close_all()
            html_parts.append(f'<h5>{stripped}</h5>')
            continue
        if re.match(r'^\d+\.\d+\s+', stripped) and len(stripped) < 30:
            close_all()
            html_parts.append(f'<h5>{stripped}</h5>')
            continue
        # 列表项
        if stripped.startswith(('•', '●', '-', '—', '→', '⇒')) or re.match(r'^[一二三四五六七八九十]+[、.．]', stripped):
            if not in_list:
                close_all()
                html_parts.append('<ul>')
                in_list = True
            item = stripped.lstrip('•●-—→⇒1234567890、.． ').strip()
            html_parts.append(f'<li>{item}</li>')
            continue
        # 表格行（双空格分隔 2~6 列）
        if '  ' in stripped and 20 < len(stripped) < 200:
            cells = [c.strip() for c in re.split(r'\s{2,}', stripped) if c.strip()]
            if 2 <= len(cells) <= 6 and all(len(c) < 40 for c in cells):
                if not in_table:
                    close_all()
                    html_parts.append('<table>')
                    in_table = True
                html_parts.append('<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>')
                continue
        if in_table:
            html_parts.append('</table>')
            in_table = False
        html_parts.append(f'<p>{stripped}</p>')

    close_all()
    return '\n'.join(html_parts)

def main():
    doc = fitz.open(PDF_PATH)
    print(f'总页数: {len(doc)}')
    chapters, sections = extract_toc(doc)
    print(f'目录解析: {len(chapters)}章, {len(sections)}小节')
    for ch in chapters:
        print('  章', ch['num'], ch['title'], '教材页', ch['textbook_page'])
    page_offset = FIRST_CH_PDF_PAGE - chapters[0]['textbook_page']
    print('页码偏移:', page_offset)

    result = []
    for i, ch in enumerate(chapters):
        ch_num = ch['num']
        ch_start = ch['textbook_page'] + page_offset - 1
        ch_end = (chapters[i + 1]['textbook_page'] + page_offset - 1) if i + 1 < len(chapters) else len(doc)
        ch_sections = [s for s in sections if s['ch_num'] == ch_num]
        print(f'处理 第{ch_num}章 {ch["title"]} (PDF p{ch_start+1}-{ch_end}) 节数 {len(ch_sections)}')
        if not ch_sections:
            text = '\n'.join(doc[p].get_text() for p in range(ch_start, ch_end))
            result.append({
                'chapter': f'第{ch_num}章 {ch["title"]}',
                'sections': [{'section': f'{ch_num}.1 {ch["title"]}', 'html': text_to_html(text)}],
            })
        else:
            sec_list = []
            for j, sec in enumerate(ch_sections):
                sec_start = sec['textbook_page'] + page_offset - 1
                sec_end = (ch_sections[j + 1]['textbook_page'] + page_offset - 1) if j + 1 < len(ch_sections) else ch_end
                text = '\n'.join(doc[p].get_text() for p in range(sec_start, sec_end))
                sec_list.append({
                    'section': f'{sec["full_num"]} {sec["title"]}',
                    'html': text_to_html(text),
                })
            result.append({'chapter': f'第{ch_num}章 {ch["title"]}', 'sections': sec_list})

    doc.close()
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print('保存:', OUT_PATH)

if __name__ == '__main__':
    main()
