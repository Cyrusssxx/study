import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 检查 OS 笔记中的 section 名
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/os_notes.json','r',encoding='utf-8'))
for c in d['chapters']:
    ch = c['chapter']
    for s in c['sections']:
        sec = s['section']
        if '1.1' in sec or '2.1' in sec or '71' in sec or '文件' in sec:
            print(f'{ch} -> {sec}')

print()
# 检查 OS 题目中的 section 名
qs=json.load(open(r'D:/ai code/408-quiz-app/pwa/data/os.json','r',encoding='utf-8'))
questions = qs.get('questions', qs) if isinstance(qs, dict) else qs
q_secs = set(q.get('section', '') for q in questions if q.get('section'))
for s in sorted(q_secs):
    if '1.1' in s or '2.1' in s or '71' in s or '文件' in s:
        print(f'题目: {s}')
