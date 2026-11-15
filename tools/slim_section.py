# -*- coding: utf-8 -*-
"""把「精简后的新版小节 HTML」写回 notes JSON。

为什么单独写脚本：改正文会动行号，历史上踩过三次（未闭合 ul 把图块收进 li、
<p> 里塞 div 导致解析器提前闭段、批注/高亮按行号或字符偏移定位）。所以每次
写盘前必须过硬校验，任何一条不过就中止，不落盘。

用法：
  python tools/slim_section.py --dry                 # 只做校验与统计
  python tools/slim_section.py                       # 校验通过后写盘
  python tools/slim_section.py --dry --subject os --sec 5.3.1 --file tools/os531_new.html
"""
import argparse
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(ROOT, 'pwa', 'data', 'notes')
BACKUP = 'D:/cjx/下载/download/408quiz-backup-20261115.json'

# 与正文同时存在、删了就丢分的硬清单（数值/年份/题号/公式）
MUST = [
    '4GB', '5046', '8.18', '12ms', '13.3ms', '1.67ms', '614400', '9600KB/s',
    '2ms', '20ms', '11.1', '5.56', '8.33', '4.17', '0.0052', '2.78', '1.5/r',
    '(N-1)×C', '(N-2)×C', 'N/2×C',
    '2019', '2014', 'Q620', 'Q622', 'Q623', 'Q627', 'Q631', 'Q632', 'Q634', 'Q635',
    '柱面号·盘面号·扇区号', 'D2 = D1⊕D3⊕P', '3、3、4',
]


def txt(html):
    s = re.sub(r'<[^>]+>', '', html or '')
    return re.sub(r'\s+', '', s)


def load_anno(sec_prefix, subject):
    """备份里该节的划词高亮文字（改完必须仍能在正文里找到）"""
    if not os.path.exists(BACKUP):
        return []
    bk = json.load(io.open(BACKUP, encoding='utf-8'))
    out = []
    for n in bk.get('notes') or []:
        qid = n.get('question_id') or ''
        if qid != '%s_hl' % subject:
            continue
        try:
            arr = json.loads(n.get('content') or '[]')
        except Exception:
            continue
        for x in arr:
            if (x.get('sec') or '').startswith(sec_prefix) and x.get('text'):
                out.append(x['text'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--subject', default='os')
    ap.add_argument('--sec', default='5.3.1')
    ap.add_argument('--file', default='tools/os531_new.html')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    path = os.path.join(NOTES, '%s_notes.json' % a.subject)
    old_raw = io.open(path, encoding='utf-8', newline='').read()
    d = json.loads(old_raw)
    new_html = io.open(os.path.join(ROOT, a.file), encoding='utf-8').read().strip()

    target = None
    for ch in d['chapters']:
        for sec in ch.get('sections', []):
            for x in [sec] + (sec.get('subsections') or []):
                if (x.get('section') or '').startswith(a.sec + ' '):
                    target = x
                    break
            if target:
                break
        if target:
            break
    if target is None:
        print('❌ 找不到小节 %s' % a.sec)
        return 1
    old_html = target.get('html') or ''
    print('小节：%s' % target.get('section'))
    print('  旧：%5d 字符  %3d 个 <p>  %d table  %d h4' % (
        len(old_html), len(re.findall(r'<p\b', old_html)),
        len(re.findall(r'<table', old_html)), len(re.findall(r'<h4', old_html))))
    print('  新：%5d 字符  %3d 个 <p>  %d table  %d h4' % (
        len(new_html), len(re.findall(r'<p\b', new_html)),
        len(re.findall(r'<table', new_html)), len(re.findall(r'<h4', new_html))))
    o, n = txt(old_html), txt(new_html)
    print('  可见字数：%d → %d（%+.0f%%）' % (len(o), len(n), (len(n) - len(o)) * 100.0 / max(1, len(o))))

    bad = []
    # ① 硬清单
    for kw in MUST:
        if kw not in new_html:
            bad.append('硬清单缺失：%s' % kw)
    # ② 高亮文字必须仍在可见文本里
    for t in load_anno(a.sec, a.subject):
        if re.sub(r'\s+', '', t) not in n:
            bad.append('高亮锚丢失：%r' % t)
    # ③ 图片一个不能少
    old_img = re.findall(r'<img[^>]*src="([^"]+)"', old_html)
    new_img = re.findall(r'<img[^>]*src="([^"]+)"', new_html)
    if old_img != new_img:
        bad.append('图片不一致：旧 %s / 新 %s' % (old_img, new_img))
    # ④ table / ul / ol 不许嵌在 <p> 里（历史 bug：解析器提前闭段 → 行号错乱）
    for m in re.finditer(r'<p\b[^>]*>((?:(?!</p>).)*?)</p>', new_html, re.S):
        if re.search(r'<(table|ul|ol|div)\b', m.group(1)):
            bad.append('块级元素嵌在 <p> 内：%s' % m.group(1)[:50])
    # ⑤ ★ 段必须保留
    if '★' in old_html and '★' not in new_html:
        bad.append('★ 考点段落丢失')

    if bad:
        print('\n❌ 校验未通过（未写盘）：')
        for b in bad:
            print('   -', b)
        return 1
    print('\n✅ 校验通过：硬清单 %d 项 / 高亮 %d 条 / 图片 %d 张 / 无块级嵌套 / ★ 保留'
          % (len(MUST), len(load_anno(a.sec, a.subject)), len(new_img)))

    if a.dry:
        print('\n--dry：未写盘')
        return 0

    target['html'] = new_html
    out = json.dumps(d, ensure_ascii=False, indent=1)
    if not out.endswith('\n'):
        out += '\n'
    io.open(path, 'w', encoding='utf-8', newline='').write(out)
    print('\n✅ 已写盘 %s' % os.path.relpath(path, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
