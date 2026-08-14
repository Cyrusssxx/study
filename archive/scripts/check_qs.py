import json

d = json.load(open('data/questions/os.json', 'r', encoding='utf-8'))
print(f"Total: {d['total']}")
print()
for q in d['questions'][:15]:
    print(f"{q['id']}: {q['content'][:60]}")
