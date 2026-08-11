import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
for s in ['ds','cn','os']:
    d=json.load(open(f'D:/ai code/408-quiz-app/data/notes/{s}_notes.json','r',encoding='utf-8'))
    ch=len(d['chapters'])
    sec=sum(len(c['sections']) for c in d['chapters'])
    total=sum(len(s['html']) for c in d['chapters'] for s in c['sections'])
    print(f'{s}: {ch}章 {sec}节 {total}字符')
