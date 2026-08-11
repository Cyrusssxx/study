import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
for c in d['chapters'][:3]:
    ch_name = c['chapter']
    print(f'== {ch_name} ==')
    for s in c['sections'][:2]:
        html = s['html']
        has_q = any(kw in html for kw in ['试题精选','答案解析','【答案】','A. ','B. ','C. ','D. '])
        has_code = '<code>' in html
        has_img = '<img' in html
        sec = s['section']
        print(f'  {sec}: 题目={has_q} 代码={has_code} 图片={has_img}')
        print(f'    {html[:150]}')
