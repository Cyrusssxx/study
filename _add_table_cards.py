# -*- coding: utf-8 -*-
"""
重建记忆卡的「重点表格」卡：按 **节** 拆分（原来按章，一章 6~12 张太厚）。

规则：
  - 每科每节生成卡片，最多 MAX_PER_CARD 张表；超出则续页（2/N、3/N…）
  - 卡片插在该节最后一张卡之后，chapter/section 继承该节，目录里归属自然
  - 先清除上一次生成的 {subj}_tbl_* 卡片，可重复执行

用法：python _add_table_cards.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
MAX_PER_CARD = 6
DRY = '--dry' in sys.argv
SUBJECTS = ['ds', 'os', 'cn', 'co']


def main():
    data = json.load(open(CARDS, encoding='utf-8'))
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        shutil.copy2(CARDS, f'{BACKUP_DIR}/cards_{ts}_before_tables.json')
        print(f'已备份 {BACKUP_DIR}/cards_{ts}_before_tables.json')

    total_added = total_tables = 0
    for subj in SUBJECTS:
        notes = json.load(open(f'pwa/data/notes/{subj}_notes.json', encoding='utf-8'))
        cards = data['cards'].get(subj) or []
        # 清掉旧表格卡
        cards = [c for c in cards if not c['id'].startswith(f'{subj}_tbl_')]

        # 按节收集表格
        sec_tables = []   # [(chapter, section_name, [ {sub, html}... ])]
        for ch in notes['chapters']:
            for s in ch['sections']:
                tables = []
                for sb in s.get('subsections') or []:
                    html = sb.get('html') or ''
                    for m in re.findall(r'<table[\s\S]*?</table>', html):
                        if len(re.findall(r'<td', m)) >= 2:      # 去掉只有表头的空表
                            tables.append({'sub': sb.get('section') or s.get('section') or '', 'html': m})
                if tables:
                    sec_tables.append((ch['chapter'], s['section'], tables))

        # 逐节生成卡片，插到该节最后一张卡之后
        for chapter, sec_name, tables in sec_tables:
            sec_no = re.match(r'^(\d+\.\d+)', sec_name)
            sec_key = sec_no.group(1) if sec_no else ''
            key = sec_key.replace('.', '_') if sec_key else 'x'
            pages = [tables[i:i + MAX_PER_CARD] for i in range(0, len(tables), MAX_PER_CARD)]
            for pi, page in enumerate(pages, 1):
                suffix = f'（{pi}/{len(pages)}）' if len(pages) > 1 else ''
                card = {
                    'id': f'{subj}_tbl_{key}' + (f'_{pi}' if len(pages) > 1 else ''),
                    'chapter': chapter,
                    'section': sec_name,
                    'title': f'表格 · {sec_name}{suffix}',
                    'points': [],
                    'tip': f'{len(page)} 张表' + (f'（本节共 {len(tables)} 张）' if len(pages) > 1 else ''),
                    'tables': page,
                }
                # 找该节最后一张卡的位置
                pos = max((i for i, c in enumerate(cards)
                           if (c.get('section') or '').startswith(sec_key)), default=None) if sec_key else None
                if pos is None:
                    pos = max((i for i, c in enumerate(cards) if c.get('chapter') == chapter), default=None)
                cards.insert(pos + 1 if pos is not None else len(cards), card)
                total_added += 1
                total_tables += len(page)

        data['cards'][subj] = cards

    if not DRY:
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f'表格卡 {total_added} 张 / {total_tables} 张表；各科卡片数：'
          + ' / '.join(f"{s}={len(data['cards'][s])}" for s in SUBJECTS))
    mx = max(((len(c.get('tables') or []), c['id']) for s in SUBJECTS for c in data['cards'][s]), default=(0, ''))
    print(f'单卡最多表格数：{mx[0]}（{mx[1]}）')


if __name__ == '__main__':
    main()
