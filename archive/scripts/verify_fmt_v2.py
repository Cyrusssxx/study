# -*- coding: utf-8 -*-
import io
import json
import re
import sys
from html.parser import HTMLParser

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'source'}
D = json.load(io.open('pwa/data/notes/co_notes.json', encoding='utf-8'))


class Checker(HTMLParser):
    def __init__(self, sec):
        HTMLParser.__init__(self, convert_charrefs=False)
        self.sec = sec
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            self.errors.append('mismatch </%s> at %s, stack top: %s' % (tag, self.getpos(), self.stack[-3:]))


bad = 0
for ch in D['chapters']:
    for s in ch['sections']:
        html = s['html']
        c = Checker(s['section'])
        c.feed(html)
        c.close()
        if c.stack or c.errors:
            bad += 1
            print('== section', s['section'], 'unbalanced')
            for e in c.errors[:10]:
                print('   ', e)
            if c.stack:
                print('    leftover stack:', c.stack[:10])
print('sections with HTML errors:', bad)

# check no <br> inside table, no </b> without <b>, etc.
issues = 0
for ch in D['chapters']:
    for s in ch['sections']:
        html = s['html']
        # <br> inside <table>
        for m in re.finditer(r'<table>.*?</table>', html, re.S):
            if '<br' in m.group(0):
                issues += 1
                print('BR IN TABLE:', s['section'])
        # 考点追踪
        if '考点追踪' in html:
            issues += 1
            print('KAODIAN TRACE:', s['section'])
print('extra issues:', issues)
