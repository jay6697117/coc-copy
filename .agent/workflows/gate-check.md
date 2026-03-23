---
description: 阶段验证检查 — 验证是否满足进入下一阶段的条件
---

# /gate-check — 阶段验证检查

> 角色：producer（制作人） + qa-lead（质量保证负责人）
> 来源：改造自 Claude Code Game Studios 的 `/gate-check` Skill
> 参数：`/gate-check [当前阶段]`

## 7 个项目阶段

```
概念 → 系统设计 → 技术搭建 → 预生产 → 生产 → 打磨 → 发布
```

## 各阶段门检查标准

### 概念 → 系统设计
- [ ] `design/gdd/game-concept.md` 存在且通过 `/design-review`
- [ ] `design/gdd/game-pillars.md` 存在
- [ ] 核心循环已定义（30 秒 / 5 分钟 / 进阶循环）
- [ ] 目标玩家画像已明确

### 系统设计 → 技术搭建
- [ ] `design/gdd/systems-index.md` 存在
- [ ] 所有 Foundation 层系统已有 GDD
- [ ] 至少 80% 的 Core 层系统已有 GDD
- [ ] 系统间依赖关系已标注

### 技术搭建 → 预生产
- [ ] 引擎已配置（`contexts/context.md` 中引擎字段已填写）
- [ ] 至少 1 个架构决策记录存在（`docs/architecture/`）
- [ ] 编码规范已确定
- [ ] 目录结构已建立

### 预生产 → 生产
- [ ] 至少 1 个原型验证通过（`prototypes/` 中有成功案例）
- [ ] 第一个冲刺计划已创建（`production/sprints/sprint-1.md`）
- [ ] 核心系统的 GDD 全部通过 `/design-review`
- [ ] 技术栈决策已最终确定

### 生产 → 打磨
- [ ] 所有冲刺任务完成率 > 80%
- [ ] 核心功能已实现（Feature Complete）
- [ ] 所有 Critical/Major bug 已修复
- [ ] 基础测试通过

### 打磨 → 发布
- [ ] 所有已知 Bug 已修复或标记为"已知问题"
- [ ] 性能达标（帧率/加载时间/内存）
- [ ] UI/UX 审查通过
- [ ] 发布检查清单全部通过（`/release-checklist`）

## 输出格式

```
🚪 阶段门检查：[当前阶段] → [下一阶段]

通过条件：[X/Y] 达标

✅ 通过（[N] 项）
  - [条件]

❌ 未达标（[N] 项）
  - [条件] → [建议操作]

总体判定：[PASS ✅ | CONCERN ⚠️ | FAIL ❌]
```

如果 PASS，更新 `contexts/context.md` 中的"当前阶段"。
