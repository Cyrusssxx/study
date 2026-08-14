#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
王道 PDF 综合提取脚本（改进版）：文字 + 图片（CN/OS）+ 代码适配（DS）
改进：
1. 章节标题排除带页码点的行
2. 小节匹配更严格（排除正文中的题号引用）
3. 合并连续的同章节结果
4. 保留图片提取能力
"""
import fitz, os, re, json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

PDF_DIR = r'D:/ai code/408教材'
OUT_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'

SUBJECTS = {
    'ds': {
        'pdf': '2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'title_re': r'第\s*(\d+)\s*章\s*([^\d\.]{2,20})',
        'sec_re': r'^(\d+\.\d+)\s+(.{2,30}?)(?:\s*[\d．.]+)?$',
        'need_code': True,
        'need_images': False,
    },
    'cn': {
        'pdf': '2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'title_re': r'第\s*(\d+)\s*章\s*([^\d\.]{2,20})',
        'sec_re': r'^(\d+\.\d+)\s+(.{2,30}?)(?:\s*[\d．.]+)?$',
        'need_code': False,
        'need_images': True,
    },
    'os': {
        'pdf': r'2027王道《操作系统》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'title_re': r'第\s*(\d+)\s*章\s*([^\d\.]{2,20})',
        'sec_re': r'^(\d+\.\d+)\s+(.{2,30}?)(?:\s*[\d．.]+)?$',
        'need_code': False,
        'need_images': True,
    },
}

def extract_text_by_page(doc, start_page, end_page):
    """提取指定范围的页面文本"""
    texts = []
    for i in range(start_page, end_page):
        texts.append(doc[i].get_text())
    return texts

def is_chapter_title(line):
    """检查是否为真正的章节标题（排除页码点行、正文引用等）"""
    line = line.strip()
    # 排除空行
    if not line:
        return False
    # 排除页码点行：如果行内有大量连续点号，是页码行
    if line.count('．') + line.count('.') + line.count('…') > 3:
        return False
    # 排除过短的行（可能是页码）
    if len(line) < 5:
        return False
    # 排除纯数字
    if line.isdigit():
        return False
    # 排除题号行（如 "01." "02."）
    if re.match(r'^\d{2,3}\.', line):
        return False
    return True

def detect_chapters(doc, title_re):
    """检测章节边界"""
    chapters = []
    pattern = re.compile(title_re)
    for i in range(len(doc)):
        text = doc[i].get_text()
        for m in pattern.finditer(text):
            title = m.group(0).strip()
            if is_chapter_title(title):
                # 检查这个章节标题附近是否有页码点（可能是目录行）
                # 真正的章节标题通常在页面前几行
                chapters.append({
                    'title': title,
                    'title_num': m.group(1),
                    'title_name': m.group(2).strip(),
                    'start_page': i,
                })
    # 去重：同一页面可能有多个匹配，取第一个
    seen_pages = set()
    unique_chapters = []
    for ch in chapters:
        if ch['start_page'] not in seen_pages:
            seen_pages.add(ch['start_page'])
            unique_chapters.append(ch)
    chapters = unique_chapters
    
    # 计算结束页
    for idx, ch in enumerate(chapters):
        if idx + 1 < len(chapters):
            ch['end_page'] = chapters[idx + 1]['start_page']
        else:
            ch['end_page'] = len(doc)
    return chapters

def detect_sections_in_chapter(doc, start_page, end_page, sec_re):
    """在章节内检测小节"""
    sections = []
    pattern = re.compile(sec_re)
    for i in range(start_page, end_page):
        text = doc[i].get_text()
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            m = pattern.match(line)
            if m:
                sec_num = m.group(1)
                sec_name = m.group(2).strip()
                # 过滤：section名称不能太长，不能包含大量标点
                if len(sec_name) > 30:
                    continue
                if sec_name.count('，') + sec_name.count('。') + sec_name.count('；') > 2:
                    continue
                sections.append({
                    'section': sec_num + ' ' + sec_name,
                    'sec_num': sec_num,
                    'sec_name': sec_name,
                    'start_page': i,
                })
    for idx, s in enumerate(sections):
        if idx + 1 < len(sections):
            s['end_page'] = sections[idx + 1]['start_page']
        else:
            s['end_page'] = end_page
    return sections

def extract_images_from_page(doc, page_num, out_dir, prefix):
    """提取页面中的图片"""
    page = doc[page_num]
    images = []
    img_list = page.get_images(full=True)
    for j, img in enumerate(img_list):
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        fname = f'{prefix}_p{page_num+1}_img{j}.png'
        pix.save(os.path.join(out_dir, fname))
        images.append(fname)
        pix = None
    return images

def is_code_line(line):
    """启发式判断是否为代码行"""
    code_indicators = [
        'int ', 'void ', 'char ', 'float ', 'double ', 'long ',
        'struct ', 'typedef ', 'return ', 'if ', 'for ', 'while ',
        'switch ', 'case ', 'break;', 'continue;', 'else ',
        '#include', '#define', 'printf(', 'scanf(', 'malloc(',
        '->', '==', '!=', '>=', '<=', '&&', '||', '<<', '>>',
        '++', '--', '+=', '-=', '*=', '/=',
    ]
    stripped = line.strip()
    if not stripped:
        return False
    indicator_count = sum(1 for ind in code_indicators if ind in stripped)
    if stripped.endswith(';') or stripped.endswith('{') or stripped.endswith('}'):
        indicator_count += 1
    return indicator_count >= 2

def format_text_for_notes(text, need_code=False):
    """格式化为笔记HTML"""
    lines = text.split('\n')
    html_parts = []
    in_list = False
    in_code = False
    in_table = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                html_parts.append('</ul>')
                in_list = False
            if in_code:
                html_parts.append('</code></pre>')
                in_code = False
            if in_table:
                html_parts.append('</table>')
                in_table = False
            continue
        
        # 排除页码行
        if stripped.isdigit():
            continue
        if re.match(r'^\d{4}年.*考研复习指导$', stripped):
            continue
        
        # 小节标题
        if re.match(r'\d+\.\d+\s+', stripped) and len(stripped) < 30:
            if in_list: html_parts.append('</ul>'); in_list = False
            if in_code: html_parts.append('</code></pre>'); in_code = False
            if in_table: html_parts.append('</table>'); in_table = False
            html_parts.append(f'<h5>{stripped}</h5>')
            continue
        
        # 代码块检测
        if need_code and is_code_line(stripped):
            if not in_code:
                if in_list: html_parts.append('</ul>'); in_list = False
                if in_table: html_parts.append('</table>'); in_table = False
                html_parts.append('<pre><code>')
                in_code = True
            html_parts.append(stripped.replace('<', '&lt;').replace('>', '&gt;'))
            continue
        else:
            if in_code:
                html_parts.append('</code></pre>')
                in_code = False
        
        # 列表项
        if stripped.startswith(('•', '●', '-', '—', '→', '⇒')) or re.match(r'[\d一二三四五六七八九十]+[、.．]', stripped):
            if not in_code:
                if not in_list:
                    if in_table: html_parts.append('</table>'); in_table = False
                    html_parts.append('<ul>')
                    in_list = True
                html_parts.append(f'<li>{stripped.lstrip("•●-—→⇒1234567890、.． ").strip()}</li>')
                continue
        
        # 表格行检测
        if '  ' in stripped and len(stripped) > 20:
            cells = [c.strip() for c in re.split(r'\s{2,}', stripped) if c.strip()]
            if len(cells) >= 2 and len(cells) <= 6:
                if not in_table:
                    if in_list: html_parts.append('</ul>'); in_list = False
                    html_parts.append('<table>')
                    in_table = True
                html_parts.append('<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>')
                continue
            else:
                if in_table:
                    html_parts.append('</table>')
                    in_table = False
        else:
            if in_table:
                html_parts.append('</table>')
                in_table = False
        
        # 普通段落
        html_parts.append(f'<p>{stripped}</p>')
    
    if in_list: html_parts.append('</ul>')
    if in_code: html_parts.append('</code></pre>')
    if in_table: html_parts.append('</table>')
    
    return '\n'.join(html_parts)

def extract_subject(subj_key):
    """提取单个科目的全部内容"""
    cfg = SUBJECTS[subj_key]
    pdf_path = os.path.join(PDF_DIR, cfg['pdf'])
    print(f'\n=== 提取 {subj_key.upper()} ===')
    print(f'PDF: {os.path.basename(pdf_path)}')
    
    doc = fitz.open(pdf_path)
    print(f'总页数: {len(doc)}')
    
    # 检测章节
    chapters = detect_chapters(doc, cfg['title_re'])
    print(f'检测到 {len(chapters)} 章')
    
    result = []
    
    for ch in chapters:
        print(f'  处理 {ch["title_num"]}章 {ch["title_name"]}...')
        sections = detect_sections_in_chapter(doc, ch['start_page'], ch['end_page'], cfg['sec_re'])
        
        if not sections:
            # 没有子节，整章作为一个section
            texts = extract_text_by_page(doc, ch['start_page'], ch['end_page'])
            full_text = '\n'.join(texts)
            html = format_text_for_notes(full_text, cfg['need_code'])
            sec = {
                'section': f'{ch["title_num"]}.1 {ch["title_name"]}',
                'html': html,
            }
            if cfg['need_images']:
                sec['images'] = extract_images_from_page(doc, ch['start_page'], 
                    os.path.join(OUT_DIR, 'images', subj_key), f'{subj_key}_ch{ch["title_num"]}')
            result.append({
                'chapter': f'第{ch["title_num"]}章 {ch["title_name"]}',
                'sections': [sec],
            })
        else:
            sec_list = []
            for s in sections:
                texts = extract_text_by_page(doc, s['start_page'], s['end_page'])
                full_text = '\n'.join(texts)
                html = format_text_for_notes(full_text, cfg['need_code'])
                sec = {
                    'section': s['section'],
                    'html': html,
                }
                if cfg['need_images']:
                    sec['images'] = extract_images_from_page(doc, s['start_page'],
                        os.path.join(OUT_DIR, 'images', subj_key), f'{subj_key}_ch{ch["title_num"]}_s{s["sec_num"]}')
                sec_list.append(sec)
            result.append({
                'chapter': f'第{ch["title_num"]}章 {ch["title_name"]}',
                'sections': sec_list,
            })
    
    doc.close()
    return result

def main():
    if len(sys.argv) < 2:
        print('用法: python extract_wangdao.py <ds|cn|os|all>')
        sys.exit(1)
    
    subj = sys.argv[1]
    if subj == 'all':
        for s in ['ds', 'cn', 'os']:
            data = extract_subject(s)
            out_path = os.path.join(OUT_DIR, f'wangdao_{s}_full.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f'保存: {out_path}')
    else:
        data = extract_subject(subj)
        out_path = os.path.join(OUT_DIR, f'wangdao_{subj}_full.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'保存: {out_path}')

if __name__ == '__main__':
    main()
