#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Service Worker 缓存版本构建脚本：根据预缓存资源内容自动生成 CACHE_VER 哈希。

背景（见 pwa/sw.js 头部注释）：
- pwa/sw.js 中的 CACHE_VER 是离线缓存命名空间；浏览器按字节比对 sw.js，
  内容变化即触发重新安装并刷新缓存。
- 之前是手写版本号（如 quiz408-v71），易忘改导致客户端长期用旧缓存。

本脚本在“构建期”自动计算哈希，替代手写：
1. 解析 pwa/sw.js 里的 PRECACHE 数组（单一真源，避免重复维护清单）。
2. 对每个预缓存资源读取磁盘内容，连同其相对路径一起送入 SHA-256。
3. 取哈希前 10 位，生成 CACHE_VER = 'quiz408-<hash10>'，写回 sw.js 的对应行。
4. 结果幂等：无论当前是占位符还是旧哈希，都会被整体替换为最新值。

注意：哈希覆盖的是 PRECACHE 列出的资源内容（不含 sw.js 自身），因此
题库/页面/样式/图标任一改动后重建，客户端都会拿到新缓存名并刷新。

用法：
    python tools/build_sw.py          # 计算并写入 pwa/sw.js
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根
PWA = os.path.join(ROOT, 'pwa')
SW = os.path.join(PWA, 'sw.js')
PREFIX = 'quiz408-'
HASH_LEN = 10


def main():
    if not os.path.exists(SW):
        print(f"[错误] 找不到 {SW}")
        sys.exit(1)

    text = open(SW, encoding='utf-8').read()

    # 解析 PRECACHE 数组块（单一真源）
    m = re.search(r'const PRECACHE\s*=\s*\[(.*?)\];', text, re.S)
    if not m:
        print('[错误] 未在 sw.js 中找到 PRECACHE 数组')
        sys.exit(1)
    entries = re.findall(r"'([^']+)'", m.group(1))
    if not entries:
        print('[错误] PRECACHE 为空')
        sys.exit(1)

    h = hashlib.sha256()
    missing = []
    for e in entries:
        p = os.path.join(PWA, e)
        h.update(e.encode('utf-8'))
        h.update(b'\0')
        if os.path.exists(p):
            h.update(open(p, 'rb').read())
        else:
            # 缺失文件仍计入路径扰动，使哈希随清单变化而改变；同时给出告警
            missing.append(e)

    short = h.hexdigest()[:HASH_LEN]
    new_ver = f"{PREFIX}{short}"

    new_text, n = re.subn(
        r"const CACHE_VER = '[^']*';",
        f"const CACHE_VER = '{new_ver}';",
        text,
    )
    if n != 1:
        print(f"[错误] 未匹配到唯一 CACHE_VER 行 (匹配数={n})")
        sys.exit(1)

    tmp = SW + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(new_text)
    os.replace(tmp, SW)

    print(f"[完成] CACHE_VER -> {new_ver}")
    print(f"        依据 {len(entries)} 个预缓存资源的 SHA-256 前 {HASH_LEN} 位生成")
    if missing:
        print(f"[警告] PRECACHE 中磁盘缺失文件（已计入哈希扰动，请补齐后重建）: {missing}")


if __name__ == '__main__':
    main()
