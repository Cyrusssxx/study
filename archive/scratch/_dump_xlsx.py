# 临时：dump 打卡表 xlsx 全部单元格到 UTF-8 文件，看清结构
import zipfile
import re

XLSX = r'e:\夸克\Download\2026数据结构强化打卡表 (1).xlsx'

z = zipfile.ZipFile(XLSX)
ss_xml = z.read('xl/sharedStrings.xml').decode('utf-8')
strings = []
for si in re.findall(r'<si>(.*?)</si>', ss_xml, re.S):
    strings.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))

def unescape(s):
    return s.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&quot;', '"').replace('&#10;', '\n')

CELL = re.compile(r'<c ([^>]*)>(?:<v>(.*?)</v>)?(?:</c>)?', re.S)

out = []
for sheet in ['sheet1', 'sheet2']:
    xml = z.read(f'xl/worksheets/{sheet}.xml').decode('utf-8')
    out.append(f'========== {sheet} ==========')
    for rnum, cells_xml in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        cells = []
        for attrs, val in CELL.findall(cells_xml):
            col = re.search(r'r="([A-Z]+)\d+"', attrs)
            col = col.group(1) if col else '?'
            if not val:
                continue
            if 't="s"' in attrs:
                cells.append(f'{col}={unescape(strings[int(val)])!r}')
            else:
                cells.append(f'{col}={val}')
        if cells:
            out.append(f'row {rnum}: ' + ' | '.join(cells))

open('_xlsx_dump.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('lines:', len(out))
