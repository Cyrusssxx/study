# -*- coding: utf-8 -*-
"""v3 驱动器：对 11 个 v2 失败 + 14 个缺失题面图（共 25 张）调用子进程裁图；
缺失题面图的再插入 <img>。块范围用各节 本节习题精选/答案与解析 的页区间。"""
import json, re, os, sys, subprocess
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
PY = r'C:/Users/cjx/.workbuddy/binaries/python/versions/3.13.12/python.exe'
PDF = r'D:/ai code/408教材/2027王道《计算机网络》考研复习指导 (王道论坛) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
IMG_STYLE = 'max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;'

doc = fitz.open(PDF)
# 每节习题块页范围
blocks = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    for ln in t.split('\n'):
        s = ln.strip()
        m = re.match(r'^(\d\.\d+\.\d+)\s+(本节习题精选|答案与解析)$', s)
        if m: blocks.append((i, m.group(1), m.group(2)))
blocks.sort()
exer = {}
for idx, (pg, sec, typ) in enumerate(blocks):
    if typ == '本节习题精选':
        end = None
        for j in range(idx + 1, len(blocks)):
            if blocks[j][2] == '答案与解析' and blocks[j][1].startswith(sec.rsplit('.', 1)[0]):
                end = blocks[j][0]; break
        exer[sec.rsplit('.', 1)[0]] = (pg, end)

def insert_img(content, num):
    for marker in ['在下图所示的', '在下图所示，', '在下图所示。', '在下图所示', '在下图中', '下图为', '下图是', '下图中', '右图描述', '下图描述', '右图是', '右图', '如下图所示，', '如下图所示。', '如下图所示', '如下图，', '如下图。', '如下图', '如图下所示', '如图所示，', '如图所示。', '如图所示', '如图，', '如图。', '如图']:
        if marker in content:
            img = f'<br><img src="data/cn_figs/cn_{num:04d}.png" alt="cn题图" style="{IMG_STYLE}" />'
            return content.replace(marker, marker + img, 1), True
    return content, False

def main():
    d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
    qs = d['questions']
    # 目标：v2 失败（有 img） + 缺失题面图（无 img 但有下图/如图）
    withimg = {q['id'] for q in qs if 'data/cn_figs/' in (q.get('content') or '')}
    targets = [q for q in qs
               if ('data/cn_figs/' in (q.get('content') or '') or '下图' in (q.get('content') or '') or '如图' in (q.get('content') or ''))
               and (q['id'] not in withimg or q['content'].count('data/cn_figs/') == 0 or q['number'] in [])]  # 全部含图题
    # 简化为：所有"含下图/如图 且 (无img 或 题面 img 数==0)"的题 + 所有有 img 的题重跑
    targets = [q for q in qs if ('下图' in (q.get('content') or '') or '如图' in (q.get('content') or ''))]
    print('目标题数:', len(targets), flush=True)
    ok = []; fail = []
    helper = os.path.join(ROOT, 'tools/_cn_crop_one.py')
    for idx, q in enumerate(targets):
        # 该题所属节习题块
        sec = q.get('section') or ''
        m = re.match(r'^(\d)\.(\d+)', sec)
        key = f'{m.group(1)}.{m.group(2)}' if m else None
        blk = exer.get(key)
        qno = q.get('_pdf_qno')
        if not blk or not qno:
            fail.append((q['id'], f'no_block key={key} qno={qno}')); continue
        out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
        # 搜索范围含答案页（跨页题在答案页顶部），子进程页内遇'答案与解析'即停
        b1 = blk[1] if blk[1] is not None else blk[1]
        payload = json.dumps({'block0': blk[0], 'block1': b1, 'qno': qno,
                              'content': q.get('content') or '', 'options': q.get('options') or {}, 'out': out})
        print(f'[{idx+1}/{len(targets)}] {q["id"]} (节{key} 题{qno}) ...', end=' ', flush=True)
        try:
            r = subprocess.run([PY, helper], input=payload.encode('utf-8'), capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            fail.append((q['id'], 'timeout')); print('FAIL timeout'); continue
        if r.returncode != 0:
            fail.append((q['id'], f'rc={r.returncode}')); print(f'FAIL rc={r.returncode}'); continue
        result = None
        for line in r.stdout.decode('utf-8', errors='ignore').strip().split('\n'):
            line = line.strip()
            if line.startswith('{'):
                try: result = json.loads(line)
                except Exception: pass
        if not result or not result.get('ok'):
            why = (result or {}).get('why', 'no_json')
            fail.append((q['id'], why)); print(f'FAIL {why}'); continue
        # 有 img 覆盖即可；缺失的插 <img>
        if 'data/cn_figs/' not in (q.get('content') or ''):
            new_content, done = insert_img(q['content'], q['number'])
            if done:
                q['content'] = new_content
                ok.append((q['id'], result.get('page'), result.get('size')))
                print(f"OK p{result.get('page')} {result.get('size')} (wired)")
            else:
                # marker 没匹配上，但图已成功裁出 → 保留图不删，等手工补 <img>
                fail.append((q['id'], 'no_marker_kept_crop'))
                print(f"FAIL no_marker（crop 已保留 cn_{q['number']:04d}.png）")
    out_json = json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n'
    open(os.path.join(ROOT, 'pwa/data/cn.json'), 'w', encoding='utf-8', newline='\n').write(out_json)
    print(f'\n成功 {len(ok)} / 失败 {len(fail)}', flush=True)
    for r in ok: print(f'  OK {r}')
    for r in fail: print(f'  FAIL {r}')

if __name__ == '__main__':
    main()
