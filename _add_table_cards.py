# -*- coding: utf-8 -*-
"""
给记忆卡新增「重点表格汇总」卡：把考点笔记里各章的 <table> 收进一张卡。

每科每章一张，插在该章最后一张卡之后；卡片带 tables 字段：
  [{sub: 小节名, html: '<table class="mc-table">…'}]

用法：python _add_table_cards.py [--dry]
"""
import json
import re
import sys
import shutil
from datetime import datetime

CARDS = 'pwa/data/cards.json'
BACKUP_DIR = 'archive/backups_questions'
MAX_TABLES = 12
DRY = '--dry' in sys.argv

SUBJECTS = ['ds', 'os', 'cn', 'co']


def ch_no(name):
    m = re.match(r'第(\d+)章', name or '')
    return int(m.group(1)) if m else 99


def main():
    data = json.load(open(CARDS, encoding='utf-8'))
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    if not DRY:
        shutil.copy2(CARDS, f'{BACKUP_DIR}/cards_{ts}_before_tables.json')
        print(f'已备份 {BACKUP_DIR}/cards_{ts}_before_tables.json')

    added = 0
    for subj in SUBJECTS:
        notes = json.load(open(f'pwa/data/notes/{subj}_notes.json', encoding='utf-8'))
        cards = data['cards'].get(subj) or []
        existing = {c['id'] for c in cards}

        # 收集每章的表格
        by_ch = {}
        for ch in notes['chapters']:
            tables = []
            for s in ch['sections']:
                for sb in s.get('subsections') or []:
                    html = sb.get('html') or ''
                    for m in re.findall(r'<table[\s\S]*?</table>', html):
                        # 去掉空表（只有表头）
                        if len(re.findall(r'<td', m)) >= 2:
                            tables.append({'sub': sb.get('section') or s.get('section') or '', 'html': m})
            if tables:
                by_ch[ch['chapter']] = tables

        # 逐章生成卡片，插到该章最后一张卡之后
        for ch_name, tables in by_ch.items():
            cid = f'{subj}_tbl_{ch_no(ch_name)}'
            if cid in existing:
                continue
            shown = tables[:MAX_TABLES]
            card = {
                'id': cid,
                'chapter': ch_name,
                'section': '',
                'title': f'第{ch_no(ch_name)}章 重点表格汇总',
                'points': [],
                'tip': (f'共 {len(tables)} 张表' + (f'，本卡展示前 {MAX_TABLES} 张' if len(tables) > MAX_TABLES else '')),
                'tables': shown,
            }
            # 找该章最后一张卡的位置
            pos = max((i for i, c in enumerate(cards) if c.get('chapter') == ch_name), default=None)
            if pos is None:
                cards.append(card)
            else:
                cards.insert(pos + 1, card)
            added += 1

        data['cards'][subj] = cards

    if not DRY:
        with open(CARDS, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(f'新增表格卡 {added} 张；各科卡片数：'
          + ' / '.join(f"{s}={len(data['cards'][s])}" for s in SUBJECTS))


if __name__ == '__main__':
    main()
