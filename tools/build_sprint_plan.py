# -*- coding: utf-8 -*-
"""考研冲刺计划页生成管线（2026-10-13）
源（真源）：archive/plan_source.html —— 计划内容以它为唯一来源，改内容改这里
输出：
  ① E:/Desktop/考研冲刺计划.html（桌面版，file:// 直接打开）
  ② pwa/plan.html（站内版，index.html「考研冲刺计划」板块入口）
改造内容：
1) 去掉单词环节（表格 / legend / 时间模板 / 机动日文案）
2) 数学每日任务统一简写为「30题」（一刷期题号区间）
3) 阅读重做按年份分组、隔天一年份（避开机动日顺延），收官仍为 11/5
4) 「✓ 打卡 / 我的备注」列：勾选行完成 + 行内备注（localStorage 持久化，含清空）
幂等：源固定取 archive/plan_source.html，可重复执行
"""
import io
import os
import re

DESKTOP = r'E:\Desktop\考研冲刺计划.html'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'archive', 'plan_source.html')
PWA_OUT = os.path.join(ROOT, 'pwa', 'plan.html')

src = io.open(SRC, encoding='utf-8').read()

# 阅读重做新排期：隔天一次，一次一个年份的全部重做篇目；机动日 10/28 跳过顺延
READ_MAP = {
    '10/16': '2011（T4）',
    '10/18': '2012（T4）',
    '10/20': '2014（T2、T4）',
    '10/22': '2015（T1、T2、T3）',
    '10/24': '2016（T3、新题型）',
    '10/26': '2017（T3、T4）',
    '10/30': '2018（T3、新题型）',
    '11/1': '2019（T1、T3）',
    '11/3': '2020（T1、T3、新题型）',
    '11/5': '2021（T3、新题型）',
}

# ---------- 1. legend / 顶部说明 ----------
src = src.replace('实习日志 10/12–15（只保单词）', '实习日志 10/12–15')
src = src.replace('        <li>单词 30′ 拆进碎片时间（早/午/晚各 10′）</li>\n', '')

# ---------- 2. guide 卡片文案 ----------
src = src.replace(
    '<h4>数学 747 题：怎么控制量</h4>',
    '<h4>数学：每日 30 题（747 题排程）</h4>')
src = src.replace(
    '<li>每日题号已排好（20–21 题 / 约 2.5h），做完打勾，<b>11/23 收官</b></li>',
    '<li>每日只记一件事：<b>30 题</b>，做完打勾，<b>11/23 收官</b></li>')
src = src.replace(
    '<h4>英语节奏（顶多一天一篇）</h4>',
    '<h4>英语节奏</h4>')
src = src.replace(
    '<li>阅读只重做正确率偏低的 20 篇（10/16 起一天 1 篇，<b>11/5 收官</b>）</li>',
    '<li>阅读重做的 20 篇按<b>年份分组</b>、<b>隔天做一年份</b>（10/16 起，遇机动日顺延，<b>11/5 收官</b>）</li>')

# ---------- 3. 逐行改造表格：去单词 / 数学 30题 / 阅读重排 / 打卡列 ----------
CK_TD = ('<td class="ck"><input type="checkbox" class="sprint-ck" aria-label="完成打卡">'
         '<div class="mynote" contenteditable="true" data-ph="备注…"></div></td>')


def fix_row(m):
    row = m.group(0)
    is_head = '<th>' in row
    dm = re.search(r'<b>(\d+/\d+)</b>', row)
    date = dm.group(1) if dm else ''

    # 表头行：追加打卡列表头
    if is_head:
        return row.replace('</tr>', '<th class="ck">✓ 打卡 / 我的备注</th></tr>')

    # 数学列：一刷期题号区间 → 30题
    def fix_math(mm):
        inner = mm.group(1)
        if re.search(r'第\s*\d+\s*[–\-]\s*\d+\s*题', inner):
            return '<td class="cma">30题</td>'
        return mm.group(0)
    row = re.sub(r'<td class="cma">(.*?)</td>', fix_math, row, flags=re.S)

    # 英语列：去单词 / 重建阅读重做
    def fix_en(mm):
        inner = mm.group(1)
        if '机动' in inner:
            return '<td class="cen">机动</td>'
        items = [x.strip() for x in inner.split(' + ')]
        keep = [it for it in items if not it.startswith('单词') and not it.startswith('阅读重做')]
        parts = []
        if date in READ_MAP:
            parts.append('阅读重做：' + READ_MAP[date])
        parts += keep
        if not parts:
            return '<td class="cen">—</td>'
        return '<td class="cen">' + ' + '.join(parts) + '</td>'
    row = re.sub(r'<td class="cen">(.*?)</td>', fix_en, row, flags=re.S)

    # 数据行：加 data-key（状态 key）+ 追加打卡/备注单元格
    if date:
        row = re.sub(r'^<tr([^>]*)>', lambda mm: '<tr%s data-key="%s">' % (mm.group(1), date), row)
        row = row.replace('</tr>', CK_TD + '</tr>')
    return row


src = re.sub(r'<tr[^>]*>.*?</tr>', fix_row, src, flags=re.S)

# ---------- 4. 新增样式（打卡列 / 备注 / 完成态 / 进度） ----------
CK_CSS = """  /* 打卡列：勾选 + 我的备注（localStorage 持久化；桌面版与站内版各自独立存储） */
  th.ck, td.ck { width: 138px; }
  td.ck { white-space: normal; }
  .sprint-ck { width: 15px; height: 15px; cursor: pointer; accent-color: var(--phB); vertical-align: middle; }
  .mynote { margin-top: 6px; min-height: 20px; font-size: 12.5px; line-height: 1.5;
            color: var(--muted); border-bottom: 1px dashed var(--line); outline: none;
            word-break: break-word; transition: color .15s ease, border-color .15s ease; }
  .mynote:hover, .mynote:focus { color: var(--text); border-bottom-color: var(--primary); }
  .mynote:empty::before { content: attr(data-ph); color: var(--muted); opacity: .55; }
  .mynote:focus:empty::before { content: none; }
  tr.done td:not(.ck) { opacity: .5; }
  tr.done .dt b::after { content: " ✓"; color: var(--phB); }
  .sprint-progress { margin-top: 12px; font-size: 13.5px; color: var(--muted); }
  .sprint-progress b { color: var(--phB); font-size: 15px; }
  .sprint-progress .reset { margin-left: 12px; font-size: 12px; color: var(--muted);
                            text-decoration: underline; cursor: pointer; }
  @media (max-width: 760px) { td.ck::before { content: "打卡："; color: var(--muted); } }
  @media print { .mynote { border-bottom: none; } .sprint-progress .reset { display: none; } }
"""
src = src.replace('</style>', CK_CSS + '</style>')

# ---------- 5. 进度行（legend 之后） ----------
src = src.replace(
    '</header>',
    '    <div class="sprint-progress" id="sprintProgress">已完成 <b>0</b> / 68 天</div>\n  </header>', 1)

# ---------- 6. 打卡 / 备注 JS ----------
CK_JS = """<script>
/* 打卡 + 我的备注：localStorage 持久化（sprint_done / sprint_notes；清空按钮带确认） */
(function () {
  var DK = 'sprint_done', NK = 'sprint_notes';
  var done = {}, notes = {};
  try { done = JSON.parse(localStorage.getItem(DK) || '{}') || {}; } catch (e) { done = {}; }
  try { notes = JSON.parse(localStorage.getItem(NK) || '{}') || {}; } catch (e) { notes = {}; }
  var save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-key]'));
  function prog() {
    var n = rows.filter(function (r) { return r.classList.contains('done'); }).length;
    var el = document.getElementById('sprintProgress');
    if (!el) return;
    el.innerHTML = '已完成 <b>' + n + '</b> / ' + rows.length + ' 天'
      + '　<span class="reset" id="sprintReset">清空勾选与备注</span>';
    document.getElementById('sprintReset').onclick = function () {
      if (!confirm('清空全部勾选与我的备注？')) return;
      done = {}; notes = {};
      save(DK, done); save(NK, notes);
      rows.forEach(function (r) {
        r.classList.remove('done');
        var c = r.querySelector('.sprint-ck'); if (c) c.checked = false;
        var n2 = r.querySelector('.mynote'); if (n2) n2.textContent = '';
      });
      prog();
    };
  }
  rows.forEach(function (tr) {
    var k = tr.dataset.key;
    var cb = tr.querySelector('.sprint-ck');
    var nt = tr.querySelector('.mynote');
    if (cb) {
      cb.checked = !!done[k];
      tr.classList.toggle('done', cb.checked);
      cb.addEventListener('change', function () {
        if (cb.checked) done[k] = 1; else delete done[k];
        tr.classList.toggle('done', cb.checked);
        save(DK, done); prog();
      });
    }
    if (nt) {
      nt.textContent = notes[k] || '';
      var t = null;
      var flush = function () {
        if (nt.innerHTML === '<br>') nt.innerHTML = '';
        var v = (nt.textContent || '').replace(/\\s+/g, ' ').trim();
        if (v) notes[k] = v; else delete notes[k];
        save(NK, notes);
      };
      nt.addEventListener('input', function () { clearTimeout(t); t = setTimeout(flush, 300); });
      nt.addEventListener('blur', function () { clearTimeout(t); flush(); });
      nt.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nt.blur(); } });
    }
  });
  prog();
})();
</script>
"""

# ---------- 7. 校验 ----------
assert '单词' not in src, '仍有单词残留'
assert '·T' not in src and '·新题型' not in src, '仍有旧阅读格式残留'
n_ck = len(re.findall(r'class="sprint-ck"', src))
n_key = len(re.findall(r'data-key="', src))
n_th = len(re.findall(r'<th class="ck">', src))
assert n_ck == 68 and n_key == 68, '打卡行数应为 68，实际 %d / %d' % (n_ck, n_key)
assert n_th == 10, '10 周表头各一列，实际 %d' % n_th

# ---------- 8. 落地两份 ----------
desktop_out = src.replace('</body>', CK_JS + '</body>')
io.open(DESKTOP, 'w', encoding='utf-8', newline='').write(desktop_out)

pwa = desktop_out
pwa = pwa.replace(
    '<h1>考研冲刺计划</h1>',
    '<h1>考研冲刺计划 <a id="backHome" href="index.html" style="display:none;font-size:14px;font-weight:400;color:var(--primary);text-decoration:none;margin-left:8px">← 返回首页</a></h1>')
pwa = pwa.replace(
    '</body>',
    "<script>if (location.protocol === 'http:' || location.protocol === 'https:') { var bh = document.getElementById('backHome'); if (bh) bh.style.display = 'inline'; }</script>\n</body>")
io.open(PWA_OUT, 'w', encoding='utf-8', newline='').write(pwa)

print('done; desktop=%d bytes, pwa=%d bytes; rows=%d, thead=%d' % (len(desktop_out), len(pwa), n_ck, n_th))
