# -*- coding: utf-8 -*-
"""修正 CO 2.2.4（定点数的乘除运算）的溢出判据与若干表述错误。

用法：python tools/fix_co224.py [--dry]

改了什么（逐条）：
  1. 「n 次后高 n 位 P 非 0 即溢出（OF/CF 置 1）」错——把无符号判据套到有符号上，
     且 OF 与 CF 并列。正确：无符号 → 高 n 位全 0 合法，否则 CF=1；
     有符号 → 高 n 位须等于低 n 位的符号扩展，否则 OF=1。
  2. 「用 2n 位寄存器」错——2n 位是乘积 [P:Y] 的宽度，不是单个寄存器。
  3. 原码乘法补「逻辑右移」；Booth 的「算术右移」与之对照。
  4. 「三种乘法实现：迭代式 / 阵列式 / 移位-加减」错——迭代式与移位-加减是同一种，
     实为两种：移位-加（串行）与阵列乘法器。
  5. 无符号除法「被除数 64 位」→ 2n 位（n=32 时才是 64 位）。
  6. 补码除法「R 中做全符号位扩展」→ 被除数按符号扩展补成 2n 位，并明确 OF=1。

硬校验（任一不过即中止）：
  · 非 data-fig 的 <p> 数量不变（10 个）、<li> 数量不变（3 个）→ 行号零漂移；
  · ★ 段原样保留；
  · 图片 src 与旧版一致；
  · 重新序列化可逆。
"""
import json, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
P = os.path.join(ROOT, 'pwa', 'data', 'notes', 'co_notes.json')
NEW = os.path.join(HERE, 'co224_new.html')
DRY = '--dry' in sys.argv

raw = io.open(P, 'rb').read()
crlf = b'\r\n' in raw
d = json.loads(raw.decode('utf-8'))


def dump(obj):
    s = json.dumps(obj, ensure_ascii=False, indent=1)
    if crlf:
        s = s.replace('\n', '\r\n')
    return s.encode('utf-8')


if dump(d) != raw:
    print('!! 序列化不可逆，中止'); sys.exit(1)

target = None
for ch in d['chapters']:
    for s in ch.get('sections', []):
        for x in [s] + s.get('subsections', []):
            if (x.get('section') or '').startswith('2.2.4'):
                target = x
if target is None:
    print('!! 找不到 2.2.4'); sys.exit(1)

old = target['html']
STAR = '<h4>★ 高频真题考点与陷阱</h4>'
if old.count(STAR) != 1:
    print('!! ★ 锚点数量异常'); sys.exit(1)
si = old.index(STAR)
old_body, old_tail = old[:si], old[si:]

new_body = io.open(NEW, encoding='utf-8').read().replace('\r\n', '\n').rstrip('\n') + '\n\n'

count_p = lambda h: len(re.findall(r'<p(?! class="paragraph" data-fig)', h))
count_li = lambda h: h.count('<li>')
count_fig = lambda h: len(re.findall(r'<p class="paragraph" data-fig="1">', h))

errs = []
if count_p(old_body) != count_p(new_body):
    errs.append('非 data-fig <p> 数 %d -> %d' % (count_p(old_body), count_p(new_body)))
if count_li(old_body) != count_li(new_body):
    errs.append('<li> 数 %d -> %d' % (count_li(old_body), count_li(new_body)))
if count_fig(old_body) != count_fig(new_body):
    errs.append('data-fig 块数 %d -> %d' % (count_fig(old_body), count_fig(new_body)))
if re.findall(r'img/[a-z0-9_]+\.svg', old_body) != re.findall(r'img/[a-z0-9_]+\.svg', new_body):
    errs.append('图片引用变了')
if '<div class="zt-ref">' not in new_body:
    errs.append('zt-ref 丢了')
for kw in ['CF=1', 'OF=1', '符号扩展', '逻辑右移', '算术右移']:
    if kw not in new_body:
        errs.append('关键结论缺失：' + kw)
for bad in ['OF/CF 置 1', '三种乘法实现', '64 位放 [R:Q]']:
    if bad in new_body:
        errs.append('旧错误残留：' + bad)

if errs:
    print('!! 校验失败：')
    for e in errs:
        print('   -', e)
    sys.exit(1)

target['html'] = new_body + old_tail
out = dump(d)

if not DRY:
    io.open(P, 'wb').write(out)
    print('written', len(raw), '->', len(out))
else:
    print('[dry] 将写入', len(raw), '->', len(out))
print('p %d / li %d / fig %d（前后一致）' % (count_p(new_body), count_li(new_body), count_fig(new_body)))
