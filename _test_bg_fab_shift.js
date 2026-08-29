// 回归测试：🎨 背景按钮避让（撞位时自动上移）
//
// 在 jsdom 里真实执行 pwa/js/background.js，用 data-box 属性模拟各页右下角
// 悬浮按钮的布局结果，断言 bgFab 的最终 bottom。覆盖 13 个场景：
// 桌面/移动、按钮出现/隐藏/消失、display:none、多个按钮、非右下角同名元素、面板跟随。
//
// 改 background.js 的避让逻辑、或 style.css 里 .bg-fab 的定位后必跑：
//   NODE_PATH=<workspace>/node_modules node _test_bg_fab_shift.js
// 依赖 jsdom（未装则跳过，不影响其它工作）
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.log('⏭  未找到 jsdom，跳过本测试。安装后重试：');
  console.log('    cd <node workspace> && npm install jsdom');
  process.exit(0);
}

const JS = fs.readFileSync(path.join(__dirname, 'pwa/js/background.js'), 'utf8');

// 只保留测试需要的定位声明（数值与 style.css 一致）
const CSS = `
.bg-fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; z-index: 200; }
.bg-panel { position: fixed; right: 20px; bottom: 80px; width: 290px; display: none; }
.bg-panel.open { display: block; }
.notes-top-btn { position: fixed; right: 22px; bottom: 26px; width: 44px; height: 44px; z-index: 2300; }
.ol-nav-fab { display: none; position: fixed; right: 14px; bottom: 20px; padding: 10px 16px; font-size: 14.4px; }
@media (max-width: 900px) { .ol-nav-fab { display: block; } }
.dati-nav-fab { display: block; position: fixed; right: 14px; bottom: 20px; padding: 10px 16px; font-size: 14.4px; }
#bgOverlay { position: fixed; inset: 0; pointer-events: none; }
`;

// 用 data-box="w,h,right,bottom" 声明一个模拟布局结果的元素
function btn(sel, cls, id, box, hidden) {
  const b = box.join(',');
  return `<${sel} class="${cls}" id="${id}"${hidden ? ' hidden' : ''} data-box="${b}">x</${sel}>`;
}
// notes-top-btn：right22 bottom26，44x44
const NOTES = [44, 44, 22, 26];
// 目录 ☰：right14 bottom20，padding 10px 16px + 行高 ≈ 35
const NAVFAB = [132, 35, 14, 20];

async function env({ vw, vh, body = '', page, cssExtra = '' }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}${cssExtra}</style></head>` +
    `<body>${body}<script>${JS}</script></body></html>`;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/' + (page || 'notes.html'),
    // 脚本执行前装好布局替身：jsdom 不做布局，矩形由 data-box 反推
    beforeParse(w) {
      // jsdom 默认视口是 1024x768，必须改成模拟视口，否则几何比较基准全错
      Object.defineProperty(w, 'innerWidth', { configurable: true, get() { return vw; } });
      Object.defineProperty(w, 'innerHeight', { configurable: true, get() { return vh; } });
      w.Element.prototype.getBoundingClientRect = function () {
        const d = this.getAttribute('data-box');
        if (!d) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
        const p = d.split(',').map(Number);
        const [bw, bh, r] = p;
        // data-top 存在 → 顶部锚定（模拟顶栏）；否则按 data-box 第 4 位的 bottom 锚定
        const top = this.hasAttribute('data-top')
            ? Number(this.getAttribute('data-top'))
            : vh - p[3] - bh;
        return { left: vw - r - bw, right: vw - r, top, bottom: top + bh, width: bw, height: bh };
      };
      for (const [prop, idx] of [['offsetWidth', 0], ['offsetHeight', 1]]) {
        Object.defineProperty(w.HTMLElement.prototype, prop, {
          configurable: true,
          get() {
            if (this.id === 'bgFab') return 48;                     // 🎨 固定 48x48
            const d = this.getAttribute('data-box');
            return d ? Number(d.split(',')[idx]) : 0;
          }
        });
      }
    }
  });
  const w = dom.window;
  // 等 DOMContentLoaded 触发 init()
  await w.eval(`new Promise(r => document.readyState !== 'loading'
      ? r() : document.addEventListener('DOMContentLoaded', r))`);
  return w;
}

/** 让 rAF 排队的 scheduleShift 跑完 */
async function flush(w) {
  await w.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
}

let pass = 0, fail = 0;
function check(name, got, exp) {
  const ok = String(got) === String(exp);
  console.log(`  ${ok ? '✅' : '❌'} ${name}  got=${JSON.stringify(got)}  exp=${JSON.stringify(exp)}`);
  ok ? pass++ : fail++;
}

(async () => {
  const NB = btn('button', 'notes-top-btn', 'notesTopBtn', NOTES);

  console.log('\n--- A 笔记页桌面：滚动后「回到开头」出现 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'notes.html',
      body: btn('button', 'notes-top-btn', 'notesTopBtn', NOTES, true) });
    const fab = w.document.getElementById('bgFab');
    check('初始（未滚动）保持默认位', fab.style.bottom, '');
    w.document.getElementById('notesTopBtn').removeAttribute('hidden');   // 模拟 scrollY > 400
    w.eval(`window.dispatchEvent(new Event('scroll'))`);
    await flush(w);
    check('滚动后 🎨 抬高到 82px（按钮顶距底 70 + 间距 12）', fab.style.bottom, '82px');
    check('与按钮实际留出 12px 间距', parseFloat(fab.style.bottom) - (26 + 44), 12);
  }

  console.log('\n--- B 刷题页：右下角没有别的按钮 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'quiz.html' });
    check('🎨 保持默认停靠位', w.document.getElementById('bgFab').style.bottom, '');
  }

  console.log('\n--- C 移动端地图页：目录 ☰ 在 ≤900px 才显示 ---');
  {
    // jsdom 不一定按 innerWidth 求值 @media，直接用覆盖样式模拟「≤900px 时 ☰ 显示」
    const w = await env({ vw: 390, vh: 700, page: 'map.html',
      body: btn('button', 'ol-nav-fab', 'olNavFab', NAVFAB),
      cssExtra: '.ol-nav-fab { display: block !important; }' });
    check('🎨 抬高到 67px（按钮顶距底 55 + 间距 12）', w.document.getElementById('bgFab').style.bottom, '67px');
  }

  console.log('\n--- D 桌面端地图页：☰ 是 display:none，不该触发 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'map.html', body: btn('button', 'ol-nav-fab', 'olNavFab', NAVFAB) });
    check('🎨 保持默认停靠位', w.document.getElementById('bgFab').style.bottom, '');
  }

  console.log('\n--- E 大题页：dati-nav-fab 桌面也显示 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'dati.html', body: btn('button', 'dati-nav-fab', 'datiNavFab', NAVFAB) });
    check('🎨 抬高到 67px（按钮顶距底 55 + 间距 12）', w.document.getElementById('bgFab').style.bottom, '67px');
  }

  console.log('\n--- F 同名按钮在顶部（不在右下角）→ 不触发 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'quiz.html',
      body: '<div class="notes-top-btn" id="topBar" data-box="1280,56,0,0" data-top="0">顶栏</div>' });
    check('🎨 保持默认停靠位', w.document.getElementById('bgFab').style.bottom, '');
  }

  console.log('\n--- G 面板跟随 🎨，不压住按钮 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'notes.html', body: NB });
    w.eval(`window.toggleBgPanel(true)`);
    check('🎨 已抬高', w.document.getElementById('bgFab').style.bottom, '82px');
    check('面板 bottom = 82 + 48 + 12 = 142px', w.document.getElementById('bgPanel').style.bottom, '142px');
    check('面板已打开', w.document.getElementById('bgPanel').classList.contains('open'), 'true');
  }

  console.log('\n--- H 两个按钮同时存在 → 抬到更靠上的那个之上 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'notes.html',
      body: NB + btn('button', 'dati-nav-fab', 'datiNavFab', NAVFAB) });
    // notes-top-btn 顶 = 900-26-44 = 830；dati-nav-fab 顶 = 900-20-35 = 845 → 取 845
    check('🎨 抬高到 67px', w.document.getElementById('bgFab').style.bottom, '67px');
  }

  console.log('\n--- I 页面按钮后来消失 → 🎨 回默认位 ---');
  {
    const w = await env({ vw: 1280, vh: 900, page: 'notes.html', body: NB });
    w.document.getElementById('notesTopBtn').setAttribute('hidden', '');   // 滚回顶部
    w.eval(`window.dispatchEvent(new Event('scroll'))`);
    await flush(w);
    check('🎨 回到默认停靠位', w.document.getElementById('bgFab').style.bottom, '');
  }

  console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})();
