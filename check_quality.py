import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

for subj in ['ds', 'cn', 'os']:
    d=json.load(open(f'D:/ai code/408-quiz-app/data/notes/{subj}_notes.json','r',encoding='utf-8'))
    print(f'=== {subj.upper()} ===')
    ch_count = len(d['chapters'])
    sec_count = sum(len(c['sections']) for c in d['chapters'])
    total_html = sum(len(s['html']) for c in d['chapters'] for s in c['sections'])
    print(f'{ch_count}章 {sec_count}节, 总HTML {total_html}字符')
    for c in d['chapters']:
        ch = c['chapter']
        secs = [s['section'] for s in c['sections']]
        print(f'  {ch}: {len(secs)}节')
    print()
