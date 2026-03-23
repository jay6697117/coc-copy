---
description: 会话保存 — 将当前进度写入 active.md 并归档
---

# /session-save — 会话保存

> 角色：producer（制作人）
> 来源：改造自 Claude Code Game Studios 的 `pre-compact.sh` + `session-stop.sh` Hook

## 使用时机
- 工作到一半需要暂停时
- 上下文窗口快满时（主动保存）
- 一段长时间工作即将结束时

## 工作流步骤

### 步骤 1：收集当前状态

自动收集以下信息：
1. **当前任务**：正在做什么？
2. **进度清单**：哪些做完了，哪些还没做？
3. **关键决策**：本次会话中做了哪些重要决策？
4. **修改的文件**：列出所有已修改/新增的文件
5. **未完成的工作**：WIP 标记（`TODO`、`WIP`、`[TBD]`）

### 步骤 2：写入 active.md

将信息写入 `production/session-state/active.md`：

```markdown
<!-- STATUS -->
当前任务：[任务描述]
所属系统：[系统名]
<!-- /STATUS -->

# 会话状态 — [日期时间]

## 当前任务
[正在做什么]

## 进度清单
- [x] [已完成的项目]
- [ ] [未完成的项目]

## 关键决策
1. [决策 1]
2. [决策 2]

## 修改的文件
- [文件路径 1]（[修改类型]）
- [文件路径 2]（[修改类型]）

## WIP 标记
- [文件:行号] TODO: [内容]

## 下次继续
[下次会话应该从哪里开始？]
```

### 步骤 3：归档到会话日志

将上一份 `active.md` 的内容追加到 `production/session-logs/session-log.md`，带上时间戳。

### 步骤 4：输出确认

```
💾 会话已保存！

📁 状态文件：production/session-state/active.md
📝 会话日志：production/session-logs/session-log.md
📋 已记录：
  - [N] 个已完成任务
  - [N] 个待办任务
  - [N] 个关键决策
  - [N] 个修改文件

下次运行 /session-start 即可恢复进度。
```
