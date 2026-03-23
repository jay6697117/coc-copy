# 已废弃 API

## PixiJS v8 中已废弃的 API

| 废弃 API | 替代方案 | 说明 |
|:---------|:---------|:-----|
| `PIXI.Loader` | `PIXI.Assets` | 新的异步资源加载系统 |
| `DisplayObject` | `Container` | 所有显示对象的基类改为 Container |
| `updateTransform()` | 自动处理 | 变换矩阵自动更新 |
| `InteractionManager` | `EventSystem` | 事件系统重构 |
| `beginFill()` / `endFill()` | `.fill()` | Graphics API 简化 |
| `lineStyle()` | `.stroke()` | Graphics 描边 API |
| `PIXI.utils` | 各自独立导入 | 工具函数拆分为独立模块 |
| `Ticker.shared` | `Ticker` 实例 | 推荐使用 Application 的 ticker |
| `PIXI.settings` | 各自渲染器配置 | 全局设置被拆分 |
