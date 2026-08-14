# -*- coding: utf-8 -*-
"""清理解析中误混入的下一节教材正文。

成因：某些小节的答案区没有"综合应用题"标记收尾，提取状态机把下一节
教材正文全部累进了该节最后一条解析。特征：解析中出现以正文标题
（如"3.2主存储器"、"第4章…"）开头的段落，其后全是教材内容。

处理：按 <p> 段落切分，找到首个标题段落，从该段起全部截掉。
仅当截掉部分超过300字才执行（真实污染都是数千字），否则只记录不动。
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / 'data' / 'questions'
OUT = Path(__file__).parent / 'clean_long_out.txt'

# 与 extract_explanations_ocr.py 的 SECTION_HEAD 一致（并扩展支持带英文的标题如"5.2UDP"/"7.2I/O接口"）
HEAD = re.compile(r'^(第\d+章|[A-Za-z/]{0,10}\d{1,2}\.\d{1,2}(\.\d{1,2})?(?![节式])[A-Za-z\u4e00-\u9fa5])')
# 王道章末栏目/书店水印：同样是正文混入的起点
MARKER = re.compile(r'^(归纳总结|思维拓展|购买王道书|【考纲内容】|【知识框架】|【复习提示】)')
P_SPLIT = re.compile(r'<p>(.*?)</p>', re.S)

lines_out = []


def log(s):
    lines_out.append(s)
    print(s)


total_fixed = 0
for subj in ['os', 'ds', 'co', 'cn']:
    fp = DATA / f'{subj}.json'
    data = json.loads(fp.read_text(encoding='utf-8'))
    questions = data['questions'] if isinstance(data, dict) else data
    fixed = 0
    for q in questions:
        expl = q.get('explanation') or ''
        if not expl:
            continue
        paras = P_SPLIT.findall(expl)
        cut_idx = None
        for i, p in enumerate(paras):
            if i > 0 and (HEAD.match(p) or MARKER.match(p) or '本节习题精选' in p):
                cut_idx = i
                break
        if cut_idx is None:
            continue
        kept = paras[:cut_idx]
        dropped_len = sum(len(p) for p in paras[cut_idx:])
        if dropped_len <= 300:
            log(f"[疑似-未处理] {q['id']} 截点段落开头: {paras[cut_idx][:40]!r} 拟删{dropped_len}字")
            continue
        q['explanation'] = ''.join(f'<p>{p}</p>' for p in kept)
        fixed += 1
        log(f"[已截断] {q['id']} 保留{sum(len(p) for p in kept)}字/删除{dropped_len}字, "
            f"删除起始: {paras[cut_idx][:40]!r}")
    if fixed:
        fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    log(f"== {subj}: 修复 {fixed} 题 ==")
    total_fixed += fixed

log(f"\n合计修复 {total_fixed} 题")
OUT.write_text('\n'.join(lines_out), encoding='utf-8')
