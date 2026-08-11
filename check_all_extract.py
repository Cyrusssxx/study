import json, sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
for s in ['ds','cn','os']:
    d=json.load(open(f'D:/ai code/408-quiz-app/data/ocr_cache/wangdao_{s}_full.json','r',encoding='utf-8'))
    ch=len(d)
    sec=sum(len(c['sections']) for c in d)
    print(f'{s.upper()}: {ch}章 {sec}节')
    for c in d:
        ch_name = c['chapter']
        sec_count = len(c['sections'])
        print(f'  {ch_name}: {sec_count}节')
