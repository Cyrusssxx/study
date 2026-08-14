# -*- coding: utf-8 -*-
"""
数学验证式修复『2的k次方被压平』（如 32K=25 → 32K=2¹⁵）：
只在等式一边可确定为 2 的整数次幂时才改写另一边的指数，指数由 log₂ 计算，
不信任 OCR 残留数字；前置运算符（+ - × / % 等）一律不碰，防止误改普通算术。
修改前备份到 data/questions/backup_exp/，修复明细写入 exp_fix_log.txt
"""
import json
import io
import math
import os
import re
import shutil

BASE = r'D:\ai code\408-quiz-app\data\questions'
BACKUP = os.path.join(BASE, 'backup_exp')
SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
MULT = {'K': 2**10, 'M': 2**20, 'G': 2**30, 'T': 2**40, '': 1}
# 左侧数字前不允许出现的字符（说明它是算式的一部分；含₂防止 log₂4M=22 被误改）
GUARD = r'(?<![0-9.+\-×x*/%％－^)₂⁰¹²³⁴⁵⁶⁷⁸⁹])'

log_lines = []


def pow2_exp(v):
    """v 是 2 的整数次幂时返回指数，否则 None"""
    if v < 2 or v != int(v):
        return None
    v = int(v)
    e = v.bit_length() - 1
    return e if (1 << e) == v else None


def sup(e):
    return '2' + str(e).translate(SUP)


def fix_text(txt, qid, fn):
    if not txt or '=' not in txt:
        return txt
    orig = txt

    # Rule E: 2a/2b=2c 链（自洽校验 a-b=c）
    def rule_e(m):
        a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a - b == c:
            return f'{sup(a)}/{sup(b)}={sup(c)}'
        return m.group(0)
    txt = re.sub(GUARD + r'2(\d{1,3})/2(\d{1,3})=2(\d{1,3})(?![0-9])', rule_e, txt)

    # Rule E2: A单位/B单位=2d（商为2的幂）
    def rule_e2b(m):
        v = int(m.group(1)) * MULT[m.group(2)] / (int(m.group(3)) * MULT[m.group(4)])
        e = pow2_exp(v)
        if e is not None:
            return f'{m.group(1)}{m.group(2)}B/{m.group(3)}{m.group(4)}B={sup(e)}'
        return m.group(0)
    txt = re.sub(GUARD + r'(\d+)([KMGT])B/(\d+)([KMGT])B=2\d{1,3}(?![0-9])', rule_e2b, txt)

    # Rule A: N单位=2d…（左侧带K/M/G/T单位，值为2的幂 → 右侧指数重算）
    def rule_a(m):
        v = float(m.group(1)) * MULT[m.group(2)]
        e = pow2_exp(v)
        if e is not None:
            return f'{m.group(1)}{m.group(2)}{m.group(3)}={sup(e)}{m.group(4)}'
        return m.group(0)
    txt = re.sub(GUARD + r'(\d+(?:\.\d+)?)([KMGT])(B?)\s*=\s*2\d{1,3}°?(B?)(?![0-9])', rule_a, txt)

    # Rule C: 2d=N（右侧为2的幂；右侧无单位时要求残留数字与指数一致）
    def rule_c(m):
        digits, num, unit, tailb = m.group(1), m.group(2), m.group(3), m.group(4)
        v = float(num) * MULT[unit]
        e = pow2_exp(v)
        if e is None:
            return m.group(0)
        if unit == '' and digits != str(e):
            return m.group(0)
        b = 'B' if m.group(0).split('=')[0].rstrip().endswith('B') else ''
        return f'{sup(e)}{b}={num}{unit}{tailb}'
    txt = re.sub(GUARD + r'2(\d{1,3})\s*B?\s*=\s*(\d+(?:\.\d+)?)([KMGT]?)(B?)(?![0-9])', rule_c, txt)

    # Rule B: N=2d（都无单位：N为2的幂且残留数字与指数一致，°按0拼接；
    #          N≥512时允许残留数字是指数前缀（OCR丢尾数，如 1024=21→2¹⁰））
    def rule_b(m):
        e = pow2_exp(float(m.group(1)))
        if e is None:
            return m.group(0)
        digits = m.group(2) + ('0' if m.group(3) == '°' else '')
        if digits != str(e) and not (float(m.group(1)) >= 512 and str(e).startswith(digits)):
            return m.group(0)
        return f'{m.group(1)}={sup(e)}'
    txt = re.sub(GUARD + r'(\d+)\s*=\s*2(\d{1,3})(°?)(?![0-9])', rule_b, txt)

    # Rule B2: N=2°（指数完全误识成度数符，N为2的幂时可定）
    def rule_b2(m):
        e = pow2_exp(float(m.group(1)))
        return f'{m.group(1)}={sup(e)}' if e is not None else m.group(0)
    txt = re.sub(GUARD + r'(\d+)\s*=\s*2°(?![0-9×x*])', rule_b2, txt)

    # Rule F: 2°-k=N（N+k为2的幂时可定，如 2°-1=255→2⁸-1）
    def rule_f(m):
        e = pow2_exp(int(m.group(2)) + int(m.group(1)))
        return f'{sup(e)}-{m.group(1)}={m.group(2)}' if e is not None else m.group(0)
    txt = re.sub(GUARD + r'2°-([12])\s*=\s*(\d+)(?![0-9])', rule_f, txt)

    # Rule C2: 2°=N（N为2的幂）
    def rule_c2(m):
        v = float(m.group(1)) * MULT[m.group(2)]
        e = pow2_exp(v)
        return f'{sup(e)}={m.group(1)}{m.group(2)}' if e is not None else m.group(0)
    txt = re.sub(GUARD + r'2°\s*=\s*(\d+(?:\.\d+)?)([KMGT]?)(?![0-9])', rule_c2, txt)

    # Rule F2: 2d-b=c（验证 2^d == b+c，如 28-250=6 → 2⁸-250=6）
    def rule_f2(m):
        d, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if d <= 64 and 2 ** d == b + c:
            return f'{sup(d)}-{m.group(2)}={m.group(3)}'
        return m.group(0)
    txt = re.sub(GUARD + r'2(\d{1,2})-(\d+)\s*=\s*(\d+)(?![0-9])', rule_f2, txt)

    # Rule D: log2N=e位/根/比特（验证 ceil(log2 N)==e）
    def rule_d(m):
        v = int(m.group(1)) * MULT[m.group(2)]
        e = int(m.group(3))
        if v >= 2 and math.ceil(math.log2(v)) == e:
            return f'log₂{m.group(1)}{m.group(2)}={m.group(3)}{m.group(4)}'
        return m.group(0)
    txt = re.sub(r'[l1]og\s*2\s*(\d+)([KMGT]?)\s*=\s*(\d+)(位|根|比特|bit)', rule_d, txt)

    # Rule G: log2后跟单个字母（变量）→ log₂
    txt = re.sub(r'log\s*2\s*([A-Za-z])(?![A-Za-z0-9])', r'log₂\1', txt)

    # Rule H: 3的幂被压平（3ᵈ=N 且 3^d==N，如 32=9→3²）
    def rule_h(m):
        if 3 ** int(m.group(1)) == int(m.group(2)):
            return f"3{m.group(1).translate(SUP)}={m.group(2)}"
        return m.group(0)
    txt = re.sub(GUARD + r'3(\d)\s*=\s*(\d+)(?![0-9])', rule_h, txt)

    if txt != orig:
        log_lines.append(f'{qid} [{fn}]\n  旧: {orig[:150]}\n  新: {txt[:150]}\n')
    return txt


os.makedirs(BACKUP, exist_ok=True)
n_field = 0
for k in ['ds', 'co', 'os', 'cn']:
    src = os.path.join(BASE, f'{k}.json')
    shutil.copy2(src, os.path.join(BACKUP, f'{k}.json'))
    d = json.load(io.open(src, encoding='utf-8'))
    for q in d['questions']:
        for key in ['content', 'explanation']:
            if q.get(key):
                new = fix_text(q[key], q['id'], key)
                if new != q[key]:
                    q[key] = new
                    n_field += 1
        for ok_ in list((q.get('options') or {}).keys()):
            new = fix_text(q['options'][ok_], q['id'], ok_)
            if new != q['options'][ok_]:
                q['options'][ok_] = new
                n_field += 1
    with io.open(src, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

with io.open(r'D:\ai code\408-quiz-app\exp_fix_log.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(log_lines))
print('fixed fields:', n_field)
