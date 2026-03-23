# 网络子系统

## 技术方案：RESTful API + WebSocket

### 架构设计
- **RESTful API**：账号管理、数据保存/加载、匹配搜索等低频操作
- **WebSocket**：部落聊天、实时通知（被攻击提醒）等高频通信

### COC 克隆网络需求
1. **账号系统** — 注册/登录、数据云端存储
2. **异步 PvP** — 上传基地布局 → 匹配 → 下载对手基地 → 本地模拟战斗 → 上传结果
3. **部落聊天** — WebSocket 实时消息
4. **捐兵** — 部落成员间的异步操作
5. **排行榜** — 定期拉取排名数据

### 实现优先级
MVP 阶段先做本地单机，数据存储在浏览器 IndexedDB 中。后续再接入后端。

### 后端技术选型（后续）
- **Node.js + Express/Fastify** — API 服务
- **Socket.io** — WebSocket 通信
- **MongoDB / PostgreSQL** — 数据存储
- **Redis** — 缓存和排行榜
