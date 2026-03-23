---
description: 项目初始化引导 — 检测项目状态，引导用户选择发展路径
---

# /start — 项目初始化引导

> 角色：producer（制作人）
> 来源：改造自 Claude Code Game Studios 的 `/start` Skill

## 工作流步骤

### 步骤 1：静默检测项目状态

在开始对话之前，先静默检查以下内容：

1. **引擎配置**：检查 `contexts/context.md` 中的"引擎/技术栈"是否已填写
2. **游戏概念**：检查 `design/gdd/game-concept.md` 是否存在
3. **源代码**：在 `src/` 目录中搜索代码文件（`.gd`, `.cs`, `.cpp`, `.js`, `.ts`, `.jsx`, `.tsx`）
4. **原型**：检查 `prototypes/` 子目录
5. **生产文档**：检查 `production/sprints/` 是否存在冲刺计划

记录检测结果，但先不输出。

### 步骤 2：询问用户当前处于哪个阶段

向用户展示 4 条路径，让其选择：

**路径 A — 完全没想法**
> "我还没有任何游戏想法，想从零开始"

**路径 B — 有模糊的想法**
> "我有个大概的方向（比如'太空探索'或'卡牌 RPG'），但没有具体细节"

**路径 C — 已有清晰概念**
> "我知道要做什么游戏，但还没有文档和代码"

**路径 D — 已有现成工作**
> "我已经有代码、文档或原型"

### 步骤 3：根据选择进行路由

#### 如果选择路径 A（没想法）：
1. 告知用户："我们先来一场创意头脑风暴！"
2. 推荐工作流序列：
   ```
   /brainstorm open → /setup-engine → /map-systems → /prototype → /sprint-plan
   ```
3. 使用"动词优先设计法"开始引导 — 不讨论类型，先讨论"你想让玩家做什么动作？"

#### 如果选择路径 B（模糊想法）：
1. 请用户用一句话描述想法
2. 推荐工作流序列：
   ```
   /brainstorm [用户的想法] → /setup-engine → /map-systems → /prototype → /sprint-plan
   ```

#### 如果选择路径 C（清晰概念）：
1. 追问以下问题：
   - 游戏类型/核心机制是什么？
   - 目标范围？（Game Jam / 小型项目 / 中大型项目）
   - 有偏好的引擎吗？
2. 根据回答提供选择：
   - 选项 A：先通过 `/brainstorm` 正式化概念
   - 选项 B：直接跳到 `/setup-engine` 配置技术栈
3. 推荐序列：
   ```
   /brainstorm 或 /setup-engine → /map-systems → /design-system → /prototype → /sprint-plan
   ```

#### 如果选择路径 D（已有工作）：
1. 分享步骤 1 的检测结果
2. 推荐运行完整项目诊断：
   ```
   → 检查文档覆盖率、代码结构、测试状态
   ```
3. 根据缺口推荐：
   - 缺引擎配置 → `/setup-engine`
   - 缺 GDD → `/design-system`（或对现有代码进行逆向文档化）
   - 缺测试 → 补充测试
   - 都有 → `/gate-check` 检查阶段就绪度
4. 推荐序列：
   ```
   /setup-engine → /design-system → /gate-check → /sprint-plan
   ```

### 步骤 4：确认并准备出发

1. 确认用户想要执行的下一步
2. 更新 `contexts/context.md` 中的"当前阶段"
3. 引导用户或直接启动推荐的工作流

### 步骤 5：输出推荐路径摘要

格式：
```
🎮 项目初始化完成！

选择的路径：[A/B/C/D]
当前阶段：[概念/系统设计/技术搭建/...]
推荐的下一步：
  1. /[command] — [说明]
  2. /[command] — [说明]
  3. /[command] — [说明]
```
