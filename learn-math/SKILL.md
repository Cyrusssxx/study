---
name: learn-math
description: Records valuable math questions asked by the user into a subject index file and writes detailed explanation notes into the math/笔记/ folder. Use when the user asks a math question (linear algebra, calculus, probability, etc.), especially exam-prep (考研) questions about theorems, formulas, properties, or problem-solving, or when the user asks to record/organize math notes.
---

# Learn Math（数学学习笔记工作流）

用户提出有价值的数学问题后，除了在对话中回答，还需将问题沉淀为结构化笔记。

## 目录结构

```
D:/ai code/math/
├── 线性代数.md          # 学科索引文件（问题概括 + 关联笔记链接）
├── <其他学科>.md        # 如 高等数学.md、概率论.md，按需创建
└── 笔记/                # 详解文件夹，存放每个问题的详细笔记
    └── <主题名>.md
```

## 工作流

1. **在对话中完整回答** 用户的数学问题（公式用 LaTeX：行内 `$...$`，独立 `$$...$$`）。**回答后不要立即写入笔记文件，等待用户指令。**
2. **仅当用户明确说“导入”时**，才执行下面的沉淀步骤（导入对象为最近一次解答的问题，除非用户另有指定）。
3. **写详解笔记** 到 `D:/ai code/math/笔记/<主题名>.md`，主题名用中文概括问题核心（如 `分块行列式的符号与方阵约束.md`）。
4. **追加索引条目** 到对应学科索引文件（如 `线性代数.md`）：
   - 按日期分节（`## YYYY-MM-DD`），同日多个问题续接编号
   - 每条含：问题标题、一句话概括、关联笔记链接
5. 若学科索引文件不存在，先按下方模板创建。

## 索引条目模板

```markdown
### <编号>. <问题概括成一句疑问句>

概括：<问题要点与结论的浓缩总结，1-3 句，含关键公式>

关联笔记：[<主题名>.md](./笔记/<主题名>.md)
```

## 学科索引文件模板（新建时使用）

```markdown
# <学科名> · 问题记录

> 记录每次提出的有价值的数学问题（概括版），按时间顺序追加。

## YYYY-MM-DD

### 1. <第一个问题>
...
```

## 详解笔记要求

- 一级标题为主题名，正文按"公式/定义回顾 → 解释/推导 → 举例验证 → 易错点/记忆技巧"组织
- 结论、易错点用 **加粗** 或 `> ⚠️` 引用块突出
- 例子要具体（代入小数字验证），推导写清每步依据

## 注意事项

- **未收到用户“导入”指令前，只解答、不创建或修改任何笔记文件**
- 追加索引时**不要覆盖**已有条目，只在文件末尾追加
- 详解文件与索引条目一一对应，链接使用相对路径 `./笔记/xxx.md`
- 用户在对话中给出图片题目时，可将题目整理进详解笔记作为典型例题
