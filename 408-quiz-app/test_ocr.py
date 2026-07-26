"""
测试 OCR 识别效果 - 使用 RapidOCR
扫描教材前几十页，找到答案页并输出OCR结果
"""
import fitz  # PyMuPDF
import re
import os
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

# 初始化 RapidOCR
ocr = RapidOCR()

PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '408教材和答案')


def get_pdf_path(keyword):
    """根据关键词找PDF文件"""
    for f in os.listdir(PDF_DIR):
        if keyword in f and f.endswith('.pdf'):
            return os.path.join(PDF_DIR, f)
    return None


def page_to_image(page, dpi=150):
    """将PDF页面转为图片数组"""
    mat = fitz.Matrix(dpi/72, dpi/72)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return np.array(img)


def ocr_page(img_array):
    """对图片进行OCR，返回识别的文本行列表"""
    result, elapse = ocr(img_array)
    if not result:
        return []
    # result 格式: [[box, text, confidence], ...]
    lines = [(item[1], item[2]) for item in result]
    return lines


def is_answer_page(lines):
    """判断是否为选择题答案页"""
    full_text = ' '.join([t for t, c in lines])
    # 匹配选择题答案模式: 数字 + 分隔符 + 单字母(A/B/C/D)
    answer_pattern = re.findall(r'\d+\s*[.．·、]\s*[A-Da-d]', full_text)
    return len(answer_pattern) >= 5, len(answer_pattern), full_text


def main():
    pdf_path = get_pdf_path('操作系统')
    if not pdf_path:
        print("未找到操作系统教材PDF")
        return

    print(f"打开: {os.path.basename(pdf_path)}")
    doc = fitz.open(pdf_path)
    print(f"总页数: {len(doc)}")

    print("\n扫描前80页寻找答案页...")
    found_pages = []

    for i in range(min(80, len(doc))):
        page = doc[i]
        img = page_to_image(page, dpi=150)
        lines = ocr_page(img)
        is_ans, count, text = is_answer_page(lines)

        if is_ans:
            found_pages.append(i)
            print(f"\n{'='*60}")
            print(f"[答案页] 第 {i+1} 页 (匹配 {count} 个答案模式)")
            print(f"{'='*60}")
            # 打印所有OCR行
            for t, c in lines:
                print(f"  [{c:.2f}] {t}")
            print()

            if len(found_pages) >= 3:
                break
        else:
            if (i+1) % 10 == 0:
                print(f"  已扫描 {i+1} 页...")

    if not found_pages:
        print("前80页未找到答案页")

    doc.close()
    print(f"\n找到 {len(found_pages)} 个答案页: {[p+1 for p in found_pages]}")


if __name__ == '__main__':
    main()
