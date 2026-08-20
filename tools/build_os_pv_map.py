# -*- coding: utf-8 -*-
"""
build_os_pv_map.py — 从 os_notes.json 的 2.4 PV操作大题总结 节生成 os_map.json
（🗺️ 思维导图页专用，带原始 SVG 草图内嵌，map.html 渲染 node.svg 字段直接展示）

用法: python tools/build_os_pv_map.py
输出: pwa/data/os_map.json  （只含 PV 总结，替换全量笔记大纲版）
"""
import json
import re
import html as htmlmod


def html_to_text(block):
    """富文本 HTML -> 纯文本（表格 | 分隔、换行清理）。SVG 块已单独抽出，此处仅兜底删掉。"""
    block = re.sub(r'<svg.*?</svg>', '', block, flags=re.S)
    block = re.sub(r'<td[^>]*>', ' | ', block)
    block = re.sub(r'</td>', '', block)
    block = re.sub(r'<th[^>]*>', ' | ', block)
    block = re.sub(r'</th>', '', block)
    block = re.sub(r'</tr>', '\n', block)
    block = re.sub(r'</table>', '\n', block)
    block = re.sub(r'<br\s*/?>', '\n', block)
    block = re.sub(r'</(p|li|div|h\d|pre)>', '\n', block)
    block = re.sub(r'<[^>]+>', '', block)
    block = htmlmod.unescape(block)
    lines = [ln.strip() for ln in block.split('\n')]
    lines = [ln for ln in lines if ln]
    out = []
    for ln in lines:
        if out and ln == out[-1]:
            continue
        out.append(ln)
    return re.sub(r'\n{2,}', '\n', '\n'.join(out)).strip()


def split_h4(html):
    """按 <h4> 分块；h4 之前的前导文本并入第一块。"""
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


def main():
    with open('pwa/data/notes/os_notes.json', encoding='utf-8') as f:
        notes = json.load(f)

    # 定位 2.4 PV操作大题总结 节
    sec = None
    for ch in notes['chapters']:
        for s in ch['sections']:
            if 'PV' in s['section']:
                sec = s
                ch_name = ch['chapter']
                break
        if sec:
            break
    if sec is None:
        print('错误: 未找到 PV 总结节'); return

    roots = [{
        'n': ch_name,
        'c': [{
            'n': sec['section'],
            'c': []
        }]
    }]
    sec_node = roots[0]['c'][0]

    for bt, br in split_h4(sec['html']):
        svg_blocks = re.findall(r'<svg.*?</svg>', br, flags=re.S)
        if svg_blocks:
            svg = ''.join(svg_blocks)
            rest = re.sub(r'<svg.*?</svg>', '', br, flags=re.S)
            sec_node['c'].append({'n': bt, 'd': html_to_text(rest), 'svg': svg})
        else:
            sec_node['c'].append({'n': bt, 'd': html_to_text(br)})

    m = {
        'title': '操作系统 · PV操作总结思维导图',
        'subtitle': '生产者-消费者六步骤解题法 · 每步配草图',
        'roots': roots,
    }
    with open('pwa/data/os_map.json', 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)

    total = sum(len(s['c']) for r in m['roots'] for s in r['c'])
    svg_cnt = sum(1 for r in m['roots'] for s in r['c'] for n in s['c'] if n.get('svg'))
    print(f'OK: pwa/data/os_map.json')
    print(f'  节: {total} 节点, 其中内嵌 SVG 的节点: {svg_cnt}')
    for n in sec_node['c']:
        print(f'    {n["n"][:36]:38s} svg={"有" if n.get("svg") else "无"}')


if __name__ == '__main__':
    main()
