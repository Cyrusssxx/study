# -*- coding: utf-8 -*-
"""
打卡表提取管线：从打卡表 xlsx + 王道 PDF 提取被引用的"王道书 X.X.X_大题_N"题目与解答，
按优先级预排序生成 data/questions/ds_daka.json（并同步 pwa/data/）。
- xlsx：zipfile 直读 XML（openpyxl 对 WPS 文件报错不可用），A/B/C 列继承合并单元格
- PDF：fitz 按目录定位各节"二、综合应用题"题目区/答案区，按 01. / 01.【解答】切分
- 代码还原：PDF 行结构本身可用，做 OCR 伪影修复（【】」)→花括号、I/→//）+ 注释回挂 + 花括号缩进
用法：
    python extract_daka.py            # 预览：写 _preview_daka.txt，不产出数据
    python extract_daka.py --apply    # 产出 ds_daka.json 并同步 pwa/data
"""
import json
import os
import re
import shutil
import sys
import zipfile

import fitz

ROOT = os.path.dirname(os.path.abspath(__file__))
XLSX = r'e:\夸克\Download\2026数据结构强化打卡表 (1).xlsx'
PDF = r'd:\ai code\408教材和答案\2027王道《数据结构》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
OUT = os.path.join(ROOT, 'data', 'questions', 'ds_daka.json')
PWA_OUT = os.path.join(ROOT, 'pwa', 'data', 'ds_daka.json')
PREVIEW = os.path.join(ROOT, '_preview_daka.txt')

PRIORITIES = {'必做': 0, '高优先级': 1, '中优先级': 2, '跨考生基本功训练': 3, '低优先级': 4}
PRIORITY_LABELS = ['必做', '高优先级', '中优先级', '基本功', '低优先级']
REF = re.compile(r'王道书\s*(\d+\.\d+\.\d+)_大题_(\d+)')
REAL = re.compile(r'408真题_(\d{4})_(\d+)题')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ---------- xlsx 解析 ----------

def parse_xlsx():
    """返回 [(sheet名, 模块, 考点, 优先级标签, 索引, 任务文本)]，A/B/C 列向下继承"""
    z = zipfile.ZipFile(XLSX)
    ss_xml = z.read('xl/sharedStrings.xml').decode('utf-8')
    strings = []
    for si in re.findall(r'<si>(.*?)</si>', ss_xml, re.S):
        t = ''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S))
        t = t.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&') \
             .replace('&quot;', '"').replace('&#10;', '\n')
        strings.append(t)
    cell_pat = re.compile(r'<c ([^>]*)>(?:<v>(.*?)</v>)?(?:</c>)?', re.S)
    rows = []
    for sheet, label in [('sheet1', '应用题'), ('sheet2', '算法题')]:
        xml = z.read(f'xl/worksheets/{sheet}.xml').decode('utf-8')
        module = kaodian = prio = ''
        for rnum, cells_xml in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
            if int(rnum) <= 2:
                continue  # 标题行
            cells = {}
            for attrs, val in cell_pat.findall(cells_xml):
                m = re.search(r'r="([A-Z]+)\d+"', attrs)
                if not m or not val:
                    continue
                cells[m.group(1)] = strings[int(val)] if 't="s"' in attrs else val
            module = cells.get('A', module)
            kaodian = cells.get('B', kaodian)
            prio = cells.get('C', prio)
            task = cells.get('E', '')
            if task:
                rows.append((label, module, kaodian, prio, cells.get('D', ''), task))
    return rows


def build_entries(rows):
    """按王道书引用去重聚合：{(sec,num): entry}，保留最高优先级与首次出现顺序"""
    entries = {}
    skipped = []
    for order, (sheet, module, kaodian, prio, idx, task) in enumerate(rows):
        m = REF.search(task)
        if not m:
            skipped.append(f'[{sheet} {idx}] {prio}: {task[:50]}')
            continue
        key = (m.group(1), int(m.group(2)))
        p = PRIORITIES.get(prio, 2)
        real = REAL.search(task)
        real_tag = f'{real.group(1)}年408真题第{real.group(2)}题' if real else ''
        if key not in entries:
            entries[key] = {
                'priority': p, 'module': module, 'kaodian': kaodian,
                'sheet': sheet, 'tasks': [task], 'real': real_tag, 'order': order,
            }
        else:
            e = entries[key]
            e['priority'] = min(e['priority'], p)
            if task not in e['tasks']:
                e['tasks'].append(task)
            if real_tag and not e['real']:
                e['real'] = real_tag
    return entries, skipped


# ---------- PDF 提取 ----------

BOOK_HEADER = re.compile(r'^(2027\s*年数据结构考研复习指导|第\s*\d+\s*章.*|\d{1,3})$')


def pages_text(doc, p1, p2):
    """拼接 [p1,p2] 页文本（1-based，含端点），每页开头的书眉/页码行剔除"""
    lines = []
    for p in range(p1 - 1, p2):
        page_lines = [x.strip() for x in doc[p].get_text().splitlines()]
        # 仅在每页前3行内剔除书眉/页码
        drop = set()
        for i, ln in enumerate(page_lines[:3]):
            if BOOK_HEADER.match(ln):
                drop.add(i)
        lines.extend(ln for i, ln in enumerate(page_lines) if i not in drop)
    return '\n'.join(lines)


def build_ranges(doc, secs):
    """由目录定位每节：(题目区起页, 题目区止页, 答案区起页, 答案区止页)"""
    toc = doc.get_toc()
    ranges = {}
    for sec in secs:
        qi = next(i for i, (l, t, p) in enumerate(toc)
                  if sec in t and '试题精选' in t)
        qapp = next(i for i in range(qi + 1, len(toc)) if '综合应用题' in toc[i][1])
        ai = next(i for i in range(qi + 1, len(toc)) if '答案与解析' in toc[i][1])
        aapp = next(i for i in range(ai + 1, len(toc)) if '综合应用题' in toc[i][1])
        aend = toc[aapp + 1][2] if aapp + 1 < len(toc) else doc.page_count
        ranges[sec] = (toc[qapp][2], toc[ai][2], toc[aapp][2], aend)
    return ranges


def cut_area(text, is_answer):
    """从'二、综合应用题'标记起，截到下一节标题/归纳总结"""
    idx = text.find('二、综合应用题')
    if idx < 0:
        return ''
    body = text[idx + len('二、综合应用题'):]
    if is_answer:
        # 节标题须带中文（如"5.4 树、森林"），避免误伤 OCR 的 IP 地址行（10.1,1.2）
        m = re.search(r'(?m)^(归纳总结|思维拓展|\*?\d+\.\d+\s*[\u4e00-\u9fff])', body)
    else:
        m = re.search(r'(?m)^(?:.{0,4}\d+\.\d+\.\d+\s*答案与解析|一、单项选择题)', body)
    return body[:m.start()] if m else body


def split_items(text, is_answer):
    # 解答标记兼容"17.【解答1】"（多解法编号）
    pat = re.compile(r'(?m)^(\d{1,2})\.【解答\d?】' if is_answer else r'(?m)^(\d{1,2})\.(?!\d)')
    ms = list(pat.finditer(text))
    items = {}
    for i, m in enumerate(ms):
        num = int(m.group(1))
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        if num not in items:
            items[num] = text[m.end():end].strip()
    return items


# ---------- 版式还原 ----------

CODE_START = re.compile(
    r'^(//|/\*|typedef\b|struct\b|int\b|void\b|bool\b|char\b|float\b|double\b|'
    r'unsigned\b|long\b|short\b|if\s*\(|else\b|while\s*\(|for\s*\(|do\s*[({]|'
    r'return\b|switch\s*\(|case\b|#define|break\b|continue\b|'
    r'[A-Za-z_][\w\[\]>.\-]*\s*[=(])')
LONE_CLOSE = {'【', '】', '」', '）', ')', '}'}
LONE_OPEN = {'（', '(', '{'}


def is_code(line):
    if not line:
        return False
    if line in LONE_CLOSE or line in LONE_OPEN:
        return True
    if line.startswith('//') or line.startswith('I/'):
        return True
    if re.match(r'^(?:1/|/)(?=[\u4e00-\u9fff])', line):  # OCR 掉斜杠的注释行
        return True
    han = len(re.findall(r'[\u4e00-\u9fff]', line))
    if re.search(r'[;{][)}】」]?\s*$', line) or re.search(r';\s*//', line):
        return True
    if CODE_START.match(line) and han <= max(2, len(line) // 3):
        return True
    return False


def fix_code_line(l):
    if l in LONE_CLOSE:
        return '}'
    if l in LONE_OPEN:
        return '{'
    l = l.replace('I/', '//').replace('1child', 'lchild').replace('；', ';')
    l = re.sub(r'^1/(?=[\u4e00-\u9fff])', '//', l)
    l = re.sub(r'^/(?![/*\s])', '//', l)
    l = re.sub(r'\|1(?=[A-Za-z_(])', '||', l)  # NULL|1T2 → NULL||T2
    l = re.sub(r'\)\s*[（(]$', '){', l)
    l = re.sub(r'\)1(?=//)', '){', l)          # val)1//注释 → val){//注释
    l = re.sub(r'^\)(?=\s*[A-Za-z_]\w*\s*;)', '}', l)  # )LinkNode; → }LinkNode;
    l = re.sub(r'\[([a-z])l(?=[\])>,;])', r'[\1]', l)  # a[jl) → a[j])
    l = re.sub(r'(?<=[a-z])[号8]2==', '%2==', l)      # k号2==1 / k82==0 → k%2==
    l = re.sub(r'(?<=[a-z])2!=0', '%2!=0', l)          # degree2!=0 → degree%2!=0
    l = re.sub(r'(?<=[0-9a-z)\]])1I(?=[A-Za-z_(])', '||', l)  # 01Icount → 0||count
    l = l.replace('("各', '("%')                       # printf("各s" → printf("%s"
    l = re.sub(r'(\w) (?=\[)', r'\1', l)               # pmin [m] → pmin[m]
    l = re.sub(r'\b(?!(?:else|return|if|while|do|case|typedef|struct|union|int|char|bool|void|new|delete|sizeof)\b)([a-z]+) (?=[A-Z][A-Za-z]*\()', r'\1', l)  # judge InorderBST( → judgeInorderBST(
    l = re.sub(r'^Unsigned\b', 'unsigned', l)
    l = re.sub(r'^Struct\b', 'struct', l)
    l = l.replace('【', '{').replace('】', '}').replace('」', '}')
    if l.endswith('(') and l.count('(') > l.count(')'):
        l = l[:-1] + '{'                        # typedef struct( → typedef struct{
    return l


def format_code_lines(ls):
    fixed = [fix_code_line(l) for l in ls]
    # 行尾注释被 PDF 拆到下一行：仅当上一行以 ; ) 结尾时回挂
    merged = []
    for l in fixed:
        if l.startswith('//') and merged and re.search(r'[;)]\s*$', merged[-1]):
            merged[-1] += '  ' + l
        else:
            merged.append(l)
    out, depth = [], 0
    for l in merged:
        d = depth - (1 if l.startswith('}') else 0)
        out.append('    ' * max(d, 0) + l)
        depth = max(depth + l.count('{') - l.count('}'), 0)
    return '\n'.join(out)


def join_prose(ls):
    out = ''
    for l in ls:
        if not out:
            out = l
            continue
        if re.match(r'^\d\)', l) or l.startswith('要求'):
            out += '<br>' + l
        elif out[-1].isascii() and out[-1].isalnum() and l[0].isascii() and l[0].isalnum():
            out += ' ' + l
        else:
            out += l
    return out


def render(text):
    """题面/解答通用渲染：散文行合并 + 连续代码行成组包 <pre class='code-block'>"""
    blocks = []
    for l in (x.strip() for x in text.splitlines()):
        if not l:
            continue
        kind = 'c' if is_code(l) else 'p'
        if blocks and blocks[-1][0] == kind:
            blocks[-1][1].append(l)
        else:
            blocks.append([kind, [l]])
    # 夹心修正：夹在两个代码块之间、无句读的短行（OCR 掉分号/斜杠误判为散文），并回代码
    for i in range(1, len(blocks) - 1):
        if (blocks[i][0] == 'p' and len(blocks[i][1]) <= 2
                and blocks[i - 1][0] == 'c' and blocks[i + 1][0] == 'c'
                and all(not re.search(r'[。：:？，]', l)
                        and len(re.findall(r'[\u4e00-\u9fff]', l)) <= 4
                        for l in blocks[i][1])):
            blocks[i][0] = 'c'
    merged = []
    for kind, ls in blocks:
        if merged and merged[-1][0] == kind:
            merged[-1][1].extend(ls)
        else:
            merged.append([kind, ls])
    blocks = merged
    parts = []
    for kind, ls in blocks:
        if kind == 'p':
            parts.append(esc(join_prose(ls)).replace('&lt;br&gt;', '<br>'))
        elif not any(re.search(r'[;{}]', x) for x in ls):
            parts.append(esc(join_prose(ls)))  # 无句法特征（图表数据误判），降级为散文
        else:
            parts.append('<pre class="code-block">' + esc(format_code_lines(ls)) + '</pre>')
    return '\n'.join(parts)


# ---------- 主流程 ----------

def main():
    apply_mode = '--apply' in sys.argv
    rows = parse_xlsx()
    entries, skipped = build_entries(rows)
    secs = sorted({sec for sec, _ in entries})

    doc = fitz.open(PDF)
    ranges = build_ranges(doc, secs)
    q_items, a_items = {}, {}
    for sec in secs:
        qs, qe, as_, ae = ranges[sec]
        q_items[sec] = split_items(cut_area(pages_text(doc, qs, qe), False), False)
        a_items[sec] = split_items(cut_area(pages_text(doc, as_, ae), True), True)

    report = [f'打卡表任务行: {len(rows)}，含王道书引用（去重后）: {len(entries)}，涉及节: {", ".join(secs)}\n']
    questions, warns = [], []
    ordered = sorted(entries.items(), key=lambda kv: (kv[1]['priority'], kv[1]['order']))
    for (sec, num), e in ordered:
        qraw = q_items[sec].get(num)
        araw = a_items[sec].get(num)
        if qraw is None:
            warns.append(f'!! {sec}_大题_{num}: 题面未找到（该节共提取 {len(q_items[sec])} 题）')
            continue
        if araw is None:
            warns.append(f'!! {sec}_大题_{num}: 解答未找到')
        content = render(qraw)
        answer = render(araw) if araw else ''
        # 校验：任务声称的真题年份应出现在题面中
        if e['real']:
            year = e['real'][:4]
            if year not in content:
                warns.append(f'?? {sec}_大题_{num}: 任务标注 {e["real"]}，但题面未见 {year}')
        qid = 'ds_daka_' + sec.replace('.', '_') + f'_{num}'
        questions.append({
            'id': qid,
            'priority': e['priority'],
            'priority_label': PRIORITY_LABELS[e['priority']],
            'module': e['module'],
            'kaodian': e['kaodian'],
            'source': f'王道书 {sec}_大题_{num}',
            'real': e['real'],
            'sheet': e['sheet'],
            'tasks': e['tasks'],
            'content': content,
            'answer': answer,
        })
        report.append(f"\n==== {qid} [{PRIORITY_LABELS[e['priority']]}] {e['module']} / {e['kaodian']}"
                      f"{' / ' + e['real'] if e['real'] else ''} ====\n--- 题面 ---\n{content}\n--- 解答 ---\n{answer}")

    counts = {}
    for q in questions:
        counts[q['priority_label']] = counts.get(q['priority_label'], 0) + 1
    summary = f"\n共 {len(questions)} 题：" + '，'.join(f'{k} {v}' for k, v in counts.items())
    report.insert(1, summary)
    if warns:
        report.insert(2, '\n--- 警告 ---\n' + '\n'.join(warns))
    report.insert(3, '\n--- 无王道书引用的任务（自练，不入题库）---\n' + '\n'.join(skipped))

    open(PREVIEW, 'w', encoding='utf-8').write('\n'.join(report))
    print(f'questions: {len(questions)}, warns: {len(warns)}, report -> _preview_daka.txt')
    if apply_mode:
        data = {'subject': 'ds_daka', 'name': '数据结构强化打卡', 'total': len(questions),
                'questions': questions}
        json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        shutil.copy2(OUT, PWA_OUT)
        print(f'written -> {OUT} (+pwa)')


if __name__ == '__main__':
    main()
