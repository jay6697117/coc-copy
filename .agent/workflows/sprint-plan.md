---
description: 冲刺计划管理 — 创建和追踪开发冲刺
---

# /sprint-plan — 冲刺计划管理

> 角色：producer（制作人）
> 来源：改造自 Claude Code Game Studios 的 `/sprint-plan` Skill
> 参数：`/sprint-plan [new|update|review]`

## 工作流步骤

### 步骤 1：读取项目状态

- 读取 `design/gdd/systems-index.md`（获取未实现的系统列表）
- 读取最新的冲刺文件 `production/sprints/sprint-N.md`
- 读取 `production/session-state/active.md`（获取当前进度）
- 读取 `docs/architecture/`（获取架构决策）

### 步骤 2：根据模式执行

#### 模式 A：新建冲刺（`/sprint-plan new`）

1. 分析未完成的系统和功能
2. 与用户讨论冲刺范围：
   - 冲刺时长？（1 周 / 2 周 / 自定义）
   - 优先级最高的 3-5 个任务？
   - 有无技术依赖需要先解决？
3. 为每个任务评估复杂度（1-5 分）和风险（低/中/高）
4. 生成冲刺文件，写入 `production/sprints/sprint-N.md`

#### 模式 B：更新冲刺（`/sprint-plan update`）

1. 读取当前冲刺
2. 标记已完成的任务
3. 处理新增/移除的任务
4. 更新文件

#### 模式 C：冲刺回顾（`/sprint-plan review`）

1. 统计完成率
2. 分析延期原因
3. 提出改进建议
4. 记录到 `production/session-logs/`

### 冲刺文件格式

```markdown
# Sprint [N] — [标题]

- **时间范围**：[开始] → [结束]
- **目标**：[冲刺目标]
- **完成率**：[X/Y] 任务完成

## 任务列表

| ID | 任务 | 系统 | 复杂度 | 风险 | 负责角色 | 状态 |
|:---|:-----|:-----|:-------|:-----|:---------|:-----|
| S1-01 | 实现基础移动 | 角色系统 | 2 | 低 | gameplay-programmer | ✅ |
| S1-02 | 实现战斗公式 | 战斗系统 | 4 | 中 | systems-designer | 🔄 |
| S1-03 | 设计 UI 布局 | UI 系统 | 3 | 低 | ux-designer | ⬜ |

## 阻塞项
- [列出当前阻塞的问题]

## 回顾笔记
- [冲刺结束后填写]
```
