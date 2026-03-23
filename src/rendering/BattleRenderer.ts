// ============================================================
// 战斗渲染器 — 渲染战斗场景（单位、建筑、血条、特效）
// ============================================================

import { Application, Container, Graphics, Text } from 'pixi.js';
import { CELL_PX } from '../gameplay/GridMap.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { BattleEngine } from '../gameplay/BattleEngine.js';
import type { BattleUnit, BattleBuilding } from '../types/index.js';

/** 单位渲染精灵 */
interface UnitSprite {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  icon: Text;
}

export class BattleRenderer {
  private app: Application;
  private configLoader: ConfigLoader;
  private worldContainer: Container;
  private buildingLayer: Container;
  private unitLayer: Container;
  private uiLayer: Container;

  /** 单位精灵映射 */
  private unitSprites: Map<string, UnitSprite> = new Map();
  /** 建筑精灵 */
  private buildingSprites: Map<string, { container: Container; hpBar: Graphics }> = new Map();

  constructor(app: Application, configLoader: ConfigLoader) {
    this.app = app;
    this.configLoader = configLoader;
    this.worldContainer = new Container();
    this.buildingLayer = new Container();
    this.unitLayer = new Container();
    this.uiLayer = new Container();

    this.worldContainer.addChild(this.buildingLayer);
    this.worldContainer.addChild(this.unitLayer);
    this.worldContainer.addChild(this.uiLayer);
  }

  getWorldContainer(): Container {
    return this.worldContainer;
  }

  /** 初始化战场渲染 */
  initBattlefield(engine: BattleEngine): void {
    this.clearAll();

    // 渲染地面
    const ground = new Graphics();
    ground.rect(0, 0, 40 * CELL_PX, 40 * CELL_PX);
    ground.fill(0x3a6a2a);
    this.buildingLayer.addChild(ground);

    // 渲染网格线
    const grid = new Graphics();
    grid.setStrokeStyle({ width: 0.5, color: 0x4a7a3a, alpha: 0.3 });
    for (let x = 0; x <= 40; x++) {
      grid.moveTo(x * CELL_PX, 0);
      grid.lineTo(x * CELL_PX, 40 * CELL_PX);
    }
    for (let y = 0; y <= 40; y++) {
      grid.moveTo(0, y * CELL_PX);
      grid.lineTo(40 * CELL_PX, y * CELL_PX);
    }
    grid.stroke();
    this.buildingLayer.addChild(grid);

    // 渲染敌方建筑
    for (const bld of engine.buildings) {
      this.addBattleBuilding(bld);
    }

    // 居中相机
    const canvasRect = this.app.canvas.getBoundingClientRect();
    this.worldContainer.x = canvasRect.width / 2 - (40 * CELL_PX) / 2;
    this.worldContainer.y = canvasRect.height / 2 - (40 * CELL_PX) / 2;
    this.worldContainer.scale.set(0.7);
  }

  /** 添加战场建筑 */
  private addBattleBuilding(bld: BattleBuilding): void {
    const config = this.configLoader.getBuilding(bld.configId);
    if (!config) return;

    const container = new Container();
    const sizePx = bld.size * CELL_PX;

    // 背景
    const bg = new Graphics();
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 3);
    bg.fill(config.color);
    bg.setStrokeStyle({ width: 1.5, color: 0xff4444, alpha: 0.5 });
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 3);
    bg.stroke();
    container.addChild(bg);

    // 图标
    const icon = new Text({
      text: config.icon,
      style: { fontSize: Math.min(sizePx * 0.5, 24) },
    });
    icon.anchor?.set(0.5);
    icon.x = sizePx / 2;
    icon.y = sizePx / 2 - 4;
    container.addChild(icon);

    // 血条
    const hpBar = new Graphics();
    this.drawHpBar(hpBar, sizePx, 1);
    hpBar.y = -6;
    container.addChild(hpBar);

    container.x = bld.gridX * CELL_PX;
    container.y = bld.gridY * CELL_PX;

    this.buildingLayer.addChild(container);
    this.buildingSprites.set(bld.uid, { container, hpBar });
  }

  /** 每帧更新 */
  update(engine: BattleEngine): void {
    // 更新单位
    for (const unit of engine.units) {
      if (unit.state === 'dead') {
        const sprite = this.unitSprites.get(unit.uid);
        if (sprite) {
          this.unitLayer.removeChild(sprite.container);
          sprite.container.destroy();
          this.unitSprites.delete(unit.uid);
        }
        continue;
      }

      let sprite = this.unitSprites.get(unit.uid);
      if (!sprite) {
        sprite = this.createUnitSprite(unit);
        this.unitSprites.set(unit.uid, sprite);
      }

      // 更新位置
      sprite.container.x = unit.x;
      sprite.container.y = unit.y;

      // 更新血条
      this.drawHpBar(sprite.hpBar, 16, unit.hp / unit.maxHp);
    }

    // 更新建筑血条
    for (const bld of engine.buildings) {
      const sprite = this.buildingSprites.get(bld.uid);
      if (!sprite) continue;

      if (bld.destroyed) {
        sprite.container.alpha = 0.3;
      } else {
        const sizePx = bld.size * CELL_PX;
        this.drawHpBar(sprite.hpBar, sizePx, bld.hp / bld.maxHp);
      }
    }
  }

  /** 创建单位精灵 */
  private createUnitSprite(unit: BattleUnit): UnitSprite {
    const config = this.configLoader.getTroop(unit.troopId);
    const container = new Container();

    // 身体圆
    const body = new Graphics();
    body.circle(0, 0, 8);
    body.fill(0x4488ff);
    body.circle(0, 0, 8);
    body.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
    container.addChild(body);

    // 图标
    const icon = new Text({
      text: config?.icon || '⚔️',
      style: { fontSize: 10 },
    });
    icon.anchor?.set(0.5);
    icon.y = -1;
    container.addChild(icon);

    // 血条
    const hpBar = new Graphics();
    this.drawHpBar(hpBar, 16, 1);
    hpBar.y = -14;
    hpBar.x = -8;
    container.addChild(hpBar);

    container.x = unit.x;
    container.y = unit.y;
    this.unitLayer.addChild(container);

    return { container, body, hpBar, icon };
  }

  /** 绘制血条 */
  private drawHpBar(g: Graphics, width: number, ratio: number): void {
    g.clear();
    // 背景
    g.rect(0, 0, width, 3);
    g.fill({ color: 0x333333, alpha: 0.7 });
    // 血量
    const color = ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff4444;
    g.rect(0, 0, width * Math.max(0, ratio), 3);
    g.fill(color);
  }

  /** 清除全部 */
  clearAll(): void {
    for (const s of this.unitSprites.values()) s.container.destroy();
    for (const s of this.buildingSprites.values()) s.container.destroy();
    this.unitSprites.clear();
    this.buildingSprites.clear();
    this.buildingLayer.removeChildren();
    this.unitLayer.removeChildren();
    this.uiLayer.removeChildren();
  }
}
