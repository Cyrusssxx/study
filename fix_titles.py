#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
转换时补上 title 和 source 字段
"""
import json, sys, os
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

NOTES_DIR = r'D:/ai code/408-quiz-app/data/notes'

TITLES = {
    'co': '计算机组成原理',
    'ds': '数据结构',
    'cn': '计算机网络',
    'os': '操作系统',
}

SOURCES = {
    'co': '袁春风《计算机组成原理》第3版 + 王道2027',
    'ds': '王道2027《数据结构考研复习指导》',
    'cn': '王道2027《计算机网络考研复习指导》',
    'os': '王道2027《操作系统考研复习指导》',
}

def fix(subj):
    path = os.path.join(NOTES_DIR, f'{subj}_notes.json')
    data = json.load(open(path, 'r', encoding='utf-8'))
    
    # 添加 title 和 source
    data['title'] = TITLES.get(subj, subj.upper())
    data['source'] = SOURCES.get(subj, '')
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'{subj.upper()}: title="{data["title"]}", source="{data["source"]}"')

if __name__ == '__main__':
    for subj in ['co', 'ds', 'cn', 'os']:
        fix(subj)
