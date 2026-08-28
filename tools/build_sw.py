#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Service Worker 缓存版本构建脚本：按资源内容自动生成 APP_VER / DATA_VER / LAZY_VER 哈希。

背景（见 pwa/sw.js 头部注释）：
- sw.js 用三个命名空间隔离缓存：APP（应用外壳）/ DATA（数据文件）/ LAZY（懒加载资源）。
- 之前 CACHE_VER 把全部资源混在一起哈希，任一题库/笔记改动都让客户端重下 3.79MB。
- 拆分后：只改外壳 → DATA_VER 不变（数据零重下）；只改数据 → APP_VER 不变（外壳零重下）。
- 懒加载资源（algo_notes.json + 各科题图目录）不进任何预缓存清单，APP_VER/DATA_VER
  都不会因它变化；若沿用外壳或数据命名空间缓存优先，改动永远到不了客户端。故单独算 LAZY_VER。

本脚本在“构建期”自动计算三个哈希，替代手写：
1. 解析 sw.js 里的 APP_PRECACHE / DATA_PRECACHE / LAZY_PREFIXES 数组（双真源，避免重复维护清单）。
2. 对每个资源读取磁盘内容，连同相对路径一起送入 SHA-256（缺失文件仅扰动哈希）。
3. 取前 10 位，生成 quiz408-app-/data-/lazy-<h>，写回对应行。
4. 结果幂等：无论当前是占位符还是旧哈希，都被整体替换为最新值。

注意：哈希覆盖对应数组列出的资源内容（不含 sw.js 自身），因此任一资源改动后重建，
客户端都会拿到新缓存名并刷新该层。

用法：
    python tools/build_sw.py          # 计算并写入 pwa/sw.js
"""
import glob
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根
PWA = os.path.join(ROOT, 'pwa')
SW = os.path.join(PWA, 'sw.js')
PREFIX = 'quiz408-'
HASH_LEN = 10


def _hash_entries(entries):
    h = hashlib.sha256()
    missing = []
    for e in entries:
        p = os.path.join(PWA, e)
        h.update(e.encode('utf-8'))
        h.update(b'\0')
        if os.path.exists(p):
            h.update(open(p, 'rb').read())
        else:
            missing.append(e)  # 缺失文件仍计入路径扰动，使哈希随清单变化
    return h.hexdigest()[:HASH_LEN], missing


def _lazy_files(prefixes):
    """按 LAZY_PREFIXES 展开出实际文件列表：带 / 的是目录前缀（递归），否则是单个文件。

    返回 (相对 pwa/ 的正斜杠路径列表, 声明了但磁盘不存在的条目)。
    排序保证哈希稳定，与磁盘枚举顺序无关。
    """
    files, missing = [], []
    for pre in prefixes:
        rel = pre.rstrip('/')
        base = os.path.join(PWA, rel)
        if pre.endswith('/'):
            files.extend(
                os.path.relpath(p, PWA).replace(os.sep, '/')
                for p in glob.glob(os.path.join(base, '**', '*'), recursive=True)
                if os.path.isfile(p)
            )
            if not os.path.isdir(base):
                missing.append(pre)
        else:
            files.append(rel)
            if not os.path.isfile(base):
                missing.append(pre)
    return sorted(files), missing


def _hash_lazy(prefixes):
    """哈希懒加载层：路径 + 内容，任一文件改动即改变 LAZY_VER。"""
    files, missing = _lazy_files(prefixes)
    h = hashlib.sha256()
    for rel in files:
        h.update(rel.encode('utf-8'))
        h.update(b'\0')
        p = os.path.join(PWA, *rel.split('/'))
        h.update(open(p, 'rb').read())
    return h.hexdigest()[:HASH_LEN], len(files), missing


def _parse_array(text, name):
    m = re.search(r'const %s\s*=\s*\[(.*?)\];' % name, text, re.S)
    if not m:
        print('[错误] 未在 sw.js 中找到 %s 数组' % name)
        sys.exit(1)
    entries = re.findall(r"'([^']+)'", m.group(1))
    if not entries:
        print('[错误] %s 为空' % name)
        sys.exit(1)
    return entries


def _find_array(text, name):
    """同 _parse_array，但允许缺失（LAZY_PREFIXES 是可选项，缺了只警告不中断）。"""
    m = re.search(r'const %s\s*=\s*\[(.*?)\];' % name, text, re.S)
    if not m:
        return []
    return re.findall(r"'([^']+)'", m.group(1))


def main():
    if not os.path.exists(SW):
        print('[错误] 找不到 %s' % SW)
        sys.exit(1)

    text = open(SW, encoding='utf-8').read()

    app_entries = _parse_array(text, 'APP_PRECACHE')
    data_entries = _parse_array(text, 'DATA_PRECACHE')
    lazy_prefixes = _find_array(text, 'LAZY_PREFIXES')

    app_hash, app_missing = _hash_entries(app_entries)
    data_hash, data_missing = _hash_entries(data_entries)
    lazy_hash, lazy_count, lazy_missing = ('', 0, [])
    if lazy_prefixes:
        lazy_hash, lazy_count, lazy_missing = _hash_lazy(lazy_prefixes)

    new_app = '%sapp-%s' % (PREFIX, app_hash)
    new_data = '%sdata-%s' % (PREFIX, data_hash)
    new_lazy = '%slazy-%s' % (PREFIX, lazy_hash)

    text, na = re.subn(r"const APP_VER = '[^']*';", "const APP_VER = '%s';" % new_app, text)
    text, nd = re.subn(r"const DATA_VER = '[^']*';", "const DATA_VER = '%s';" % new_data, text)
    nl = 0
    if lazy_prefixes:
        text, nl = re.subn(r"const LAZY_VER = '[^']*';", "const LAZY_VER = '%s';" % new_lazy, text)
    if na != 1 or nd != 1 or (lazy_prefixes and nl != 1):
        print('[错误] 版本行匹配数异常 (APP=%d, DATA=%d, LAZY=%d)' % (na, nd, nl))
        sys.exit(1)

    tmp = SW + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, SW)

    print('[完成] APP_VER  -> %s  (依据 %d 个外壳资源)' % (new_app, len(app_entries)))
    print('[完成] DATA_VER -> %s  (依据 %d 个数据资源)' % (new_data, len(data_entries)))
    if lazy_prefixes:
        print('[完成] LAZY_VER -> %s  (依据 %d 个懒加载文件)' % (new_lazy, lazy_count))
    else:
        print('[警告] sw.js 未定义 LAZY_PREFIXES，LAZY_VER 未更新')
    if app_missing:
        print('[警告] APP_PRECACHE 磁盘缺失（已扰动哈希，请补齐）: %s' % app_missing)
    if data_missing:
        print('[警告] DATA_PRECACHE 磁盘缺失（已扰动哈希，请补齐）: %s' % data_missing)
    if lazy_missing:
        print('[警告] LAZY_PREFIXES 磁盘缺失: %s' % lazy_missing)


if __name__ == '__main__':
    main()
