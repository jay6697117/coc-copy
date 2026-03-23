# 输入子系统

## 技术方案：PixiJS EventSystem + 浏览器原生事件

### 核心能力
- **点击/触摸**：PixiJS 内置 `EventSystem` 自动处理
- **拖拽**：建筑放置/移动需要拖拽支持
- **缩放/平移**：双指缩放（移动端）+ 鼠标滚轮/拖拽（桌面端）

### COC 克隆特定需求
1. **建筑拖放** — pointerdown → pointermove → pointerup 三阶段
2. **地图平移** — 拖拽空白区域移动视角
3. **捏合缩放** — 移动端双指手势
4. **长按识别** — 长按建筑进入编辑模式
5. **军队部署** — 在战斗界面快速点击/滑动部署军队

### 实现要点
```typescript
// PixiJS v8 事件示例
sprite.eventMode = 'static'; // 启用交互
sprite.on('pointerdown', onDragStart);
sprite.on('pointermove', onDragMove);
sprite.on('pointerup', onDragEnd);
```
