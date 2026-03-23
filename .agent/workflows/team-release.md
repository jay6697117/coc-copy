---
description: 发布流水线 — 授权、分支、检查清单、质量门、Go/No-Go、部署
---

# /team-release — 发布流水线

> 角色：producer（制作人） + release-manager（发布经理）
> 来源：改造自 Claude Code Game Studios 的 `/team-release` Skill
> 参数：`/team-release [版本号]`

## 6 阶段发布流水线

### 阶段 1：发布授权

**扮演角色**：producer

- 确认发布版本号
- 审查当前里程碑完成度
- 列出自上次发布以来的主要变更
- 获取用户的发布授权

### 阶段 2：准备发布分支

**扮演角色**：release-manager

- 创建发布分支（如适用）
- 冻结新功能合入
- 标记版本号

### 阶段 3：质量门

**扮演角色**：qa-lead

- 运行 `/release-checklist` 检查全部项目
- 执行回归测试
- 验证所有已知 Bug 的状态

### 阶段 4：构建与打包

**扮演角色**：devops-engineer

- 构建 Release 版本
- 验证安装流程
- 准备平台特定的包

### 阶段 5：Go / No-Go 决策

**扮演角色**：producer

综合所有阶段报告，给出决策：

| 条件 | Go | No-Go |
|:-----|:---|:------|
| 重大 Bug | 0 个 | > 0 个 |
| 发布检查清单 | 100% 通过 | < 100% |
| 性能达标 | 是 | 否 |
| 构建成功 | 是 | 否 |

### 阶段 6：发布执行

如果 Go：
- 打 tag（git tag）
- 生成更新日志（`CHANGELOG.md`）
- 生成玩家友好的发布说明
- 部署/发布

如果 No-Go：
- 列出阻塞项
- 创建修复冲刺
- 设定新的预期发布日期

## 输出

```
🚀 发布流水线：v[版本号]

阶段状态：
  ✅ 发布授权
  ✅ 发布分支
  [✅/❌] 质量门
  [✅/❌] 构建打包
  📋 Go/No-Go 决策：[GO ✅ / NO-GO ❌]

[如果 GO]
  📦 已发布：v[版本号]
  📝 更新日志：CHANGELOG.md
  📄 发布说明：production/releases/REL-v[版本号]-notes.md

[如果 NO-GO]
  ❌ 阻塞项：[列表]
  📋 修复计划：[概要]
```
