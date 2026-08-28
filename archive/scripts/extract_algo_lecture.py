# -*- coding: utf-8 -*-
"""
从《【一休】算法课程讲义.pdf》提取：
  1) 方法论部分 -> pwa/data/algo_notes.json
  2) 17 道真题的多解法 -> 写入 ds_code.json 的 solutions 字段

要点：
  - PDF 的 get_text() 按"内容流"顺序输出（是乱的），必须全局按 (页, y, x) 排序还原视觉顺序
  - 代码字体 LucidaConsole，正文 HarmonyOS_Sans_SC_Medium —— 代码识别零误判
  - 用目录(TOC)标题做锚点切分区间，跨页代码块的延续会自然归属到上一区间，不会串页
"""
import fitz
import re
import json
import os
from collections import Counter

PDF = r"E:\夸克\Download\06 27考研王道计算机【数据结构强化班】\【一休】算法课程讲义.pdf"
OUT_NOTES = 'pwa/data/algo_notes.json'
DS_CODE = 'pwa/data/ds_code.json'

CODE_FONT = 'LucidaConsole'


def norm(s):
    return re.sub(r'\s+', '', s or '')


class Doc:
    def __init__(self, path):
        self.doc = fitz.open(path)
        self.N = self.doc.page_count
        self.lines = self._build()
        self.idx = {}
        for i, r in enumerate(self.lines):
            n = norm(r['text'])
            if n and n not in self.idx:
                self.idx[n] = i
        self.toc = self.doc.get_toc()
        # 规范化 TOC 标题 -> (level, title)
        self.tocnorm = {}
        for lv, title, page in self.toc:
            self.tocnorm.setdefault(norm(title), (lv, title))

    def _build(self):
        """全局行列表，按 (页, y, x) 排序；同一 y 的多个单元格合并为表格行"""
        raw = []
        for pno in range(1, self.N + 1):
            d = self.doc[pno - 1].get_text("dict")
            for b in d['blocks']:
                if b['type'] != 0:
                    continue
                for l in b['lines']:
                    sp = l['spans']
                    if not sp:
                        continue
                    y = round(l['bbox'][1], 1)
                    x = round(l['bbox'][0], 1)
                    txt = ''.join(s['text'] for s in sp)
                    font = sp[0]['font']
                    raw.append((pno, y, x, txt, font))
        raw.sort(key=lambda r: (r[0], r[1], r[2]))

        # 按 (页, y) 合并同一行的单元格（表格列）
        merged = []
        i = 0
        while i < len(raw):
            pno, y, x, txt, font = raw[i]
            group = [(x, txt, font)]
            j = i + 1
            while j < len(raw) and raw[j][0] == pno and abs(raw[j][1] - y) < 2.0:
                group.append((raw[j][2], raw[j][3], raw[j][4]))
                j += 1
            if len(group) > 1:
                # 过滤空白单元格（页眉/页码等空文本对象），否则会拼出 "3 链表 | " 这类脏值
                cells = [(x, t, f) for (x, t, f) in group if t.strip()]
                if not cells:
                    i = j
                    continue
                if all(CODE_FONT not in f for _, _, f in cells):
                    txt = ' | '.join(t.strip() for _, t, _ in sorted(cells))
                    font = cells[0][2]
                else:
                    txt = ''.join(t for _, t, _ in sorted(cells))
                    font = cells[0][2]
            merged.append({'page': pno, 'y': y, 'text': txt, 'font': font,
                           'code': CODE_FONT in font})
            i = j
        return merged

    def at(self, title):
        """按目录标题定位行索引（精确优先，其次包含匹配）"""
        n = norm(title)
        if n in self.idx:
            return self.idx[n]
        for k, i in self.idx.items():
            if len(n) > 3 and (n in k or k in n):
                return i
        return None

    def slice(self, start_title, end_title=None):
        s = self.at(start_title)
        if s is None:
            raise KeyError('锚点未命中: ' + start_title)
        e = self.at(end_title) if end_title else len(self.lines)
        if e is None:
            raise KeyError('锚点未命中: ' + str(end_title))
        return self.lines[s:e]

    def heading_level(self, text):
        n = norm(text)
        if n in self.tocnorm:
            return self.tocnorm[n]
        return None


# ============ 1. 方法论部分 ============
CHAPTERS = [
    ('ch1', '1 课程介绍', '2 顺序表'),
    ('ch2', '2 顺序表', '2.5 章节练习'),
    ('ch3', '3 链表', '3.6 章节练习'),
    ('ch4', '4 树', '4.5 章节练习'),
    ('ch5', '5 图', '5.4 章节练习'),
    ('ch6', '6 补充知识', None),
]

NOISE = re.compile(r'^[\s\u00a0]*$')


def extract_notes(doc):
    chapters = []
    for cid, start, end in CHAPTERS:
        rows = doc.slice(start, end)
        items = []
        buf_code = []
        buf_code_page = None
        buf_text = []
        buf_text_page = None

        def flush_code():
            nonlocal buf_code, buf_code_page
            if buf_code:
                items.append({'t': 'code', 'text': '\n'.join(buf_code), 'page': buf_code_page})
                buf_code = []

        def flush_text():
            nonlocal buf_text, buf_text_page
            if buf_text:
                t = '\n'.join(buf_text).strip()
                if t:
                    items.append({'t': 'p', 'text': t, 'page': buf_text_page})
                buf_text = []

        for r in rows:
            txt = r['text'].rstrip()
            if NOISE.match(txt):
                continue
            hl = doc.heading_level(txt)
            if hl:
                flush_code(); flush_text()
                items.append({'t': 'h', 'lvl': hl[0], 'text': hl[1], 'page': r['page']})
                continue
            if r['code']:
                flush_text()
                if not buf_code:
                    buf_code_page = r['page']
                buf_code.append(txt)
            else:
                flush_code()
                if not buf_text:
                    buf_text_page = r['page']
                buf_text.append(txt)
        flush_code(); flush_text()

        # 去掉最开头的章标题自身（避免与章节名重复）
        if items and items[0]['t'] == 'h' and norm(items[0]['text']) == norm(start):
            items = items[1:]

        chapters.append({'id': cid, 'title': start, 'page': rows[0]['page'], 'items': items})
    return chapters


# ============ 2. 真题解法 ============
YEAR_Q = re.compile(r'^(\d{4})\s*年\s*(\d+)\s*题$')
# 解法标题：讲义各章写法不统一，全部兼容：
#   【解法1】暴力解：枚举，另设一个数组，枚举每个元素再移动   （顺序表/链表章）
#   【解法1】暴力解（双重循环枚举，10分左右）
#   【解法1】前序/中序/后序遍历，下面给出的是先序遍历        （无类型前缀）
#   【解法】中序遍历，递归                                  （无编号）
#   【解析】/【答案】、【解析 1】/【答案 1】                 （图章）
SOL_HEAD = re.compile(r'^【\s*(解法|解析|答案)\s*(\d*)\s*】\s*(.*)$')
# 小问编号：必须带右括号才算（（1）/ 1）/ (1) 均可）。
# 注意：绝不能放开成 "1." —— 讲义里 1. 2. 3. 常用来做步骤编号，放开会把步骤误判成小问
SUB = re.compile(r'^[（(]?\s*([123])\s*[）)]\s*(.*)$')
TABLE_HEAD_KEYS = ('做题思路', '预计得分')


KNOWN_KIND = ('暴力解', '特殊解', '优化解', '预处理', '技巧')


def split_kind_name(s):
    """从『暴力解：枚举…』/『暴力解（双重循环…）』拆出 类型 / 方法名；
       无类型前缀时（如『前序/中序/后序遍历…』）类型留空，整串作方法名"""
    s = (s or '').strip()
    m = re.match(r'^(暴力解|特殊解|优化解|预处理|技巧)\s*[：:（(]?\s*(.*?)\s*[）)]?\s*$', s)
    if m:
        return m.group(1), m.group(2)
    for sep in ('：', ':'):
        if sep in s:
            a, b = s.split(sep, 1)
            return a.strip(), b.strip()
    m = re.match(r'^(.*?)\s*[（(]\s*(.*?)\s*[）)]\s*$', s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return s, ''


def split_questions(doc, section_start, section_end):
    """把一个"真题"章节切成 [{'year','no','rows'}, ...]"""
    rows = doc.slice(section_start, section_end)
    qs = []
    cur = None
    for r in rows:
        m = YEAR_Q.match(r['text'].strip())
        if m:
            if cur:
                qs.append(cur)
            cur = {'year': int(m.group(1)), 'no': int(m.group(2)), 'rows': []}
        elif cur is not None:
            cur['rows'].append(r)
    if cur:
        qs.append(cur)
    return qs


def parse_solutions(q):
    """解析单题：做题思路表 + 多个解法（兼容冒号/圆括号两种标题写法）"""
    score_cells = []
    solutions = []
    cur = None
    state = None          # 'thought' | 'code' | 'complexity' | 'note'
    in_table = False

    def new_sol(tag, kind, name):
        return {'tag': tag, 'kind': kind, 'name': name, '_key': tag.replace('解法', ''),
                'analysis': [], 'thought': [], 'code': [], 'complexity': [], 'note': []}

    def flush_sol():
        nonlocal cur
        if cur:
            cur['analysis'] = '\n'.join(cur['analysis']).strip()
            cur['thought'] = '\n'.join(cur['thought']).strip()
            cur['code'] = '\n'.join(cur['code']).strip()
            cur['complexity'] = ' '.join(cur['complexity']).strip()
            cur['note'] = '\n'.join(cur['note']).strip()
            cur.pop('_key', None)
            solutions.append(cur)
            cur = None

    for r in q['rows']:
        txt = r['text'].strip()
        if not txt or txt == '\xa0':
            continue

        # 表格表头：合并后是一整行，形如 "做题思路 | 时间复杂度 | 空间复杂度 | 预计得分"
        if all(k in txt for k in TABLE_HEAD_KEYS) and len(txt) < 45:
            flush_sol()
            score_cells = []
            in_table = True
            continue

        if in_table:
            if SOL_HEAD.match(txt) or YEAR_Q.match(txt):
                in_table = False          # 表格结束，继续按正常逻辑处理本行
            else:
                cells = [c.strip() for c in txt.split('|') if c.strip()]
                if cells:
                    score_cells.append(cells)
                continue

        m = SOL_HEAD.match(txt)
        if m:
            typ, num, desc = m.group(1), m.group(2) or '1', m.group(3).strip()
            if typ in ('解析', '答案'):
                # 图章格式：【解析 N】给分析文字，【答案 N】给正式解答，二者配对为一个解法
                if typ == '解析':
                    flush_sol()
                    cur = new_sol('解法' + num, '', desc)
                    state = 'analysis'
                else:
                    if cur is None or cur['_key'] != num:
                        flush_sol()
                        cur = new_sol('解法' + num, '', desc)
                    state = None
                continue
            flush_sol()
            kind, name = split_kind_name(desc)
            cur = new_sol('解法' + num, kind, name)
            state = None
            continue

        if cur is None:
            continue

        if state == 'analysis':
            if r['code']:
                cur['code'].append(r['text'])
            else:
                cur['analysis'].append(txt)
            continue

        sm = SUB.match(txt)
        if sm:
            n = sm.group(1)
            rest = sm.group(2).strip()
            # 复杂度小问必须是「（3）…复杂度…」，否则可能是步骤编号残留
            if n == '3' and '复杂度' not in txt:
                state = 'thought'
                cur['thought'].append(txt)
                continue
            state = {'1': 'thought', '2': 'code', '3': 'complexity'}[n]
            if rest and state == 'thought':
                cur['thought'].append(rest)
            elif rest and state == 'complexity':
                cur['complexity'].append(rest)
            # "2）伪代码如下 / C代码实现" 只是引导语，丢弃
            continue

        if r['code']:
            cur['code'].append(r['text'])
            state = 'code'
            continue

        if state == 'complexity':
            cur['complexity'].append(txt)
        elif state == 'thought':
            cur['thought'].append(txt)
        else:
            cur['note'].append(txt)

    flush_sol()

    # 表格单元格 -> 结构（末列为得分，首列为思路，中间为方法/复杂度）
    score_rows = []
    for c in score_cells:
        if len(c) >= 3:
            score_rows.append({'approach': c[0], 'method': ' '.join(c[1:-1]), 'score': c[-1]})
        elif len(c) == 2:
            score_rows.append({'approach': c[0], 'method': c[1], 'score': ''})

    for s in solutions:
        s['thought'] = re.sub(r'^[（(]?\s*1\s*[）)]?\s*', '', s['thought'])
        s['complexity'] = re.sub(r'^[（(]?\s*3\s*[）)]?\s*', '', s['complexity'])
        s['complexity'] = re.sub(r'\s{2,}', '   ', s['complexity'])
    return score_rows, solutions


def main():
    doc = Doc(PDF)
    print('总行数:', len(doc.lines))

    # ---- 方法论 ----
    chapters = extract_notes(doc)
    notes = {
        'meta': {
            'source': '【一休】算法课程讲义.pdf（27考研王道计算机·数据结构强化班）',
            'pages': doc.N,
            'note': '文字内容一字未改，仅还原排版结构',
        },
        'chapters': chapters,
    }
    os.makedirs(os.path.dirname(OUT_NOTES), exist_ok=True)
    with open(OUT_NOTES, 'w', encoding='utf-8') as f:
        json.dump(notes, f, ensure_ascii=False, indent=1)
    total = sum(len(c['items']) for c in chapters)
    chars = sum(len(x.get('text', '')) for c in chapters for x in c['items'])
    print(f'方法论：{len(chapters)} 章 / {total} 块 / {chars} 字符 -> {OUT_NOTES}')
    for c in chapters:
        ncode = sum(1 for x in c['items'] if x['t'] == 'code')
        print(f"  {c['title']:<12} p{c['page']:<4} {len(c['items']):>4} 块（代码 {ncode}）")

    # ---- 真题解法 ----
    sections = [('2.6.2 真题', '3 链表'), ('3.7.2 真题', '4 树'),
                ('4.6.2 真题', '5 图'), ('5.5.2 真题', '6 补充知识')]
    all_q = []
    for s, e in sections:
        got = split_questions(doc, s, e)
        print(f'{s}: {len(got)} 道 -> {[g["year"] for g in got]}')
        all_q.extend(got)

    result = {}
    for q in all_q:
        score_rows, sols = parse_solutions(q)
        result[q['year']] = {'no': q['no'], 'score_rows': score_rows, 'solutions': sols}
        print(f"  {q['year']} 年 {q['no']} 题：{len(sols)} 个解法，得分表 {len(score_rows)} 行")
        for s in sols:
            print(f"      [{s['kind']}] {s['name'][:34]}  代码 {len(s['code'])} 字符")

    with open('tools/_algo_solutions.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print('\n真题解法已暂存 -> tools/_algo_solutions.json')


if __name__ == '__main__':
    main()
