# 408 刷题 PWA · 项目交接文档

> 生成：2026-11-03　适用对象：接手本项目的 AI / 开发者
> 本文是**唯一入口文档**，读完应能独立改代码而不踩坑。细节日志在 `.workbuddy-ai/memory/`。

---

## 0. 一句话

纯前端 PWA（**没有服务端**）：题库是静态 JSON，学习数据全在浏览器 IndexedDB。
`pwa/js/backend.js` 伪装成后端，拦截 `/api/*` 请求并操作 IndexedDB——改接口就是改这个文件。

---

## 1. 快速上手

```bash
# 跑测试（必须带 NODE_PATH，jsdom / fake-indexeddb 在 workspace 里）
NODE_PATH="C:/Users/cjx/.workbuddy-ai/binaries/node/workspace/node_modules" \
  "C:/Users/cjx/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe" _test_exam_pool.js

# 构建（改过 pwa/ 下任何文件都要跑，否则 PWA 不拉新）
python tools/build_sw.py      # 重算 sw.js 的 APP_VER / DATA_VER / LAZY_VER
python tools/build_meta.py    # 题库题量变了才需要

# 提交
git add <具体文件>            # ⚠️ 不要用 pwa/data/*.json 通配符（会带上备份文件）
git commit -m "..." && git push origin main
```

**提交前必做**：跑相关测试 + `build_sw.py`。版本号不更新 = 用户看不到更新。

---

## 2. 技术架构

```
页面(html) ──api('/api/xxx')──> backend.js ──> IndexedDB
                                    │
                                    └──> fetch('data/*.json')  题库（静态）
```

- `backend.js` 顶部是 `dbGet/dbPut/dbAll/dbDelete` 四个 IndexedDB 封装，下面是一堆 `if (seg[1] === 'xxx')` 路由。
- 所有页面共享 `common.js`（`fmtFormula` / `fmtOptionText` / 顶栏 / 深色模式）+ `background.js` + `lightbox.js`。
- 没有构建步骤：直接改 `pwa/` 下的文件，Service Worker 负责缓存刷新。

---

## 3. 目录地图

```
pwa/
├── index.html        首页（6 个板块入口）
├── quiz.html         刷题页（模式由 ?mode= 决定，是功能最密集的页面）
├── exam.html         模拟考（组卷 / 答题 / 交卷 / 成绩单）
├── wrong.html        错题本（列表 + 「模拟考错题专项」卡片）
├── favorites.html    收藏夹
├── zhenti.html       真题套卷（按年份整套刷，左年份列表 + 右题号浮层）
├── notes.html        考点笔记（含行级批注 / 划词高亮）
├── algo.html         算法讲义（内含排序可视化演示）
├── code.html         代码题专项（数组算法演示）
├── dati.html         大题专项
├── cards.html        记忆卡
├── daily.html        每日一题
├── daka.html         数据结构强化打卡
├── map.html          知识点地图
├── plan.html         冲刺计划（67 行表格 = 打卡表）
├── search.html       全站搜索
├── stats.html        统计 / 数据备份导入导出
├── cn_graph.html     计网图表
├── js/
│   ├── backend.js    ★ 假后端，所有 /api/* 在这里
│   ├── common.js     公共函数 + 顶栏 + 深色 + --sbw 滚动条宽度
│   ├── zhenti.js     真题套卷逻辑（997 行，三套卡片模板）
│   ├── code_demo.js  code.html 的数组演示播放器（data-ad-*）
│   ├── background.js 背景图
│   ├── lightbox.js   图片放大
│   └── note_richtext.js  笔记富文本
├── css/style.css     ★ 单文件样式（8000+ 行，全站共用）
└── data/
    ├── ds/co/os/cn.json  题库（合计 2451 题：632 / 603 / 652 / 564）
    ├── meta.json         题量（给首页显示，可能与实际差 1，以题库为准）
    ├── zt/               真题套卷（index.json + zt_<year>.json）
    ├── papers.json / cards.json / dati.json / algo_notes.json / ds_daka.json ...
    └── *_figs/           题图
```

---

## 4. 数据模型

### 4.1 IndexedDB stores（9 个）

| store | 主键 | 关键字段 | 用途 |
|---|---|---|---|
| `progress` | question_id | user_answer, is_correct, answered_at | 每题最近一次作答 |
| `wrong` | question_id | wrong_count, last_wrong_at, is_resolved, correct_streak | 错题本 |
| `favorites` | question_id | added_at | 收藏 |
| `unfamiliar` | question_id | added_at | 不熟标记 |
| `dontknow` | question_id | added_at | 不会标记 |
| `notes` | question_id | content, images[] | 笔记 |
| `exams` | id | question_ids[], answers{}, wrong_ids[], right_ids[], status | 模拟考会话 |
| `redo` | question_id | **kind**, due_at, mastered, added_at | ★ 池子成员表（见第 5 节） |
| `daka_progress` | — | — | 打卡进度 |

### 4.2 题库 JSON 字段

```jsonc
{
  "id": "os_0484", "number": 484,
  "content": "<p>题干…</p>",              // 可含 <sup>/<pre>/<table class="q-table">/<img>
  "options": { "A": "…", "B": "…" },
  "answer": "B",                          // 多选 = "BD"；多空题 = 每空一位
  "explanation": "<p>解析…</p>",
  "chapter": "第4章 文件管理", "section": "4.2 目录与文件", "subsection": "…",
  "kp_analysis": "<div class=\"kp-sec\"><b>考点</b>…</div>",   // 考点分析（含答案！）
  "multi_blank": true, "blank_opts": {...},                    // 多空题才有
  "is_real_exam": true, "exam_year": 2020,                     // loadQuestions 自动识别
  "excluded": true                                             // 全站不出现
}
```

> `excluded: true` 的题会被 `loadQuestions` 过滤，且 `total` 要同步减一 + 跑 `build_meta.py`。

### 4.3 关键约定

- **题号**：四科 `number` 都是 1..N 严格递增、无重复（改数据时别破坏）。
- **上标/下标**：一律用 `<sup>` / `<sub>`，`fmtOptionText` 会保留这两个标签（其余转义）。
- **多空题**：题干空位格式不统一（半角 `(①)` / 全角 `（①）` / 空括号），渲染正则必须全认。

---

## 5. 池子系统（改动最频繁，重点看）

### 5.1 三个池子

| 池子 | 成员 | 入口 |
|---|---|---|
| **收藏池** | `favorites` 表 | 考试模式「仅收藏题」 |
| **错题池** | `wrong` 未了结 ∪ `unfamiliar` ∪ `dontknow` ∪ `redo` 未掌握 | 考试模式「仅错题」/ 刷题 `mode=wrong` |
| **模拟考错题池** | 模拟考做错的题（持久成员）∪ 手动标记题 | 考试模式「仅模拟考错题」/ 刷题 `mode=examwrong` / 错题本专项卡 |

> 不熟池**已并入错题池**（2026-11-01），考试下拉里不再有独立入口。

### 5.2 `redo` 表的四种 kind

| kind | 写入时机 | due_at | 语义 |
|---|---|---|---|
| `redo` | 试卷回顾点「7 天后重练」 | +7 天 | 时间排期 |
| `guessed` | 试卷回顾点「猜对了」 | 0 | 放回收藏池垫底层 |
| `examwrong` | `examWrongPoolQids()` 回填模拟考错题 | 0 | 池子成员 |
| `ztwrong` | 真题套卷点「加入错题池」 | +7 天 | 池子成员（**冷却期内不进收藏池组卷**） |

**共同规则**：`mastered = 1` 表示"做对过一次" → **留在池子里但不再抽**。
由 `applyAnswer()` 统一维护：答对 → 置 mastered；答错 → 清 mastered。

### 5.3 池子函数

```js
examWrongQids(calc)       // 模拟考仍错的题（按最后一场作答算）
examWrongPoolQids(calc)   // 池子全量 = 动态错题 ∪ redo 全部记录，返回 { pending, mastered }
examDueWrongIds()         // 收藏池的「到期错题」层（满 7 天才进）
```

⚠️ **`calc` 参数必须一致**：一处传 `false` 一处传 `true` 会出现"卡片说 20 题，点进去只有 3 题"
（`false` 会跳过没有 `wrong_ids` 的老会话）。所有对外入口统一传 `true`。

### 5.4 各模式怎么取池

| 模式 | 取法 |
|---|---|
| `favorites` | `prioritizeByTime` 分层：到期错题 → 做过的错题 → 没做过 → 做过的对题（垫底）；模拟考答对的题默认退出，除非标了 `guessed` |
| `wrong` | 上述并集，`prioritize()` 三层：没做过 > 错题未了结 > 按天 |
| `examwrong` | `examWrongPoolQids(true).pending` |
| 单科 / full | 整库 |

**刷题页跨科目**：`/api/questions/all?mode=examwrong` 支持四科混刷（`subject=all` 只允许这一个模式）。
`quiz.html` 在 `SUBJECT === 'all'` 时会隐藏左侧章节树。

### 5.5 统计口径（`/api/exam/pool`）

返回 `exam_wrong`（模拟考仍错）、`marked_pending`、`marked_mastered`、`exam_marked`、`zt_marked`、
`exam_pool_total`（去重后的实际可抽数）。**ztwrong / examwrong 不能混进 `redo_due`**——
它们的 `due_at = 0`，会被"到期层"误判成早已到期。

---

## 6. 各页面关键行为

### quiz.html（刷题）
- 模式由 `?mode=` 决定；`SWITCHABLE_MODES` 决定哪些能热切换。
- 面板三件套：`explanationShown` / `noteShown` / `kpShown`，切题时**全部按当前题重算**：
  ```js
  noteShown = hasNoteOf(q)                 // 有笔记就展开
  kpShown   = hasKpOf(q)                   // 收藏 + 有 kp_analysis 才展开
  ```
- 题号面板：普通刷题按「章 · 节」分组；`exam_wrong` / `exam_review` / `examwrong` **平铺**。
- 题头：`meta | 不熟/不会 | 收藏星`，靠 `flex-wrap` 防溢出。

### exam.html（模拟考）
- 组卷模式：收藏 / 模拟考错题 / 错题 / full / 单科。
- 选「仅模拟考错题」后会出现「刷题式练」行，按科目直达 `quiz.html?subject=X&mode=examwrong`。
- 交卷 `gradeExam` 固化 `wrong_ids` / `right_ids`，并逐题 `applyAnswer`。

### wrong.html（错题本）
- 顶部「🎯 模拟考错题专项」卡片：主入口「全部科目 N 题 →」（`subject=all`）+ 分科目入口。

### zhenti.html（真题套卷）
- 三套卡片模板：`choiceCard` / `bigCard` / `dakaBigCard`——**加功能必须三处同步**，
  已用 `markBtnsHtml` / `kpBtnHtml` / `kpPanelHtml` / `poolBtnHtml` 四个 helper 收敛。
- 只有**映射到题库**的题（`it.qid` 存在）才显示 不熟/不会/考点分析/加入错题池；
  合成 id（`{sid}_zt{year}_{i}`）写不进这些表。
- 考点分析**做题模式下隐藏**（`kp_analysis` 含答案）。

### algo.html / code.html（演示）
两套独立播放器，改一处要同步另一处：

| 页面 | 实现 | 选择器前缀 |
|---|---|---|
| algo.html | 内联脚本 | `data-qs-*` / `.qs-*` |
| code.html | `js/code_demo.js` | `data-ad-*` / `.ad-*` |

两者都支持「上一步 / 下一步」单步（`state.idx` = 下一个待渲染帧）。

---

## 7. 开发约定

### 7.1 换行符（最容易翻车）
- Windows 上**禁止**用 Python 文本模式 `open(p, 'w')` 写 JS/CSS——会 LF→CRLF，
  破坏按 `\n` 匹配的正则测试。用 Edit 工具或 `open(p, 'w', encoding='utf-8', newline='\n')`。
- 改完检查：`python -c "print(open(f,'rb').read().count(b'\r\n'))"` 应为 0。

### 7.2 Bash heredoc 吃反斜杠
往 JS 里写含 `\s` / `\.` 的正则会变成 `/s` / `/.`。用无反斜杠写法（`[.]` 代 `\.`、`[{]` 代 `\{`），
或用 `node -e` 的 `fs.writeFileSync`，写完 `node --check` + 实跑。

### 7.3 改样式前先 grep JS 生成的类名
笔记批注有三套类名（`.note-input .hl-*` / `.line-anno-text .hl-*` / `.note-hl-*`），
只改 CSS 不 grep JS 会漏。

### 7.4 测试基线
55 个 `_test_*.js`。改动后至少跑相关的那几个：

| 改动范围 | 必跑 |
|---|---|
| 池子 / 模拟考 | `_test_exam_pool.js` `_test_exam_wrongpool.js` `_test_exam.js` |
| 刷题页 / 布局 | `_test_quiz_layout.js` `_test_multiblank.js` `_test_mode_switch.js` |
| 真题套卷 | `_test_zhenti_marks.js` |
| 题库数据 | `_test_data_integrity.js` |
| 演示 | `_test_algo_demo.js` `_test_algo_render.js` |

**已知坏件**：`_test_algo_hl.js` 因 jsdom 选择器库崩溃，非回归，可忽略。

---

## 8. 踩过的坑

1. **`100vw` ≠ 可用宽度**：它包含竖向滚动条（Windows ~17px）。凡"贴屏幕边缘"的布局
   （负 margin、全出血）必须用 `100vw - var(--sbw)` 或 `100%`，否则整页出现横向滚动条。
   `--sbw` 由 `common.js` 写入（`innerWidth - documentElement.clientWidth`）。
2. **flex 子项默认 `min-width: auto`**：宽内容会把 flex 行撑破视口。必须显式 `min-width: 0`。
3. **题头不换行**：徽标 + 多个按钮的横排必须 `flex-wrap: wrap`，否则窄屏溢出。
4. **宽内容要有自己的滚动边界**：题干 `<pre>` 加 `overflow-x: auto`，宽表格包 `.q-table-wrap`。
5. **`redo.due_at = 0` 会被"到期"判断误判**：`ztwrong` / `examwrong` / `guessed` 必须在收藏池的到期层里 `continue` 跳过。
   `ztwrong` 现在带 +7 天冷却：冷却期内**整题**不进收藏池，且第三轮「全库补题」也要过滤，否则会被捞回来。
6. **`examWrongPoolQids(calc)` 参数不一致**：见 5.3。
7. **同一池子两处读取要同源**：`/api/questions` 与 `/api/exam/pool` 必须用同一套成员计算。
8. **合成 id 不能写标记表**：zhenti 的 `{sid}_zt{year}_{i}` 只在页面内有效。
9. **题库上标丢失**：历史导入曾把 `2<sup>32</sup>` 压成 `232`、`3<sup>0</sup>` 压成 `3°`、
   `3<sup>1</sup>` 压成 `3&#x27；`。`_test_data_integrity.js` 已固化检查。
10. **解析开头残留答案字母**：`、D尽管…` `、A、C、A深度优先…`——批量清理过 27 题。
11. **`git add pwa/data/*.json` 会带上 `ds.bak_rename.json`**：永远显式列文件名。
12. **WAAPI 收起动画无 fill**：`toc.animate()` 结束后效果移除，要靠 CSS 类落定终态
    （opacity / transform / pointer-events / visibility 四件套）。

---

## 9. 用户明确要求（别改回去）

- **笔记重点标记**按内容价值判定，非黑名单：公式/长结论/判断句/定义句/目的作用/判别技巧保留；
  超 34 字与代码块脱掉。`<b>` = 术语（红下边线+极淡底），`<mark>` = 重点句（黄荧光）。
- **池子规则**：做对**一次**即 `mastered`，留池不抽；做错恢复可抽。不熟/不会答对 1 次直接移出。
- **模拟考收藏题**：`prioritizeByTime` 纯时间队列，不按错题/不熟加权。
- **侧键键位**：quiz 与 exam 共用 `quiz_keybinds_v1` / `quiz_sideguard`；exam 仅考试进行中接管。
- **plan.html**：收藏/错题按题号排到底（非四科轮转）；打卡表 50 题 10 月内清完。
- **不熟池已并入错题池**，不要恢复成独立池子。
- **考点分析默认展开**（收藏题 + 有 kp_analysis），与"有笔记就展开笔记"同规则。
- **模拟考错题池**：做对后留池不抽；入口要「全部科目」和「分科目」并存。
- **演示**：两套播放器都要支持「上一步 / 下一步」，指针用实心彩色徽标。

---

## 10. 未完成 / 待办

- **「错题池」与「模拟考错题池」仍有包含关系**（后者是前者的子集视图）。
  曾建议合并成「错题池 + 来源筛选」，用户当时选了"先给意见不做"，**尚未实施**。
- **exam 错题转刷题界面 + 评分 2 分/题** → 已移交他人，本线不接手。
- **`/api/questions` 的 `calc=true`** 首次会补算老会话 `wrong_ids`（1~3 秒），可接受但可优化。
- **`meta.json` 与题库实际题量可能差 1**（os 记 651、实际 652），改题库后记得跑 `build_meta.py`。

---

## 11. 最近改动时间线（2026-10-31 ~ 11-03）

| 提交 | 内容 |
|---|---|
| `db5b208` | 真题套卷每题「加入错题池」（`kind='ztwrong'`） |
| `1b0789a` | 真题套卷补 不熟/不会 + 收藏题考点分析（新增 `/api/kp/<qid>`） |
| `cef05d0` | code.html 演示单步 + 指针徽标 |
| `4746cc5` | algo.html 排序演示单步 + 指针徽标 |
| `7cb7701` | 模拟考错题模式题号面板平铺 + 专项卡双入口 |
| `1321822` | 专项改「全部科目」入口 + 修池子只出 3 题（calc 不一致） |
| `5585a1f` | 清理 27 题解析开头的答案字母残留 |
| `5c6f8d0` | 修复 13 题幂次丢失 / 表格压平 |
| `81e02a3` | 收藏题默认展开考点分析 |
| `4e53e02` | 错题本加「模拟考错题专项」卡片 |
| `800aa53` | 修横向滚动条（`--bleed` 用 100vw） |
| `1f847c4` | 不熟池并入错题池 + 刷题式批量练 |
| `243d20c` | 模拟考错题做对后留池不抽（成员持久化） |
| `ea22d34` | 「7 天后重练」「猜对了」并入模拟考错题池 |

---

## 12. 接手检查清单

- [ ] 跑一遍 `_test_data_integrity.js`（数据没被改坏）
- [ ] 跑 `_test_exam_pool.js`（池子规则没被改坏）
- [ ] 改过 `pwa/` 后跑 `python tools/build_sw.py`
- [ ] `git add` 用显式文件名，不用通配符
- [ ] 改 zhenti / 演示 / 池子前，先看第 5、6 节的"三处同步"提示
