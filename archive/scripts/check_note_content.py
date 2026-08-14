import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

for subj in ['ds', 'cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    print(f'=== {subj.upper()} ===')
    for ch in data['chapters'][:2]:
        print(f'{ch["chapter"]}')
        for s in ch['sections'][:2]:
            html = s['html']
            # 检查是否有题目/答案
            has_question = any(kw in html for kw in ['试题精选', '答案解析', '考研真题', '模拟题', '【答案】', '题精选'])
            has_img = '<img' in html
            has_code = '<pre><code>' in html
            # 看前200字符
            preview = html[:300].replace('\n', ' ')
            print(f'  {s["section"]}: 题目={has_question} 图片={has_img} 代码={has_code}')
            print(f'    预览: {preview}')
