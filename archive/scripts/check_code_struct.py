import json, sys, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
# 找第二章代码块看实际结构
for c in d['chapters']:
    if '2章' in c['chapter']:
        for s in c['sections']:
            if '2.2' in s['section']:
                html = s['html']
                # 找所有代码相关标签
                for m in re.finditer(r'<code>.*?</code>', html, re.DOTALL):
                    print(f'CODE: {repr(m.group()[:150])}')
                # 找pre
                for m in re.finditer(r'<pre>.*?</pre>', html, re.DOTALL):
                    print(f'PRE: {repr(m.group()[:150])}')
                break
