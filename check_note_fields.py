import json, sys, os, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

# 检查是否有页码信息
for subj in ['cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    print(f'=== {subj.upper()} ===')
    
    # 看章节名是否有页码
    for c in data['chapters'][:2]:
        print(f'  {c["chapter"]}')
        for s in c['sections'][:2]:
            print(f'    {s["section"]}')
    
    # 看是否有页码字段
    ch = data['chapters'][0]
    print(f'  章字段: {list(ch.keys())}')
    sec = ch['sections'][0]
    print(f'  节字段: {list(sec.keys())}')
