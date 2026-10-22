# -*- coding: utf-8 -*-
"""
给第8章加一张「排序比较次数空白考点」记忆卡。

内容来自对 2009–2025 共 38 道第8章统考真题的覆盖分析：
真题直接考「比较次数」的只有 5 题（堆 2011/2015、归并 2024、插入类辨析 2012/2020），
本卡汇总真题空白 + 考纲第八条在位的 7 个精确结论。

用法：python _add_sort_gap_card.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
DRY = '--dry' in sys.argv
CID = 'ds_tbl_8_gap'

# 真题已考的比较次数（用于对照）
TESTED = """<table class="mc-table">
<tr><th>算法</th><th>真题</th><th>考法</th></tr>
<tr><td>堆排序</td><td>2011、2015</td><td>堆的插入/删除调整过程中的关键字比较次数（给序列实算）</td></tr>
<tr><td>2路归并</td><td>2024</td><td>多个有序序列归并的总比较次数</td></tr>
<tr><td>插入类</td><td>2012、2020</td><td>辨析「效率更高的原因」：比较次数更少 / 移动次数更少</td></tr>
</table>"""

# 真题空白 + 考纲在位的精确结论
GAP = """<table class="mc-table">
<tr><th>考点</th><th>最好</th><th>最坏</th><th>与初态</th><th>真题状态</th></tr>
<tr><td><b>冒泡·比较</b></td><td>n−1</td><td><b>n(n−1)/2</b></td><td>有关</td><td>仅考过第二趟结果(2019)，公式空白</td></tr>
<tr><td><b>冒泡·移动</b></td><td>0</td><td><b>3n(n−1)/2</b></td><td>有关</td><td>同上</td></tr>
<tr><td><b>简单选择·比较</b></td><td colspan="2">恒为 <b>n(n−1)/2</b></td><td><b>无关</b></td><td>仅作 2020 Q613 陪衬</td></tr>
<tr><td><b>直接插入·比较</b></td><td>n−1</td><td><b>n(n−1)/2</b></td><td>有关</td><td>仅作 2020/2022 对比项</td></tr>
<tr><td><b>快速·比较</b></td><td>O(nlog₂n)</td><td>≈<b>n(n−1)/2</b></td><td>有关</td><td>10 题全考过程/划分</td></tr>
<tr><td><b>堆·建堆比较</b></td><td colspan="2">≤ 4n（教材只给 O(n)）</td><td>—</td><td>只考调整过程(2011/2015)</td></tr>
<tr><td><b>希尔</b></td><td colspan="2">≈O(n<sup>1.3</sup>)</td><td>有关</td><td>只考增量/趟过程</td></tr>
</table>"""

TIP = ('统计口径：第8章共 123 题，其中统考真题 38 道（2009–2025）。'
       '真题直接考「比较次数」的只有 5 题。计数排序在 2027 教材中标 *（超纲），不准备。')


def main():
    data = json.load(open(CARDS, encoding='utf-8'))
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    cards = data['cards']['ds']
    cards = [c for c in cards if c['id'] != CID]          # 去重，可重复执行

    card = {
        'id': CID,
        'chapter': '第8章 排序',
        'section': '8.6 各种内部排序算法的比较及应用',
        'title': '表格 · 排序比较次数空白考点（真题未考）',
        'points': [],
        'tip': TIP,
        'tables': [
            {'sub': '真题已考的比较次数（仅 5 题）', 'html': TESTED},
            {'sub': '真题空白 + 考纲第八条在位的精确结论', 'html': GAP},
        ],
    }
    # 插到 8.6 最后一张卡之后
    pos = max((i for i, c in enumerate(cards)
               if (c.get('section') or '').startswith('8.6')), default=None)
    cards.insert(pos + 1 if pos is not None else len(cards), card)
    data['cards']['ds'] = cards

    if not DRY:
        shutil.copy2(CARDS, f'{BACKUP_DIR}/cards_{ts}_before_sortgap.json')
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f'已加入 {CID}（2 张表），ds 卡片数 {len(cards)}')


if __name__ == '__main__':
    main()
