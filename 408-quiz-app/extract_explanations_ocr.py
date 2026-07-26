"""
从王道教材 PDF（扫描版）中提取选择题逐题解析与官方答案，写入题库 JSON
使用 RapidOCR + PyMuPDF

逻辑：
1. 全书逐页 OCR（结果缓存到 data/ocr_cache/*.jsonl，重跑不重复扫描）
2. 状态机扫描行流：遇"答案与解析"进入待命，遇"单项选择题"开新小节，
   遇"综合应用题/填空题/解答题"结束小节
3. 小节内按 "题号.答案字母" 行切分条目，其余行归入当前条目的解析文字
4. 题库按 (chapter, section) 分组，与提取小节按顺序/条数对齐：
   两边小节数相等时一一配对；否则按条数相似度贪心配对
5. 仅当配对小节条数相等时才逐条写入：教材官方答案覆盖旧answer（修正旧版
   全局累积对齐造成的错位），解析文字转 <p> 段落HTML 写入 explanation；
   条数不等的小节不写入，记录到报告供人工处理
"""
import fitz  # PyMuPDF
import re
import os
import json
import html
import time
import numpy as np
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, '..', '408教材和答案')
QUESTIONS_DIR = os.path.join(BASE_DIR, 'data', 'questions')
CACHE_DIR = os.path.join(BASE_DIR, 'data', 'ocr_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# (PDF关键词, JSON文件名, 科目key)
SUBJECTS = [
    ('操作系统', 'os.json', 'os'),
    ('数据结构', 'ds.json', 'ds'),
    ('计算机组成原理', 'co.json', 'co'),
    ('计算机网络', 'cn.json', 'cn'),
]

# 页眉/页脚/水印干扰行
HEADER_PAT = re.compile(r'(考研复习指导|z-lib|1lib|^\s*\d{1,4}\s*$|^第\s*\d+\s*页|^第\s*\d+\s*章[\u4e00-\u9fa5、/A-Za-z]{2,14}$)')
# 答案条目行: "01. C 解析开头..." / "10.C"
ANS_LINE = re.compile(r'^\s*(\d{1,3})\s*[.．、，,·]\s*([A-Da-d])(?![A-Za-z])\s*(.*)$')
# 教材正文标题（如"3.2主存储器"/"第4章..."）：答案区无"综合应用题"收尾时的兼底终止符，
# 避免下一节正文被当成末条解析累积（排除"3.5节"这类行内引用）
SECTION_HEAD = re.compile(r'^(第\d+章|\d{1,2}\.\d{1,2}(\.\d{1,2})?(?![节式])[\u4e00-\u9fa5])')


def get_pdf_path(keyword):
    for f in os.listdir(PDF_DIR):
        if keyword in f and f.endswith('.pdf'):
            return os.path.join(PDF_DIR, f)
    return None


def ocr_pdf_pages(pdf_path, cache_path):
    """全PDF逐页OCR，返回 [[行文本,...], ...]；带JSONL缓存，支持断点续扫"""
    doc = fitz.open(pdf_path)
    total = len(doc)

    pages = []
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            for ln in f:
                pages.append(json.loads(ln))
    if len(pages) >= total:
        doc.close()
        print(f"  使用OCR缓存: {os.path.basename(cache_path)} ({len(pages)}页)", flush=True)
        return pages[:total]

    if pages:
        print(f"  缓存不完整({len(pages)}/{total}页)，从断点续扫", flush=True)

    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    t0 = time.time()
    start = len(pages)
    with open(cache_path, 'a', encoding='utf-8') as f:
        for i in range(start, total):
            mat = fitz.Matrix(200 / 72, 200 / 72)
            pix = doc[i].get_pixmap(matrix=mat)
            img = np.array(Image.frombytes("RGB", [pix.width, pix.height], pix.samples))
            result, _ = ocr(img)
            lines = [item[1] for item in result] if result else []
            pages.append(lines)
            f.write(json.dumps(lines, ensure_ascii=False) + '\n')
            f.flush()
            if (i + 1) % 50 == 0:
                done = i + 1 - start
                elapsed = time.time() - t0
                eta = elapsed / done * (total - i - 1)
                print(f"    OCR {i+1}/{total} 页, 已用{elapsed/60:.1f}分, 预计还需{eta/60:.1f}分", flush=True)
    doc.close()
    return pages


def extract_sections(pages):
    """状态机扫描全书行流
    返回 [小节, ...]，每小节 = [(answer或None, [解析行,...]), ...]
    """
    sections = []
    cur = None
    armed = False       # 刚遇到"答案与解析"，等待"单项选择题"
    in_choice = False   # 处于选择题解析区

    def flush():
        nonlocal cur
        if cur:
            sections.append(cur)
        cur = None

    for lines in pages:
        for raw in lines:
            t = raw.strip()
            if not t or HEADER_PAT.search(t):
                continue
            if '答案与解析' in t:
                flush()
                armed = True
                in_choice = False
                continue
            if re.search(r'(综合应用题|填空题|解答题)', t):
                # 答案区选择题部分结束（或该节无选择题）
                flush()
                armed = False
                in_choice = False
                continue
            if armed and '单项选择题' in t:
                flush()
                cur = []
                in_choice = True
                armed = False
                continue
            if not in_choice or cur is None:
                continue
            if len(cur) > 0 and SECTION_HEAD.match(t):
                # 遇到下一节正文标题，答案区结束
                flush()
                in_choice = False
                continue

            m = ANS_LINE.match(t)
            if m:
                num = int(m.group(1))
                expected = len(cur) + 1
                rest = m.group(3).strip()
                if num == expected:
                    cur.append([m.group(2).upper(), [rest] if rest else []])
                    continue
                elif num == expected + 1:
                    # OCR漏识别了上一条答案行，占位保号
                    cur.append([None, []])
                    cur.append([m.group(2).upper(), [rest] if rest else []])
                    continue
                # 题号不连续（可能是解析内文中的编号），按解析文字处理
            if cur and len(cur) > 0:
                cur[-1][1].append(t)
    flush()
    return sections


def to_html(text_lines):
    """解析文字行 -> <p>段落HTML；行尾为句末标点时断段"""
    paras = []
    buf = ''
    for line in text_lines:
        buf += line
        if re.search(r'[。！？!?]\s*$', line):
            paras.append(buf)
            buf = ''
    if buf:
        paras.append(buf)
    return ''.join(f'<p>{html.escape(p)}</p>' for p in paras if p.strip())


def group_by_section(questions):
    """题库按 (chapter, section) 分组，保持顺序"""
    groups = []
    cur_key = None
    for q in questions:
        key = (q.get('chapter') or '', q.get('section') or '')
        if key != cur_key:
            groups.append((key, []))
            cur_key = key
        groups[-1][1].append(q)
    return groups


def match_score(qs, es):
    """小节配对相似度：仅基于条数差异（旧answer存在错位，不能作为参考序列）"""
    return 1.0 - abs(len(qs) - len(es)) / max(len(qs), len(es))


def write_pair(key, qs, es, report):
    """将一个提取小节写入一个题库小节（仅限条数相等，位置对齐）"""
    if len(qs) != len(es):
        report['count_mismatch'].append(
            f"{' '.join(key)}: 题库{len(qs)}题 vs 提取{len(es)}条，未写入")
        return 0
    written = 0
    for q, (ans, lines) in zip(qs, es):
        if ans is None:
            continue  # OCR漏检占位条目，跳过不影响后续对齐
        if q.get('answer') and q['answer'] != ans:
            report['corrections'].append({
                'id': q['id'], 'old': q['answer'], 'new': ans,
                'section': ' '.join(key)})
        q['answer'] = ans  # 教材官方答案为准
        htm = to_html(lines)
        if htm:
            q['explanation'] = htm
            written += 1
    return written


def align_and_write(qgroups, esections, report):
    """小节配对：数量相等时一一对应，否则按条数相似度贪心同步"""
    written = 0
    if len(qgroups) == len(esections):
        for (key, qs), es in zip(qgroups, esections):
            written += write_pair(key, qs, es, report)
        return written

    i, j = 0, 0
    while i < len(qgroups) and j < len(esections):
        (key, qs), es = qgroups[i], esections[j]
        if match_score(qs, es) >= 0.9:
            written += write_pair(key, qs, es, report)
            i += 1
            j += 1
        else:
            s_skip_e = match_score(qs, esections[j + 1]) if j + 1 < len(esections) else -1
            s_skip_q = match_score(qgroups[i + 1][1], es) if i + 1 < len(qgroups) else -1
            if s_skip_e >= s_skip_q and s_skip_e >= 0.9:
                report['skipped_pdf_sections'].append(f"提取节#{j}({len(es)}条)未匹配")
                j += 1
            elif s_skip_q >= 0.9:
                report['skipped_json_sections'].append(f"{' '.join(key)}({len(qs)}题)无解析")
                i += 1
            else:
                report['skipped_json_sections'].append(
                    f"{' '.join(key)}({len(qs)}题 vs 提取{len(es)}条)对齐失败")
                i += 1
                j += 1
    while i < len(qgroups):
        key, qs = qgroups[i]
        report['skipped_json_sections'].append(f"{' '.join(key)}({len(qs)}题)无解析")
        i += 1
    return written


def process_subject(keyword, json_file, subject_key):
    pdf_path = get_pdf_path(keyword)
    if not pdf_path:
        print(f"  [错误] 未找到包含 '{keyword}' 的PDF")
        return None
    json_path = os.path.join(QUESTIONS_DIR, json_file)
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"  PDF: {os.path.basename(pdf_path)}", flush=True)
    cache_path = os.path.join(CACHE_DIR, f'{subject_key}_pages.jsonl')
    pages = ocr_pdf_pages(pdf_path, cache_path)

    esections = extract_sections(pages)
    n_items = sum(len(s) for s in esections)
    qgroups = group_by_section(data['questions'])
    print(f"  提取: {len(esections)}个小节 / {n_items}条解析; 题库: {len(qgroups)}个小节 / {data['total']}题", flush=True)

    report = {'subject': subject_key, 'corrections': [], 'count_mismatch': [],
              'skipped_pdf_sections': [], 'skipped_json_sections': []}
    written = align_and_write(qgroups, esections, report)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    with_expl = sum(1 for q in data['questions'] if q.get('explanation'))
    print(f"  本次写入解析: {written}; 当前有解析: {with_expl}/{data['total']} "
          f"({with_expl/data['total']*100:.1f}%)", flush=True)
    print(f"  答案修正: {len(report['corrections'])}, 条数不等跳过节: {len(report['count_mismatch'])}, "
          f"跳过题库节: {len(report['skipped_json_sections'])}", flush=True)
    return report


def main():
    print("=" * 60)
    print("从王道教材PDF提取选择题解析")
    print("=" * 60)
    reports = []
    for keyword, json_file, subject_key in SUBJECTS:
        print(f"\n{'─'*50}\n处理科目: {keyword}\n{'─'*50}", flush=True)
        r = process_subject(keyword, json_file, subject_key)
        if r:
            reports.append(r)
    with open(os.path.join(BASE_DIR, 'explanation_report.json'), 'w', encoding='utf-8') as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)
    print("\n全部完成! 报告已写入 explanation_report.json")


if __name__ == '__main__':
    main()
