import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
# 找线性表的代码块
for s in d['chapters'][1]['sections']:
    if '2.2' in s['section']:
        html = s['html']
        if '<code>' in html:
            idx = html.find('<code>')
            print(f'Code in {s["section"]}:')
            print(html[idx:idx+800])
        break
