# -*- coding: utf-8 -*-
"""同步真题页的外链配图到 pwa/data/zt_img/（build_zt.py 的 IMG_MAP 与之对应）。

用法：python tools/sync_zt_imgs.py
源站部分题目/解析把配图写成 <img src="../../static/assets/..."> 或绝对 URL，
PWA 里必然 404、离线不可用。本脚本一次性把这些公开静态资源落到本地；
已存在且非空的文件默认跳过，重复执行安全。
"""
import io
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, 'pwa', 'data', 'zt_img')
CDN = 'https://www.408os.cn/static/assets/exam/'

# (源 URL, 本地文件名) —— 文件名必须与 build_zt.py 的 IMG_MAP 值一致。
FILES = [
    (CDN + '2012/2012_4.drawio.svg', 'zt_2012_4.svg'),
    (CDN + '2012/2012_27.drawio.svg', 'zt_2012_27.svg'),
    (CDN + '2012/2012_29.drawio.svg', 'zt_2012_29.svg'),
    (CDN + '2012/2012_44.drawio.svg', 'zt_2012_44.svg'),
    (CDN + '2015/6.drawio.svg', 'zt_2015_6.svg'),
    (CDN + '2016/2016_4.drawio.svg', 'zt_2016_4.svg'),
    (CDN + '2016/6.drawio.svg', 'zt_2016_6.svg'),
    (CDN + '2018/6.drawio.svg', 'zt_2018_6.svg'),
    (CDN + '2020/2020_41.drawio.svg', 'zt_2020_41.svg'),
    (CDN + '2023/2023_19_ans.jpg', 'zt_2023_19.jpg'),
    ('https://oss.408os.cn/image/2024-4-q.png', 'zt_2024_4.png'),
    (CDN + '2025/2025_3_sol.png', 'zt_2025_3.png'),
    (CDN + '2025/2025_20_raw.png', 'zt_2025_20.png'),
]

UA = {'User-Agent': 'Mozilla/5.0 (compatible; 408-quiz-offline/1.0)'}


def main():
    os.makedirs(DST, exist_ok=True)
    for url, name in FILES:
        p = os.path.join(DST, name)
        if os.path.exists(p) and os.path.getsize(p) > 0:
            print('skip  %-24s %d B' % (name, os.path.getsize(p)))
            continue
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
        if not data:
            raise RuntimeError('空响应: ' + url)
        with io.open(p, 'wb') as f:
            f.write(data)
        print('fetch %-24s %d B' % (name, len(data)))
    print('共 %d 张，目录 %s' % (len(FILES), DST))


if __name__ == '__main__':
    main()
