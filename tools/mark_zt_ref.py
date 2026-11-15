# -*- coding: utf-8 -*-
"""在讲义节/小节顶部标注「这里考过哪几年的大题」。

为什么值得单独做：图和大题目前完全没打通 —— 全库正文提到年份只有 16 处，
图块里 0 处。用户看到一张图，无从知道这节是 2014 年大题第 44 题的考点。

为什么标注放「块顶部」而不是「图下方」：
  一张图往往对应多道题（也可能对应的是选择题），逐图标会给出错误暗示；
  而「这一节考过 2011-41 / 2015-42 / 2023-41」是数据能直接支撑的事实。

为什么用 <div> 而不是 <p>：
  行号器只遍历 .notes-body li / p（见 notes.html indexSection）。用 div 既不占行号，
  也就不会让已存的行级批注整体错位 —— 这是本仓库改正文的头号红线。

数据源：tools/bigq_kp_manual.json（主锚点）+ tools/bigq_kp_extra.json（副锚点），
        与 tools/mark_bigq_importance.py 同一份口径，避免两处清单不同步。

用法：
  python tools/mark_zt_ref.py --dry
  python tools/mark_zt_ref.py
"""
import argparse
import collections
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(ROOT, 'pwa', 'data', 'notes')
SUBJECTS = ['co', 'os', 'cn', 'ds']


def load(p):
    with io.open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return json.load(f)


def collect():
    """知识点编号 -> [年份-题号]，同一题重复登记时去重"""
    hits = collections.defaultdict(list)
    for name in ('tools/bigq_kp_manual.json', 'tools/bigq_kp_extra.json'):
        d = load(name)
        for year, v in d.items():
            if str(year).startswith('_'):
                continue
            for qno, v2 in v.items():
                items = v2 if isinstance(v2, list) else [v2]
                for kp in items:
                    tag = '%s-%s' % (year, qno)
                    if tag not in hits[kp]:
                        hits[kp].append(tag)
    return hits


def num_of(sec):
    return (sec or '').split(' ')[0]


def render_div(tags):
    tags = sorted(tags, key=lambda t: (-int(t.split('-')[0]), int(t.split('-')[1])))
    body = ' · '.join('<span class="zt-ref-q">%s</span>' % t for t in tags)
    return ('<div class="zt-ref"><b>大题考点</b>%s</div>' % body)


DIV_RE = re.compile(r'^<div class="zt-ref">[\s\S]*?</div>')


def strip_div(html):
    return DIV_RE.sub('', html or '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    hits = collect()
    by_subject = collections.defaultdict(dict)
    for kp, tags in hits.items():
        sk, num = kp.split(':')
        by_subject[sk][num] = tags

    total = 0
    for sk in SUBJECTS:
        path = os.path.join(NOTES, '%s_notes.json' % sk)
        raw = io.open(path, encoding='utf-8', newline='').read()
        crlf = '\r\n' in raw
        trail = raw.endswith('\n')
        d = json.loads(raw)
        want = by_subject.get(sk, {})
        touched = []
        for ch in d.get('chapters', []):
            for sec in ch.get('sections', []):
                for blk in [sec] + (sec.get('subsections') or []):
                    num = num_of(blk.get('section'))
                    tags = want.get(num)
                    cur = strip_div(blk.get('html') or '')
                    if not tags:
                        if cur != (blk.get('html') or ''):
                            blk['html'] = cur        # 清理已失效的旧标注
                            touched.append((num, 'clean'))
                        continue
                    blk['html'] = render_div(tags) + cur
                    touched.append((num, ','.join(tags)))
                    total += 1

        print('== %s  命中 %d 处' % (sk, len(touched)))
        for num, tag in touched:
            print('   %-8s %s' % (num, tag))
        if a.dry:
            continue
        out = json.dumps(d, ensure_ascii=False, indent=1)
        if crlf:
            out = out.replace('\n', '\r\n')
        if trail and not out.endswith('\n'):
            out += '\n'
        io.open(path, 'w', encoding='utf-8', newline='').write(out)

    print('\n合计标注 %d 处%s' % (total, '（--dry 未写盘）' if a.dry else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
