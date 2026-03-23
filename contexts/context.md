# 🎮 Game Studio — 项目核心上下文

> 本文件是 AI 自动读取的项目核心配置。改造自 [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)。

## 项目基本信息

- **项目名称**：[待填写]
- **游戏类型**：[待填写]
- **目标平台**：[待填写]
- **引擎/技术栈**：[待填写 — 运行 `/setup-engine` 配置]
- **当前阶段**：概念 ← [概念 | 系统设计 | 技术搭建 | 预生产 | 生产 | 打磨 | 发布]

---

## 核心协作协议

> ⚠️ 这是整个工作流体系的基石。所有工作流都必须遵守。

### 基本原则
1. **用户驱动协作，非自主执行** — 永远不要在没有用户明确批准的情况下进行破坏性变更或提交
2. **协作而非指令** — AI 是专家顾问，不是独裁者

### 5 步决策循环
每个重要决策都必须经过以下循环：

```
提问 → 选项 → 决策 → 草稿 → 批准
 (1)    (2)    (3)    (4)    (5)
```

1. **提问**：识别歧义，提出澄清性问题（一次最多 4 个）
2. **选项**：提供 2-4 个不同方案，每个包含优劣分析和参考案例
3. **决策**：用户选择方案或提供混合方向
4. **草稿**：增量式编写内容，一次一个章节，逐步反馈
5. **批准**：在写入文件前必须获得明确的 "是"

### 写入权限门
- **永远不要**未经许可就写入或修改文件
- 先展示内容，获得批准后再写入
- 对于每个文件操作，明确说明："我要将这个写入 [文件路径]，可以吗？"

---

## 文件即记忆策略

> LLM 上下文窗口是有限的。**磁盘文件是记忆，对话历史是临时的。**

### 核心规则
1. **立即持久化** — 每个重要里程碑完成后立即写入文件
2. **增量写入** — 先创建骨架，逐节填充（每节 3-5k token）
3. **会话状态** — 使用 `production/session-state/active.md` 作为"检查点"
4. **主动压缩** — 在上下文使用 60-70% 时主动保存状态

### 会话管理命令
- `/session-start` — 启动新会话时运行，恢复上次进度
- `/session-save` — 保存当前进度到 `active.md`

---

## 目录结构标准

```
项目根目录/
├── contexts/                       ← AI 读取的上下文配置
│   ├── context.md                  ← 本文件（核心配置）
│   └── agents-roster.md            ← Agent 角色手册
├── .agent/workflows/               ← 工作流文件（/command 触发）
├── templates/                      ← 文档模板
├── design/                         ← 设计文档
│   ├── gdd/                        ← 游戏设计文档（GDD）
│   │   ├── game-concept.md         ← 游戏概念
│   │   ├── game-pillars.md         ← 游戏核心支柱
│   │   └── systems-index.md        ← 系统索引与依赖
│   └── narrative/                  ← 叙事和世界观
├── docs/                           ← 技术文档
│   ├── architecture/               ← 架构决策记录 (ADR)
│   └── engine-reference/           ← 引擎 API 参考
├── src/                            ← 源代码
│   ├── gameplay/                   ← 游戏逻辑（→ standards-gameplay 规范）
│   ├── core/                       ← 核心引擎封装（→ standards-core 规范）
│   ├── ui/                         ← 用户界面（→ standards-ui 规范）
│   ├── ai/                         ← AI 系统（→ standards-ai 规范）
│   └── networking/                 ← 网络代码
├── assets/                         ← 游戏资源
│   ├── data/                       ← 数据文件（JSON/CSV）
│   └── shaders/                    ← 着色器
├── tests/                          ← 测试代码（→ standards-test 规范）
├── prototypes/                     ← 实验性原型（沙箱环境）
└── production/                     ← 生产管理
    ├── sprints/                    ← 冲刺计划
    ├── milestones/                 ← 里程碑
    ├── session-state/              ← 会话状态（active.md）
    ├── session-logs/               ← 会话历史日志
    └── releases/                   ← 发布记录
```

---

## 游戏设计核心支柱

> 运行 `/brainstorm` 后在此填写。支柱是项目的"宪法"，所有设计决策必须符合。

1. **[支柱 1]**：[待填写]
2. **[支柱 2]**：[待填写]
3. **[支柱 3]**：[待填写]

### 反面支柱（Anti-Pillars）
- **[反面 1]**：[待填写 — 这个游戏明确不做的事情]

---

## 工作流快速索引

| 命令 | 用途 | 阶段 |
|:-----|:-----|:-----|
| `/start` | 项目初始化引导 | 🟢 启动 |
| `/brainstorm` | 创意头脑风暴 | 🟢 启动 |
| `/setup-engine` | 配置技术栈 | 🟢 启动 |
| `/map-systems` | 系统分解与依赖 | 🔵 设计 |
| `/design-system` | GDD 系统设计 | 🔵 设计 |
| `/design-review` | 设计文档审查 | 🔵 设计 |
| `/sprint-plan` | 冲刺计划管理 | 🟡 开发 |
| `/prototype` | 原型搭建 | 🟡 开发 |
| `/code-review` | 代码审查 | 🟡 开发 |
| `/architecture-decision` | 架构决策记录 | 🟡 开发 |
| `/balance-check` | 游戏平衡检查 | 🟠 测试 |
| `/playtest-report` | 测试报告 | 🟠 测试 |
| `/bug-report` | Bug 报告 | 🟠 测试 |
| `/gate-check` | 阶段验证检查 | 🔴 质量 |
| `/tech-debt` | 技术债务管理 | 🔴 质量 |
| `/perf-profile` | 性能分析 | 🔴 质量 |
| `/release-checklist` | 发布检查清单 | 🔴 发布 |
| `/session-start` | 会话启动检查 | 🟣 会话 |
| `/session-save` | 会话保存 | 🟣 会话 |
| `/team-feature` | 功能编排流水线 | 🟤 团队 |
| `/team-polish` | 打磨流水线 | 🟤 团队 |
| `/team-release` | 发布流水线 | 🟤 团队 |

### 编码规范
| 命令 | 适用范围 |
|:-----|:---------|
| `/standards-gameplay` | `src/gameplay/` 下的游戏逻辑 |
| `/standards-core` | `src/core/` 下的引擎核心 |
| `/standards-ui` | `src/ui/` 下的界面代码 |
| `/standards-ai` | `src/ai/` 下的 AI 和 `src/networking/` |
| `/standards-test` | `tests/` 下的测试代码 |
