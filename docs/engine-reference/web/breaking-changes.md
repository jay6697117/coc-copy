# PixiJS v8 Breaking Changes（相对于 v7）

> 参考：https://pixijs.com/guides/migrations/v8

## 重大变更

### 1. 渲染器架构
- v7 的 `Renderer` 被拆分为 `WebGLRenderer` 和 `WebGPURenderer`
- 使用 `autoDetectRenderer()` 自动选择最佳渲染器
- 新增 `Application.init()` — 异步初始化替代构造函数

```typescript
// v8 写法
const app = new Application();
await app.init({ width: 800, height: 600 });
```

### 2. 显示对象体系
- `DisplayObject` 被移除，`Container` 成为基类
- `Sprite`、`Graphics`、`Text` 等直接继承 `Container`
- 移除 `updateTransform()` 方法

### 3. 资源加载
- `Loader` 被移除，使用新的 `Assets` 系统
- 基于 Promise 的异步加载

```typescript
// v8 写法
import { Assets } from 'pixi.js';
const texture = await Assets.load('image.png');
```

### 4. Graphics API
- `Graphics` API 完全重写
- 链式调用变为方法调用

```typescript
// v7
graphics.beginFill(0xff0000).drawRect(0, 0, 100, 100).endFill();

// v8
graphics.rect(0, 0, 100, 100).fill(0xff0000);
```

### 5. 文本渲染
- `TextStyle` 属性名称变更（如 `fill` 直接接受颜色值）
- 新增 `HTMLText` 组件

### 6. 事件系统
- 统一使用 `EventSystem`，替代旧的 `InteractionManager`
- 事件冒泡和捕获更符合 DOM 标准

## 需要特别注意
- PixiJS v8 不向后兼容 v7，不能混用 v7 的插件
- 所有示例代码需确保是 v8 语法
