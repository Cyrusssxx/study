# -*- coding: utf-8 -*-
"""OS 1.5「操作系统引导」正文精简（痛点：110 个 <p> 平铺、同一考点讲 3 遍）。

做法：保留全部考点，只做三件事
  1. 「二、七步流程」由 20 个散段落改成 7 行表格（步骤 / 执行者 / 关键动作 / 位置）
  2. 删掉「五、职责分工速记」整节——它的表格与二重复，末尾 21 段是把一、四讲过的
     类比、ROM/RAM、中断串联又讲了一遍；有用信息（硬件起头软件接力、双系统主导权、
     UEFI 演进、两条主线、三句话）并入四、五
  3. 表格与要点替代长句罗列，口径不变

硬约束（写盘前逐条校验，任一不满足就中止）：
  · 划词高亮 os_hl 里 1.5 的两条文字（'BIOS初始化'、'源头在ROM；'）必须仍出现在正文
    —— loadHighlights 对找不到 text 的高亮会静默丢弃并落盘清洗，删掉字就永久没了
  · boot-fig 图块原样保留（不重写 SVG，直接从旧 html 抠出来拼回去）
  · 不出现 <p> 嵌 <ul>/<table>（解析器会提前闭合，行号与批注全乱）

用法：
  python tools/slim_os15.py --dry     # 只打印前后对比与校验结果
  python tools/slim_os15.py           # 写盘
"""
import io
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, 'pwa', 'data', 'notes', 'os_notes.json')
NEW_HTML = os.path.join(ROOT, 'tools', 'os15_new.html')
BAK_DIR = os.path.join(ROOT, 'archive', 'os_slim_2026-11-15')
SEC_PREFIX = '1.5 '
HL_MUST = ['BIOS初始化', '源头在ROM；']

DRY = '--dry' in sys.argv


def norm_text(html):
    """去标签后的可见文字（用于字数对比）。"""
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.S)
    t = re.sub(r'<[^>]+>', '', t)
    return re.sub(r'\s+', '', t)


def main():
    raw = io.open(JSON_PATH, encoding='utf-8').read()
    doc = json.loads(raw)
    sec = None
    for ch in doc['chapters']:
        for s in ch.get('sections', []):
            if s.get('section', '').startswith(SEC_PREFIX):
                sec = s
                break
        if sec:
            break
    if not sec:
        sys.exit('找不到 %s' % SEC_PREFIX)

    old = sec['html']
    m = re.search(r'<figure class="struct-fig boot-fig".*?</figure>', old, flags=re.S)
    if not m:
        sys.exit('旧正文里没有 boot-fig 图块，中止（避免误删配图）')
    figure = m.group(0)

    new = io.open(NEW_HTML, encoding='utf-8').read().replace('<!--BOOTFIG-->', figure)

    # ---------- 硬校验 ----------
    errs = []
    # 高亮锚要按「去标签后的可见文本」比对：<b>BIOS</b>初始化 在源码里不连续，
    # 但 textContent 是 "BIOS初始化"，高亮实际匹配的是后者
    plain_new = norm_text(new)
    for kw in HL_MUST:
        if re.sub(r'\s+', '', kw) not in plain_new:
            errs.append('划词高亮锚文字被删掉了：%r（高亮会被静默丢弃）' % kw)
    if new.count('boot-fig') != 1:
        errs.append('boot-fig 出现 %d 次，应为 1' % new.count('boot-fig'))
    # <p> 不能嵌在 <ul>/<table> 里
    for tag in ('ul', 'ol', 'table'):
        for mm in re.finditer(r'<%s\b[^>]*>(.*?)</%s>' % (tag, tag), new, flags=re.S):
            if re.search(r'<p\b', mm.group(1)):
                errs.append('<p> 嵌在 <%s> 内（会提前闭合，行号偏移）' % tag)
    # 表格 / 图 / h4 结构自检
    n_h4, n_tab, n_p = len(re.findall(r'<h4', new)), len(re.findall(r'<table', new)), len(re.findall(r'<p[ >]', new))
    if n_h4 < 6:
        errs.append('<h4> 只剩 %d 个，板块结构可能被削掉' % n_h4)

    print('旧：%d 字 / %d 个 <p> / %d 个 <table> / %d 个 <h4>' % (
        len(norm_text(old)), len(re.findall(r'<p[ >]', old)), len(re.findall(r'<table', old)), len(re.findall(r'<h4', old))))
    print('新：%d 字 / %d 个 <p> / %d 个 <table> / %d 个 <h4>' % (
        len(norm_text(new)), n_p, n_tab, n_h4))
    print('    精简 %d%%（%d → %d 字）' % (
        round((1 - len(norm_text(new)) / max(1, len(norm_text(old)))) * 100), len(norm_text(old)), len(norm_text(new))))
    for kw in HL_MUST:
        print('   高亮锚 %r：%s' % (kw, '在' if re.sub(r'\s+', '', kw) in plain_new else '❌ 缺失'))

    if errs:
        print('\n❌ 校验失败：')
        for e in errs:
            print('   ·', e)
        sys.exit(1)
    print('\n✅ 硬校验通过')

    if DRY:
        print('（--dry：不写盘）')
        return

    os.makedirs(BAK_DIR, exist_ok=True)
    shutil.copyfile(JSON_PATH, os.path.join(BAK_DIR, 'os_notes.before.json'))
    io.open(os.path.join(BAK_DIR, 'os15.before.html'), 'w', encoding='utf-8', newline='').write(old)

    sec['html'] = new
    # OS 的序列化口径：indent=1 + LF + 尾换行
    out = json.dumps(doc, ensure_ascii=False, indent=1) + '\n'
    io.open(JSON_PATH, 'w', encoding='utf-8', newline='\n').write(out)
    print('已写盘：%s' % JSON_PATH)
    print('备份：%s' % BAK_DIR)


if __name__ == '__main__':
    main()
