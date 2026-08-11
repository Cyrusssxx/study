"""
单科目测试 - 只处理操作系统，验证答案提取逻辑
"""
import fitz
import re
import os
import json
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, '..', '408教材和答案')
QUESTIONS_DIR = os.path.join(BASE_DIR, 'data', 'questions')


def get_pdf_path(keyword):
    for f in os.listdir(PDF_DIR):
        if keyword in f and f.endswith('.pdf'):
            return os.path.join(PDF_DIR, f)
    return None


def page_to_image(page, dpi=200):
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return np.array(img)


def ocr_page(img_array):
    result, elapse = ocr(img_array)
    if not result:
        return []
    return [(item[1], item[2]) for item in result]


def extract_answers_from_lines(lines):
    """从OCR行中提取选择题答案，忽略解答题部分"""
    answers = {}
    in_choice_section = True

    for text, confidence in lines:
        # 检测非选择题区域
        if re.search(r'(综合应用|解答题|应用题|填空题)', text):
            in_choice_section = False
            continue
        # 回到选择题区域
        if re.search(r'(选择题|单项选择|本节习题|本章习题)', text):
            in_choice_section = True
            continue

        if not in_choice_section:
            continue

        # 提取 "数字.字母" 答案模式
        pattern = r'(\d+)\s*[.．·、]\s*([A-Da-d])'
        matches = re.findall(pattern, text)
        for num_str, ans in matches:
            num = int(num_str)
            ans = ans.upper()
            if 1 <= num <= 200:
                answers[num] = ans

    return answers


def is_answer_page(lines):
    full_text = ' '.join([t for t, c in lines])
    matches = re.findall(r'\d+\s*[.．·、]\s*[A-Da-d]', full_text)
    return len(matches) >= 3


def main():
    keyword = '操作系统'
    pdf_path = get_pdf_path(keyword)
    json_path = os.path.join(QUESTIONS_DIR, 'os.json')

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    total_questions = data['total']

    print(f"科目: {keyword}")
    print(f"题目数: {total_questions}")

    doc = fitz.open(pdf_path)
    print(f"PDF页数: {len(doc)}")
    print()

    # 收集所有答案
    all_answers = []
    current_section_answers = {}
    section_count = 0

    for i in range(len(doc)):
        page = doc[i]
        img = page_to_image(page, dpi=200)
        lines = ocr_page(img)

        if is_answer_page(lines):
            # 提取这一页的答案
            page_ans = extract_answers_from_lines(lines)
            for num, ans in page_ans.items():
                current_section_answers[num] = ans
        else:
            # 非答案页：如果有积攒的答案就保存
            if current_section_answers:
                sorted_ans = sorted(current_section_answers.items())
                section_count += 1
                print(f"  第{section_count:2d}节: {len(sorted_ans):3d}题 "
                      f"(题号{sorted_ans[0][0]:3d}-{sorted_ans[-1][0]:3d}) "
                      f"答案: {' '.join(a for _, a in sorted_ans[:10])}...")
                for _, ans in sorted_ans:
                    all_answers.append(ans)
                current_section_answers = {}

        if (i + 1) % 30 == 0:
            print(f"  [进度] {i+1}/{len(doc)} 页已处理...")

    # 最后一节
    if current_section_answers:
        sorted_ans = sorted(current_section_answers.items())
        section_count += 1
        print(f"  第{section_count:2d}节: {len(sorted_ans):3d}题 "
              f"(题号{sorted_ans[0][0]:3d}-{sorted_ans[-1][0]:3d}) "
              f"答案: {' '.join(a for _, a in sorted_ans[:10])}...")
        for _, ans in sorted_ans:
            all_answers.append(ans)

    doc.close()

    print(f"\n总计: {section_count} 节, {len(all_answers)} 个答案")
    print(f"题库: {total_questions} 题")

    # 对比前10题答案
    print("\n前10题答案验证:")
    for idx in range(min(10, len(all_answers), total_questions)):
        q = data['questions'][idx]
        print(f"  {q['id']}: 答案={all_answers[idx]}  题目={q['content'][:40]}")


if __name__ == '__main__':
    main()
