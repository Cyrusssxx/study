# -*- coding: utf-8 -*-
"""大题专项数据源：从真题套卷 data/zt/*.json 抽出全部大题，生成 data/dati_zt.json。

为什么这么做（2026-11-13）：
  原 data/dati.json 是 89 道王道章节截图题，题目/答案与「真题套卷」页对不上，
  做题记录也用了另一套 dati_* id。用户要求大题专项直接用 zhenti 的真源，
  并把笔记、收藏、不熟/不会与真题页完全打通。

  打通的关键＝**同一道题用同一个 id**：
    zhenti.js buildFlat() → iid = it.qid || (sid + '_zt' + year + '_' + i)
  本脚本按完全相同的公式生成 id；note_alias.json 已把 126 个 iid 全部映射到
  规范键 zt{年}_{卷面题号}，因此笔记写同一个键、收藏/标记写同一个键，
  两页天然双向同步（后端 api() 与 dbPut() 落的是同一个 IndexedDB）。

输出结构刻意保持旧 dati.json 的 subjects[].chapters[].sections[].questions[] 形状，
  让 dati.html 的筛选/排序/导航逻辑几乎不用改；题干与答案由「图片名数组」换成
  「HTML 字符串」，页面里做双格式兼容（数组→旧截图、字符串→真题 HTML）。

DS 算法题（18 道）在 zhenti.js 里走 dakaBigCard() 的打卡表版本，这里在构建期
  用同一套公式预算好 HTML，保证两页显示的题目与答案一致。

用法： python tools/build_dati_zt.py
"""
import io
import json
import os
import re
import glob
import html as _html

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PWA = os.path.join(ROOT, 'pwa')
DATA = os.path.join(PWA, 'data')

SUBJ_NAME = {
    'ds': '数据结构',
    'co': '计算机组成原理',
    'os': '操作系统',
    'cn': '计算机网络',
}
SUBJ_ORDER = ['ds', 'co', 'os', 'cn']


def read_json(rel):
    with io.open(os.path.join(PWA, rel), 'r', encoding='utf-8') as f:
        return json.load(f)


def esc(s):
    """与 zhenti.js 的 esc() 一致（' 用 &#39;）。"""
    return (str(s if s is not None else '')
            .replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&#39;'))


def fmt_formula(raw):
    """common.js fmtFormula()：LaTeX 风格 _{} ^{} / X_0 转 sub/sup，代码块内不误转。"""
    if not raw:
        return ''
    blocks = []

    def keep_pre(m):
        blocks.append(m.group(0))
        return '\x00B%d\x00' % (len(blocks) - 1)

    s = re.sub(r'<pre[\s\S]*?</pre>', keep_pre, raw)
    s = re.sub(r'_\{([^{}]+)\}', r'<sub>\1</sub>', s)
    s = re.sub(r'\^\{([^{}]+)\}', r'<sup>\1</sup>', s)
    s = re.sub(r'([A-Za-z0-9₀₁₂₃₄₅₆₇₈₉]|\))_([A-Za-z0-9])(?!\w)', r'\1<sub>\2</sub>', s)
    for i, b in enumerate(blocks):
        s = s.replace('\x00B%d\x00' % i, b)
    return s


def fmt_content(raw):
    """common.js fmtContent() 的等价实现（打卡表题干：纯文本 + <pre> 代码块）。

    必须与前端逐字等价，否则「大题专项」显示的题干会与「真题套卷」不一致 ——
    这正是用户要求合并两页数据的原因，不能只搬数据不搬排版口径。
    """
    if not raw:
        return ''
    s = fmt_formula(raw)
    blocks = []

    def keep_pre(m):
        blocks.append(m.group(0))
        return '\x00B%d\x00' % (len(blocks) - 1)

    s = re.sub(r'\n*<pre[\s\S]*?</pre>\n*', keep_pre, s)
    s = re.sub(r'\n+', '<br>', s)

    # I. II. III. IV. V. 陈述挤在一行时自动分行（HTML 标签原样保留、段首不加、
    # 前面已是 <br> 不重复插）——与 common.js fmtContent 的 replacer 一一对应。
    def split_items(m):
        tag, num, off = m.group(0), m.group(1), m.start()
        if not num or off == 0:
            return tag
        prev = s[max(0, off - 6):off].lower()
        if prev.endswith('<br>') or prev.endswith('<br/>'):
            return tag
        return '<br>' + tag
    s = re.sub(r'<[^>]*>|(I{1,3}|IV|V)\.', split_items, s)
    for i, b in enumerate(blocks):
        s = s.replace('\x00B%d\x00' % i, b)
    return s


def fig_wrap(arr, label):
    """zhenti.js figWrapHtml()：打卡表教材原图区块。"""
    if not arr:
        return ''
    imgs = ''.join('<img src="data/daka_figs/%s" loading="lazy" alt="教材原图">' % esc(n)
                   for n in arr)
    return ('<div class="code-figs zt-daka-figs">'
            '<div class="code-figs-label">📷 %s</div>%s</div>' % (esc(label), imgs))


def sol_html(q):
    """zhenti.js solHtml()：讲义多解法（思路 / 代码 / 复杂度）。"""
    s = (q.get('solutions') or {})
    lst = s.get('list') or []
    if not lst:
        b = q.get('brute')
        if not b:
            return ''
        return ('<div class="code-brute">'
                '<div class="code-brute-head">💪 %s <span class="sol-tag-fb">自生成</span></div>'
                '<div class="sol-sec">基本设计思想</div><div class="sol-text">%s</div>'
                '<div class="sol-sec">代码</div><pre class="code-block">%s</pre></div>'
                % (esc(b.get('method') or '暴力解'), b.get('idea') or '', esc(b.get('code') or '')))
    table = ''
    rows = s.get('score_rows') or []
    if rows:
        tr = ''.join('<tr><td>%s</td><td>%s</td><td class="sol-score-num">%s</td></tr>'
                     % (esc(r.get('approach')), esc(r.get('method')), esc(r.get('score')))
                     for r in rows)
        table = ('<table class="sol-score"><tr><th>做题思路</th><th>方法</th>'
                 '<th>预计得分</th></tr>%s</table>' % tr)
    folds = []
    for i, x in enumerate(lst):
        head = esc(x.get('tag') or ('解法' + str(i + 1)))
        if x.get('kind'):
            head += ' · ' + esc(x['kind'])
        if x.get('name'):
            head += ' · ' + esc(x['name'])
        body = ''
        for key, title, cls in [('analysis', '解析', 'sol-text'),
                                ('thought', '基本设计思想', 'sol-text')]:
            if x.get(key):
                body += '<div class="sol-sec">%s</div><div class="%s">%s</div>' % (title, cls, esc(x[key]))
        if x.get('code'):
            body += '<div class="sol-sec">代码</div><pre class="code-block">%s</pre>' % esc(x['code'])
        if x.get('complexity'):
            body += '<div class="sol-cx">%s</div>' % esc(x['complexity'])
        if x.get('note'):
            body += '<div class="sol-note">%s</div>' % esc(x['note'])
        folds.append('<details class="sol-fold"%s><summary class="sol-head">%s</summary>'
                     '<div class="sol-item">%s</div></details>'
                     % (' open' if i == 0 else '', head, body))
    return ('<div class="sol-wrap"><div class="sol-source">📘 %s</div>%s%s</div>'
            % (esc(s.get('source') or ''), table, ''.join(folds)))


def daka_answer(card, lecture):
    """zhenti.js dakaAnswerHtml()：讲义解析 + 解答原图。"""
    out = ''
    if lecture and (lecture.get('solutions') or {}).get('list'):
        analysis = (lecture.get('analysis') or '').replace('易错点：', '\n易错点：')
        out += '<div class="daka-analysis">%s</div>' % esc(analysis)
        out += sol_html(lecture)
    out += fig_wrap((card.get('figs') or {}).get('answer'), '解答原图')
    return out or '<div class="explanation-empty">该题暂无解答内容</div>'


def build():
    alias = read_json('data/note_alias.json')
    old = read_json('data/dati.json')
    daka = read_json('data/ds_daka.json')
    code = read_json('data/ds_code.json')
    extra = read_json('data/ds_code_extra.json')

    # 旧 dati_* → 规范键；顺手记下它原来的章/节，便于「按章节」浏览延续旧口径
    old_info = {}
    for s in old['subjects']:
        for ch in s['chapters']:
            for sec in ch['sections']:
                for q in sec['questions']:
                    old_info[q['id']] = (ch['name'], sec['name'])
    spec2old = {}
    for k, v in alias.items():
        if k.startswith('dati_') and v:
            spec2old.setdefault(v, []).append(k)

    # 打卡表替换源（与 zhenti.js loadDaka() 同口径）
    by_real = {}
    for c in daka.get('questions') or []:
        m = re.match(r'^(\d{4})年408真题第(\d+)题', c.get('real') or '')
        if m:
            by_real[m.group(1) + '|' + m.group(2)] = c
    by_source = {}
    for q in (code.get('questions') or []) + (extra.get('questions') or []):
        if q.get('source'):
            by_source[q['source']] = q

    idx = read_json('data/zt/index.json')
    years = sorted(idx['years'], reverse=True)   # 二轮刷题：最新年份优先

    # spec → zhenti iid（用于把旧 dati_* 记录迁到新 id）
    spec2iid = {}
    items = []
    for y in years:
        with io.open(os.path.join(DATA, 'zt', 'zt_%d.json' % y), 'r', encoding='utf-8') as f:
            paper = json.load(f)
        for it in paper['items']:
            if it.get('t') == 1:
                continue
            sid = it['sid']
            num = it['i']
            iid = it.get('qid') or (sid + '_zt' + str(y) + '_' + str(num))
            spec = alias.get(iid)
            if not spec:
                raise RuntimeError('note_alias 缺 %s（笔记会与真题页不同步）' % iid)
            spec2iid[spec] = iid

            card = by_real.get(str(y) + '|' + str(num))
            lecture = by_source.get(card.get('source')) if card else None
            if card and lecture:
                q_html = fmt_content(card.get('content') or '') + fig_wrap(
                    (card.get('figs') or {}).get('content'), '题目原图')
                a_html = daka_answer(card, lecture)
                variant = 'daka'
            else:
                q_html = it.get('q') or ''
                a_html = it.get('an') or ''
                variant = 'zt'

            old_ids = spec2old.get(spec, [])
            ch_name, sec_name = None, None
            for oid in old_ids:
                if oid in old_info:
                    ch_name, sec_name = old_info[oid]
                    break
            if not ch_name:
                ch_name, sec_name = '真题综合（未分章）', '第 %d 题' % num

            svgs = sorted(set(re.findall(r'data-svg="([^"]+)"', q_html + a_html)))
            items.append({
                'iid': iid, 'spec': spec, 'sid': sid, 'year': y, 'num': num,
                'score': it.get('s'), 'variant': variant,
                'q': q_html, 'a': a_html, 'svgs': svgs,
                'old_ids': old_ids, 'ch': ch_name, 'sec': sec_name,
            })

    if len(items) != sum(idx['counts'].values()) - 40 * len(years):
        # 只作提示：每年 40 道选择题是固定口径
        pass

    legacy = {}
    for it in items:
        for oid in it['old_ids']:
            legacy[oid] = it['iid']

    # 组织成旧 dati.json 的形状：科目 → 章 → 节 → 题
    # 章顺序沿用旧 dati.json（用户熟悉的章节顺序），未匹配的题统一进「真题综合」。
    subjects = []
    for key in SUBJ_ORDER:
        sub_old = next((s for s in old['subjects'] if s['key'] == key), None)
        ch_order = [c['name'] for c in (sub_old or {}).get('chapters', [])]
        ch_map = {}
        for it in [x for x in items if x['sid'] == key]:
            ch_map.setdefault(it['ch'], {}).setdefault(it['sec'], []).append(it)
        ordered = [c for c in ch_order if c in ch_map]
        ordered += [c for c in ch_map if c not in ch_order]
        chapters = []
        for ch_name in ordered:
            sections = []
            for sec_name, qs in ch_map[ch_name].items():
                qs.sort(key=lambda x: (-x['year'], x['num']))
                questions = []
                for x in qs:
                    questions.append({
                        'id': x['iid'],
                        'num': x['num'],
                        'year': x['year'],
                        'real': True,
                        'sid': x['sid'],
                        'score': x['score'],
                        'variant': x['variant'],
                        'label': '%02d-%d' % (x['year'] % 100, x['num']),
                        'q': x['q'],
                        'a': x['a'],
                        'svgs': x['svgs'],
                        'oldIds': x['old_ids'],
                    })
                sections.append({'name': sec_name, 'questions': questions})
            sections.sort(key=lambda s: s['name'])
            chapters.append({'name': ch_name, 'sections': sections})
        subjects.append({'key': key, 'name': SUBJ_NAME[key], 'chapters': chapters})

    out = {
        'source': 'data/zt/zt_YYYY.json（与真题套卷页同源）',
        'years': years,
        'total': len(items),
        'legacy': legacy,          # 旧 dati_* id → zhenti iid，用于一次性迁移已练/收藏/标记
        'subjects': subjects,
    }
    path = os.path.join(DATA, 'dati_zt.json')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('写出 %s：%d 题 / %d 科 / %d 个旧 id 迁移项 / %.2f MB'
          % (path, len(items), len(subjects), len(legacy),
             os.path.getsize(path) / 1048576.0))
    for s in subjects:
        n = sum(len(sec['questions']) for c in s['chapters'] for sec in c['sections'])
        print('  %-3s %-8s %2d 题 / %d 章' % (s['key'], s['name'], n, len(s['chapters'])))


if __name__ == '__main__':
    build()
