# study

我的考研学习工具集，包含三个子项目：

| 目录 | 说明 |
| --- | --- |
| [`408-quiz-app`](./408-quiz-app) | 408 离线刷题应用（Flask + SQLite），王道选择题题库、错题本、收藏、模拟考试 |
| [`learn-math`](./learn-math) | Agent Skill：数学问题自动沉淀为笔记（考研数学错题/知识点整理工作流） |
| [`video-summarizer`](./video-summarizer) | Agent Skill：视频链接一键出结构化笔记（字幕提取三层降级 + 关键帧截图），基于 [keepongo/video-summarizer](https://github.com/keepongo/video-summarizer) 二次完善 |

## video-summarizer 的本地完善点

- 国内平台（B站/抖音/小红书）自动绕过代理，修复境外代理出口 IP 触发的 HTTP 412
- Whisper `device=auto` 误选 CUDA 缺运行库时自动回退 CPU
- ffmpeg 缺失时使用 `imageio-ffmpeg` 内置二进制兜底
- 降级失败时精确提示缺失的依赖
- B站页面请求自动携带 buvid cookie
