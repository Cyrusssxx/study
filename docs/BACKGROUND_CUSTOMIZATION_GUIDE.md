# PWA 刷题页·背景自定义与 UI 透明度实施指南

> 适用于任何**单页面/多页面 PWA**，只需纯前端、零后端、配合 Service Worker 版本管理即可落地。

---

## 1. 核心设计原则

| 原则 | 说明 |
|------|------|
| **仅背景透明，文字不糊** | 用 `rgba(var(--xxx-rgb), var(--ui-alpha))` 控制背景 alpha，**严禁**直接给容器加 `opacity`（会把文字/按钮一起变淡）。 |
| **深浅色模式同套变量** | `:root` 与 `.dark` 各定义一套 `--card-rgb`、`--sidebar-rgb` 等 **rgb 三元组**（如 `255, 255, 255` / `31, 36, 45`），滑块只改 `--ui-alpha`，模式切换自动生效。 |
| **单一总滑块统管** | 一个 `0~100%` 滑块（默认 `100`）同时驱动所有参与透明的盒子，**不做**分滑块，降低认知负荷。 |
| **自适应描边兜底** | `border: 1px solid rgba(128,128,128, calc((1 - var(--ui-alpha)) * 0.5 + 0.001))` —— 越透边框越明显，防止卡片“隐形”不可辨。 |
| **持久化键名规范** | `quiz_bg_type` / `quiz_bg_value` / `quiz_bg_overlay` / `quiz_ui_opacity` —— 前缀统一、语义清晰、易迁移。 |
| **预设 + 自定义并行** | 内置 6 纯色 + 6 渐变零成本预设，**上传走前端压缩**（最长边 ≤1920px、JPEG 0.8、仅 `jpg/png/webp`）转 `dataURL` 存 `localStorage`，不依赖后端。 |
| **自定义背景优先于夜间模式** | 开深色时**保留用户图**，仅把遮罩色从白雾 `rgba(255,255,255,.85)` 切黑雾 `rgba(0,0,0,.6)`，用 `MutationObserver` 监听 `html.dark` 实时重算。 |
| **入口内聚** | 右下角悬浮按钮 🎨 → 单面板集中所有控制（预设/上传/遮罩/透明度/重置），不污染导航栏。 |

---

## 2. 目录结构最小改动清单

```
pwa/
├── css/
│   └── style.css          # + 变量定义、盒子背景 rgba 化、自适应描边、深色覆盖
├── quiz.html              # + 悬浮按钮、面板 HTML、初始化/上传/透明度/重置 JS
├── sw.js                  # 构建期自动注入 CACHE_VER（由 tools/build.py 维护）
└── tools/
    └── build.py           # 刷新 APP_VER / DATA_VER，重建 SW 预缓存清单
```

> **只动这 3 个文件**（`quiz.html`、`style.css`、`sw.js`），其余页面/逻辑零侵入。

---

## 3. CSS 变量体系（直接复制到 `:root` 与 `.dark`）

```css
/* === :root 浅色 === */
:root {
  --card-bg: #ffffff;                 /* 兼容旧写法，保留 */
  --card-rgb: 255, 255, 255;          /* ★ 新增：卡片/导航/侧栏/面板底色 rgb */
  --sidebar-rgb: 255, 255, 255;       /* ★ 新增：侧栏专用（如需不同色可分） */
  --ui-alpha: 1;                      /* ★ 新增：0~1，由滑块写入，默认 1=不透明 */
  /* ...其余原有变量保持... */
}

/* === .dark 深色 === */
.dark {
  --card-bg: #1f242c;
  --card-rgb: 31, 36, 45;
  --sidebar-rgb: 31, 36, 45;
  /* --ui-alpha 继承，不重置 */
  /* ...其余原有变量保持... */
}
```

---

## 4. 盒子背景统一改造模板

把原本写死 `background: #fff / var(--card-bg)` 的规则，**统一替换**为：

```css
/* 通用：卡片/导航/侧栏/面板 */
.your-box {
  background: rgba(var(--card-rgb), var(--ui-alpha));
  border: 1px solid rgba(128, 128, 128, calc((1 - var(--ui-alpha)) * 0.5 + 0.001));
  /* 原有 border-radius / box-shadow 保留 */
}

/* 深色模式下只需改边框颜色（背景已由 rgb+alpha 自动适配） */
.dark .your-box {
  border-color: rgba(128, 128, 128, calc((1 - var(--ui-alpha)) * 0.5 + 0.001));
}

/* 标题条/头部等子元素单独配色时 */
.your-box-title {
  background: rgba(238, 245, 253, var(--ui-alpha));  /* 浅色专用淡蓝 */
  /* 深色下若需专色，再加 .dark .your-box-title { background: rgba(xxx, var(--ui-alpha)); } */
}
```

> **本项目已改造的 6 类盒子**：
> 1. `.navbar` 顶栏
> 2. `.question-card` 题目卡
> 3. `.number-sidebar` 右侧题号面板
> 4. `.question-number` 题干题号 chip（原无背景，先加 `padding/border-radius` 再套模板）
> 5. `.chapter-sidebar` 左侧章节目录
> 6. `.explanation-panel` / `.note-panel` 解析&笔记面板（含标题条）

---

## 5. JS 关键逻辑（可直接迁移）

### 5.1 常量与键名
```js
const BG_TYPE = 'quiz_bg_type';      // 'preset' | 'custom'
const BG_VAL  = 'quiz_bg_value';     // 预设键名 或 dataURL
const BG_OV   = 'quiz_bg_overlay';   // 遮罩强度 0~90
const UI_OP   = 'quiz_ui_opacity';   // UI 透明度 0~100
```

### 5.2 统一入口 `applyQuizBg()`
```js
function applyQuizBg() {
  const type = localStorage.getItem(BG_TYPE);
  const val  = localStorage.getItem(BG_VAL);
  const ov   = parseInt(localStorage.getItem(BG_OV) || '35', 10);
  const ui   = parseInt(localStorage.getItem(UI_OP) || '100', 10);

  document.documentElement.style.setProperty('--ui-alpha', ui / 100);

  const body = document.body;
  if (type === 'custom' && val) {
    body.style.backgroundImage = `url("${val}")`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundPosition = 'center';
    setOverlay(ov);
  } else {
    body.style.backgroundImage = '';
    removeOverlay();
    if (type === 'preset' && val) {
      document.body.style.background = PRESETS[val];  // PRESETS 为预设对象
    } else {
      document.body.style.background = '';  // 恢复 CSS 变量
    }
  }
}
```

### 5.3 上传压缩（纯前端，无依赖）
```js
function compressAndStore(file, callback) {
  const img = new Image();
  img.onload = () => {
    const max = 1920;
    let w = img.width, h = img.height;
    if (w > max || h > max) {
      if (w > h) { h = Math.round(h * max / w); w = max; }
      else { w = Math.round(w * max / h); h = max; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    URL.revokeObjectURL(img.src);
    callback(dataUrl);
  };
  img.src = URL.createObjectURL(file);
}
```

### 5.4 遮罩层（随深浅色自动切换）
```js
function setOverlay(pct) {
  let ov = document.getElementById('bgOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'bgOverlay';
    Object.assign(ov.style, {
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      background: 'rgba(255,255,255,0)'  // 初始透明
    });
    document.body.prepend(ov);
  }
  const isDark = document.documentElement.classList.contains('dark');
  ov.style.background = isDark
    ? `rgba(0,0,0,${pct/100*0.6})`
    : `rgba(255,255,255,${pct/100*0.85})`;
}
function removeOverlay() { document.getElementById('bgOverlay')?.remove(); }

// 深色切换时自动重算遮罩色
new MutationObserver(() => {
  const ov = localStorage.getItem(BG_OV);
  if (ov) setOverlay(parseInt(ov, 10));
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
```

### 5.5 初始化与重置
```js
function initBg() {
  applyQuizBg();
  // 同步面板滑块值
  document.getElementById('bgOpacityRange').value = localStorage.getItem(UI_OP) || 100;
  document.getElementById('bgOpacityVal').textContent = (localStorage.getItem(UI_OP) || 100) + '%';
  // 预设色板高亮、遮罩滑块同步略...
}

function resetQuizBg() {
  [BG_TYPE, BG_VAL, BG_OV, UI_OP].forEach(k => localStorage.removeItem(k));
  document.getElementById('bgOpacityRange').value = 100;
  document.getElementById('bgOpacityVal').textContent = '100%';
  document.getElementById('bgOverlayRange').value = 35;
  document.getElementById('bgOverlayVal').textContent = '35%';
  applyQuizBg();
  markActivePreset(null);
}
```

---

## 6. 面板 HTML 极简模板（塞进 `quiz.html` 任意位置）

```html
<!-- 悬浮按钮 -->
<button class="bg-fab" id="bgFab" onclick="toggleBgPanel()" title="背景设置">🎨</button>

<!-- 面板（默认隐藏） -->
<div class="bg-panel" id="bgPanel">
  <div class="bg-hdr">背景设置 <span onclick="toggleBgPanel()" class="bg-close">×</span></div>

  <!-- 预设色板 -->
  <div class="bg-sec"><div class="bg-sec-title">预设主题</div>
    <div class="bg-swatches" id="bgSwatches"></div>
  </div>

  <!-- 自定义上传 -->
  <div class="bg-sec"><div class="bg-sec-title">自定义图片</div>
    <input type="file" id="bgFile" accept="image/jpeg,image/png,image/webp" hidden
           onchange="handleBgFile(this.files[0])">
    <button class="bg-btn" onclick="document.getElementById('bgFile').click()">上传图片</button>
  </div>

  <!-- 遮罩强度 -->
  <div class="bg-sec" id="bgOverlaySec">
    <div class="bg-sec-title">遮罩强度（自定义图片时生效）</div>
    <div class="bg-row">
      <input type="range" id="bgOverlayRange" min="0" max="90" value="35"
             oninput="onBgOverlayInput(this.value)">
      <span class="bg-val" id="bgOverlayVal">35%</span>
    </div>
  </div>

  <!-- 整体 UI 透明度 -->
  <div class="bg-sec">
    <div class="bg-sec-title">整体 UI 透明度（顶栏/题目框/题号框/目录/解析&笔记面板）</div>
    <div class="bg-hint">仅背景变透明，文字保持清晰；拉低即可透出壁纸。</div>
    <div class="bg-row">
      <input type="range" id="bgOpacityRange" min="0" max="100" value="100"
             oninput="onUiOpacityInput(this.value)">
      <span class="bg-val" id="bgOpacityVal">100%</span>
    </div>
  </div>

  <button class="bg-reset" onclick="resetQuizBg()">重置为默认</button>
</div>
```

> 面板 CSS 见项目 `style.css` 尾部 `.bg-fab / .bg-panel / .bg-swatches / .bg-row / .bg-btn / .bg-reset` 等类，**直接复制粘贴即用**。

---

## 7. 构建与部署流程（本项目约定）

```bash
# 1. 修改完 css/html 后
python tools/build.py          # 刷新 APP_VER / DATA_VER，重建 sw.js 缓存清单

# 2. 仅提交本次相关文件（禁 git add -A）
git add pwa/quiz.html pwa/css/style.css pwa/sw.js
git commit -m "feat: 背景/透明度功能……"

# 3. 推送并核实远程 HEAD
git push
git ls-remote origin main      # 确认远程 hash 与本地一致

# 4. 线上验证：打开页面 → Ctrl+Shift+R 强刷 → 右下角 🎨 测试
```

> `tools/build.py` 内部会读取所有预缓存资源算 SHA-256，自动注入 `sw.js` 的 `CACHE_VER = 'quiz408-<hash10>'`，**无需手动改版本号**。

---

## 8. 迁移到新项目 Checklist

- [ ] 把 `:root` / `.dark` 变量块复制进项目全局 CSS
- [ ] 找出所有“白底/卡片/侧栏/导航/弹层”盒子，按 **§4 模板** 改成 `rgba(var(--xxx-rgb), var(--ui-alpha))` + 自适应描边
- [ ] 把面板 HTML + JS（`applyQuizBg` / `compressAndStore` / `setOverlay` / `initBg` / `resetQuizBg`）塞入入口页面
- [ ] 确认项目有 `localStorage` 可用、无 CSP 禁止 `dataURL` 背景图
- [ ] 若有 Service Worker，接入构建脚本自动刷新缓存版本
- [ ] 真机测试：浅色/深色切换、上传大图自动压缩、滑块拖动无卡顿、刷新保留设置

---

## 9. 常见坑 & 避雷

| 现象 | 原因 | 修正 |
|------|------|------|
| 文字跟着变透明 | 给容器加了 `opacity` | 改用 `background: rgba(...)` 仅改背景 |
| 深色模式下背景色没变 | 没在 `.dark` 定义对应 `--card-rgb` | 补上深色 rgb 三元组 |
| 上传大图后页面卡/存储爆 | 直接存原图 base64 | **必须**前端压缩 ≤1920px、JPEG 0.8 |
| 切深色后自定义图片没了 | 代码里 `if (dark) body.style.backgroundImage = ''` | 去掉该判断，改用遮罩层切色 |
| 滑块拉到底卡片边界找不着 | 无描边 | 加自适应描边 `calc((1-alpha)*0.5+0.001)` |
| 面板里预设色板点击无反应 | `PRESETS` 对象键名与 `data-preset` 不一致 | 统一键名，或在 JS 里做映射 |
| 强刷后设置丢失 | `localStorage` 键名拼写不一致 | 统一常量 `BG_TYPE/BG_VAL/…`，全局唯一 |

---

## 10. 一键复制包（最小可运行片段）

> 新建空白 PWA 页面，把下面三段分别扔进 `style.css`、`index.html`、`app.js`，**即可跑通**“预设色板 + 上传压缩 + 遮罩 + UI 透明度 + 深浅色联动 + 持久化”。

### 10.1 CSS 片段
```css
:root { --card-rgb: 255,255,255; --sidebar-rgb: 255,255,255; --ui-alpha: 1; }
.dark { --card-rgb: 31,36,45; --sidebar-rgb: 31,36,45; }
.card, nav, aside, .panel { background: rgba(var(--card-rgb), var(--ui-alpha));
  border: 1px solid rgba(128,128,128, calc((1-var(--ui-alpha))*0.5+0.001)); }
.dark .card, .dark nav, .dark aside, .dark .panel { border-color: rgba(128,128,128, calc((1-var(--ui-alpha))*0.5+0.001)); }
```

### 10.2 HTML 片段（含面板结构）
```html
<button class="fab" onclick="togglePanel()">🎨</button>
<div class="panel" id="panel" hidden>
  <div class="swatches" id="swatches"></div>
  <input type="file" accept="image/*" id="up" hidden onchange="upFile(this.files[0])">
  <button onclick="up.click()">上传</button>
  <input type="range" min="0" max="90" value="35" id="ov" oninput="setOv(this.value)">
  <input type="range" min="0" max="100" value="100" id="ui" oninput="setUi(this.value)">
  <button onclick="resetAll()">重置</button>
</div>
<style>.fab{fixed;bottom:16px;right:16px;z:99}.panel{fixed;bottom:60px;right:16px;w:280px;bg:rgba(var(--card-rgb),1);pad:16px;radius:12px;shadow:0 4px 24px #0003}</style>
```

### 10.3 JS 片段（完整可运行）
```js
const K={t:'bg_t',v:'bg_v',o:'bg_o',u:'bg_u'}, PRE={light:'linear-gradient(135deg,#fdfbf7,#ebf5fb)',dark:'#1f242c',blue:'#e8f0fe',green:'#e6f4ea',orange:'#fef3c7',purple:'#f3e8ff',grad1:'linear-gradient(135deg,#84fab0,#8fd3f4)',grad2:'linear-gradient(135deg,#fa709a,#fee140)',grad3:'linear-gradient(135deg,#a1c4fd,#c2e9fb)',grad4:'linear-gradient(135deg,#ff9a9e,#fad0c4)',grad5:'linear-gradient(135deg,#d299c2,#fef9d7)',grad6:'linear-gradient(135deg,#89f7fe,#66a6ff)'};
function $(s){return document.querySelector(s)}; function $id(s){return document.getElementById(s)}
function apply(){const t=localStorage.getItem(K.t),v=localStorage.getItem(K.v),o=+localStorage.getItem(K.o)||35,u=+localStorage.getItem(K.u)||100;
  document.documentElement.style.setProperty('--ui-alpha',u/100); const b=document.body;
  if(t==='custom'&&v){b.style.backgroundImage=`url("${v}")`;b.style.backgroundSize='cover';b.style.backgroundAttachment='fixed';b.style.backgroundPosition='center';setOvReal(o)}
  else{b.style.backgroundImage='';removeOv(); if(t==='preset'&&v)b.style.background=PRE[v]; else b.style.background='';}
  $id('ui').value=u;$id('ov').value=o;$id('ov').nextElementSibling.textContent=o+'%';$id('ui').nextElementSibling.textContent=u+'%';}
function compress(f,cb){const i=new Image();i.onload=()=>{let w=i.width,h=i.height,m=1920;if(w>m||h>m){if(w>h){h=Math.round(h*m/w);w=m}else{w=Math.round(w*m/h);h=m}}const cvs=document.createElement('canvas');cvs.width=w;cvs.height=h;cvs.getContext('2d').drawImage(i,0,0,w,h);cb(cvs.toDataURL('image/jpeg',0.8));URL.revokeObjectURL(i.src)};i.src=URL.createObjectURL(f)}
function upFile(f){if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type))return alert('仅支持 jpg/png/webp');compress(f,d=>{localStorage.setItem(K.t,'custom');localStorage.setItem(K.v,d);apply()})}
function setOv(v){localStorage.setItem(K.o,v);if(localStorage.getItem(K.t)==='custom')setOvReal(v);$id('ov').nextElementSibling.textContent=v+'%'}
function setOvReal(v){let ov=$id('ovl');if(!ov){ov=document.createElement('div');ov.id='ovl';Object.assign(ov.style,{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'});document.body.prepend(ov)}const dk=document.documentElement.classList.contains('dark');ov.style.background=dk?`rgba(0,0,0,${v/100*0.6})`:`rgba(255,255,255,${v/100*0.85})`}
function removeOv(){$id('ovl')?.remove()}
function setUi(v){localStorage.setItem(K.u,v);document.documentElement.style.setProperty('--ui-alpha',v/100);$id('ui').nextElementSibling.textContent=v+'%'}
function resetAll(){Object.values(K).forEach(k=>localStorage.removeItem(k));apply()}
function init(){Object.entries(PRE).forEach(([k,v])=>{const d=document.createElement('div');d.className='swatch';d.style.background=v;d.dataset.k=k;d.onclick=()=>{localStorage.setItem(K.t,'preset');localStorage.setItem(K.v,k);apply()};$id('swatches').appendChild(d)});apply();new MutationObserver(()=>{const o=localStorage.getItem(K.o);if(o)setOvReal(+o)}).observe(document.documentElement,{attributes:true,attributeFilter:['class']})}
init()
```

---

## 11. 版本记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-08-28 | v1.0 | 首版：背景自定义 + 遮罩 + UI 透明度（6 盒子）完整落地 408-quiz PWA |
| 2026-08-28 | v1.1 | 补全迁移指南、一键复制片段、常见坑表 |

---

**维护者**：如需在新项目落地，直接按 **§8 Checklist** 走一遍；核心 CSS/JS 已在 **§4/§5/§10** 给出最小可运行集，复制即用。如有改进请同步更新本文档。