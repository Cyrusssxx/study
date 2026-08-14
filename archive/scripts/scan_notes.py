import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

for subj in ['ds', 'cn', 'os']:
    d=json.load(open(f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json','r',encoding='utf-8'))
    ch_count = len(d['chapters'])
    sec_count = sum(len(c['sections']) for c in d['chapters'])
    print(f'== {subj.upper()} == {ch_count}章 {sec_count}节')
    for c in d['chapters']:
        print(f'  {c["chapter"]}: {len(c["sections"])}节')
        for s in c['sections']:
            print(f'    - {s["section"]}')
