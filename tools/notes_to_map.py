# -*- coding: utf-8 -*-
"""
notes_to_map.py — 把 pwa/data/notes/{subject}_notes.json 转成 pwa/data/{subject}_map.json
大纲式思维导图数据（map.html 使用）。

用法: python tools/notes_to_map.py <subject>
示例: python tools/notes_to_map.py os
  -> 读 pwa/data/notes/os_notes.json, 写 pwa/data/os_map.json

转换规则:
- 每章 -> root 节点 (n=章名)
- 每节 -> root 下一级 (n=节名)
- 节内每个 <h4> -> 二级节点 (n=h4标题)
- h4 块内正文(p/li/table/ol) -> 节点 d 纯文本
- <svg> 草图 -> 提取内部 <text> 文字拼成 "[图] ..." 描述(纯文本大纲放不了图)
- <table> -> 行内单元格用 | 分隔、行间换行
"""
import json
import re
import html as htmlmod
import sys
import os


def svg_to_text(svg_block):
    """提取 SVG 内 text 元素内容，拼接为一行描述（去重、过滤空/坐标文字）。"""
    texts = re.findall(r'<text[^>]*>(.*?)</text>', svg_block, re.S)
    if not texts:
        return '[示意图]'
    parts = []
    for t in texts:
        t = re.sub(r'<[^>]+>', '', t).strip()
        if not t:
            continue
        parts.append(t)
    seen, out = set(), []
    for t in parts:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return '[图] ' + ' | '.join(out)


def html_to_text(block):
    """富文本 HTML -> 大纲纯文本（SVG 提取文字、表格 | 分隔、换行清理）。"""
    # SVG 先整体替换
    block = re.sub(r'<svg.*?</svg>', lambda m: svg_to_text(m.group(0)), block, flags=re.S)
    # 表格
    block = re.sub(r'<td[^>]*>', ' | ', block)
    block = re.sub(r'</td>', '', block)
    block = re.sub(r'<th[^>]*>', ' | ', block)
    block = re.sub(r'</th>', '', block)
    block = re.sub(r'</tr>', '\n', block)
    block = re.sub(r'</table>', '\n', block)
    # 换行
    block = re.sub(r'<br\s*/?>', '\n', block)
    block = re.sub(r'</(p|li|div|h\d)>', '\n', block)
    # 去标签
    block = re.sub(r'<[^>]+>', '', block)
    # 实体还原
    block = htmlmod.unescape(block)
    # 清理：去行首尾空白、空行、连续重复行
    lines = [ln.strip() for ln in block.split('\n')]
    lines = [ln for ln in lines if ln]
    out = []
    for ln in lines:
        if out and ln == out[-1]:
            continue
        out.append(ln)
    text = '\n'.join(out)
    return re.sub(r'\n{2,}', '\n', text).strip()


def split_h4(html):
    """按 <h4> 分块，返回 [(标题, 块内html), ...]；h4 之前的前导文本并入第一块。"""
    parts = re.split(r'(<h4[^>]*>.*?</h4>)', html, flags=re.S)
    blocks = []
    lead = ''
    for p in parts:
        if p.startswith('<h4'):
            title = re.sub(r'<[^>]+>', '', p).strip()
            blocks.append((title, ''))
        elif blocks:
            blocks[-1] = (blocks[-1][0], blocks[-1][1] + p)
        else:
            lead += p
    if blocks and lead.strip():
        blocks[0] = (blocks[0][0], lead + blocks[0][1])
    elif not blocks and lead.strip():
        blocks.append(('', lead))
    return blocks


def build_map(notes, title, subtitle):
    roots = []
    for ch in notes['chapters']:
        root = {'n': ch['chapter'], 'c': []}
        for sec in ch['sections']:
            sec_node = {'n': sec['section'], 'c': []}
            for bt, br in split_h4(sec['html']):
                d = html_to_text(br)
                sec_node['c'].append({'n': bt, 'd': d})
            root['c'].append(sec_node)
        roots.append(root)
    return {'title': title, 'subtitle': subtitle, 'roots': roots}


def main():
    if len(sys.argv) < 2:
        print('用法: python tools/notes_to_map.py <subject>   (os/co/ds/cn)')
        sys.exit(1)
    subject = sys.argv[1]
    src = os.path.join('pwa', 'data', 'notes', f'{subject}_notes.json')
    dst = os.path.join('pwa', 'data', f'{subject}_map.json')
    with open(src, encoding='utf-8') as f:
        notes = json.load(f)
    title = {'os': '操作系统思维导图', 'co': '计算机组成原理思维导图',
             'ds': '数据结构思维导图', 'cn': '计算机网络思维导图'}.get(subject, f'{subject.upper()}思维导图')
    m = build_map(notes, title, notes.get('source', ''))
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    # 统计
    total = 0
    for r in m['roots']:
        for s in r['c']:
            total += len(s['c'])
    print(f'OK: {dst}')
    print(f'  roots(章): {len(m["roots"])}, 节: {sum(len(r["c"]) for r in m["roots"])}, h4节点: {total}')
    return m


if __name__ == '__main__':
    main()
