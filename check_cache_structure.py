import json, sys, os
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

CACHE_DIR = r'D:/ai code/408-quiz-app/data/ocr_cache'

for subj in ['cn', 'os']:
    path = os.path.join(CACHE_DIR, f'wangdao_{subj}_full.json')
    if not os.path.exists(path):
        print(f'{subj}: 无缓存文件')
        continue
    
    data = json.load(open(path, 'r', encoding='utf-8'))
    print(f'=== {subj.upper()} ===')
    print(f'  章数: {len(data)}')
    
    # 看结构
    ch = data[0]
    print(f'  章字段: {list(ch.keys())}')
    if 'sections' in ch and ch['sections']:
        sec = ch['sections'][0]
        print(f'  节字段: {list(sec.keys())}')
        # 看页码信息
        print(f'  第一节: {sec.get("section", "?")}')
        print(f'    start_page: {sec.get("start_page", "N/A")}')
        print(f'    end_page: {sec.get("end_page", "N/A")}')
