#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
王道 PDF 提取脚本 v4：
1. 从目录页提取章节结构（章节号+教材内页码）
2. 建立教材页码→PDF页码映射（教材page1=PDF page12）
3. 按章节提取正文，用小节标题行在正文中切分
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
        'first_ch_pdf_page': 12,  # 第1章开始于PDF第12页
    },
    'cn': {
        'pdf': '2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'need_code': False,
        'need_images': True,
        'first_ch_pdf_page': 12,
    },
    'os': {
        'pdf': '2027王道《操作系统》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
        'need_code': False,
        'need_images': True,
        'first_ch_pdf_page': 14,
    },
}

def extract_toc(doc):
    """从目录页解析章节结构（包含所有目录范围内的页面，不仅是有'目 录'字样的页）"""
    # 先找第一个'目 录'页
    first_toc = None
    for i in range(min(20, len(doc))):
        if '目 录' in doc[i].get_text():
            first_toc = i
            break
    
    if first_toc is None:
        return [], []
    
    # 收集从第一个目录页到正文开始前的所有页面文本
    toc_text = ''
    for i in range(first_toc, min(first_toc + 10, len(doc))):
        text = doc[i].get_text()
        # 如果遇到正文章节标题（如"第7 章\n绪 论"），停止
        if re.search(r'第\s*\d+\s*章\s*\n', text) and '【考纲内容】' in text:
            break
        toc_text += text + '\n'
    
    # 章节行：第X章 标题⋯⋯页码
    ch_pattern = re.compile(r'第\s*(\d+)\s*章\s+(.+?)(?:⋯{2,}|\.{2,}|\s{3,})(\d+)', re.MULTILINE)
    chapters = []
    for m in ch_pattern.finditer(toc_text):
        chapters.append({
            'num': int(m.group(1)),
            'title': m.group(2).strip(),
            'textbook_page': int(m.group(3)),
        })
    
    # 小节行：X.Y 标题⋯⋯页码（过滤掉X.Y.Z子子节）
    sec_pattern = re.compile(r'^(\d+\.\d+)\s+(.+?)(?:⋯{2,}|\.{2,}|\s{3,})(\d+)$', re.MULTILINE)
    sections = []
    for m in sec_pattern.finditer(toc_text):
        full_num = m.group(1)
        parts = full_num.split('.')
        if len(parts) == 2:  # 只取两级
            sections.append({
                'full_num': full_num,
                'ch_num': int(parts[0]),
                'sec_num': int(parts[1]),
                'title': m.group(2).strip(),
                'textbook_page': int(m.group(3)),
            })
    
    return chapters, sections

def textbook_to_pdf_page(tbook_page, offset):
    """教材页码转PDF页码"""
    return tbook_page + offset - 1

def extract_images(doc, start_page, end_page, out_prefix, max_per_page=2):
    """提取页面范围内的图片（限制每页最多提取数）"""
    images = []
    for i in range(start_page, min(end_page, len(doc))):
        page = doc[i]
        img_list = page.get_images(full=True)
        if not img_list:
            continue
        for j, img in enumerate(img_list[:max_per_page]):
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
    """严格判断代码行（只匹配真正的代码结构，不匹配单行语句）"""
    line = line.strip()
    if not line or len(line) < 3:
        return False
    
    # 真正的代码定义模式
    code_patterns = [
        r'(typedef\s+)?struct\s+\w*\s*\{',  # struct定义
        r'(void|int|char|float|double|long|bool)\s+\w+\s*\([^)]*\)\s*\{',  # 函数定义
        r'#(include|define)\s+',  # 预处理
        r'for\s*\([^;]+;[^;]+;[^)]+\)',  # for循环
        r'while\s*\([^)]+\)',  # while循环
        r'if\s*\([^)]+\)',  # if语句
        r'switch\s*\([^)]+\)',  # switch
        r'case\s+.+:',  # case
        r'printf\s*\(|scanf\s*\(|malloc\s*\(|free\s*\(',  # 库函数
    ]
    
    for pattern in code_patterns:
        if re.search(pattern, line):
            return True
    
    # 多符号组合（至少2个不同符号）
    symbols = ['->', '<<', '>>', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
               '+=', '-=', '*=', '/=', '&=', '|=', '^=']
    sym_count = sum(1 for s in symbols if s in line)
    if sym_count >= 2:
        return True
    
    # 函数调用（至少2个）
    func_call = len(re.findall(r'\w+\s*\([^)]+\)', line))
    if func_call >= 2:
        return True
    
    # 单行赋值/声明带分号，且有明确类型前缀
    if re.match(r'^\s*(int|char|float|double|long|unsigned|struct\s+\w+)\s+\w+', line) and ';' in line:
        return True
    
    return False

def text_to_html(text, need_code=False):
    """将正文文本转换为笔记HTML（改进代码块检测：2行连续才开代码块）"""
    lines = text.split('\n')
    html_parts = []
    in_code = False
    in_list = False
    in_table = False
    code_buffer = []  # 暂存可能的代码行
    
    def flush_code():
        """刷新代码缓冲区：真正的代码行>=2才输出<pre><code>，否则作为普通文本"""
        nonlocal in_code, code_buffer
        if in_code:
            html_parts.append('</code></pre>')
            in_code = False
        if code_buffer:
            real_lines = [l for l in code_buffer if is_code_line(l)]
            if len(real_lines) >= 2:
                html_parts.append('<pre><code>' + '\n'.join(code_buffer) + '</code></pre>')
            else:
                for l in code_buffer:
                    html_parts.append(f'<p>{l}</p>')
            code_buffer = []
    
    def close_all():
        nonlocal in_code, in_list, in_table
        flush_code()
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
        
        # 代码检测：严格模式
        if need_code and is_code_line(stripped):
            code_buffer.append(stripped.replace('<', '&lt;').replace('>', '&gt;'))
            in_code = True
            continue
        else:
            # 非代码行，刷新缓冲区
            flush_code()
        
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

def extract_subject(subj_key, extract_imgs=False):
    """提取单个科目的全部内容"""
    cfg = SUBJECTS[subj_key]
    pdf_path = os.path.join(PDF_DIR, cfg['pdf'])
    print(f'\n=== 提取 {subj_key.upper()} ===')
    
    doc = fitz.open(pdf_path)
    print(f'总页数: {len(doc)}')
    
    # 从目录页解析结构
    chapters, sections = extract_toc(doc)
    print(f'目录解析: {len(chapters)}章, {len(sections)}小节')
    
    # 计算页码偏移
    first_ch = chapters[0] if chapters else {'textbook_page': 1}
    page_offset = cfg['first_ch_pdf_page'] - first_ch['textbook_page']
    print(f'页码偏移: PDF页码 = 教材页码 + {page_offset}')
    
    result = []
    
    for i, ch in enumerate(chapters):
        ch_num = ch['num']
        ch_title = ch['title']
        
        # 章节PDF页码范围
        ch_start = textbook_to_pdf_page(ch['textbook_page'], page_offset)
        if i + 1 < len(chapters):
            ch_end = textbook_to_pdf_page(chapters[i + 1]['textbook_page'], page_offset)
        else:
            ch_end = len(doc)
        
        print(f'  处理 第{ch_num}章 {ch_title} (PDF p{ch_start+1}-p{ch_end+1})...')
        
        # 找这一章的小节
        ch_sections = [s for s in sections if s['ch_num'] == ch_num]
        
        if not ch_sections:
            # 没有子节，整章作为一个section
            text = '\n'.join(doc[p].get_text() for p in range(ch_start, ch_end))
            html = text_to_html(text, cfg['need_code'])
            sec_data = {
                'section': f'{ch_num}.1 {ch_title}',
                'html': html,
            }
            if extract_imgs and cfg['need_images']:
                sec_data['images'] = extract_images(doc, ch_start, ch_end, f'{subj_key}_ch{ch_num}')
            
            result.append({
                'chapter': f'第{ch_num}章 {ch_title}',
                'sections': [sec_data],
            })
        else:
            sec_list = []
            for j, sec in enumerate(ch_sections):
                sec_start = textbook_to_pdf_page(sec['textbook_page'], page_offset)
                if j + 1 < len(ch_sections):
                    sec_end = textbook_to_pdf_page(ch_sections[j + 1]['textbook_page'], page_offset)
                else:
                    sec_end = ch_end
                
                text = '\n'.join(doc[p].get_text() for p in range(sec_start, sec_end))
                html = text_to_html(text, cfg['need_code'])
                sec_data = {
                    'section': f'{sec["full_num"]} {sec["title"]}',
                    'html': html,
                }
                if extract_imgs and cfg['need_images']:
                    sec_data['images'] = extract_images(doc, sec_start, sec_end,
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
        print('用法: python extract_wangdao_v4.py <ds|cn|os|all> [--imgs]')
        sys.exit(1)
    
    subj = sys.argv[1]
    extract_imgs = '--imgs' in sys.argv
    targets = ['ds', 'cn', 'os'] if subj == 'all' else [subj]
    
    for s in targets:
        data = extract_subject(s, extract_imgs=extract_imgs)
        out_path = os.path.join(OUT_DIR, f'wangdao_{s}_full.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'保存: {out_path}')

if __name__ == '__main__':
    main()
