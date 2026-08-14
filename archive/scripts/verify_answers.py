import json

subjects = ['os', 'ds', 'co', 'cn']
names = ['操作系统', '数据结构', '计算机组成原理', '计算机网络']
total_ans = 0
total_qs = 0

for s, name in zip(subjects, names):
    with open(f'data/questions/{s}.json', encoding='utf-8') as f:
        data = json.load(f)
    qs = data['questions']
    has_ans = sum(1 for q in qs if q.get('answer'))
    total_ans += has_ans
    total_qs += len(qs)
    print(f'{name}: {has_ans}/{len(qs)} 有答案 ({has_ans/len(qs)*100:.1f}%)')
    # 显示前3题验证
    for q in qs[:3]:
        ans = q.get('answer', '无')
        print(f"  {q['id']}: 答案={ans}  题目={q['content'][:30]}")

print(f'\n总计: {total_ans}/{total_qs} ({total_ans/total_qs*100:.1f}%)')
