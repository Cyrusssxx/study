# -*- coding: utf-8 -*-
"""kp_analysis 卫生清理：Unicode 上下标字符连续段转 <sup>/<sub> 标签（全科目）"""
import io, json, re, sys

sys.stdout.reconfigure(encoding='utf-8')

SUP = {'\u2070':'0','\u00b9':'1','\u00b2':'2','\u00b3':'3','\u2074':'4','\u2075':'5','\u2076':'6',
       '\u2077':'7','\u2078':'8','\u2079':'9','\u207a':'+','\u207b':'-','\u207c':'=','\u207f':'n','\u2071':'i'}
SUB = {'\u2080':'0','\u2081':'1','\u2082':'2','\u2083':'3','\u2084':'4','\u2085':'5','\u2086':'6',
       '\u2087':'7','\u2088':'8','\u2089':'9','\u2090':'a','\u2091':'e','\u2092':'o','\u2093':'x',
       '\u2095':'h','\u2096':'k','\u2097':'l','\u2098':'m','\u2099':'n','\u209a':'p','\u209b':'s','\u209c':'t'}

PAT = re.compile('([' + ''.join(SUP) + ']+)|([' + ''.join(SUB) + ']+)')

def conv(m):
    if m.group(1) is not None:
        return '<sup>' + ''.join(SUP[c] for c in m.group(1)) + '</sup>'
    return '<sub>' + ''.join(SUB[c] for c in m.group(2)) + '</sub>'

files = ['pwa/data/ds.json', 'pwa/data/os.json', 'pwa/data/cn.json', 'pwa/data/co.json']
for p in files:
    d = json.load(io.open(p, encoding='utf-8'))
    n = 0
    for q in d['questions']:
        if 'kp_analysis' in q and PAT.search(q['kp_analysis']):
            q['kp_analysis'] = PAT.sub(conv, q['kp_analysis'])
            n += 1
    json.dump(d, io.open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(p, '修复', n, '题')

# 复验
left = []
for p in files:
    d = json.load(io.open(p, encoding='utf-8'))
    for q in d['questions']:
        if 'kp_analysis' in q and re.search(r'[\u00b9\u00b2\u00b3\u2070-\u209f]', q['kp_analysis']):
            left.append(q['id'])
print('残留:', left or '无')
