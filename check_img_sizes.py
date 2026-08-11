import json, sys, os, glob, re
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'
IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

# 检查图片实际是整页渲染还是独立图示
for subj in ['cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    files = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    print(f'=== {subj.upper()} ===')
    print(f'  图片数: {len(files)}')
    
    # 看几张图片的尺寸
    import subprocess
    for f in files[:3]:
        fname = os.path.basename(f)
        size = os.path.getsize(f) / 1024
        print(f'  {fname}: {size:.0f}KB')
