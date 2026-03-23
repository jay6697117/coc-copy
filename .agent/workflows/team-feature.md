---
description: 通用功能编排 — 6 阶段跨角色流水线（设计→架构→实现→集成→验证→签收）
---

# /team-feature — 功能编排流水线

> 角色：producer（制作人）总协调，根据领域切换不同角色
> 来源：改造自 Claude Code Game Studios 的 `/team-combat`、`/team-ui`、`/team-level`、`/team-narrative`、`/team-audio` 等 7 个命令
> 参数：`/team-feature [功能名称] [领域：combat|ui|level|narrative|audio|economy]`

## 为什么合并为一个命令？

原版有 7 个 `/team-*` 命令，每个对应不同部门。在 Antigravity 中，AI 不能生成子 Agent，所以我们将其合并为一个通用流水线，通过参数指定领域，由 AI 依次扮演不同角色。

## 6 阶段流水线

### 阶段 1：设计（Design）

**扮演角色**：game-designer / narrative-director / ux-designer（取决于领域）

- 读取相关 GDD
- 如无 GDD，触发 `/design-system` 先创建
- 明确功能范围和验收标准
- 产出：功能设计概要

### 阶段 2：架构（Architecture）

**扮演角色**：lead-programmer / technical-director

- 技术分解：类结构、数据流、接口定义
- 与已有系统的集成点
- 评估性能影响
- 产出：架构草案

### 阶段 3：实现（Implementation）

**扮演角色**：对应领域的 programmer（gameplay-programmer / ui-programmer / ai-programmer 等）

- 按架构草案编写代码
- 遵守对应路径的编码规范
- 暴露调试旋钮（不硬编码数值）
- 产出：实现代码

### 阶段 4：集成（Integration）

**扮演角色**：lead-programmer

- 将新功能与已有系统对接
- 确保事件/信号正确连接
- 处理边界情况
- 产出：集成后的完整功能

### 阶段 5：验证（Validation）

**扮演角色**：qa-tester / performance-analyst

- 测试功能是否满足验收标准
- 检查边界情况处理
- 性能基本测试
- 产出：验证报告

### 阶段 6：签收（Sign-off）

**扮演角色**：producer

- 综合所有阶段报告
- 产出最终状态报告
- 更新冲刺进度
- 推荐下一步

### 领域特有的角色映射

| 领域 | 阶段 1 角色 | 阶段 3 角色 | 特殊检查 |
|:-----|:-----------|:-----------|:---------|
| combat | game-designer + systems-designer | gameplay-programmer + ai-programmer | 公式验证、AI 行为测试 |
| ui | ux-designer | ui-programmer | 无障碍、手柄/键鼠兼容 |
| level | level-designer + narrative-director | gameplay-programmer | 节奏曲线、叙事节拍 |
| narrative | narrative-director + writer | gameplay-programmer | 对话长度 < 120 字、本地化就绪 |
| audio | audio-director + sound-designer | audio-programmer | 音效事件架构 |
| economy | economy-designer | gameplay-programmer | 经济模型验证 |

## 输出

```
🏗️ 功能编排完成：[功能名称]

📊 6 阶段状态：
  ✅ 设计 — [概要]
  ✅ 架构 — [概要]
  ✅ 实现 — [文件列表]
  ✅ 集成 — [概要]
  ✅ 验证 — [通过/关注/失败]
  ✅ 签收 — [状态]

🔧 涉及的系统：[系统列表]
📁 修改的文件：[文件列表]
```
