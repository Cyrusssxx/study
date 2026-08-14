import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

print('=== 最终状态 ===')
for subj in ['ds', 'cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    ch = len(data['chapters'])
    sec = sum(len(c['sections']) for c in data['chapters'])
    imgs = sum(s['html'].count('<img') for c in data['chapters'] for s in c['sections'])
    codes = sum(s['html'].count('<pre><code>') for c in data['chapters'] for s in c['sections'])
    size = os.path.getsize(path) / 1024 / 1024
    print(f'{subj.upper()}: {ch}章 {sec}节 | 代码块:{codes} 图片:{imgs} | {size:.1f}MB')
