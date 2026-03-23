---
description: 测试编码规范 — tests/ 下的代码标准
---

# /standards-test — 测试编码规范

> 适用范围：`tests/**`
> 来源：改造自 Claude Code Game Studios 的 `.claude/rules/test-standards.mdc`

## 核心原则

### 1. AAA 结构
```
func test_damage_calculation():
    # Arrange（准备）
    var attacker = create_test_character(attack: 10)
    var defender = create_test_character(defense: 3)

    # Act（执行）
    var result = DamageCalculator.calculate(attacker, defender)

    # Assert（断言）
    assert_eq(result.damage, 7)  # 10 - 3 = 7
```
- 每个测试严格遵守 AAA 模式
- 一个测试只验证一件事

### 2. 命名约定
```
# 格式：test_[被测行为]_[条件]_[预期结果]
func test_attack_when_target_has_armor_reduces_damage():
func test_heal_when_at_full_health_does_nothing():
func test_levelup_when_xp_sufficient_increases_level():
```

### 3. 无外部依赖
- 测试不依赖文件系统、网络、数据库
- 使用 Mock / Stub 替代外部依赖
- 测试可以在任何顺序执行
- 每个测试独立、互不影响

### 4. 测试分类

| 类型 | 覆盖范围 | 运行频率 |
|:-----|:---------|:---------|
| **单元测试** | 单个函数/方法 | 每次提交 |
| **集成测试** | 系统间交互 | 每日/每个冲刺 |
| **性能测试** | 基准性能指标 | 每个里程碑 |
| **回归测试** | 已修复的 Bug | 每次发布前 |

### 5. 测试覆盖目标

| 代码层 | 最低覆盖率 |
|:-------|:-----------|
| `src/core/` | 80% |
| `src/gameplay/` 公式计算 | 95% |
| `src/ui/` | 50% |
| `prototypes/` | 0%（不需要测试）|

### 6. 性能基准测试
```
func test_pathfinding_performance():
    var start_time = Time.get_ticks_msec()
    for i in 1000:
        pathfinder.find_path(start, end)
    var elapsed = Time.get_ticks_msec() - start_time
    assert_lt(elapsed, 100)  # 1000 次寻路 < 100ms
```
- 关键系统编写性能基准测试
- 设置明确的时间/内存阈值
- 性能回归自动报警
