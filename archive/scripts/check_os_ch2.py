import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# OS 第2章
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/os_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    ch = c['chapter']
    if '2' in ch:
        for s in c['sections']:
            print(f'{ch} -> {s["section"]}')
