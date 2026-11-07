# -*- coding: utf-8 -*-
"""生成真题大题的知识点跳转表（data/zt_bigq_kp.json）

为什么大题要单独做：
  选择题里有 637/720 映射到题库（qid），可直接从题库取 section/subsection 得到精确锚点；
  大题则**基本没有映射**（每年 7 道里只有 1 道 DS 算法题映射，co/os/cn 全部未映射），
  题库里也没有这些题目，无法靠映射找节。

现在的做法（2026-11-07 起）：
  ① 全部 126 道大题按题干内容人工审定，落在 notes/{科目}_notes.json 的
     **节(X.Y) / 小节(X.Y.Z) / 章(X)** 编号上，源表见 tools/bigq_kp_manual.json。
     编号由 notes.html 在 loadNotes 里改写成真实节/小节名，再走精确落位。
     源表里的 subject 可覆盖 zt 原始 sid：例如 2014-42 题干是 OSPF 路由协议，
     原始数据标成 ds，实际属计网 cn（4.4.4 OSPF）。
  ② 选择题仍走题库现取（不重复存一份）。
  ③ 源表缺项时才退回旧逻辑：DS 算法题由 note_alias + 王道书号取节级锚点、
     新题退打卡表模块关键词，其余落科目级。

输出：pwa/data/zt_bigq_kp.json（indent=1、LF、无尾换行）
      { "年份": { "题号": { "sub":"co", "goto":"", "mode":"bank"|"sec"|"kw"|"sub" } } }

用法：python tools/build_zt_bigq_kp.py
"""
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'pwa', 'data')
SUBJECTS = ['ds', 'co', 'os', 'cn']


def load(name):
    with io.open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def build_code_sections():
    """ds_code / ds_code_extra: id → 节锚点（王道书 X.Y.Z_大题_N → 'X.Y'）"""
    out = {}
    for name in ('ds_code.json', 'ds_code_extra.json'):
        try:
            data = load(name)
        except Exception:
            continue
        for q in data.get('questions') or []:
            m = re.match(r'^王道书\s*(\d+)\.(\d+)\.\d+', q.get('source') or '')
            if m:
                out[q['id']] = '%s.%s' % (m.group(1), m.group(2))
    return out


def build_daka_keyword():
    """ds_daka: 标准题 id（2026年408真题第41题 → ds_daka_2026_41）→ 模块关键词"""
    out = {}
    try:
        data = load('ds_daka.json')
    except Exception:
        return out
    for c in data.get('questions') or []:
        m = re.match(r'^(\d{4})年408真题第(\d+)题', c.get('real') or '')
        mod = c.get('module') or ''
        if not m or not mod or '真题训练' in mod:
            continue                      # 「真题训练」模块不带知识域，跳过
        kw = re.sub(r'^基于', '', mod).split('“')[-1].split('”')[0] if '“' in mod else mod
        out['ds_daka_%s_%s' % (m.group(1), m.group(2))] = kw
    return out


def main():
    code_sec = build_code_sections()
    daka_kw = build_daka_keyword()
    alias = load('note_alias.json')
    canon2local = {}
    for local, canon in alias.items():
        canon2local.setdefault(canon, []).append(local)

    with io.open(os.path.join(ROOT, 'tools', 'bigq_kp_manual.json'), encoding='utf-8') as f:
        manual = json.load(f)

    zt_dir = os.path.join(DATA, 'zt')
    years = sorted(int(f[3:-5]) for f in os.listdir(zt_dir) if re.match(r'^zt_\d{4}\.json$', f))
    out, stat = {}, {'manual': 0, 'sec': 0, 'kw': 0, 'sub': 0, 'choice': 0}
    missing = []

    for y in years:
        table = {}
        for it in load(os.path.join('zt', 'zt_%d.json' % y))['items']:
            i, sid = it['i'], it['sid']
            if it['t'] == 1:
                # 选择题只要有题库映射，章节锚点由页面从题库字段现取（避免与题库重复存一份）；
                # 没有映射的选择题不列入，页面据此不显示知识点入口。
                if it.get('qid'):
                    table[str(i)] = {'sub': sid, 'goto': '', 'mode': 'bank'}
                    stat['choice'] += 1
                continue

            # ① 人工审定的章节锚点优先（覆盖全部 126 道大题）
            mrec = (manual.get(str(y)) or {}).get(str(i))
            if mrec:
                sub, goto = mrec.split(':', 1)
                table[str(i)] = {'sub': sub, 'goto': goto, 'mode': 'sec'}
                stat['manual'] += 1
                continue

            # ② 源表缺项才退回旧逻辑，并把缺口报出来，避免静默退化成科目首页
            missing.append('%d-%d(%s)' % (y, i, sid))
            rec = None
            for local in canon2local.get('zt%d_%d' % (y, i), []):
                if local in code_sec:
                    rec = {'sub': 'ds', 'goto': code_sec[local], 'mode': 'sec'}
                    stat['sec'] += 1
                    break
                if local in daka_kw:
                    rec = {'sub': 'ds', 'goto': daka_kw[local], 'mode': 'kw'}
                    stat['kw'] += 1
                    break
            if rec is None:
                rec = {'sub': sid if sid in SUBJECTS else 'ds', 'goto': '', 'mode': 'sub'}
                stat['sub'] += 1
            table[str(i)] = rec
        out[str(y)] = table

    p = os.path.join(DATA, 'zt_bigq_kp.json')
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1))

    n = sum(len(v) for v in out.values())
    print('写出 %s：%d 年 / %d 条（含选择题 %d）' % (p, len(out), n, stat['choice']))
    print('大题来源：人工章节锚点 %(manual)d ｜ 旧书号 %(sec)d ｜ 模块关键词 %(kw)d ｜ 科目级 %(sub)d' % stat)
    if missing:
        print('⚠ 人工表缺 %d 题：%s' % (len(missing), ', '.join(missing)))


if __name__ == '__main__':
    main()
