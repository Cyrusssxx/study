# -*- coding: utf-8 -*-
"""为 14 道"题面有下图但无 <img>"的题裁图并插入 <img>。
find_zone + crop 全部在子进程 tools/_cn_crop_one.py 中（通过 stdin 传 JSON），
子进程崩溃只杀自身，父进程用 subprocess 隔离。"""
import json, re, os, sys, subprocess
import pymupdf as fitz

ROOT = r'D:/ai code/408-quiz'
PY = r'C:/Users/cjx/.workbuddy/binaries/python/versions/3.13.12/python.exe'
HDR_H = 60
IMG_STYLE = 'max-width:100%;margin:8px 0;border:1px solid #ddd;border-radius:4px;'

def insert_img(content):
    for marker in ['如下图所示，', '如下图所示，', '如下图所示', '如下图，', '如下图', '如图所示，', '如图所示', '如图，', '如图']:
        if marker in content:
            return content.replace(marker, marker + f'<br><img src="data/cn_figs/placeholder.png" alt="cn题图" style="{IMG_STYLE}" />', 1), marker
    return content, None

def main():
    d = json.load(open(os.path.join(ROOT, 'pwa/data/cn.json'), encoding='utf-8'))
    qs = d['questions']
    targets = [q for q in qs if 'data/cn_figs/' not in (q.get('content') or '') and ('下图' in (q.get('content') or '') or '如图' in (q.get('content') or ''))]
    print('目标题数:', len(targets), flush=True)
    ok=[]; fail=[]
    helper = os.path.join(ROOT, 'tools/_cn_crop_one.py')
    for idx, q in enumerate(targets):
        qid = q['id']
        out = os.path.join(ROOT, f"pwa/data/cn_figs/cn_{q['number']:04d}.png")
        payload = json.dumps({'id': qid, 'content': q.get('content') or '', 'options': q.get('options') or {}, 'out': out})
        print(f'[{idx+1}/{len(targets)}] {qid} ...', end=' ', flush=True)
        try:
            r = subprocess.run([PY, helper], input=payload.encode('utf-8'), capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            fail.append((qid, 'timeout')); print('FAIL timeout'); continue
        if r.returncode != 0:
            fail.append((qid, f'rc={r.returncode}')); print(f'FAIL rc={r.returncode}'); continue
        # 解析最后一行 JSON
        result = None
        for line in r.stdout.decode('utf-8', errors='ignore').strip().split('\n'):
            line = line.strip()
            if line.startswith('{'):
                try: result = json.loads(line)
                except: pass
        if not result:
            fail.append((qid, f'no_json stderr={r.stderr[:100]}')); print('FAIL no_json'); continue
        if not result.get('ok'):
            fail.append((qid, result.get('why', '?'))); print(f"FAIL {result.get('why')}")
            # 不在出文件时不影响（子进程可能没写出）
            if os.path.exists(out): os.remove(out)
            continue
        # 插入 <img>
        new_content, marker = insert_img(q['content'])
        if marker:
            new_content = new_content.replace('data/cn_figs/placeholder.png', f'data/cn_figs/cn_{q["number"]:04d}.png', 1)
            q['content'] = new_content
            ok.append((qid, result.get('page'), result.get('size'), marker)); print(f"OK p{result.get('page')} {result.get('size')} marker={marker!r}")
        else:
            fail.append((qid, 'no_marker_in_content')); os.remove(out); print('FAIL no_marker')
    out_json = json.dumps(d, ensure_ascii=False, separators=(',', ': '), indent=2) + '\n'
    open(os.path.join(ROOT, 'pwa/data/cn.json'), 'w', encoding='utf-8', newline='\n').write(out_json)
    print(f'\n成功 {len(ok)} / 失败 {len(fail)}', flush=True)
    for r in ok: print(f'  OK {r}')
    for r in fail: print(f'  FAIL {r}')

if __name__ == '__main__':
    main()
