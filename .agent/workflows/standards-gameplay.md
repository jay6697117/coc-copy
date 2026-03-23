---
description: 游戏逻辑编码规范 — src/gameplay/ 下的代码标准
---

# /standards-gameplay — 游戏逻辑编码规范

> 适用范围：`src/gameplay/**`
> 来源：改造自 Claude Code Game Studios 的 `.claude/rules/gameplay-code.mdc`

## 核心原则

### 1. 数据驱动设计
```
❌ 错误：var damage = 50
✅ 正确：var damage = config.get("base_damage")
```
- 所有游戏数值**必须**从配置文件/数据表加载
- 配置文件位于 `assets/data/` 目录
- GDD 中的"调试旋钮"必须作为可配置变量暴露

### 2. Delta Time
```
❌ 错误：position.x += speed
✅ 正确：position.x += speed * delta
```
- 所有与时间相关的计算必须使用 delta time
- 物理相关逻辑使用固定步长（fixed delta）

### 3. 状态机模式
- 角色/AI/游戏阶段使用状态机管理
- 每个状态有明确的进入(`enter`)、更新(`update`)、退出(`exit`) 方法
- 状态转换条件必须明确定义

### 4. GameManager 分离
- 游戏逻辑不直接操作 UI
- 通过事件系统/信号机制通信
- 单一职责：一个系统只管一件事

### 5. 事件系统
```
❌ 错误：直接调用其他系统的方法 enemy.take_damage(50)
✅ 正确：EventBus.emit("damage_dealt", {target: enemy, amount: 50})
```
- 系统间通过事件/信号解耦
- 事件名使用过去式（`damage_dealt`，不是 `deal_damage`）

## 代码风格

- 函数保持 < 30 行
- 使用中文注释
- TODO 格式：`TODO(name): 描述`
- 每个文件顶部有简要的中文说明注释
- 魔法数字必须定义为常量
