---
description: 配置游戏引擎和技术栈 — 引擎选型、版本锁定、参考文档填充
---

# /setup-engine — 配置技术栈

> 角色：technical-director（技术总监）
> 来源：改造自 Claude Code Game Studios 的 `/setup-engine` Skill
> 参数：`/setup-engine [可选：godot|unity|unreal|web] [可选：版本号]`

## 工作流步骤

### 步骤 1：解析参数

三种模式：
- **完整参数**：`/setup-engine godot 4.6` → 直接跳到步骤 3
- **仅引擎**：`/setup-engine unity` → 跳到步骤 2（版本选择）
- **无参数**：`/setup-engine` → 运行完整引导

### 步骤 2：引导式引擎选型

如果没有提供引擎参数：

1. 检查 `design/gdd/game-concept.md` 是否存在，提取项目信息
2. 如无概念文档，直接询问关键问题：
   - 2D 还是 3D？
   - 目标平台？（桌面 / 移动 / Web / 主机）
   - 团队的编程语言偏好？
   - 预算情况？（开源优先 / 商业可以接受）

3. 展示**引擎决策矩阵**：

| 维度 | Godot 4 | Unity | Unreal Engine 5 | Web (Vite/Three.js) |
|:-----|:--------|:------|:----------------|:-------------------|
| **最擅长** | 2D、轻量 3D | 全能型、移动端 | AAA 3D、开放世界 | 浏览器游戏、快速原型 |
| **语言** | GDScript / C# | C# | C++ / Blueprints | JavaScript / TypeScript |
| **成本** | 免费开源 | 免费 → 付费（收入门槛） | 免费 → 付费（收入门槛） | 免费开源 |
| **学习曲线** | 低 | 中 | 高 | 低-中 |
| **2D 能力** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **3D 能力** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **社区/文档** | 快速成长中 | 巨量 | 巨量 | 巨量 |

4. 给出推荐并附理由，等待用户确认

### 步骤 3：锁定引擎版本

1. 确认具体版本号
2. 更新 `contexts/context.md`：
   - 设置"引擎/技术栈"字段
3. 创建/更新 `.claude/docs/technical-preferences.md`（如适用）

### 步骤 4：知识缺口分析

根据引擎版本评估 AI 的知识风险：
- **低风险**：版本在 AI 训练截止日期之前（可以自信输出代码）
- **中风险**：版本在截止日期附近（需要谨慎，可能有部分 API 变化）
- **高风险**：版本在截止日期之后（需要外部参考文档）

如果为中/高风险：
1. 通知用户存在知识缺口
2. 建议搜索该版本的 breaking changes 和新 API
3. 将找到的信息写入 `docs/engine-reference/`

### 步骤 5：填充引擎参考文档

在 `docs/engine-reference/[引擎名]/` 下创建以下结构：

```
docs/engine-reference/[engine]/
├── VERSION.md              ← 版本号、风险等级、AI 截止日期
├── breaking-changes.md     ← 与上版本的 API 变化
├── deprecated-apis.md      ← 已废弃的函数/类
├── current-best-practices.md ← 当前最佳实践
└── subsystem-modules/      ← 8 个子系统模块
    ├── animation.md
    ├── audio.md
    ├── input.md
    ├── navigation.md
    ├── networking.md
    ├── physics.md
    ├── rendering.md
    └── ui.md
```

### 步骤 6：配置编码规范

根据引擎设置匹配的编码规范：
- **Godot (GDScript)**：snake_case、信号系统、`@export` 注解
- **Unity (C#)**：PascalCase、事件系统、`[SerializeField]`
- **Unreal (C++)**：UE 命名约定、UObject 体系、宏
- **Web (JS/TS)**：camelCase、React/组件模式

### 步骤 7：输出摘要

```
⚙️ 技术栈配置完成！

🔧 引擎：[引擎名 版本号]
📊 知识风险：[低/中/高]
📖 参考文档：docs/engine-reference/[engine]/
📝 Context 已更新：contexts/context.md
🎨 编码规范：[对应的 standards 文件]

推荐下一步：
  1. /map-systems — 分解游戏系统
  2. /prototype — 创建技术原型
```
