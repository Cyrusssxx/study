# -*- coding: utf-8 -*-
"""从 408os.cn 同步历年真题原始数据到 _zt_source/（不进 git）。

拉取内容（2009-2026 每年 47 题）：
  meta/meta_YYYY.json            题目元数据（题号/类型/分值/答案/静态文件路径）
  questions/YYYY/N.html          题干
  answers/YYYY/N.html            答案页
  analysis/YYYY/N.html           解析页

断点续传（已存在文件跳过），间隔 0.12s 礼貌抓取。
同步后运行 tools/build_zt.py 生成 pwa/data/zt/。

用法：python tools/sync_zt_source.py
"""
import io
import json
import os
import time
import urllib.request

BASE = 'https://www.408os.cn'
API = 'https://api.408os.cn/api/zt/question/list-with-details?year=%d'
YEARS = list(range(2009, 2027))
HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
       'Accept': '*/*', 'Referer': 'https://www.408os.cn/'}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_zt_source')


def fetch(url, retry=3, timeout=30):
    last = None
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers=HDR)
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:
            last = e
            time.sleep(0.8 * (i + 1))
    raise last


def fetch_meta():
    os.makedirs(os.path.join(SRC, 'meta'), exist_ok=True)
    for y in YEARS:
        out = os.path.join(SRC, 'meta', 'meta_%d.json' % y)
        if os.path.exists(out) and os.path.getsize(out) > 100:
            continue
        data = fetch(API % y)
        with io.open(out, 'wb') as f:
            f.write(data)
        n = len(json.loads(data.decode('utf-8'))['data'])
        print('[meta] %d -> %d 题' % (y, n))
        time.sleep(0.12)


def fetch_pages():
    ok = skip = fail = 0
    for y in YEARS:
        mf = os.path.join(SRC, 'meta', 'meta_%d.json' % y)
        if not os.path.exists(mf):
            print('[warn] 无元数据，跳过', y)
            continue
        items = json.load(io.open(mf, encoding='utf-8'))['data']
        for x in items:
            q = x['question']
            idx = q['questionIndex']
            for kind, key in [('questions', 'mdContent'), ('answers', 'answerText'), ('analysis', 'analysisText')]:
                path = q.get(key) or ''
                if not path:
                    continue
                d = os.path.join(SRC, kind, str(y))
                os.makedirs(d, exist_ok=True)
                out = os.path.join(d, '%d.html' % idx)
                if os.path.exists(out) and os.path.getsize(out) > 30:
                    skip += 1
                    continue
                try:
                    with io.open(out, 'wb') as f:
                        f.write(fetch(BASE + path))
                    ok += 1
                except Exception as e:
                    fail += 1
                    print('[FAIL]', kind, y, idx, str(e)[:60])
                time.sleep(0.12)
        print('[year] %d  done' % y)
    print('同步完成：新拉 %d / 跳过 %d / 失败 %d' % (ok, skip, fail))


if __name__ == '__main__':
    fetch_meta()
    fetch_pages()
