import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 检查 DS 第二章线性表的代码质量
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/ds_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    if '2章' in c['chapter']:
        for s in c['sections']:
            if '2.2' in s['section']:
                html = s['html']
                # 找代码块
                import re
                codes = re.findall(r'<code>(.*?)</code>', html, re.DOTALL)
                print(f'{s["section"]}:')
                for code in codes[:5]:
                    print(f'  {code[:100]}')
                break
