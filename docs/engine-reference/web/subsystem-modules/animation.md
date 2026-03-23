# 动画子系统

## 技术方案：PixiJS 内置动画 + Spritesheet

### 核心能力
- **Spritesheet 帧动画**：士兵行走、攻击等序列帧动画
- **Tween 动画**：建筑移动、UI 过渡等补间动画
- **Ticker 驱动**：基于 PixiJS Ticker 的游戏循环动画

### COC 克隆动画需求
1. **建筑动画** — 矿场挖矿、兵营训练、大本营升级中
2. **单位动画** — 行走、攻击、死亡
3. **弹道动画** — 箭矢飞行、炮弹轨迹
4. **特效动画** — 爆炸、治疗光环
5. **UI 动画** — 面板弹出、数字飘字

### 推荐方案
```typescript
import { AnimatedSprite, Assets } from 'pixi.js';

// 加载 spritesheet
const sheet = await Assets.load('units/archer.json');

// 创建帧动画
const archer = new AnimatedSprite(sheet.animations['walk']);
archer.animationSpeed = 0.15;
archer.play();
```
