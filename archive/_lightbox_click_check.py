"""隔离实例验证：figLightbox 单击图片关闭（真实 Chromium，preventDefault 后 click 是否仍触发）。

用法：先起 `python -m http.server 8899 --directory pwa`，再跑本脚本。
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'http://127.0.0.1:8899/notes.html'

with sync_playwright() as p:
    exe = r'E:\deps_cache\ms-playwright\chromium-1223\chrome-win64\chrome.exe'
    browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None)
    page = browser.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL, wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(1000)

    # 用一张真实存在的 SVG 打开 lightbox，绕开页面滚动/加载
    fig = 'img/co_fig_clock_cycle.svg'
    if not os.path.exists(os.path.join(ROOT, 'pwa', fig)):
        # 找任意一张 svg
        import glob
        cands = glob.glob(os.path.join(ROOT, 'pwa', 'img', '*.svg'))
        fig = 'img/' + os.path.basename(cands[0]) if cands else fig

    def shown():
        return page.eval_on_selector('#figLightbox', 'el => el.classList.contains("show")')

    results = []

    # 1. 单击图片关闭
    page.evaluate('f => window.openFigLightbox(f)', fig)
    page.wait_for_timeout(300)
    results.append(('打开后 show', shown()))
    box = page.locator('#figLightbox .fig-lb-stage img')
    box.click(position={'x': 30, 'y': 30}, force=True)
    page.wait_for_timeout(400)
    results.append(('单击图片后关闭', not shown()))

    # 2. 双击图片不关闭 + 重置 100%
    page.evaluate('f => window.openFigLightbox(f)', fig)
    page.wait_for_timeout(300)
    box = page.locator('#figLightbox .fig-lb-stage img')
    box.dblclick(position={'x': 30, 'y': 30}, force=True)
    page.wait_for_timeout(400)
    results.append(('双击后仍打开', shown()))
    results.append(('双击重置到 100%',
        page.eval_on_selector('#figLbZoom', 'el => el.textContent') == '100%'))

    # 3. 拖拽后不误关
    page.evaluate('f => window.openFigLightbox(f)', fig)
    page.wait_for_timeout(300)
    r = page.locator('#figLightbox .fig-lb-stage img').bounding_box()
    cx, cy = r['x'] + r['width'] / 2, r['y'] + r['height'] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 40, cy + 30, steps=5)
    page.mouse.up()
    page.wait_for_timeout(400)
    results.append(('拖拽后不误关', shown()))
    page.keyboard.press('Escape')

    # 4. 点空白关闭
    page.evaluate('f => window.openFigLightbox(f)', fig)
    page.wait_for_timeout(200)
    page.locator('#figLightbox').click(position={'x': 3, 'y': 3}, force=True)
    page.wait_for_timeout(150)
    results.append(('点空白关闭', not shown()))

    for name, ok in results:
        print(('PASS ' if ok else 'FAIL ') + name)
    print('pageerror:', errs[:3])
    browser.close()
    raise SystemExit(0 if all(o for _, o in results) and not errs else 1)
