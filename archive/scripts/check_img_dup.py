import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

for subj in ['cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    print(f'=== {subj.upper()} ===')
    for ch in data['chapters'][:2]:
        print(f'{ch["chapter"]}')
        for s in ch['sections'][:2]:
            imgs = re.findall(r'<img[^>]+>', s['html'])
            print(f'  {s["section"]}: {len(imgs)}张图片')
            for img in imgs[:2]:
                print(f'    {img}')
