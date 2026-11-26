# -*- coding: utf-8 -*-
"""从 2027 王道 8 套模拟卷 PDF 提取题目/选项/题图，构建为真题套卷同构 JSON。

输入：
  E:/Desktop/做题/2027王道8套模拟卷(1).pdf   （试卷，文字层可提取）
  archive/_pdf_probe/v1_ocr_pages.json         （解析册 OCR 结果，逐题解析）

输出：
  pwa/data/zt/zt_mock1.json（结构同 zt_YYYY.json，多一个 kp 字段）
  pwa/data/zt_img/zt_mock1_{题号}.png         （含图题整题截图，高清）

题图策略：含图/表格/矢量图的题，用题号 y 坐标到下一题 y 坐标整题截图成 PNG，
题干 HTML 里放 <img>，文字层不再重复（避免图文重叠）。纯文字题保留 HTML 文本。

字段：i=题号 t=类型(1单选/2大题) s=分值 a=答案字母 sid=科目
      q=题干HTML o=选项数组 an=解析HTML qid=null kp=考点分析HTML
"""
import os, re, json, sys
import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPER = r'E:/Desktop/做题/2027王道8套模拟卷(1).pdf'
OCR_JSON = os.path.join(ROOT, 'archive', '_pdf_probe', 'v1_ocr_pages.json')
DST = os.path.join(ROOT, 'pwa', 'data', 'zt')
IMGDIR = os.path.join(ROOT, 'pwa', 'data', 'zt_img')

VOL_PAGES = {
    1: list(range(3, 15)),
}
CN = {1: '一'}
# 卷一选择题答案（OCR 坐标重排 + 解析标记交叉校验）
ANS_VOL1 = "D B D A B B D D B D D A C B C C B C A B A A A B D D B B D B C C C D B C A D B B".split()

# 含图/表格题：这些题整题截图（人工核对 p4-p15 得出）
FIG_Q = {32, 33, 41, 43, 44, 45, 46, 47}


def clean_lines(txt):
    lines = []
    for raw in txt.split('\n'):
        s = raw.strip()
        if not s or s.startswith('2027 王道408 冲刺模拟试卷'):
            continue
        if re.fullmatch(r'第\s*\d+\s*页（共79 页）', s) or s in ('考试时间180 分钟', '满分150 分'):
            continue
        if s.startswith('一、单项选择题') or s.startswith('二、综合应用题'):
            continue
        lines.append(s)
    return '\n'.join(lines)


def build_questions(doc, vol):
    raw = '\n'.join(doc[i].get_text('text') for i in VOL_PAGES[vol])
    text = re.sub(r'（\s*\n\s*）', '（）', clean_lines(raw))
    pat = re.compile(r'(?m)^\s*(\d{1,2})[.．、]\s*')
    marks, expect = [], 1
    for m in pat.finditer(text):
        n = int(m.group(1))
        if n == expect:
            marks.append((n, m.start(), m.end())); expect += 1
            if expect > 47: break
    qs = []
    for idx, (n, st, en) in enumerate(marks):
        nxt = marks[idx + 1][1] if idx + 1 < len(marks) else len(text)
        body = re.split(r'2027\s*王道408', text[en:nxt])[0].strip()
        sm = re.match(r'[（(](\d+)\s*分[）)]', body)
        score = int(sm.group(1)) if sm else (2 if n <= 40 else 0)
        if n <= 40:
            oms = list(re.finditer(r'(?m)^\s*\(([A-D])\)\s*', body))
            if len(oms) == 4:
                stem = body[:oms[0].start()].strip()
                opts = [body[oms[j].end():(oms[j + 1].start() if j < 3 else len(body))].strip() for j in range(4)]
            else:
                stem, opts = body, []
        else:
            stem, opts = body, []
        qs.append({'i': n, 't': 1 if n <= 40 else 2, 's': score, 'stem': stem, 'opts': opts})
    return qs


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def stem_to_html(stem):
    """代码块合并（含 // 注释行也归入代码块），其余按段落。"""
    parts, buf, in_code = [], [], False
    for ln in stem.split('\n'):
        code = bool(re.search(r'[{};]|for\s*\(|#include|typedef|int\s+\w+\(|float\s+\w+\(|//', ln))
        if code and not in_code:
            if buf:
                parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>'); buf = []
            in_code = True
        if not code and in_code:
            parts.append('<pre>' + '\n'.join(esc(x) for x in buf) + '</pre>'); buf = []; in_code = False
        buf.append(ln)
    if in_code:
        parts.append('<pre>' + '\n'.join(esc(x) for x in buf) + '</pre>')
    elif buf:
        parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>')
    return '\n'.join(parts)


def load_analysis():
    """从 OCR 页文本提取逐题解析：'NN．X。【解析】...' 到下一题标记前。"""
    pages = json.load(open(OCR_JSON, encoding='utf-8'))
    full = '\n'.join(' '.join(p['lines']) for p in pages)
    # 解析标记两种格式：①「05.B。【解析】…」②「09.B。本题考查…」（无【解析】字样）
    # 统一为：题号 + 点 + 字母 + 句号(可带顿号) → 后面即解析正文。
    # 先定位首个「【解析】」，从它往前找最近的题号标记作为起点，跳过开头的答案表。
    first = full.find('【解析】')
    body = full[max(0, first - 12):] if first >= 0 else full
    # 标记：选择题「05.B。」；大题「41.（10分）」在解析册里是「41.【解析】」或「41.1）」
    ms = list(re.finditer(
        r'(\d{1,2})\s*[.．]\s*(?:([A-D])\s*[。.．、]\s*|(?:【解析】))', body))
    ana, ans = {}, {}
    for k, m in enumerate(ms):
        n = int(m.group(1))
        if not (1 <= n <= 47) or n in ana: continue
        end = ms[k + 1].start() if k + 1 < len(ms) else len(body)
        seg = body[m.end():end].strip()
        seg = re.sub(r'^【解析】\s*', '', seg)
        seg = re.split(r'计算机专业基础综合考试模拟试卷', seg)[0].strip()
        seg = seg.replace('本愿考查', '本题考查')
        ana[n] = seg
        if m.group(2): ans[n] = m.group(2)
    # 定点补丁：OCR 把题号识别成 Q 导致漏抓的题 24
    if 24 not in ana:
        m24 = re.search(r'Q【解析】(本题考查引导程序[\s\S]*?)(?=\d{1,2}\s*[.．]\s*[A-D]\s*[。.])', full)
        if m24:
            ana[24] = re.sub(r'\s+', ' ', m24.group(1)).strip()
    return ana, ans


def crop_fig(doc, vol, qnum, savepath):
    """按题号定位 y 范围，整题截图。返回是否成功。"""
    for pi in VOL_PAGES[vol]:
        page = doc[pi]
        blocks = sorted([b for b in page.get_text('blocks') if b[6] == 0], key=lambda b: b[1])
        # 找本题号起始块（行首 "NN." 或 "NN．"）
        start = None
        for b in blocks:
            if re.match(r'^\s*%d\s*[.．、]' % qnum, b[4]):
                start = b; break
        if not start: continue
        # 下一题 y（同页更大的题号）
        next_y = page.rect.height - 30
        nxt_q = None
        for b in blocks:
            mm = re.match(r'^\s*(\d{1,2})\s*[.．、]', b[4])
            if mm and b[1] > start[1] + 2:
                nxt_q = int(mm.group(1)); next_y = b[1]; break
        y0 = max(0, start[1] - 6)
        y1 = min(page.rect.height - 20, next_y - 4 if nxt_q else page.rect.height - 20)
        clip = fitz.Rect(60, y0, 550, y1)
        pix = page.get_pixmap(matrix=fitz.Matrix(2.2, 2.2), clip=clip)
        pix.save(savepath)
        return True
    return False


def main():
    vol = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    doc = fitz.open(PAPER)
    qs = build_questions(doc, vol)
    ana, ocr_ans = load_analysis() if vol == 1 else ({}, {})
    ans = {i + 1: ANS_VOL1[i] for i in range(40)}
    # 用解析标记里的字母交叉校验/OCR 纠错
    for n, a in ocr_ans.items():
        if 1 <= n <= 40: ans[n] = a
    os.makedirs(IMGDIR, exist_ok=True)
    items = []
    for q in qs:
        n = q['i']
        qhtml = stem_to_html(q['stem'])
        if n in FIG_Q:
            name = f'zt_mock{vol}_{n}.png'
            ok = crop_fig(doc, vol, n, os.path.join(IMGDIR, name))
            if ok:
                qhtml = (f'<div class="img-container" style="height:auto;width:100%">'
                         f'<img src="data/zt_img/{name}" style="width:100%;height:auto" alt="" draggable="false"></div>')
                print(f'  题{n} 截图 OK')
        # 选项：截图题把选项也含在图里了，清空 o（否则重复）
        opts = [] if n in FIG_Q else q['opts']
        an = f'<div class="analysis-content">{esc(ana.get(n, ""))}</div>' if ana.get(n) else ''
        items.append({
            'i': n, 't': q['t'], 's': q['s'], 'a': ans.get(n, ''),
            'sid': '', 'q': qhtml, 'o': opts, 'an': an, 'qid': None, 'kp': ''
        })
    out = os.path.join(DST, f'zt_mock{vol}.json')
    with open(out, 'w', encoding='utf-8', newline='') as f:
        json.dump({'y': f'模拟{CN[vol]}', 'n': len(items), 'items': items}, f, ensure_ascii=False, indent=1)
    print(f'卷{CN[vol]} 完成：{len(items)}题，答案{sum(1 for x in items if x["a"])}，解析{sum(1 for x in items if x["an"])}，写出 {out}')


if __name__ == '__main__':
    main()
