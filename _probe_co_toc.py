# -*- coding: utf-8 -*-
"""探查：王道计组 PDF 目录 + 现有 co_notes 结构，输出到文本文件"""
import sys, io, json, fitz

OUT = io.open(r'D:\ai code\408-quiz-app\_probe_co_out.txt', 'w', encoding='utf-8')

pdf = fitz.open(r'D:\ai code\408教材\2027王道《计算机组成原理》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf')

OUT.write('===== PDF 目录区（第 4~12 页） =====\n')
for i in range(4, 12):
    t = pdf[i].get_text()
    OUT.write('\n===== PDF页 %d（长度 %d） =====\n' % (i, len(t)))
    OUT.write(t)

OUT.write('\n\n===== 现有 co_notes.json 完整章节结构 =====\n')
with open(r'D:\ai code\408-quiz-app\data\notes\co_notes.json', encoding='utf-8') as f:
    data = json.load(f)
for ch in data['chapters']:
    OUT.write('\n[章] %s | %s\n' % (ch.get('chapter'), ch.get('title')))
    for s in ch['sections']:
        OUT.write('   %s （html 长度 %d）\n' % (s['section'], len(s['html'])))

OUT.write('\n\n===== 王道书内正文起始页探测 =====\n')
for i in [12, 13, 14]:
    t = pdf[i].get_text()
    OUT.write('\n--- PDF页 %d 前80字符 ---\n%s\n' % (i, repr(t[:80])))

OUT.close()
print('done')
