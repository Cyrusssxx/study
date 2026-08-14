import os, sys, glob, re, shutil
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

src = r'D:\ai code\.reasonix\attachments\clipboard-20260802-180848.812947-000001.png'
dst = r'D:\ai code\408-quiz-app\screenshot.png'

shutil.copy2(src, dst)
print(f'截图复制到: {dst}')
print(f'文件大小: {os.path.getsize(dst)} bytes')
