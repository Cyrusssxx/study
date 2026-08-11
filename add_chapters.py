"""
为题库补充章节信息 (chapter/section)
复用 parse_pdf.py 的解析逻辑，同时跟踪章节标记的位置，
按顺序与现有 JSON 题目对齐后写入 chapter/section 字段。
运行: python add_chapters.py
"""
import os
import re
import json
import io
import sys
import pdfplumber
from config import PDF_DIR, QUESTIONS_DIR, SUBJECTS
from parse_pdf import clean_text, split_inline_options

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def find_markers(text):
    """找出章/节标记及其在文本中的位置"""
    chapters = []  # (pos, "第X章 标题")
    sections = []  # (pos, "X.Y 标题")
    for m in re.finditer(r'^第(\d+)章\s*([^\n]{1,30})$', text, re.M):
        title = m.group(2).strip()
        # 排除目录行（含点线填充符或结尾是页码）
        if '\uf001' in title or re.search(r'\d{1,3}$', title.replace(' ', '')) and '\uf001' in m.group(0):
            continue
        if '\uf001' in m.group(0):
            continue
        chapters.append((m.start(), f"第{m.group(1)}章 {title}"))
    for m in re.finditer(r'^(\d{1,2})\.(\d{1,2})\s*([^\n]{1,25})$', text, re.M):
        title = m.group(3).strip()
        # 排除目录行、公式行等
        if '\uf001' in title or not title:
            continue
        if any(c in title for c in '()（）?？。,，=+'):
            continue
        sections.append((m.start(), f"{m.group(1)}.{m.group(2)} {title}"))
    return chapters, sections


def latest_before(markers, pos):
    """返回位置 pos 之前最近的标记"""
    result = ''
    for p, name in markers:
        if p <= pos:
            result = name
        else:
            break
    return result


def parse_with_chapters(text):
    """复刻 parse_pdf.parse_questions_improved 的验证逻辑，附带章节信息"""
    text = clean_text(text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    chapters, sections = find_markers(text)

    # 与 parse_pdf 相同的切分点，同时记录每块起始偏移
    split_positions = [0] + [m.start() + 1 for m in re.finditer(r'\n(?=\s*\d+\s*[.、．\)）])', text)]
    split_positions.append(len(text))

    results = []  # (chapter, section, content前缀)
    for i in range(len(split_positions) - 1):
        start, end = split_positions[i], split_positions[i + 1]
        block = text[start:end].strip()
        if not block:
            continue

        num_match = re.match(r'\s*(\d+)\s*[.、．\)）]\s*(.*)', block, re.DOTALL)
        if not num_match:
            continue
        q_body = num_match.group(2).strip()
        if not q_body or len(q_body) < 10:
            continue

        q_body = split_inline_options(q_body)
        option_start = re.search(r'(?:^|\n)\s*A\s*[.、．\)）\s]', q_body)
        if not option_start:
            continue

        content = q_body[:option_start.start()].strip()
        options_text = q_body[option_start.start():].strip()
        opt_parts = re.split(r'(?:^|\n)\s*([A-D])\s*[.、．\)）\s]\s*', options_text)
        options = {}
        j = 1
        while j < len(opt_parts) - 1:
            letter = opt_parts[j].strip()
            opt_content = re.sub(r'\s+', ' ', opt_parts[j + 1]).strip()
            opt_content = re.sub(r'\s*·.*$', '', opt_content).strip()
            if letter in 'ABCD' and opt_content:
                options[letter] = opt_content
            j += 2
        if len(options) < 2:
            continue

        content = re.sub(r'\s+', ' ', content).strip()
        if not content:
            continue

        results.append({
            'chapter': latest_before(chapters, start),
            'section': latest_before(sections, start),
            'content': content,
        })
    return results


def main():
    for key, info in SUBJECTS.items():
        pdf_path = os.path.join(PDF_DIR, info['pdf'])
        json_path = os.path.join(QUESTIONS_DIR, info['json'])
        print(f"\n处理 {info['name']} ...")

        full_text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    full_text += t + "\n"

        parsed = parse_with_chapters(full_text)

        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)
        questions = data['questions']

        if len(parsed) != len(questions):
            print(f"  [警告] 解析数({len(parsed)}) != 题库数({len(questions)})，跳过该科目")
            continue

        mismatch = 0
        for p, q in zip(parsed, questions):
            # 内容前缀校验，确保顺序对齐
            if p['content'][:15] != q['content'][:15]:
                mismatch += 1
            q['chapter'] = p['chapter']
            q['section'] = p['section']

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        with_ch = sum(1 for q in questions if q.get('chapter'))
        with_sec = sum(1 for q in questions if q.get('section'))
        print(f"  已写入: {with_ch}/{len(questions)} 题有章信息, {with_sec} 题有节信息, 内容前缀不匹配 {mismatch} 题")


if __name__ == '__main__':
    main()
