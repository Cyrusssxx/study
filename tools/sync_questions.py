#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库单源构建脚本：以 pwa/data 为唯一真源，生成 data/questions 镜像。

设计（见 config.QUESTIONS_DIR 与 项目评估_增量_20260814.md）：
- 真源（canonical）：pwa/data/{cn,co,ds,ds_daka,os}.json
  由上游管线写入：parse_pdf / add_chapters / generate_answers /
  fill_missing_answers / fmt_code_questions --apply / extract_daka
- 构建产物（derived）：data/questions/{cn,co,ds,ds_daka,os}.json
  本脚本从真源复制并统一 indent=2 规范化生成；已加入 .gitignore，不手工维护。

用法：
    python tools/sync_questions.py          # 预览：对比真源与当前镜像差异
    python tools/sync_questions.py --apply  # 生成 data/questions/ 镜像
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根
CANON_DIR = os.path.join(ROOT, 'pwa', 'data')
OUT_DIR = os.path.join(ROOT, 'data', 'questions')
SUBJECTS = ['cn', 'co', 'ds', 'ds_daka', 'os']


def norm(obj):
    """统一规范化后的 JSON 文本，用于稳定比较/写出。"""
    return json.dumps(obj, ensure_ascii=False, indent=2)


def main():
    apply = '--apply' in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    changed = 0
    for s in SUBJECTS:
        src = os.path.join(CANON_DIR, f'{s}.json')
        dst = os.path.join(OUT_DIR, f'{s}.json')
        if not os.path.exists(src):
            print(f"[跳过] 真源缺失: {src}")
            continue
        canon = json.load(open(src, encoding='utf-8'))
        # 字段完整性校验
        if isinstance(canon, dict) and 'questions' in canon:
            qs = canon['questions']
        elif isinstance(canon, list):
            qs = canon
        else:
            qs = canon.get('questions', canon.get('data', []))
        n = len(qs)
        canon_text = norm(canon)
        if apply:
            tmp = os.path.join(OUT_DIR, f'.{s}.tmp.json')
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(canon_text)
            os.replace(tmp, dst)
            print(f"[生成] {s}.json  {n} 题 -> {dst}")
            changed += 1
        else:
            if os.path.exists(dst):
                cur = json.load(open(dst, encoding='utf-8'))
                same = norm(cur) == canon_text
                print(f"[预览] {s}.json  真源 {n} 题  | 镜像{'一致' if same else '不一致(需 --apply 更新)'}")
                if not same:
                    changed += 1
            else:
                print(f"[预览] {s}.json  真源 {n} 题  | 镜像不存在(需 --apply 生成)")
                changed += 1
    if apply:
        print(f"\n已生成 {changed} 个镜像文件于 {OUT_DIR}")
    else:
        print(f"\n预览模式：{changed} 个文件需更新。加 --apply 生成 data/questions/")


if __name__ == '__main__':
    main()
