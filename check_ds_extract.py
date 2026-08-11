import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
d=json.load(open(r'D:/ai code/408-quiz-app/data/ocr_cache/wangdao_ds_full.json','r',encoding='utf-8'))
print(f'章数: {len(d)}')
for c in d:
    ch = c['chapter']
    secs = len(c['sections'])
    print(f'{ch}: {secs}节')
