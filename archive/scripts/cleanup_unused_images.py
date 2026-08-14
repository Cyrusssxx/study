import os, sys, json, re, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'
NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

for subj in ['cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    
    # 从笔记中提取引用的图片
    notes = json.load(open(os.path.join(NOTES_DIR, f'{subj}_notes.json'), 'r', encoding='utf-8'))
    used = set()
    for ch in notes['chapters']:
        for sec in ch['sections']:
            for img in re.findall(r'<img[^>]+src="([^"]+)"', sec['html']):
                used.add(os.path.basename(img))
    
    # 删除未使用的图片
    all_imgs = glob.glob(os.path.join(img_dir, '*.png'))
    deleted = 0
    for img in all_imgs:
        if os.path.basename(img) not in used:
            os.remove(img)
            deleted += 1
    
    remaining = len(glob.glob(os.path.join(img_dir, '*.png')))
    total_size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(img_dir, '*.png'))) / 1024 / 1024
    print(f'{subj.upper()}: 删除 {deleted}张，保留 {remaining}张，{total_size:.1f}MB')
