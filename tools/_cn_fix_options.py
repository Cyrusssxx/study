"""修复 cn.json 中 6 题的损坏选项（下标/上标剥落 + 值错 + 重复）

来源：教材原图裁图逐题核对（tools/_crop/cn*.png）
"""
import json

ROOT = r'D:/ai code/408-quiz'
d = json.load(open(f'{ROOT}/pwa/data/cn.json', encoding='utf-8'))
qs = d['questions']

fixes = {
    # cn_0015: D 应为 80.10ms（教材原图明确显示）
    15: {'D': '80.10ms'},
    # cn_0017: T_CS/T_MS/T_PS 下标
    17: {
        'A': 'T<sub>CS</sub>＞T<sub>MS</sub>＞T<sub>PS</sub>',
        'B': 'T<sub>MS</sub>＞T<sub>PS</sub>＞T<sub>CS</sub>',
        'C': 'T<sub>MS</sub>＞T<sub>CS</sub>＞T<sub>PS</sub>',
        'D': 'T<sub>PS</sub>＞T<sub>MS</sub>＞T<sub>CS</sub>',
    },
    # cn_0136: n 上标（教材：A=2ⁿ−1, B=2n, C=2n−1, D=2ⁿ⁻¹）
    136: {
        'A': '2<sup>n</sup>−1',
        'B': '2n',
        'C': '2n−1',
        'D': '2<sup>n−1</sup>',
    },
    # cn_0473: C 的 k 上标（教材：C=2ᵏ）
    473: {
        'C': '2<sup>k</sup>',
    },
    # cn_0535: C 应为 UDP,TCP（SMTP/POP3 都用 TCP，C≠D）
    535: {
        'C': 'UDP,TCP',
    },
    # cn_0488: t₁/t₂/t₃/t₄ 下标
    488: {
        'A': 't<sub>1</sub>',
        'B': 't<sub>2</sub>',
        'C': 't<sub>3</sub>',
        'D': 't<sub>4</sub>',
    },
}

for number, opts_fix in fixes.items():
    q = [x for x in qs if x['number'] == number][0]
    old = dict(q.get('options') or {})
    q.setdefault('options', {})
    for k, v in opts_fix.items():
        q['options'][k] = v
    print(f'{q["id"]}: {old} → {q["options"]}')

json.dump(d, open(f'{ROOT}/pwa/data/cn.json', 'w', encoding='utf-8'),
         ensure_ascii=False, separators=(',', ': '), indent=2)
print('\n已写入 pwa/data/cn.json')
