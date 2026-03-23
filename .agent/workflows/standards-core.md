---
description: 核心引擎编码规范 — src/core/ 下的代码标准
---

# /standards-core — 核心引擎编码规范

> 适用范围：`src/core/**`
> 来源：改造自 Claude Code Game Studios 的 `.claude/rules/engine-code.mdc`

## 核心原则

### 1. 零分配热路径
```
❌ 错误：func _process(delta): var result = Array.new()  // 每帧创建数组
✅ 正确：var _result_cache = []  // 预分配，复用
         func _process(delta): _result_cache.clear()
```
- 每帧调用的函数中禁止 `new` / 创建临时对象
- 使用对象池管理频繁创建/销毁的对象

### 2. 线程安全
- 共享状态必须有同步保护
- 主线程处理渲染和 UI
- 重计算放到工作线程
- 异步操作需要明确的完成回调

### 3. API 稳定性
- 核心模块的公共 API 变更需要创建 ADR（`/architecture-decision`）
- 废弃的 API 用 `@deprecated` 标记并保留至少 1 个版本
- 内部方法使用下划线前缀（`_internal_method`）

### 4. 对象池
```
// 对象池模式示例
class BulletPool:
    var available = []
    var active = []

    func get():
        if available.is_empty():
            return create_new()
        var obj = available.pop_back()
        active.append(obj)
        return obj

    func release(obj):
        active.erase(obj)
        available.append(obj)
        obj.reset()
```

### 5. 错误处理
- 核心模块不使用 `assert`（assert 在 Release 构建中被移除）
- 返回错误码或使用 Result 模式
- 关键失败路径要有日志输出

## 性能预算

| 指标 | 目标值 |
|:-----|:-------|
| 帧时间（60 FPS） | < 16.67ms |
| 帧时间（30 FPS） | < 33.33ms |
| 每帧内存分配 | < 1 KB |
| 启动时间 | < 3 秒 |
