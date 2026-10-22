# -*- coding: utf-8 -*-
"""
给记忆卡要点里的「公式 / 结论表达式」打荧光标记。

约定：公式片段用 ≈≈...≈≈ 包裹，前端渲染成 <em class="fc-em fx">（黄色半高亮荧光笔）。
术语/考点仍用 **...**（红色）。

只处理普通文本片段，跳过已标记的 ** 区间，避免嵌套。

用法：python _mark_formulas.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
DRY = '--dry' in sys.argv

# 公式特征：复杂度 / 上下取整 / 求和 / 对数 / 取模 / 赋值与等式
FORMULA_PATTERNS = [
    r'O\s*\((?:[^()]|\([^()]*\)){0,16}\)',
    r'⌊[^⌋]{1,26}⌋',
    r'⌈[^⌉]{1,26}⌉',
    r'∑[^。；，]{1,24}',
    r'log\s*[₂2]?\s*\(?[nN]\)?',
    r'[A-Za-z][A-Za-z0-9_]*\s*\([^)]{1,22}\)\s*=\s*[^，。；]{1,34}',
    r'\b[A-Za-z]{1,8}\s*=\s*[^，。；]{1,34}',
    r'[^，。；]{0,20}\bmod\b[^，。；]{0,20}',
    r'\d+\s*[+\-*/^]\s*[^，。；]{1,18}',
    r'2\s*\^\s*[A-Za-z0-9]+',
]
FORMULA_RE = re.compile('(?:' + '|'.join(FORMULA_PATTERNS) + ')')

# 明显不是公式的等号用法（避免满屏黄）
SKIP_IF = re.compile(r'等于|叫做|称为|是指|指的是|表示|意味着')


def mark(text):
    """把普通片段里的公式用 ≈≈ 包起来；已有 ** 的区间不动。"""
    if '≈≈' in text:
        return text
    parts = re.split(r'(\*\*.+?\*\*)', text)      # 保留 **...** 作为独立片段
    out = []
    n = 0
    for seg in parts:
        if seg.startswith('**') and seg.endswith('**'):
            out.append(seg)
            continue
        def repl(m):
            s = m.group(0)
            if SKIP_IF.search(s):
                return s
            return f'≈≈{s}≈≈'
        new = FORMULA_RE.sub(repl, seg)
        n += new.count('≈≈') // 2
        out.append(new)
    return ''.join(out)


def main():
    data = json.load(open(CARDS, encoding='utf-8'))
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        shutil.copy2(CARDS, f'{BACKUP_DIR}/cards_{ts}_before_formula.json')
        print(f'已备份 {BACKUP_DIR}/cards_{ts}_before_formula.json')

    marked = pts = 0
    for subj, cards in data['cards'].items():
        for c in cards:
            for key in ('points',):
                new_list = []
                for p in c.get(key) or []:
                    pts += 1
                    np = mark(p)
                    if np != p:
                        marked += 1
                    new_list.append(np)
                c[key] = new_list
            if c.get('tip'):
                c['tip'] = mark(c['tip'])

    if not DRY:
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f'要点 {pts} 条，其中 {marked} 条含公式荧光标记')


if __name__ == '__main__':
    main()
