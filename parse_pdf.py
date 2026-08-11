"""
PDF 解析脚本 - 从408习题库PDF中提取选择题（改进版）
用法: python parse_pdf.py
"""
import os
import re
import json
import pdfplumber
from config import PDF_DIR, QUESTIONS_DIR, SUBJECTS


def extract_text_from_pdf(pdf_path):
    """从PDF文件中提取所有文本内容"""
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"
    return full_text


def clean_text(text):
    """清理文本中的水印、页码等干扰信息"""
    # 移除页码信息: · 第 X 页，共 Y 页 ·
    text = re.sub(r'·\s*第\s*\d+\s*页[，,]\s*共\s*\d+\s*页\s*·', '', text)
    # 移除公众号信息
    text = re.sub(r'公众号[：:].+?(?=\n|$)', '', text)
    # 移除章节标题行（如 "王道操作系统课后习题·1.概述"）
    text = re.sub(r'王道.+?课后习题·[\d.]+\S+', '', text)
    text = re.sub(r'王道《.+?》.+?(?=\n|$)', '', text)
    # 移除做题本相关信息
    text = re.sub(r'做题本集结地', '', text)
    # 清理多余空格
    text = re.sub(r'[ \t]+', ' ', text)
    # 清理多余空行
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def split_inline_options(text):
    """
    处理同一行内多个选项的情况
    如: "A. xxx B. xxx" -> "A. xxx\nB. xxx"
    """
    # 匹配行内的 B./C./D. 选项（前面有内容的情况）
    text = re.sub(r'(\S)\s+([B-D])\s*[.．]\s*', r'\1\n\2. ', text)
    # 也处理用"、"分隔的情况
    text = re.sub(r'(\S)\s+([B-D])\s*、\s*', r'\1\n\2、', text)
    return text


def parse_questions_improved(text, subject_key):
    """改进的题目解析器"""
    questions = []
    
    # 预处理
    text = clean_text(text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # 按题号分割文本块
    # 匹配: 行首的数字 + 分隔符(. 、．) )）)
    blocks = re.split(r'\n(?=\s*\d+\s*[.、．\)）])', text)
    
    seq_id = 0  # 全局顺序ID
    
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        
        # 提取题号
        num_match = re.match(r'\s*(\d+)\s*[.、．\)）]\s*(.*)', block, re.DOTALL)
        if not num_match:
            continue
        
        q_num = int(num_match.group(1))
        q_body = num_match.group(2).strip()
        
        if not q_body or len(q_body) < 10:
            continue
        
        # 处理行内选项
        q_body = split_inline_options(q_body)
        
        # 分离题干和选项
        # 找到选项开始位置（第一个A选项）
        option_start = re.search(r'(?:^|\n)\s*A\s*[.、．\)）\s]', q_body)
        if not option_start:
            continue
        
        content = q_body[:option_start.start()].strip()
        options_text = q_body[option_start.start():].strip()
        
        # 解析选项
        options = {}
        # 按选项字母分割
        opt_parts = re.split(r'(?:^|\n)\s*([A-D])\s*[.、．\)）\s]\s*', options_text)
        
        i = 1
        while i < len(opt_parts) - 1:
            letter = opt_parts[i].strip()
            opt_content = opt_parts[i + 1].strip()
            # 清理选项内容
            opt_content = re.sub(r'\s+', ' ', opt_content).strip()
            # 移除末尾可能残留的页码等信息
            opt_content = re.sub(r'\s*·.*$', '', opt_content).strip()
            if letter in 'ABCD' and opt_content:
                options[letter] = opt_content
            i += 2
        
        # 验证选项数量（至少需要A和B两个选项）
        if len(options) < 2:
            continue
        
        # 清理题干
        content = re.sub(r'\s+', ' ', content).strip()
        if not content:
            continue
        
        seq_id += 1
        q_id = f"{subject_key}_{seq_id:04d}"
        
        questions.append({
            "id": q_id,
            "number": seq_id,
            "content": content,
            "options": options,
            "answer": "",
            "explanation": ""
        })
    
    return questions


def parse_single_pdf(subject_key, subject_info):
    """解析单个科目的PDF文件"""
    pdf_path = os.path.join(PDF_DIR, subject_info['pdf'])
    
    if not os.path.exists(pdf_path):
        print(f"[警告] PDF文件不存在: {pdf_path}")
        return None
    
    print(f"[解析中] {subject_info['name']}: {subject_info['pdf']}")
    
    # 提取文本
    text = extract_text_from_pdf(pdf_path)
    if not text.strip():
        print(f"  [错误] 无法从PDF中提取文本")
        return None
    
    print(f"  提取文本长度: {len(text)} 字符")
    
    # 解析题目
    questions = parse_questions_improved(text, subject_key)
    print(f"  解析到 {len(questions)} 道题目")
    
    # 构建输出数据
    data = {
        "subject": subject_info['name'],
        "subject_key": subject_key,
        "total": len(questions),
        "questions": questions
    }
    
    return data


def save_json(data, filename):
    """保存数据到JSON文件"""
    filepath = os.path.join(QUESTIONS_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  已保存到: {filepath}")


def main():
    """主函数：解析所有PDF并保存为JSON"""
    print("=" * 50)
    print("408习题库 PDF 解析工具 (改进版)")
    print("=" * 50)
    
    # 确保输出目录存在
    os.makedirs(QUESTIONS_DIR, exist_ok=True)
    
    total_questions = 0
    
    for key, info in SUBJECTS.items():
        print(f"\n{'─' * 40}")
        data = parse_single_pdf(key, info)
        
        if data and data['questions']:
            save_json(data, info['json'])
            total_questions += data['total']
        else:
            empty_data = {
                "subject": info['name'],
                "subject_key": key,
                "total": 0,
                "questions": []
            }
            save_json(empty_data, info['json'])
            print(f"  [注意] 未能解析到题目，已创建空文件")
    
    print(f"\n{'=' * 50}")
    print(f"解析完成! 共解析 {total_questions} 道题目")
    print(f"{'=' * 50}")


if __name__ == '__main__':
    main()
