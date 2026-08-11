import json, sys, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
total=0
for c in d['chapters']:
    for s in c['sections']:
        cnt = len(re.findall(r'<pre><code>', s['html']))
        total += cnt
        if cnt > 0:
            sec = s['section']
            print(f'{sec}: {cnt}块')
print(f'总计: {total}块')
