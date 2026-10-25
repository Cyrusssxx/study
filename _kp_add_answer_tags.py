# -*- coding: utf-8 -*-
"""kp_analysis 格式统一：考点段末尾补「答案 X」标注（仅处理缺失者，幂等）"""
import io, json, re, sys

sys.stdout.reconfigure(encoding='utf-8')

files = {'cn': 'pwa/data/cn.json', 'co': 'pwa/data/co.json', 'ds': 'pwa/data/ds.json', 'os': 'pwa/data/os.json'}
patched, skipped = [], []
for sub, p in files.items():
    d = json.load(io.open(p, encoding='utf-8'))
    ch = False
    for q in d['questions']:
        kp = q.get('kp_analysis')
        if not kp:
            continue
        if '答案' in kp or '逐空' in kp or '口径' in kp:
            continue
        ans = str(q.get('answer', '')).strip().replace(' ', '')
        if not ans or not re.fullmatch(r'[A-Z]+', ans):
            skipped.append((q['id'], f'answer异常:{q.get("answer")!r}'))
            continue
        m = re.search(r'</div>', kp)
        if not m:
            skipped.append((q['id'], '无</div>结构'))
            continue
        pos = m.start()
        prev = kp[:pos]
        if prev and prev[-1] not in '。！？；：':
            prev += '。'
        q['kp_analysis'] = prev + f'<b>答案 {ans}。</b>' + kp[pos:]
        patched.append(q['id'])
        ch = True
    if ch:
        json.dump(d, io.open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

print('补标注:', len(patched), '题；跳过:', len(skipped))
for qid, why in skipped:
    print('  跳过', qid, why)
# 复验：全部条目结构
total, bad = 0, []
for sub, p in files.items():
    d = json.load(io.open(p, encoding='utf-8'))
    for q in d['questions']:
        kp = q.get('kp_analysis')
        if not kp:
            continue
        total += 1
        for tag in ('div', 'b', 'sup', 'sub', 'span'):
            o = len(re.findall(r'<' + tag + r'[ >]', kp)); c = len(re.findall(r'</' + tag + r'>', kp))
            if o != c:
                bad.append((q['id'], tag))
print('复验总数:', total, '；标签不平衡:', bad or '无')
