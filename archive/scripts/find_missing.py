import json
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

subjects = ['os', 'ds', 'co', 'cn']
result = {}

for s in subjects:
    with open(f'data/questions/{s}.json', encoding='utf-8') as f:
        data = json.load(f)
    missing = []
    for q in data['questions']:
        if not q.get('answer'):
            missing.append({
                'id': q['id'],
                'number': q.get('number'),
                'chapter': q.get('chapter', ''),
                'section': q.get('section', ''),
                'content': q['content'],
                'options': q.get('options', {}),
            })
    result[s] = missing
    print(f'{s}: {len(missing)} 题缺答案')

with open('missing_questions.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print('已导出到 missing_questions.json')
