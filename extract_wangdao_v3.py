#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
王道 PDF 综合提取脚本 v3：文字 + 图片（CN/OS）+ 代码适配（DS）
从目录页解析结构 → 按章节提取正文
"""
import fitz, os, re, json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

PDF_DIR = r'D:/ai code/408教材'
OUT_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'
IMG_DIR = os.path.join(OUT_DIR, 'images')

for d in [OUT_DIR, IMG_DIR]:
    os.makedirs(d, exist_ok=True)

SUBJECTS = {
    'ds': {
        'pdf': '2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'need_code': True,
        'need_images': False,
        'start_chapter_page': 12,  # 正文从第12页开始
    },
    'cn': {
        'pdf': '2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'need_code': False,
        'need_images': True,
        'start_chapter_page': 12,
    },
    'os': {
        'pdf': '2027王道《操作系统》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'need_code': False,
        'need_images': True,
        'start_chapter_page': 14,
    },
}

def extract_toc_structure(doc):
    """从目录页解析章节结构"""
    toc_text = ''
    for i in range(min(20, len(doc))):
        text = doc[i].get_text()
        if '目 录' in text or '目录' in text:
            toc_text += text + '\n'
    
    # 匹配章节行：第X章 标题⋯⋯页码
    ch_pattern = re.compile(r'第\s*(\d+)\s*章\s+(.+?)(?:⋯{2,}|\.{2,}|\s{2,})(\d+)', re.MULTILINE)
    # 匹配小节行：X.Y 标题⋯⋯页码
    sec_pattern = re.compile(r'(\d+\.\d+)\s+(.+?)(?:⋯{2,}|\.{2,}|\s{2,})(\d+)', re.MULTILINE)
    
    chapters = []
    for m in ch_pattern.finditer(toc_text):
        chapters.append({
            'num': int(m.group(1)),
            'title': m.group(2).strip(),
            'page': int(m.group(3)),
        })
    
    sections = []
    for m in sec_pattern.finditer(toc_text):
        sections.append({
            'full_num': m.group(1),
            'ch_num': int(m.group(1).split('.')[0]),
            'sec_num': int(m.group(1).split('.')[1]),
            'title': m.group(2).strip(),
            'page': int(m.group(3)),
        })
    
    return chapters, sections

def find_chapter_pages(doc, chapters, start_body_page):
    """计算每个章节的起止页"""
    result = []
    for i, ch in enumerate(chapters):
        # 章节起始页：目录中的页码（需要转换为0索引）
        start = ch['page'] - 1  # 转为0索引
        if start < start_body_page:
            start = start_body_page
        
        # 章节结束页：下一个章节的起始页
        if i + 1 < len(chapters):
            end = chapters[i + 1]['page'] - 1
        else:
            end = len(doc)
        
        result.append({
            'num': ch['num'],
            'title': ch['title'],
            'start': start,
            'end': end,
        })
    
    return result

def find_section_pages(doc, sections, chapter_start, chapter_end):
    """在章节内找小节页码"""
    result = []
    ch_sections = [s for s in sections if chapter_start <= s['page'] - 1 < chapter_end]
    
    for i, sec in enumerate(ch_sections):
        start = sec['page'] - 1
        if i + 1 < len(ch_sections):
            end = ch_sections[i + 1]['page'] - 1
        else:
            end = chapter_end
        
        result.append({
            'full_num': sec['full_num'],
            'title': sec['title'],
            'start': start,
            'end': end,
        })
    
    return result

def extract_images(doc, start_page, end_page, out_prefix):
    """提取页面范围内的图片"""
    images = []
    for i in range(start_page, min(end_page, len(doc))):
        page = doc[i]
        for j, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha > 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            fname = f'{out_prefix}_p{i+1}_i{j}.png'
            pix.save(os.path.join(IMG_DIR, fname))
            images.append({'page': i+1, 'file': fname})
            pix = None
    return images

def is_code_line(line):
    """启发式判断代码行"""
    line = line.strip()
    if not line or len(line) < 3:
        return False
    indicators = ['int ', 'void ', 'char ', 'float ', 'double ', 'long ', 'struct ',
                  'typedef ', 'return ', 'if (', 'for (', 'while (', 'switch (',
                  'case ', 'break;', 'else {', 'else ', '#include', '#define',
                  'printf(', 'scanf(', 'malloc(', 'free(', '->', '<<', '>>',
                  '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=']
    count = sum(1 for ind in indicators if ind in line)
    if line.endswith(';') or line.endswith('{') or line.endswith('}') or line.endswith(':'):
        count += 1
    return count >= 2

def text_to_html(text, need_code=False):
    """将正文文本转换为笔记HTML"""
    lines = text.split('\n')
    html_parts = []
    in_code = False
    in_list = False
    in_table = False
    
    def close_all():
        nonlocal in_code, in_list, in_table
        if in_code: html_parts.append('</code></pre>'); in_code = False
        if in_list: html_parts.append('</ul>'); in_list = False
        if in_table: html_parts.append('</table>'); in_table = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            close_all()
            continue
        
        # 跳过页眉页脚
        if re.match(r'^\d{4}年.*考研复习指导$', stripped):
            continue
        if re.match(r'^\d+$', stripped) and len(stripped) <= 4:
            continue
        
        # 检测小节标题
        if re.match(r'^\d+\.\d+\s+', stripped) and len(stripped) < 30:
            close_all()
            html_parts.append(f'<h5>{stripped}</h5>')
            continue
        
        # 检测代码
        if need_code and is_code_line(stripped):
            if not in_code:
                close_all()
                html_parts.append('<pre><code>')
                in_code = True
            html_parts.append(stripped.replace('<', '&lt;').replace('>', '&gt;'))
            continue
        else:
            if in_code:
                html_parts.append('</code></pre>')
                in_code = False
        
        # 列表项
        if stripped.startswith(('•', '●', '-', '—', '→', '⇒')) or re.match(r'^[一二三四五六七八九十]+[、.．]', stripped):
            if not in_list:
                close_all()
                html_parts.append('<ul>')
                in_list = True
            item = stripped.lstrip('•●-—→⇒1234567890、.． ').strip()
            html_parts.append(f'<li>{item}</li>')
            continue
        
        # 表格行
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

def extract_subject(subj_key):
    """提取单个科目的全部内容"""
    cfg = SUBJECTS[subj_key]
    pdf_path = os.path.join(PDF_DIR, cfg['pdf'])
    print(f'\n=== 提取 {subj_key.upper()} ===')
    
    doc = fitz.open(pdf_path)
    print(f'总页数: {len(doc)}')
    
    # 从目录页解析结构
    chapters, sections = extract_toc_structure(doc)
    print(f'目录解析: {len(chapters)}章, {len(sections)}小节')
    
    # 计算章节页码范围
    ch_pages = find_chapter_pages(doc, chapters, cfg['start_chapter_page'])
    
    result = []
    
    for ch in ch_pages:
        ch_num = ch['num']
        ch_title = ch['title']
        print(f'  处理 第{ch_num}章 {ch_title} (p{ch["start"]+1}-p{ch["end"]+1})...')
        
        # 找这一章的小节
        sec_pages = find_section_pages(doc, sections, ch['start'], ch['end'])
        
        if not sec_pages:
            # 没有子节，整章作为一个section
            text = '\n'.join(doc[i].get_text() for i in range(ch['start'], ch['end']))
            html = text_to_html(text, cfg['need_code'])
            sec_data = {
                'section': f'{ch_num}.1 {ch_title}',
                'html': html,
            }
            if cfg['need_images']:
                sec_data['images'] = extract_images(doc, ch['start'], ch['end'], f'{subj_key}_ch{ch_num}')
            
            result.append({
                'chapter': f'第{ch_num}章 {ch_title}',
                'sections': [sec_data],
            })
        else:
            sec_list = []
            for sec in sec_pages:
                text = '\n'.join(doc[i].get_text() for i in range(sec['start'], sec['end']))
                html = text_to_html(text, cfg['need_code'])
                sec_data = {
                    'section': f'{sec["full_num"]} {sec["title"]}',
                    'html': html,
                }
                if cfg['need_images']:
                    sec_data['images'] = extract_images(doc, sec['start'], sec['end'], 
                        f'{subj_key}_ch{ch_num}_s{sec["full_num"]}')
                sec_list.append(sec_data)
            
            result.append({
                'chapter': f'第{ch_num}章 {ch_title}',
                'sections': sec_list,
            })
    
    doc.close()
    return result

def main():
    if len(sys.argv) < 2:
        print('用法: python extract_wangdao_v3.py <ds|cn|os|all>')
        sys.exit(1)
    
    subj = sys.argv[1]
    targets = ['ds', 'cn', 'os'] if subj == 'all' else [subj]
    
    for s in targets:
        data = extract_subject(s)
        out_path = os.path.join(OUT_DIR, f'wangdao_{s}_full.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'保存: {out_path}')

if __name__ == '__main__':
    main()
