# Web 游戏开发最佳实践

## PixiJS v8 最佳实践

### 1. 应用初始化
```typescript
import { Application } from 'pixi.js';

const app = new Application();

async function init() {
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x1a1a2e,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
}
```

### 2. 资源管理
- 使用 `Assets.load()` 预加载所有资源
- 使用 `Assets.bundle` 管理资源分组
- 实现加载进度条提升用户体验

```typescript
import { Assets } from 'pixi.js';

// 定义资源包
Assets.addBundle('buildings', {
  townhall: 'assets/buildings/townhall.png',
  cannon: 'assets/buildings/cannon.png',
  wall: 'assets/buildings/wall.png',
});

// 加载时显示进度
const textures = await Assets.loadBundle('buildings', (progress) => {
  console.log(`加载进度: ${progress * 100}%`);
});
```

### 3. 性能优化
- **对象池**：频繁创建/销毁的对象（如子弹、特效）使用对象池
- **纹理图集**：使用 Spritesheet 减少 draw call
- **视口裁剪**：只渲染可见区域的对象
- **避免频繁创建 Graphics**：缓存不变的图形

### 4. 游戏循环
```typescript
app.ticker.add((ticker) => {
  const delta = ticker.deltaTime;
  // 更新游戏逻辑
  gameWorld.update(delta);
});
```

### 5. 响应式设计
```typescript
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  // 重新计算游戏画面缩放
});
```

## TypeScript 最佳实践

### 1. 严格模式
在 `tsconfig.json` 中启用严格模式：
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 2. 类型定义
- 为游戏数据定义明确的类型/接口
- 使用 `enum` 或 `const` 对象定义游戏常量
- 避免使用 `any`

## Vite 最佳实践

### 1. 资源处理
- 静态资源放在 `public/` 目录
- 使用 `import.meta.env` 管理环境变量

### 2. 构建优化
- 配置代码分割
- 开启 gzip 压缩
- Tree-shaking 移除未使用代码
