import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
s = d['chapters'][0]['sections'][0]
print(f'Section: {s["section"]}')
print(s['html'][:1500])
