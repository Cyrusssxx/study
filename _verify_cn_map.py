# -*- coding: utf-8 -*-
"""cn 题号迁移全量校验：旧库(092cb20) 558 题 → cn_id_map → 新库，逐条内容比对"""
import io, json, re, subprocess, sys, difflib

sys.stdout.reconfigure(encoding='utf-8')

def norm(html):
    t = re.sub(r'<[^>]+>', '', html or '')
    t = t.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return re.sub(r'\s+', '', t)

def load_old(commit):
    raw = subprocess.run(['git', 'show', f'{commit}:pwa/data/cn.json'], capture_output=True).stdout.decode('utf-8')
    return json.loads(raw)

old = load_old('092cb20')
new = json.load(io.open('pwa/data/cn.json', encoding='utf-8'))
mp = json.load(io.open('pwa/data/cn_id_map.json', encoding='utf-8'))

old_q = {q['id']: q for q in old['questions']}
new_q = {q['id']: q for q in new['questions']}
new_norm = {qid: norm(q['content']) for qid, q in new_q.items()}
new_norm_index = {}
for qid, n in new_norm.items():
    new_norm_index.setdefault(n, []).append(qid)

exact = fuzzy = mismatch = missing_old = 0
mismatch_details = []
for oid, nids in mp.items():
    oq = old_q.get(oid)
    if not oq:
        missing_old += 1
        continue
    on = norm(oq['content'])
    nid = nids  # map 值是字符串
    # ① map 指向的新 id 内容是否一致
    nn = new_norm.get(nid)
    if nn == on:
        exact += 1
        continue
    # ② 不一致：允许后续小修订（相似度），并在全库找内容最佳匹配（防串号）
    best_id, best_r = None, 0.0
    for qid2, n2 in new_norm.items():
        if abs(len(n2) - len(on)) > max(40, len(on) * 0.3):
            continue
        r = difflib.SequenceMatcher(None, on, n2).ratio()
        if r > best_r:
            best_r, best_id = r, qid2
    if best_r >= 0.92:
        fuzzy += 1
        if best_id != nid:
            mismatch += 1
            mismatch_details.append((oid, nid, best_id, round(best_r, 3), on[:40]))
    else:
        mismatch += 1
        mismatch_details.append((oid, nid, best_id, round(best_r, 3), on[:40]))

print(f'映射总数: {len(mp)} | 旧题缺: {missing_old}')
print(f'内容完全一致: {exact} | 后续修订(相似>=0.92): {fuzzy} | 疑似串号: {mismatch}')
for d in mismatch_details[:10]:
    print('  串号嫌疑:', d)
# 新库多出的 6 题（不在映射里）
extra = [q['id'] for q in new['questions'] if q['id'] not in set(mp.values())]
print('新库新增(不在映射):', extra)
