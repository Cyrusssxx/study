"""
从王道教材 PDF（图片格式）中提取选择题答案
使用 RapidOCR + PyMuPDF

逻辑：
1. 扫描所有页面进行 OCR
2. 识别答案页（含密集 "数字.字母" 模式的页面）
3. 只提取选择题答案，跳过解答题/综合应用题
4. 按顺序累积答案，映射到题库 JSON 的题目 ID
5. 写入 JSON 文件
"""
import fitz  # PyMuPDF
import re
import os
import json
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

# 初始化 OCR
ocr = RapidOCR()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, '..', '408教材和答案')
QUESTIONS_DIR = os.path.join(BASE_DIR, 'data', 'questions')

# 科目映射: (PDF关键词, JSON文件名)
SUBJECTS = [
    ('操作系统', 'os.json', 'os'),
    ('数据结构', 'ds.json', 'ds'),
    ('计算机组成原理', 'co.json', 'co'),
    ('计算机网络', 'cn.json', 'cn'),
]


def get_pdf_path(keyword):
    """根据关键词找PDF文件"""
    for f in os.listdir(PDF_DIR):
        if keyword in f and f.endswith('.pdf'):
            return os.path.join(PDF_DIR, f)
    return None


def page_to_image(page, dpi=200):
    """将PDF页面转为高清图片数组"""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return np.array(img)


def ocr_page(img_array):
    """对图片进行OCR，返回文本行列表"""
    result, elapse = ocr(img_array)
    if not result:
        return []
    # result: [[box, text, confidence], ...]
    lines = [(item[1], item[2]) for item in result]
    return lines


def extract_answers_from_text(lines):
    """
    从OCR文本行中提取选择题答案
    返回: [(题号int, 答案str), ...] 按题号排序
    只提取选择题部分，遇到"综合应用题"/"解答题"等标记停止
    """
    answers = {}
    in_choice_section = True  # 默认在选择题区域

    for text, confidence in lines:
        # 检测是否进入非选择题区域
        if re.search(r'(综合应用|解答题|应用题|填空题)', text):
            in_choice_section = False
            continue

        # 检测是否回到选择题区域（新的小节）
        if re.search(r'(选择题|单项选择|本节习题|本章习题)', text):
            in_choice_section = True
            continue

        if not in_choice_section:
            continue

        # 提取答案模式: 数字 + 分隔符 + 字母(A/B/C/D)
        # 支持格式: "01.C", "1. A", "2．B", "3、D"
        # 也支持一行多个答案: "1.A 2.B 3.C"
        pattern = r'(\d+)\s*[.．·、]\s*([A-Da-d])'
        matches = re.findall(pattern, text)
        for num_str, ans in matches:
            num = int(num_str)
            ans = ans.upper()
            if 1 <= num <= 200:  # 合理题号范围
                answers[num] = ans

    # 按题号排序返回
    return sorted(answers.items())


def is_answer_page(lines):
    """判断是否为答案页"""
    full_text = ' '.join([t for t, c in lines])
    answer_pattern = re.findall(r'\d+\s*[.．·、]\s*[A-Da-d]', full_text)
    return len(answer_pattern) >= 3


def process_subject(keyword, json_file, subject_key):
    """处理单个科目"""
    pdf_path = get_pdf_path(keyword)
    if not pdf_path:
        print(f"  [错误] 未找到包含 '{keyword}' 的PDF文件")
        return 0

    json_path = os.path.join(QUESTIONS_DIR, json_file)
    if not os.path.exists(json_path):
        print(f"  [错误] 题库文件不存在: {json_path}")
        return 0

    # 加载题库
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total_questions = data['total']
    print(f"  PDF: {os.path.basename(pdf_path)}")
    print(f"  题库: {json_file} ({total_questions} 题)")

    # 打开PDF
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    print(f"  PDF页数: {total_pages}")

    # 收集所有答案（按出现顺序）
    all_answers = []  # 累积的答案列表
    section_count = 0
    processed_pages = 0

    # 记录每个小节的答案范围，用于去重和排序
    current_section_answers = {}
    last_max_num = 0

    for i in range(total_pages):
        page = doc[i]
        img = page_to_image(page, dpi=200)
        lines = ocr_page(img)
        processed_pages += 1

        if not is_answer_page(lines):
            # 如果当前有未处理的小节答案，先保存
            if current_section_answers:
                # 按题号排序，加入总答案列表
                sorted_ans = sorted(current_section_answers.items())
                for num, ans in sorted_ans:
                    all_answers.append(ans)
                section_count += 1
                print(f"    第{section_count}节: {len(sorted_ans)}题 "
                      f"(题号 {sorted_ans[0][0]}-{sorted_ans[-1][0]})")
                current_section_answers = {}

            if (i + 1) % 50 == 0:
                print(f"    已扫描 {i+1}/{total_pages} 页...")
            continue

        # 这是答案页，提取答案
        page_answers = extract_answers_from_text(lines)
        for num, ans in page_answers:
            current_section_answers[num] = ans

    # 处理最后一节
    if current_section_answers:
        sorted_ans = sorted(current_section_answers.items())
        for num, ans in sorted_ans:
            all_answers.append(ans)
        section_count += 1
        print(f"    第{section_count}节: {len(sorted_ans)}题 "
              f"(题号 {sorted_ans[0][0]}-{sorted_ans[-1][0]})")

    doc.close()

    print(f"\n  提取结果: 共 {section_count} 个小节, {len(all_answers)} 个答案")
    print(f"  题库题目数: {total_questions}")

    # 写入答案到JSON
    matched = 0
    for idx, question in enumerate(data['questions']):
        if idx < len(all_answers):
            question['answer'] = all_answers[idx]
            matched += 1

    # 保存
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  成功写入: {matched}/{total_questions} 题有答案")

    # 如果数量不匹配，输出警告
    if len(all_answers) != total_questions:
        diff = total_questions - len(all_answers)
        print(f"  [警告] 答案数({len(all_answers)}) != 题目数({total_questions}), "
              f"差异: {diff}")

    return matched


def main():
    print("=" * 60)
    print("从王道教材PDF提取选择题答案")
    print("=" * 60)

    total_matched = 0
    for keyword, json_file, subject_key in SUBJECTS:
        print(f"\n{'─'*50}")
        print(f"处理科目: {keyword}")
        print(f"{'─'*50}")
        matched = process_subject(keyword, json_file, subject_key)
        total_matched += matched

    print(f"\n{'='*60}")
    print(f"全部完成! 共写入 {total_matched} 个答案")
    print("=" * 60)


if __name__ == '__main__':
    main()
