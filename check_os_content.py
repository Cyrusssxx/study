import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 检查OS提取日志
d=json.load(open(r'D:/ai code/408-quiz-app/data/notes/os_notes.json','r',encoding='utf-8'))
print('OS 笔记结构:')
for c in d['chapters']:
    ch = c['chapter']
    secs = [s['section'] for s in c['sections']]
    print(f'{ch}: {len(secs)}节')
    for s in secs:
        print(f'  - {s}')

print()
# 看OS提取时的目录结构
import os
log_path = r'D:/ai code/408-quiz-app/os_log.txt'
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f:
        print('OS 提取日志:')
        print(f.read())
