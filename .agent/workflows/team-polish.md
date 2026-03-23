---
description: 打磨流水线 — 性能优化、Bug 修复、视觉增强、浸泡测试
---

# /team-polish — 打磨流水线

> 角色：performance-analyst（性能分析师）主导
> 来源：改造自 Claude Code Game Studios 的 `/team-polish` Skill

## 4 阶段打磨流水线

### 阶段 1：性能评估

**扮演角色**：performance-analyst

- 运行 `/perf-profile` 找出性能瓶颈
- 标记需要优化的 Top 5 热点
- 评估优化的投入产出比

### 阶段 2：优化执行

**扮演角色**：engine-programmer / graphics-programmer

- 修复 Draw Call 过多的问题
- 消除内存泄漏
- 优化热路径中的分配
- 实现延迟加载/对象池

### 阶段 3：视觉增强（Juice）

**扮演角色**：technical-artist

- 添加屏幕震动效果
- 添加镜头效果（景深、动态模糊等）
- 添加粒子效果
- 添加过渡动画
- 增强反馈感（命中效果、收集效果等）

### 阶段 4：浸泡测试

**扮演角色**：qa-tester

- 长时间运行功能，观察性能降级
- 检查内存增长趋势
- 验证优化效果
- 记录剩余的边缘问题

## 输出

```
✨ 打磨报告

📊 性能优化：
  - 帧时间 [之前] → [之后]
  - 内存使用 [之前] → [之后]
  - Draw Call [之前] → [之后]

🎨 视觉增强：
  - [添加的效果列表]

🧪 浸泡测试：
  - 运行时间：[时间]
  - 稳定性：[稳定/有退化]
```
