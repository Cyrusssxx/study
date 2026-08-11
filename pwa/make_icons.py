# -*- coding: utf-8 -*-
"""生成 PWA 图标（192/512，紫底白字"408"）"""
from PIL import Image, ImageDraw, ImageFont

for size in (192, 512):
    img = Image.new('RGB', (size, size), '#4f46e5')
    d = ImageDraw.Draw(img)
    # 圆角背景层次感：中心浅一点的圆
    d.ellipse([size*0.08]*2 + [size*0.92]*2, fill='#6366f1')
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', int(size*0.38))
    except OSError:
        font = ImageFont.load_default()
    d.text((size/2, size*0.44), '408', font=font, fill='white', anchor='mm')
    try:
        f2 = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', int(size*0.14))
    except OSError:
        f2 = ImageFont.load_default()
    d.text((size/2, size*0.70), '刷题', font=f2, fill='#e0e7ff', anchor='mm')
    img.save(rf'D:\ai code\408-quiz-app\pwa\icons\icon-{size}.png')
print('icons ok')
