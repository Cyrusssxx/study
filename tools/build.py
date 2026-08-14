#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
408-quiz PWA 统一构建入口（本地静态托管前的可选步骤）。

串联两个构建动作：
1. sync_questions.py --apply  以 pwa/data 为唯一真源，生成 data/questions 镜像。
2. build_sw.py                依据预缓存资源内容自动生成 sw.js 的 CACHE_VER 哈希。

两个脚本均幂等，可反复运行。静态服务 pwa/ 前执行一次本脚本即可保证
题库镜像与离线缓存版本都是最新的。

用法：
    python tools/build.py
"""
import subprocess
import sys

ROOT = __file__ and __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__)))


def run(script):
    import os
    path = os.path.join(ROOT, script)
    print(f"\n=== {script} ===")
    rc = subprocess.call([sys.executable, path, '--apply'] if script.endswith('sync_questions.py') else [sys.executable, path])
    if rc != 0:
        print(f"[失败] {script} 返回 {rc}")
        sys.exit(rc)


def main():
    run('tools/sync_questions.py')
    run('tools/build_sw.py')
    print("\n[完成] 构建结束：题库镜像与 SW 缓存版本均已刷新。")


if __name__ == '__main__':
    main()
