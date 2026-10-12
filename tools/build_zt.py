# -*- coding: utf-8 -*-
"""把 408os.cn 同步的 846 道真题构建为项目数据 pwa/data/zt/zt_YYYY.json。

用法：python tools/build_zt.py
输入：_zt_source/{meta,questions,answers,analysis}/（由 tools/sync_zt_source.py 同步）
      tools/zt_qid_map.json（交互 id 的题库映射表：与刷题页收藏/错题互通）
输出：pwa/data/zt/zt_YYYY.json（每年一个，indent=1、LF、无尾换行）
      pwa/data/zt/index.json（年份 + 题数 + 交互 id 列表）
      pwa/data/zt_svg/*.svg（题图外置，题干留 .zt-svgholder 占位）

字段：i=题号 t=类型(1单选/2大题/3综合) s=分值 a=答案字母 sid=科目
      q=题干HTML（清洗） o=选项HTML数组 an=解析HTML qid=题库映射id或null
"""
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_zt_source')
DST = os.path.join(ROOT, 'pwa', 'data', 'zt')
SVGDIR = os.path.join(ROOT, 'pwa', 'data', 'zt_svg')
QID_MAP = os.path.join(ROOT, 'tools', 'zt_qid_map.json')
YEARS = list(range(2009, 2027))

WATERMARK = re.compile(r'<pattern[^>]*watermark-pattern.*?</pattern>', re.S)
SVG_RE = re.compile(r'<svg[\s\S]*?</svg>', re.I)
_svg_n = [0]

# 大题科目关键词分类（含题号先验：41-42 DS / 43-44 CO / 45-46 OS / 47 CN）
KW = {
    'cn': ['TCP', 'UDP', 'IP', '路由', '协议', '以太网', '子网', 'DNS', 'HTTP', '交换机',
           'MAC', '帧', '带宽', '信道', '报文', '窗口', '拥塞', 'ARP', 'DHCP', 'FTP', 'SMTP',
           '网络层', '传输层', '应用层', '链路', 'OSPF', 'CSMA', 'NAT', '域名', '自治系统'],
    'os': ['进程', '线程', '页面', '缺页', '文件', '目录', '调度', '信号量', '互斥', '死锁', '系统调用',
           '虚拟存储器', '页表', '分页', '缓冲区', '磁盘', '簇', '索引节点', '管道', '用户态', '内核',
           '操作系统', '时间片', '置换', '作业', '内核态', '页框', '工作集', '启动盘', '引导', '扇区',
           '磁道', '柱面', '文件系统', '生产者', '消费者', '哲学家'],
    'co': ['指令', '寄存器', 'Cache', 'CPU', '主存', '总线', '流水线', '通道', 'DMA',
           '浮点', '补码', '微指令', '数据通路', '寻址', '操作码', '标志', '存储字',
           '机器数', 'CPI', '译码', '控制器', 'ALU', '时钟周期', '指令集', '汇编',
           '字节编址', '字编址', '存储器', '外设', 'I/O', 'RAID', '虚拟地址', '物理地址',
           '页目录', 'TLB', 'Cache行', '命中率', '总线'],
    'ds': ['二叉树', '树', '图', '顶点', '边', '邻接', '排序', '查找', '散列', '哈希', '栈', '队列',
           '链表', '算法', '复杂度', '结点', '叶子', '遍历', 'B树', '生成树', '最短路径',
           '拓扑', '关键路径', '归并', '堆', '哈夫曼', '先序', '中序', '后序', '查找概率'],
}
PRIOR = {41: 'ds', 42: 'ds', 43: 'co', 44: 'co', 45: 'os', 46: 'os', 47: 'cn'}
# 人工修正（关键词误判的个案）
FIXES = {
    (2014, 45): 'co',   # 承接 44 的计算机 M（页式虚拟存储+Cache 综合）
    (2016, 43): 'ds',   # 集合划分算法（|n1-n2|最小 |S1-S2|最大）
    (2017, 45): 'co',   # 承接 43/44（二级分页虚拟存储）
}


def classify_text(text, idx):
    scores = {k: 0.0 for k in KW}
    for subj, kws in KW.items():
        for kw in kws:
            if kw in text:
                scores[subj] += 1
    if idx in PRIOR:
        scores[PRIOR[idx]] += 2
    return max(scores, key=lambda k: scores[k])


def choice_subject(year, idx):
    if year == 2009:
        d_end = 10
    else:
        d_end = 11
    if idx <= d_end:
        return 'ds'
    if idx <= 22:
        return 'co'
    if idx <= 32:
        return 'os'
    return 'cn'


def subject_of(year, idx, qid, plain_text):
    if qid:
        return qid.split('_')[0]
    if idx <= 40:
        return choice_subject(year, idx)
    if (year, idx) in FIXES:
        return FIXES[(year, idx)]
    return classify_text(plain_text, idx)


def extract_svgs(text, tag, out_files):
    """把内联 SVG（含嵌套）抽取为独立文件，返回替换后的文本。"""
    lower = text.lower()
    if '<svg' not in lower:
        return text
    res = []
    seq = 0
    i = 0
    n = len(text)
    while True:
        start = lower.find('<svg', i)
        if start < 0:
            break
        # 配对扫描（处理嵌套）
        depth = 0
        j = start
        end = -1
        while j < n:
            no = lower.find('<svg', j)
            nc = lower.find('</svg>', j)
            if nc < 0:
                break
            if 0 <= no < nc:
                depth += 1
                j = no + 4
            else:
                depth -= 1
                j = nc + 6
                if depth == 0:
                    end = j
                    break
        if end < 0:
            i = start + 4
            continue
        seq += 1
        name = 'zt_%s_%d' % (tag, seq)
        with io.open(os.path.join(SVGDIR, name + '.svg'), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text[start:end])
        out_files.append(name)
        res.append(text[i:start])
        res.append('<div class="zt-svgholder" data-svg="%s"></div>' % name)
        i = end
    res.append(text[i:])
    return ''.join(res)


def read(p):
    try:
        return io.open(p, encoding='utf-8').read()
    except Exception:
        return ''


def clean_html(body):
    """清洗题干/解析 HTML（含安全过滤：去 script/iframe/事件属性）。"""
    body = body.replace('<!DOCTYPE html>', '')
    body = re.sub(r'<!DOCTYPE[^>]*>', '', body)
    body = re.sub(r"content='[^']*'", '', body)          # drawio mxfile 数据
    body = re.sub(r'<link[^>]*>', '', body)
    body = re.sub(r'<meta[^>]*>', '', body)
    body = re.sub(r'<title>.*?</title>', '', body, flags=re.S)
    body = re.sub(r'</?(html|head|body)[^>]*>', '', body)
    # 安全过滤（第三方来源内容 innerHTML 注入前清洗）
    body = re.sub(r'<script[\s\S]*?</script>', '', body, flags=re.I)
    body = re.sub(r'<iframe[\s\S]*?</iframe>', '', body, flags=re.I)
    body = re.sub(r'\son\w+\s*=\s*"[^"]*"', '', body, flags=re.I)
    body = re.sub(r"\son\w+\s*=\s*'[^']*'", '', body, flags=re.I)
    body = re.sub(r'(href|src)\s*=\s*"javascript:[^"]*"', '', body, flags=re.I)
    body = re.sub(r"(href|src)\s*=\s*'javascript:[^']*'", '', body, flags=re.I)
    # 引用的水印 pattern 清理（defs 里的 watermark-pattern + 使用处保留）
    body = WATERMARK.sub('', body)
    body = body.strip()
    return body


def extract_content(html):
    """从整页 HTML 提取 <div class="content"> 的内部。"""
    i = html.find('<div class="content">')
    if i < 0:
        return ''
    start = i + len('<div class="content">')
    # 到 </body>
    j = html.find('</body>', start)
    inner = html[start:j if j > 0 else len(html)]
    # 去尾部多余的 </div>（content 的闭合）与其后空白
    inner = inner.strip()
    if inner.endswith('</div>'):
        inner = inner[:-len('</div>')]
    return inner.strip()


OPT_RE = re.compile(
    r'<div class="option"><span class="opt-label">\s*([A-D])[.、]?\s*</span>'
    r'<span class="opt-content">(.*?)</span></div>', re.S)


def parse_options(content):
    """拆出选项。返回 (stem, [optA, optB, optC, optD], 剩余HTML is_svg_opt)"""
    opts = OPT_RE.findall(content)
    if not opts:
        return content, []
    stem = content
    for label, txt in opts:
        full = ('<div class="option"><span class="opt-label">%s.</span>'
                '<span class="opt-content">%s</span></div>' % (label, txt))
        stem = stem.replace(full, '')
    return stem.strip(), [clean_html(t) for _, t in opts]


def strip_answer_page(html):
    """答案页 -> 纯文本（如「正确答案：D」）。"""
    c = extract_content(html)
    c = re.sub(r'<br\s*/?>', '\n', c)
    c = re.sub(r'<[^>]+>', '', c)
    return c.strip()


def load_qid_map():
    """从 tools/zt_qid_map.json 加载 {year: {idx: qid}}（交互 id 映射）。"""
    m = {}
    p = QID_MAP
    if os.path.exists(p):
        raw = json.load(io.open(p, encoding='utf-8'))
        for k, v in raw.items():
            y, i = k.split('|')
            m.setdefault(int(y), {})[int(i)] = v
    return m


def main():
    os.makedirs(DST, exist_ok=True)
    # 清空旧的 zt_svg（避免残留）
    if os.path.isdir(SVGDIR):
        for f in os.listdir(SVGDIR):
            os.remove(os.path.join(SVGDIR, f))
    os.makedirs(SVGDIR, exist_ok=True)
    qid_map = load_qid_map()
    total_size = 0
    total_svg = 0
    for y in YEARS:
        items = json.load(io.open(os.path.join(SRC, 'meta', 'meta_%d.json' % y),
                                  encoding='utf-8'))['data']
        out_items = []
        for x in items:
            q = x['question']
            idx = q['questionIndex']
            qh = read(os.path.join(SRC, 'questions', str(y), '%d.html' % idx))
            content = clean_html(extract_content(qh))
            stem, opts = parse_options(content)
            ans_html = read(os.path.join(SRC, 'answers', str(y), '%d.html' % idx))
            an_html = read(os.path.join(SRC, 'analysis', str(y), '%d.html' % idx))
            an = clean_html(extract_content(an_html))
            # SVG 外置（题干 + 选项）；科目判断需在抽取前取纯文本（含 SVG 内文字）
            tag = '%d_%d' % (y, idx)
            plain = re.sub(r'<[^>]+>', '', stem) + ''.join(re.sub(r'<[^>]+>', '', o) for o in opts)
            svg_files = []
            stem = extract_svgs(stem, tag, svg_files)
            opts = [extract_svgs(o, '%s_o%d' % (tag, k + 1), svg_files)
                    for k, o in enumerate(opts)]
            an = extract_svgs(an, '%s_an' % tag, svg_files)
            total_svg += len(svg_files)
            # 科目判断（用于交互 id 前缀与收藏归类）
            qid = qid_map.get(y, {}).get(idx)
            sid = subject_of(y, idx, qid, plain)
            item = {
                'i': idx,
                't': q['questionType'],
                's': q['score'],
                'a': (q.get('answer') or '').strip().upper() or None,
                'sid': sid,
                'q': stem,
                'o': opts,
                'an': an,
                'qid': qid,
            }
            # 主观题答案页（非"正确答案：X"时才有价值）
            ans_txt = strip_answer_page(ans_html)
            if ans_txt and ans_txt not in ('', '详见解析') and not ans_txt.startswith('正确答案：' + (item['a'] or '^')):
                item['ans'] = ans_txt
            out_items.append(item)
        out = {'y': y, 'n': len(out_items), 'items': out_items}
        text = json.dumps(out, ensure_ascii=False, indent=1)
        p = os.path.join(DST, 'zt_%d.json' % y)
        with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        kb = os.path.getsize(p) // 1024
        total_size += kb
        n_qid = sum(1 for it in out_items if it['qid'])
        print('%d: %d 题 | %d KB | qid 映射 %d' % (y, len(out_items), kb, n_qid))
    # 索引文件（年份列表 + 每年题数 + 交互 id 列表，供年份进度统计）
    idx = {
        'years': YEARS,
        'counts': {},
        'iids': {},
        'choice_total': 40,
        'big_total': 7,
    }
    for y in YEARS:
        d = json.load(io.open(os.path.join(DST, 'zt_%d.json' % y), encoding='utf-8'))
        idx['counts'][str(y)] = len(d['items'])
        idx['iids'][str(y)] = [
            it['qid'] if it['qid'] else '%s_zt%d_%d' % (it['sid'], y, it['i'])
            for it in d['items'] if it['t'] == 1
        ]
    with io.open(os.path.join(DST, 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(idx, ensure_ascii=False, indent=1))
    n_svg = len(os.listdir(SVGDIR))
    svg_mb = sum(os.path.getsize(os.path.join(SVGDIR, f)) for f in os.listdir(SVGDIR)) / 1024 / 1024
    print('总大小: %.1f MB | SVG 外置: %d 个 / %.1f MB' % (total_size / 1024, n_svg, svg_mb))


if __name__ == '__main__':
    main()
