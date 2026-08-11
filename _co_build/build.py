# -*- coding: utf-8 -*-
"""生成计组笔记 co_notes.json（王道 7 章 27 节）+ 结构与题库一致性验证"""
import io
import json
import sys

sys.path.insert(0, '_co_build')

import ch1
import ch2
import ch3
import ch4
import ch5
import ch6
import ch7

CHS = [ch1.CH1, ch2.CH2, ch3.CH3, ch4.CH4, ch5.CH5, ch6.CH6, ch7.CH7]

data = {
    "subject": "计算机组成原理",
    "source": "王道2027《计算机组成原理》考研复习指导",
    "version": "3.0",
    "title": "计算机组成原理",
    "chapters": CHS,
}

path = 'data/notes/co_notes.json'
with io.open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

# ---- 验证 ----
out = []
note_secs = []
for ch in CHS:
    for s in ch['sections']:
        note_secs.append(s['section'])
out.append('章节数: %d, 节数: %d' % (len(CHS), len(note_secs)))

q = json.load(io.open('data/questions/co.json', encoding='utf-8'))
qsecs = sorted(set(x['section'] for x in q['questions']))
nsecs = sorted(set(note_secs))
out.append('题库节数: %d, 笔记节数: %d' % (len(qsecs), len(nsecs)))
out.append('题库有笔记无: %s' % [s for s in qsecs if s not in nsecs])
out.append('笔记有题库无: %s' % [s for s in nsecs if s not in qsecs])

dup = [s for s in note_secs if note_secs.count(s) > 1]
out.append('重复节: %s' % sorted(set(dup)))

total_chars = sum(len(s['html']) for ch in CHS for s in ch['sections'])
out.append('HTML 总字符: %d' % total_chars)
for ch in CHS:
    c = sum(len(s['html']) for s in ch['sections'])
    out.append('%s %s: %d 字符 / %d 节' % (ch['chapter'], ch['title'], c, len(ch['sections'])))

# 每节字数分布
lens = sorted((len(s['html']) for ch in CHS for s in ch['sections']))
out.append('单节最少: %d, 最多: %d' % (lens[0], lens[-1]))

with io.open('_gen_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('generated:', path)
