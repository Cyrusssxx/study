import json, sys, os, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

def dedup_images(html):
    """去掉重复的图片标签，每节只保留1张"""
    imgs = re.findall(r'<img[^>]+>', html)
    if len(imgs) <= 1:
        return html
    
    seen = set()
    result = html
    for img in imgs:
        if img in seen:
            result = result.replace(img, '', 1)
        else:
            seen.add(img)
    return result

for subj in ['cn', 'os']:
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    for ch in data['chapters']:
        for sec in ch['sections']:
            sec['html'] = dedup_images(sec['html'])
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'{subj.upper()} 去重完成')
