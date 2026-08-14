import os, sys, glob
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

from PIL import Image

IMG_DIR = r'D:/ai code/408-quiz-app/data/notes/images'

for subj in ['ds', 'cn', 'os']:
    img_dir = os.path.join(IMG_DIR, subj)
    files = sorted(glob.glob(os.path.join(img_dir, '*.png')))
    
    # 统计尺寸分布
    sizes = []
    for f in files:
        img = Image.open(f)
        w, h = img.size
        ratio = w / h
        sizes.append((f, w, h, ratio))
    
    # 找图表特征：不是整页（整页通常是A4比例~0.7），图表通常更方正
    # 整页A4: ~0.7 ratio, 图表: 0.3-3.0 更集中
    print(f'{subj.upper()}: {len(files)}张')
    
    # 看尺寸分布
    ratios = [s[3] for s in sizes]
    avg_ratio = sum(ratios) / len(ratios)
    print(f'  平均宽高比: {avg_ratio:.2f}')
    
    # 过滤：去掉明显是整页的（ratio接近0.7且尺寸大）
    charts = [(f, w, h, r) for f, w, h, r in sizes if not (0.65 < r < 0.75 and w > 700)]
    print(f'  疑似图表: {len(charts)}张')
    
    # 看前5张
    for f, w, h, r in charts[:5]:
        print(f'    {os.path.basename(f)}: {w}x{h} ratio={r:.2f}')
