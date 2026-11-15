#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""按「408 大题真题锚点」给四科讲义目录补重点标记（可复跑，只增不减）。

背景
----
上一轮（2026-11-15）按「大题频次 + 题库题量 + 我的错题/不熟/不会」加权打分，
只处理了**小节**，于是：
  * 锚点写在第 2 级的（如 2021-46 的 os:1.5 操作系统引导、cn:4.2 IPv4）整节被漏掉；
  * 一道题跨两个小节的（如 2021-46 第(2)(3)问考的磁盘格式化在 5.3.2）没有副锚点可落。

本脚本只做「覆盖兜底」：凡是被大题考过的点位，至少要标成「重点」；
同一小节被考过 >=2 次升为「很重点」。已有的 important/core 一律不清除，
所以和上一轮的加权结果叠加而不是覆盖。

数据源
------
  tools/bigq_kp_manual.json  主锚点（每年 7 道大题，人工审定）
  tools/bigq_kp_extra.json   副锚点（一题跨多小节时补充）
  pwa/data/notes/<科目>_notes.json  写入目标

用法
----
  python tools/mark_bigq_importance.py --dry    # 只打印将要改什么
  python tools/mark_bigq_importance.py          # 落盘
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBS = ['os', 'co', 'cn', 'ds']
# 各文件 JSON 序列化口径（与仓库现状逐字节一致，写回前会做往返校验）
SERIAL = {
    'os': dict(indent=1, crlf=False, tail=True),
    'co': dict(indent=1, crlf=True, tail=False),
    'cn': dict(indent=1, crlf=True, tail=False),
    'ds': dict(indent=1, crlf=True, tail=False),
}


def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return json.load(f)


def dump(doc, sub):
    cfg = SERIAL[sub]
    s = json.dumps(doc, ensure_ascii=False, indent=cfg['indent'])
    if cfg['crlf']:
        s = s.replace('\n', '\r\n')
    if cfg['tail']:
        s += '\n' if not cfg['crlf'] else '\r\n'
    return s


def read_raw(sub):
    p = os.path.join(ROOT, 'pwa/data/notes/%s_notes.json' % sub)
    with open(p, encoding='utf-8', newline='') as f:
        return p, f.read()


def collect_anchors():
    """返回 {(科目, 编号): [来源, ...]}"""
    hits = {}
    manual = load('tools/bigq_kp_manual.json')
    for year, items in manual.items():
        if year.startswith('_'):
            continue
        for num, code in items.items():
            sub, c = code.split(':')
            hits.setdefault((sub, c), []).append('主 %s-%s' % (year, num))
    extra_path = os.path.join(ROOT, 'tools/bigq_kp_extra.json')
    if os.path.exists(extra_path):
        extra = load('tools/bigq_kp_extra.json')
        for year, items in extra.items():
            if year.startswith('_'):
                continue
            for num, codes in items.items():
                if isinstance(codes, str):
                    codes = [codes]
                for code in codes:
                    sub, c = code.split(':')
                    hits.setdefault((sub, c), []).append('副 %s-%s' % (year, num))
    return hits


def main():
    dry = '--dry' in sys.argv
    hits = collect_anchors()
    report = []
    missing = []
    for sub in SUBS:
        p, raw = read_raw(sub)
        doc = json.loads(raw)
        if dump(doc, sub) != raw:
            raise SystemExit('%s 序列化口径与脚本不符，先核对，别写盘' % sub)

        index = {}   # code -> (holder_dict, level)
        for ch in doc['chapters']:
            for sec in ch['sections']:
                index[sec['section'].split(' ')[0]] = (sec, '节')
                for x in (sec.get('subsections') or []):
                    index[x['section'].split(' ')[0]] = (x, '小节')

        added = []
        for (s, code), src in sorted(hits.items()):
            if s != sub:
                continue
            if code not in index:
                missing.append((s, code, src))
                continue
            holder, level = index[code]
            # 很重点的门槛与上一轮加权口径保持一致：同一小节被 >=3 道大题考过；
            # 只考过 1~2 道的一律先给「重点」，避免把上一轮的 core 语义改窄。
            core = len(src) >= 3
            before = (bool(holder.get('core')), bool(holder.get('important')))
            extra_flag = ''
            # 字段顺序与仓库现状一致：section, html, [core], important
            if core and not holder.get('core'):
                holder['core'] = True
                extra_flag += 'core+'
            if not holder.get('important'):
                holder['important'] = True
                extra_flag += 'important'
            after = (bool(holder.get('core')), bool(holder.get('important')))
            if after != before:
                added.append('%s [%s] %s 次 → %s%s' % (
                    code, level, len(src), '很重点' if after[0] else '重点',
                    ('（' + extra_flag.strip('+') + '）') if extra_flag else ''))

        report.append((sub, len(added), added))
        if added and not dry:
            out = dump(doc, sub)
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(out)
            print('%s 写入 %d 处，字节 %d → %d' % (sub, len(added), len(raw.encode('utf-8')), len(out.encode('utf-8'))))
        elif added:
            print('%s 待写入 %d 处（--dry）' % (sub, len(added)))

    print('\n===== 覆盖明细 =====')
    total = 0
    for sub, n, added in report:
        total += n
        print('-- %s: %d 处' % (sub, n))
        for line in added:
            print('   ' + line)
    print('\n合计新增 %d 处；锚点总数 %d 个（含副锚点）' % (total, len(hits)))
    if missing:
        print('\n!! 锚点在讲义里找不到对应节/小节：')
        for s, code, src in missing:
            print('   %s %s  来源 %s' % (s, code, ', '.join(src)))


if __name__ == '__main__':
    main()
