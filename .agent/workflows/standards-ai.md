---
description: AI 与网络编码规范 — src/ai/ 和 src/networking/ 下的代码标准
---

# /standards-ai — AI 与网络编码规范

> 适用范围：`src/ai/**` 和 `src/networking/**`
> 来源：改造自 Claude Code Game Studios 的 `.claude/rules/ai-code.mdc` + `.claude/rules/network-code.mdc`

## AI 系统规范

### 1. 行为树标准
- 每个 AI 角色使用行为树或状态机管理
- 行为树节点分类：
  - **Composite**：Sequence、Selector、Parallel
  - **Decorator**：Inverter、Repeater、Cooldown
  - **Leaf**：Action、Condition
- 叶节点保持原子性（一个节点只做一件事）

### 2. 寻路优化
- 使用引擎内置寻路系统（NavMesh / AStar）
- 避免每帧重新计算路径
- 分帧计算（coroutine / 分批处理）
- 设置最大搜索距离限制

### 3. 感知系统
```
// AI 感知更新频率控制
const PERCEPTION_INTERVAL = 0.2  // 每 0.2 秒刷新一次，不要每帧
var _perception_timer = 0.0

func _process(delta):
    _perception_timer += delta
    if _perception_timer >= PERCEPTION_INTERVAL:
        _perception_timer = 0.0
        update_perception()
```
- AI 感知（视线、听力等）不在每帧执行
- 使用固定间隔或事件触发

### 4. 决策数据分离
- AI 决策参数从配置文件加载（攻击范围、逃跑阈值等）
- 不在代码中硬编码 AI 行为参数
- AI 行为日志用于调试（可在 Release 中关闭）

## 网络系统规范

### 1. 状态同步
- 使用权威服务器模型
- 客户端只发送输入，不发送状态
- 差值更新（只发送变化的部分）

### 2. 延迟补偿
- 客户端预测 + 服务器校正
- 平滑插值（不要"闪现"）
- 最大延迟容忍设计

### 3. 序列化
- 使用紧凑的二进制格式
- 位打包（bit packing）优化带宽
- 版本化协议（兼容旧版本客户端）

### 4. 可靠性
- 区分可靠/不可靠消息
  - 位置更新 → 不可靠（UDP）
  - 物品交易 → 可靠（TCP / 确认应答）
- 处理丢包和乱序
