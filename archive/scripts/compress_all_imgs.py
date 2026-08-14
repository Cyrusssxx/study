#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

from PIL import Image

IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'
MAX_W = 800

for subj in ['ds', 'cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    files = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    print(f'{subj.upper()}: {len(files)}张')
    
    for f in files:
        img = Image.open(f)
        w, h = img.size
        if w > MAX_W:
            ratio = MAX_W / w
            new_h = int(h * ratio)
            img = img.resize((MAX_W, new_h), Image.LANCZOS)
            img.save(f, optimize=True, quality=85)
    
    total_size = sum(os.path.getsize(f) for f in files) / 1024 / 1024
    print(f'  压缩后: {total_size:.1f}MB')
