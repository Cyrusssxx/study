import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    for s in c['sections']:
        matches = re.findall(r'<pre><code>(.*?)</code></pre>', s['html'], re.DOTALL)
        for code in matches[:3]:
            lines = [l for l in code.split('\n') if l.strip()]
            if len(lines) >= 3:
                print(f'{s["section"]}: {len(lines)}行')
                print(code[:300])
                print('---')
                break
