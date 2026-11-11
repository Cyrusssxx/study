# -*- coding: utf-8 -*-
"""2017-2026 真题「题目 / 答案」内容与排版只读审计。

用法：python tools/_zt_audit_17_26.py > tools/_zt_audit_17_26.txt
检查分三层：
  A 构建保真：逐题重跑 build_zt.py 的清洗逻辑，与产物逐字段比对（题干/选项/解析/答案/分值/qid）。
  B 数据规则：题号、选项数、答案字母、分值合计、答案页与解析结论一致性、题库映射有效性。
  C 排版结构：<pre> 残留、SVG 外置引用、内联括号、标签配对、超宽/隐藏文本/乱码等。
只读，不写任何 pwa/ 数据。
"""
import collections
import difflib
import html as htmlmod
import importlib.util
import io
import json
import os
import re
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YEARS = list(range(2017, 2027))
SRC = os.path.join(ROOT, '_zt_source')
DST = os.path.join(ROOT, 'pwa', 'data', 'zt')
SVGDIR = os.path.join(ROOT, 'pwa', 'data', 'zt_svg')

spec = importlib.util.spec_from_file_location('bz', os.path.join(ROOT, 'tools', 'build_zt.py'))
bz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bz)
bz.SVGDIR = tempfile.mkdtemp(prefix='zt_audit_svg_')  # 只写临时目录

issues = collections.defaultdict(list)
stats = collections.Counter()


def read(p):
    try:
        return io.open(p, encoding='utf-8').read()
    except Exception:
        return ''


def add(cat, key, msg):
    issues[cat].append((key, msg))
    stats[cat] += 1


def plain(s):
    return re.sub(r'\s+', '', htmlmod.unescape(re.sub(r'<[^>]+>', '', s or '')))


def fields(it):
    return [('q', it.get('q') or ''), ('an', it.get('an') or ''), ('ans', it.get('ans') or '')] + [
        ('o%d' % (k + 1), o) for k, o in enumerate(it.get('o') or [])]


# ---------- 题库映射有效性 ----------
bank_ids = {}
for sub in ('ds', 'co', 'os', 'cn'):
    d = json.load(io.open(os.path.join(ROOT, 'pwa', 'data', sub + '.json'), encoding='utf-8'))
    bank_ids[sub] = {x['id'] for x in d['questions']}
qid_map = bz.load_qid_map()

paper_meta = {}
for y in YEARS:
    paper_meta[y] = json.load(io.open(os.path.join(SRC, 'meta', 'meta_%d.json' % y), encoding='utf-8'))['data']

all_svg_refs = set()
year_summary = []

for y in YEARS:
    out = json.load(io.open(os.path.join(DST, 'zt_%d.json' % y), encoding='utf-8'))
    items = out['items']
    metas = {x['question']['questionIndex']: x['question'] for x in paper_meta[y]}
    if out['n'] != len(items):
        add('结构', '%d' % y, 'n=%d 与 items 长度 %d 不符' % (out['n'], len(items)))
    idxs = [it['i'] for it in items]
    if idxs != list(range(1, 48)):
        add('结构', '%d' % y, '题号不连续/重复：%s' % idxs[:60])

    for it in items:
        i = it['i']
        key = '%d-%d' % (y, i)
        m = metas.get(i)
        if not m:
            add('结构', key, '源 meta 缺该题')
            continue
        # ---- A 构建保真：重跑清洗链 ----
        qh = read(os.path.join(SRC, 'questions', str(y), '%d.html' % i))
        ah = read(os.path.join(SRC, 'answers', str(y), '%d.html' % i))
        nh = read(os.path.join(SRC, 'analysis', str(y), '%d.html' % i))
        if not qh:
            add('源文件', key, '题目 HTML 缺失')
        if not nh:
            add('源文件', key, '解析 HTML 缺失')
        content = bz.clean_html(bz.extract_content(qh))
        stem, opts = bz.parse_options(content)
        an = bz.clean_html(bz.extract_content(nh))
        tag = '%d_%d' % (y, i)
        stem = bz.extract_svgs(stem, tag, [])
        stem = bz.balance_div(stem)  # 与构建管线一致：SVG 外置后才配平题干 div
        opts = [bz.extract_svgs(o, '%s_o%d' % (tag, k + 1), []) for k, o in enumerate(opts)]
        an = bz.extract_svgs(an, '%s_an' % tag, [])
        for fname, got, want in (('q', it['q'], stem), ('an', it['an'], an)) + tuple(
                ('o%d' % (k + 1), (it['o'] or [''] * 4)[k] if k < len(it['o'] or []) else '', o)
                for k, o in enumerate(opts)):
            if got != want:
                d = ''.join(difflib.unified_diff(want.splitlines(), (got or '').splitlines(), n=0, lineterm=''))
                add('构建保真', key, '%s 与源清洗结果不一致：%s' % (fname, d[:260]))
        if len(opts) != len(it['o'] or []):
            add('结构', key, '选项数 %d(产物) vs %d(源)' % (len(it['o'] or []), len(opts)))
        # 主观题答案页字段
        ans_txt = bz.strip_answer_page(ah)
        want_ans = (ans_txt if ans_txt and ans_txt != '详见解析'
                    and not bz.ANS_PAGE_LETTER.match(ans_txt) else None)
        if (it.get('ans') or None) != want_ans:
            add('构建保真', key, 'ans 字段不一致：产物=%r 源=%r' % ((it.get('ans') or '')[:80], (want_ans or '')[:80]))

        # ---- B 数据规则 ----
        if it['t'] != m['questionType']:
            add('数据', key, '题型 t=%s vs meta=%s' % (it['t'], m['questionType']))
        score = bz.SCORE_FIX.get((y, i), m['score'])
        if it['s'] != score:
            add('数据', key, '分值 s=%s vs meta=%s' % (it['s'], score))
        want_a = (m.get('answer') or '').strip().upper() or None
        if it['a'] != want_a:
            add('数据', key, '答案 a=%r vs meta=%r' % (it['a'], want_a))
        # 答案页文本与答案字母
        ap = bz.strip_answer_page(ah)
        mm = re.search(r'正确答案[：:]\s*([A-D])', ap or '')
        if mm and (it['a'] or '') != mm.group(1):
            add('源站数据提示', key, '答案页 %s 与 meta/解析 %s 不一致（解析支持 meta，答案页已不入 ans）' % (mm.group(1), it['a']))
        if i <= 40:
            if not it['q'] or not it['an']:
                add('数据', key, '选择题题干/解析为空')
            if len(it['o'] or []) != 4:
                add('数据', key, '选择题选项数=%d' % len(it['o'] or []))
            if any(not plain(o) for o in (it['o'] or [])):
                add('数据', key, '存在空选项')
            if it['a'] not in list('ABCD'):
                add('数据', key, '选择题答案非 A-D：%r' % it['a'])
            if 'class="option"' in it['q']:
                add('排版', key, '题干里残留未拆出的 <div class="option">')
            # 解析结论字母与答案矛盾（仅取强结论句式）
            txt = plain(it['an'])
            concl = re.findall(r'(?:故选|答案为|应选|因此选|正确答案[为是：:]|故选)\s*([A-D])(?![A-D和、或])', txt)
            bad = sorted({c for c in concl if c != it['a']})
            if bad:
                add('待复核·答案矛盾', key, '解析结论=%s 但答案=%s ｜ %s' % (
                    '/'.join(sorted(set(concl))), it['a'], txt[-110:]))
        else:
            if (it['o'] or []):
                add('数据', key, '大题却带选项 %d 个' % len(it['o']))
            if it['a']:
                add('数据', key, '大题带字母答案 %r' % it['a'])
        # qid 映射
        want_qid = qid_map.get(y, {}).get(i)
        if it['qid'] != want_qid:
            add('数据', key, 'qid=%r vs 映射表=%r' % (it['qid'], want_qid))
        q = it['qid']
        if q and '_zt' not in q and '_code_' not in q:
            sub = q.split('_')[0]
            if sub in bank_ids and q not in bank_ids[sub]:
                add('数据', key, 'qid %s 不在 %s.json 题库' % (q, sub))
        # 卷面满分标注与分值
        if i > 40:
            mf = re.search(r'本题满分\s*(\d+)\s*分', plain(it['q']))
            if mf and int(mf.group(1)) != it['s']:
                add('待复核·分值', key, '题干标「满分 %s 分」但 s=%s' % (mf.group(1), it['s']))

        # ---- C 排版结构 ----
        for fname, v in fields(it):
            if not v:
                continue
            if '<svg' in v.lower():
                add('排版', key, '%s 残留内联 <svg>（应外置）' % fname)
            if 'display:flex' in v or 'display: flex' in v:
                add('排版', key, '%s 残留 display:flex' % fname)
            if re.search(r'<pre\s+[^>]*>', v):
                add('排版', key, '%s 残留 <pre 内联样式' % fname)
            if any(re.search(r'style="color:#', p) for p in re.findall(r'<pre\b[^>]*>([\s\S]*?)</pre>', v, re.I)):
                add('排版', key, '%s <pre> 内残留 token 内联色' % fname)
            if any(float(n) > 100 for n in re.findall(r'width:\s*(\d+(?:\.\d+)?)%', v)):
                add('排版', key, '%s 残留 >100%% 宽度' % fname)
            if 'mxGraphModel' in v or 'color:transparent' in v:
                add('排版', key, '%s 残留 drawio 隐藏数据' % fname)
            if '\ufffd' in v or '&amp;lt;' in v or '&amp;gt;' in v:
                add('排版', key, '%s 疑似乱码/双重转义' % fname)
            if re.search(r'<(?:script|iframe)\b', v, re.I) or re.search(r'\son\w+\s*=', v):
                add('排版', key, '%s 残留脚本/事件属性' % fname)
            if fname == 'an' and it['i'] <= 40:
                for cm in re.findall(r'正确答案[：:]\s*([A-D])', v):
                    if cm != it['a']:
                        add('排版', key, '%s 解析里的正确答案 %s 与 a=%s 冲突' % (fname, cm, it['a']))
            # 标签配对（只统计容易撑破版面的容器）
            for tagn in ('div', 'span', 'p', 'table', 'tr', 'td', 'ul', 'ol', 'li', 'pre', 'code'):
                no = len(re.findall(r'<%s\b' % tagn, v, re.I))
                nc = len(re.findall(r'</%s>' % tagn, v, re.I))
                if tagn not in ('p', 'li', 'td', 'tr') and no != nc:
                    add('标签配对', key, '%s <%s> %d 开 / %d 闭' % (fname, tagn, no, nc))
            for ref in re.findall(r'data-svg="([^"]+)"', v):
                all_svg_refs.add(ref)
                p = os.path.join(SVGDIR, ref + '.svg')
                if not os.path.exists(p):
                    add('题图', key, '%s 引用不存在的 SVG %s' % (fname, ref))
                else:
                    s = read(p)
                    if not s.lstrip().lower().startswith('<svg') or '</svg>' not in s.lower():
                        add('题图', key, 'SVG 文件损坏 %s' % ref)
                    # drawio 把 mxGraphModel 藏在 <svg content="..."> 属性，或
                    # color:transparent / font-size:0 的 span 里，两者都不会渲染成文本。
                    vis = re.sub(r'<[^>]+>', '', s)
                    hidden = re.search(r'color:transparent|font-size:0', s)
                    if 'mxGraphModel' in vis and not hidden:
                        add('题图', key, 'SVG 内 mxGraphModel 作为可见文本泄漏 %s' % ref)
            for src in re.findall(r'<img[^>]+src="([^"]+)"', v):
                if not src.startswith('data/zt_img/'):
                    add('题图', key, '%s 含外链 <img src=%s>' % (fname, src))
                elif not os.path.exists(os.path.join(ROOT, 'pwa', src)):
                    add('题图', key, '%s 本地图缺失 %s' % (fname, src))
        # 内联 KaTeX 括号：span 占位 + 文件以 em 为宽高
        for ref in re.findall(r'class="zt-svgholder zt-svg-inline" data-svg="([^"]+)"', it['q'] + it['an'] + ''.join(it['o'] or [])):
            s = read(os.path.join(SVGDIR, ref + '.svg'))
            if s and not re.search(r'(?:width|height)="[^"]*em"', s[:400], re.I):
                add('题图', key, '内联占位 %s 对应的 SVG 不是 em 尺寸（可能误判）' % ref)

    scores = [it['s'] for it in items]
    year_summary.append((y, len(items), sum(scores), sum(scores[:40]), scores[40:]))

# 孤儿 SVG（17-26 年范围，未被任何字段引用）
orphan = []
for f in sorted(os.listdir(SVGDIR)):
    m = re.match(r'zt_(\d{4})_', f)
    if m and int(m.group(1)) in YEARS and f[:-4] not in all_svg_refs:
        orphan.append(f)
if orphan:
    add('题图', '-', '17-26 年孤儿 SVG %d 个：%s' % (len(orphan), ', '.join(orphan[:20])))

# ---------- 输出 ----------
print('=== 2017-2026 真题审计（只读）===')
print('年份  题数  总分  选择题  大题分值')
for y, n, tot, ch, big in year_summary:
    print('%d  %3d  %4d  %4d   %s' % (y, n, tot, ch, big))
print('\n引用 SVG 总数（17-26）: %d' % len(all_svg_refs))
print('分类计数: ' + (', '.join('%s=%d' % (k, stats[k]) for k in sorted(stats)) if issues else '0（无异常）'))
for cat in sorted(issues):
    print('\n--- %s（%d）---' % (cat, len(issues[cat])))
    for key, msg in issues[cat][:400]:
        print('[%s] %s' % (key, msg))
print('\n=== 结束 ===')
