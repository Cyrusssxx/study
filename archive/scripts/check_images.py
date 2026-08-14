import json, sys, os
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

for subj in ['cn', 'os']:
    print(f'=== {subj.upper()} ===')
    img_dir = os.path.join(IMG_DIR, subj)
    mapping_file = os.path.join(img_dir, 'images.json')
    
    if not os.path.exists(mapping_file):
        print('  无映射文件')
        continue
    
    mapping = json.load(open(mapping_file, 'r', encoding='utf-8'))
    print(f'  总图片数: {len(mapping)}')
    
    # 按页码分布
    pages = {}
    for img in mapping:
        p = img['page']
        if p not in pages:
            pages[p] = 0
        pages[p] += 1
    
    # 找图片密集的页面（可能有重要图表）
    multi_img_pages = [(p, c) for p, c in pages.items() if c >= 2]
    print(f'  多图片页: {len(multi_img_pages)}')
    
    # 看前几张图片
    for img in mapping[:3]:
        print(f'  p{img["page"]}: {img["file"]} {img["w"]}x{img["h"]}')
