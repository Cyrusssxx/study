import os, sys, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

for subj in ['ds', 'cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    imgs = glob.glob(os.path.join(img_dir, '*.png'))
    total_size = sum(os.path.getsize(f) for f in imgs) / 1024 / 1024
    print(f'{subj.upper()}: {len(imgs)}张, {total_size:.1f}MB')
