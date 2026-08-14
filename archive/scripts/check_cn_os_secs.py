import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# CN 笔记中网络层的 section
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/cn_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    if '4' in c['chapter']:
        for s in c['sections']:
            print(s['section'])

print()
# OS 笔记中第1章的 section
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/os_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    if '1' in c['chapter']:
        for s in c['sections']:
            print(s['section'])
