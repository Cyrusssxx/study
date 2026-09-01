# -*- coding: utf-8 -*-
"""用「本节习题精选/答案与解析」块边界精确统计教材每节题号，与题库对照。"""
import json, re
import pymupdf as fitz

PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(PDF)

# 收集块头（页号, 类型, 小节号）
blocks = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    for ln in t.split('\n'):
        s = ln.strip()
        m = re.match(r'^(\d\.\d+\.\d+)\s+(本节习题精选|答案与解析)$', s)
        if m:
            blocks.append((i, m.group(1), m.group(2)))
blocks.sort()
# 转成区间：每个习题块 = 该块头页 到 下一个答案块头页（不含）
exer_blocks = []
for idx, (pg, sec, typ) in enumerate(blocks):
    if typ == '本节习题精选':
        # 找下一个答案与解析
        end = None
        for j in range(idx+1, len(blocks)):
            if blocks[j][2] == '答案与解析' and blocks[j][1].startswith(sec.rsplit('.',1)[0]):
                end = blocks[j][0]; break
        exer_blocks.append({'sec3': sec, 'start': pg, 'end': end})

# 抽取每题：题干起行 ^\d{2}\. ；同时记录「一、单项选择题/二、综合应用题」子块
# 扫描范围含答案头所在页，但遇到「答案与解析」行即停止（该页顶部常有上一块余题）
def extract_questions(pg0, pg1):
    cur_sub = '单选'
    items = []
    for i in range(pg0, pg1+1 if pg1 is not None else pg0+1):
        t = doc[i].get_text()
        for ln in t.split('\n'):
            s = ln.strip()
            if '答案与解析' in s:
                return items
            if '单项选择题' in s and '一' in s:
                cur_sub = '单选'; continue
            if '综合应用题' in s and '二' in s:
                cur_sub = '综合'; continue
            mq = re.match(r'^(\d{2})\.', s)
            if mq:
                items.append({'no': int(mq.group(1)), 'sub': cur_sub, 'stem': s[3:].strip()[:60]})
    return items

audit = []
for eb in exer_blocks:
    qs = extract_questions(eb['start'], eb['end'])
    sec = eb['sec3'].rsplit('.', 1)[0]          # X.Y
    nums_single = sorted(set(q['no'] for q in qs if q['sub']=='单选'))
    maxs = max(nums_single) if nums_single else 0
    gaps = [n for n in range(1, maxs+1) if n not in nums_single]
    n_comp = len([q for q in qs if q['sub']=='综合'])
    audit.append({'sec': sec, 'start_pdf': eb['start']+1, 'end_pdf': (eb['end'] or 0)+1,
                  'single_count': len(nums_single), 'max_no': maxs, 'gaps': gaps,
                  'comp_count': n_comp, 'qs': qs})

print(f"{'小节':6s} {'单选':>4s} {'最大题号':>6s} {'缺号':>12s} {'综合':>4s}  页范围")
for a in audit:
    print(f"{a['sec']:6s} {a['single_count']:4d} {a['max_no']:6d} {str(a['gaps']):>12s} {a['comp_count']:4d}  {a['start_pdf']}-{a['end_pdf']}")

json.dump(audit, open('tools/_cn_pdf_audit.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('\nsaved tools/_cn_pdf_audit.json')
