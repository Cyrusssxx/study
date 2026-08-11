#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证两个 notes.html 文件中的 JS 语法"""
import re
import sys

def extract_js(html_path):
    """提取 HTML 中 <script> 标签内的 JS 代码"""
    with open(html_path, encoding='utf-8') as f:
        content = f.read()
    
    # 提取最后一个 <script>...</script> 块（内联脚本）
    scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
    return scripts[-1] if scripts else ''

def validate_js_syntax(js_code, label):
    """用 js 语法检查（通过 Node.js --check）"""
    import tempfile, os
    # 写入临时 .js 文件
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8')
    tmp.write(js_code)
    tmp.close()
    
    import subprocess
    try:
        result = subprocess.run(
            ['node', '--check', tmp.name],
            capture_output=True, text=True, encoding='utf-8'
        )
        if result.returncode == 0:
            print(f"  [{label}] JS 语法检查通过")
            return True
        else:
            print(f"  [{label}] JS 语法错误:")
            print(f"    {result.stderr.strip()}")
            return False
    except FileNotFoundError:
        print(f"  [{label}] Node.js 不可用，跳过语法检查")
        return None
    finally:
        os.unlink(tmp.name)

for path, label in [
    ('templates/notes.html', 'Flask版'),
    ('pwa/notes.html', 'PWA版')
]:
    js = extract_js(path)
    if js:
        validate_js_syntax(js, label)
    else:
        print(f"  [{label}] 未找到 JS 代码")
