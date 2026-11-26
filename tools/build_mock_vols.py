# -*- coding: utf-8 -*-
"""从 OCR 结果构建卷（三）/卷（五）题目 JSON（结构同 zt_mock1.json）。

输入：archive/_pdf_probe/{q,a}_v{3,5}.json（tools/ocr_mock_vols.py 产出）
输出：pwa/data/zt/zt_mock{3,5}.json

题目来源：试题册 OCR（按 y 合并成行后切题号/选项）
答案解析：解析册 OCR 的「NN.X。【解析】…」标记
写盘：indent=1 / LF / 无尾换行（与卷一一致）
"""
import os, re, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE = os.path.join(ROOT, 'archive', '_pdf_probe')
DST = os.path.join(ROOT, 'pwa', 'data', 'zt')
CN = {3: '三', 5: '五'}


def rows_from_lines(lines, ytol=7):
    """按 y 聚类成行，行内按 x 排序拼接（保留选项同行的布局）。"""
    groups = []
    for l in sorted(lines, key=lambda z: (z['y0'], z['x0'])):
        if groups and abs(l['y0'] - groups[-1][0]) <= ytol:
            groups[-1][1].append(l)
        else:
            groups.append((l['y0'], [l]))
    out = []
    for _, gs in groups:
        gs.sort(key=lambda z: z['x0'])
        # 同一行内 x 间隔明显（>60px）视为多列，用两个空格分隔
        parts = []
        prev_x1 = None
        for g in gs:
            if prev_x1 is not None and g['x0'] - prev_x1 > 60:
                parts.append('  ')
            parts.append(g['t'])
            prev_x1 = g['x1']
        out.append(''.join(parts).strip())
    return out


def load_rows(kind, vol):
    data = json.load(open(os.path.join(PROBE, '%s_v%d.json' % (kind, vol)), encoding='utf-8'))
    return [(pg['p'], rows_from_lines(pg['lines'])) for pg in data]


def clean_qline(s):
    s = s.strip()
    if not s:
        return ''
    # 页眉页脚
    if s.startswith('全国硕士研究生入学统一考试') or s.startswith('计算机科学与技术学科联考'):
        return ''
    if re.match(r'^第\s*\d+\s*页（共\s*\d+\s*页）', s):
        return ''
    if '全国硕士研究生入学统一考试' in s or '计算机专业基础综合考试模拟试卷' in s:
        return ''
    if '考试注意事项' in s or '答题卡' in s or '选项代号' in s:
        return ''
    return s


def build_questions(vol):
    pages = load_rows('q', vol)
    lines = []
    for p, rows in pages:
        if p == 25 or p == 41:      # 下一套卷封面
            continue
        for r in rows:
            r = clean_qline(r)
            if r:
                lines.append(r)
    # OCR 漏识别题号的定点补丁（题号在页面空白处，OCR 没框到）
    if vol == 5:
        # 卷五 p39：题44 题号漏识别，题干从「一个总线周期用来存取数据…」开始
        for k, s in enumerate(lines):
            if s.startswith('一个总线周期用来存取数据。若总线宽度为8位'):
                lines[k] = '44．' + s
                break
    text = '\n'.join(lines)
    # 题号标记：01．/ 02. / 41. （两位数字）
    pat = re.compile(r'(?m)^\s*(\d{2})\s*[.．、]\s*')
    marks, expect = [], 1
    for m in pat.finditer(text):
        n = int(m.group(1))
        if n == expect:
            marks.append((n, m.start(), m.end()))
            expect += 1
            if expect > 47:
                break
    qs = []
    for idx, (n, st, en) in enumerate(marks):
        nxt = marks[idx + 1][1] if idx + 1 < len(marks) else len(text)
        body = text[en:nxt].strip()
        sm = re.match(r'[（(](\d+)\s*分[）)]', body)
        score = int(sm.group(1)) if sm else (2 if n <= 40 else 0)
        if n <= 40:
            # 选项：行首 A. / B. / C. / D.（可能同行多个，前面已用两空格分隔）
            oms = list(re.finditer(r'(?:(?<=^)|(?<=  ))\(([A-D])\)|(?:(?<=^)|(?<=  ))([A-D])[.．、]\s*', body, re.M))
            if len(oms) >= 4:
                # 取前 4 个不同字母
                picked = []
                for m in oms:
                    letter = m.group(1) or m.group(2)
                    if letter not in [p[0] for p in picked]:
                        picked.append((letter, m.start(), m.end()))
                    if len(picked) == 4:
                        break
                picked.sort(key=lambda z: z[1])
                stem = body[:picked[0][1]].strip()
                opts = []
                for j in range(4):
                    a = picked[j][2]
                    b = picked[j + 1][1] if j < 3 else len(body)
                    opts.append(body[a:b].strip())
            else:
                stem, opts = body, []
        else:
            stem, opts = body, []
        qs.append({'i': n, 't': 1 if n <= 40 else 2, 's': score, 'stem': stem, 'opts': opts})
    return qs, len(marks)


def build_analysis(vol):
    pages = load_rows('a', vol)
    ans, ana = {}, {}
    # 逐行扫描解析标记；一行可能含多段（OCR 按 y 合并），逐个切
    for _, rows in pages:
        for r in rows:
            for m in re.finditer(r'(\d{1,2})\s*[.．]\s*([A-D])\s*[。.．、]\s*(?:【解析】)?', r):
                n = int(m.group(1))
                if 1 <= n <= 40:
                    ans[n] = m.group(2)
    # 解析正文：找「NN.X。【解析】」或「NN.X。」起始，截到下一标记
    full = []
    for _, rows in pages:
        for r in rows:
            full.append(r)
    text = '\n'.join(full)
    # OCR 漏识别「NN.X。【解析】」整行的补丁：题号+答案从答案表补，正文从孤立【解析】起截。
    if vol == 3 and 3 in ans:
        pass
    if vol == 3:
        m4 = re.search(r'【解析】本题考查二叉树的存储特点。', text)
        if m4 and 4 not in ana:
            end = text.find('05.', m4.end())
            if end < 0: end = m4.end() + 900
            ana[4] = text[m4.end():end].strip()
            ans[4] = 'A'   # 答案表 p26 第1行 04. 右侧为 A
    ms = list(re.finditer(r'(\d{1,2})\s*[.．]\s*(?:([A-D])\s*[。.．、]\s*)?【解析】', text))
    for k, m in enumerate(ms):
        n = int(m.group(1))
        if not (1 <= n <= 47) or n in ana:
            continue
        end = ms[k + 1].start() if k + 1 < len(ms) else len(text)
        seg = text[m.end():end].strip()
        seg = re.split(r'全国硕士研究生入学统一考试|计算机专业基础综合考试模拟试卷', seg)[0].strip()
        seg = re.sub(r'\n{2,}', '\n', seg)
        if seg:
            ana[n] = seg
        if m.group(2) and n <= 40:
            ans[n] = m.group(2)
    return ans, ana


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def stem_to_html(stem):
    """按行分段；伪代码/汇编行合并为 pre，其余 p。"""
    parts, buf, in_code = [], [], False
    for ln in stem.split('\n'):
        code = bool(re.search(r'(?<![A-Za-z])(for|if|while|int|void|return|typedef|struct|#include)\b|[{};]|//|←|<-', ln))
        if code and not in_code:
            if buf:
                parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>'); buf = []
            in_code = True
        if not code and in_code:
            parts.append('<pre><code class="language-c">' + '\n'.join(esc(x) for x in buf) + '</code></pre>'); buf = []; in_code = False
        buf.append(ln)
    if in_code:
        parts.append('<pre><code class="language-c">' + '\n'.join(esc(x) for x in buf) + '</code></pre>')
    elif buf:
        parts.append('<p>' + '<br/>'.join(esc(x) for x in buf) + '</p>')
    return '\n'.join(parts)


def sid_of(n):
    if n <= 11: return 'ds'
    if n <= 22: return 'co'
    if n <= 32: return 'os'
    if n <= 40: return 'cn'
    if n <= 42: return 'ds'
    if n <= 44: return 'co'
    if n <= 46: return 'os'
    return 'cn'


def main():
    vol = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    qs, nmarks = build_questions(vol)
    ans, ana = build_analysis(vol)
    print('卷%s：题号标记 %d，切出 %d 题；答案 %d/40，解析 %d/47' % (CN[vol], nmarks, len(qs), len(ans), len(ana)))
    miss_a = [n for n in range(1, 41) if n not in ans]
    miss_ana = [n for n in range(1, 48) if n not in ana]
    print('  缺答案:', miss_a)
    print('  缺解析:', miss_ana)
    items = []
    for q in qs:
        n = q['i']
        items.append({
            'i': n, 't': q['t'], 's': q['s'], 'a': ans.get(n, ''),
            'sid': sid_of(n), 'q': stem_to_html(q['stem']),
            'o': [esc(x) for x in q['opts']],
            'an': '<div class="analysis-content">' + esc(ana.get(n, '')) + '</div>' if ana.get(n) else '',
            'qid': None, 'kp': ''
        })
    out = os.path.join(DST, 'zt_mock%d.json' % vol)
    with open(out, 'w', encoding='utf-8', newline='') as f:
        json.dump({'y': '模拟' + CN[vol], 'n': len(items), 'items': items}, f, ensure_ascii=False, indent=1)
    print('  写出', out)
    # 调试 dump（不提交）
    with open(os.path.join(PROBE, 'build_v%d_qs.json' % vol), 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
