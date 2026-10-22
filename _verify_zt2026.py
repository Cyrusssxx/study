# -*- coding: utf-8 -*-
"""
用《【宇天】2026年真题.pdf》核对 pwa/data/zt/zt_2026.json 的题目。

PDF：14 页，一、单项选择 1~40，二、综合应用题 41~47。
zt_2026.json：items 47 条，字段 i/t/s/a/sid/q/o/an/qid。

逐题比对题干（相似度），并核对科目归属（sid）与答案是否存在。
用法：python _verify_zt2026.py
"""
import fitz
import json
import re
import difflib

PDF = r'D:\vx\xwechat_files\wxid_rl5ywso7sx8b22_ff41\msg\file\2026-10\【宇天】2026年真题.pdf'
ZT = 'pwa/data/zt/zt_2026.json'


def norm(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    s = re.sub(r'[\s\u3000]+', '', s)
    s = (s.replace('（', '(').replace('）', ')').replace('，', ',').replace('。', '')
          .replace('；', ';').replace('！', '').replace('？', '').replace('：', ':'))
    return re.sub(r'[^\x00-\x7f\u4e00-\u9fff]', '', s).lower()


def parse_pdf():
    d = fitz.open(PDF)
    lines = []
    started = False
    for i in range(d.page_count):
        for l in d[i].get_text().split('\n'):
            l = l.strip()
            if not started:
                if '单项选择题' in l:
                    started = True
                continue
            lines.append(l)
    q_pat = re.compile(r'^(\d{1,2})[．.]\s*(.*)$')
    opt_pat = re.compile(r'^([A-D])[．.]\s*(.*)$')
    qs, cur = [], None
    for l in lines:
        if not l or l.startswith('·') or '考生' in l[:4]:
            continue
        qm = q_pat.match(l)
        if qm and not opt_pat.match(l):
            cur = {'no': int(qm.group(1)), 'stem': [qm.group(2)], 'opts': [], 'type': 1 if int(qm.group(1)) <= 40 else 2}
            qs.append(cur)
            continue
        om = opt_pat.match(l)
        if om and cur:
            cur['opts'].append(om.group(2))
            continue
        if cur is not None and not om:
            if cur['opts']:
                cur['opts'][-1] += l
            else:
                cur['stem'].append(l)
    return qs


def main():
    pdf = parse_pdf()
    zt = json.load(open(ZT, encoding='utf-8'))['items']

    print(f'PDF 解析出 {len(pdf)} 题（选择 {sum(1 for q in pdf if q["type"]==1)} / 大题 {sum(1 for q in pdf if q["type"]==2)}）')
    print(f'zt_2026 有 {len(zt)} 题\n')

    bad = []
    print('=== 逐题比对 ===')
    for p in pdf:
        z = next((x for x in zt if x['i'] == p['no']), None)
        if not z:
            print(f'  第{p["no"]}题：zt 里没有')
            bad.append(p['no'])
            continue
        r = difflib.SequenceMatcher(None, norm(''.join(p['stem']))[:120], norm(z['q'])[:120]).ratio()
        flag = 'OK ' if r >= 0.45 else '❌ '
        if r < 0.45:
            bad.append(p['no'])
        print(f'  {flag}第{p["no"]:>2}题  相似度={r:.2f}  科目={z["sid"]}  答案={z.get("a") or "?"}  '
              f'{"".join(p["stem"])[:38]}')

    print(f'\n低相似/缺失：{bad or "无"}')

    # 科目分布 vs 真题常规分布
    import collections
    c = collections.Counter(x['sid'] for x in zt if x['t'] == 1)
    print('\n选择题科目分布：', dict(c), '合计', sum(c.values()))
    print('大题科目分布：', dict(collections.Counter(x['sid'] for x in zt if x['t'] == 2)))
    print('缺答案的题：', [x['i'] for x in zt if not x.get('a')] or '无')
    print('缺解析的题：', [x['i'] for x in zt if not x.get('an')] or '无')


if __name__ == '__main__':
    main()
