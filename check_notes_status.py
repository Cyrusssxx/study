import json, sys, os
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

for subj in ['ds', 'cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    ch_count = len(data['chapters'])
    sec_count = sum(len(c['sections']) for c in data['chapters'])
    total_chars = sum(len(s['html']) for c in data['chapters'] for s in c['sections'])
    size_kb = os.path.getsize(path) / 1024
    
    # 检查代码/图片
    code_count = sum(s['html'].count('<code>') for c in data['chapters'] for s in c['sections'])
    img_count = sum(s['html'].count('<img') for c in data['chapters'] for s in c['sections'])
    table_count = sum(s['html'].count('<table') for c in data['chapters'] for s in c['sections'])
    
    print(f'{subj.upper()}: {ch_count}章 {sec_count}节 {total_chars}字符 {size_kb:.0f}KB')
    print(f'  代码块:{code_count} 图片:{img_count} 表格:{table_count}')
    print(f'  title: {data.get("title", "MISSING")}')
    print()
