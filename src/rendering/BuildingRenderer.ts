// ============================================================
// 建筑渲染器 — 渲染建筑方块、等级标识和放置预览
// ============================================================

import { Container, Graphics, Text } from 'pixi.js';
import { CELL_PX } from '../gameplay/GridMap.js';
import type { BuildingConfig, BuildingInstance } from '../types/index.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';

/** 单个建筑的渲染对象 */
interface BuildingSprite {
  container: Container;
  background: Graphics;
  icon: Text;
  levelBadge: Container; // 等级标识
  levelText: Text;
}

export class BuildingRenderer {
  private configLoader: ConfigLoader;
  /** 已渲染的建筑精灵映射 */
  private sprites: Map<string, BuildingSprite> = new Map();
  /** 父容器（MapRenderer 的 buildingLayer） */
  private buildingLayer: Container;

  /** 放置预览相关 */
  private previewGraphics: Graphics | null = null;
  private previewContainer: Container;

  constructor(buildingLayer: Container, overlayLayer: Container, configLoader: ConfigLoader) {
    this.buildingLayer = buildingLayer;
    this.configLoader = configLoader;
    this.previewContainer = overlayLayer;
  }

  /** 添加一个建筑的渲染 */
  addBuilding(building: BuildingInstance): void {
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;

    const container = new Container();
    const sizePx = config.size * CELL_PX;

    // 背景方块
    const bg = new Graphics();
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 3);
    bg.fill(config.color);
    bg.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 0.3 });
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 3);
    bg.stroke();
    container.addChild(bg);

    // 图标
    const icon = new Text({
      text: config.icon,
      style: {
        fontSize: Math.min(sizePx * 0.5, 24),
      },
    });
    icon.anchor?.set(0.5);
    icon.x = sizePx / 2;
    icon.y = sizePx / 2 - 4;
    container.addChild(icon);

    // 等级标识（右下角小圆圈）
    const badgeContainer = new Container();
    
    const badge = new Graphics();
    badge.circle(0, 0, 7);
    badge.fill({ color: 0x000000, alpha: 0.7 });
    badge.circle(0, 0, 7);
    badge.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
    badgeContainer.addChild(badge);

    const levelText = new Text({
      text: String(building.level),
      style: {
        fontSize: 9,
        fill: 0xffffff,
        fontWeight: 'bold',
      },
    });
    levelText.anchor?.set(0.5);
    badgeContainer.addChild(levelText);

    badgeContainer.x = sizePx - 10;
    badgeContainer.y = sizePx - 10;
    container.addChild(badgeContainer);

    // 定位到网格坐标
    container.x = building.gridX * CELL_PX;
    container.y = building.gridY * CELL_PX;

    container.eventMode = 'static';
    container.cursor = 'pointer';

    this.buildingLayer.addChild(container);
    this.sprites.set(building.uid, {
      container,
      background: bg,
      icon,
      levelBadge: badgeContainer,
      levelText,
    });
  }

  /** 更新建筑等级显示（升级完成后调用） */
  updateBuildingLevel(building: BuildingInstance): void {
    const sprite = this.sprites.get(building.uid);
    if (!sprite) return;

    // 更新等级数字
    sprite.levelText.text = String(building.level);
  }

  /** 移除一个建筑的渲染 */
  removeBuilding(uid: string): void {
    const sprite = this.sprites.get(uid);
    if (sprite) {
      this.buildingLayer.removeChild(sprite.container);
      sprite.container.destroy();
      this.sprites.delete(uid);
    }
  }

  /** 更新建筑的位置 */
  updateBuildingPosition(uid: string, gridX: number, gridY: number): void {
    const sprite = this.sprites.get(uid);
    if (sprite) {
      sprite.container.x = gridX * CELL_PX;
      sprite.container.y = gridY * CELL_PX;
    }
  }

  /** 获取建筑精灵的容器 */
  getBuildingContainer(uid: string): Container | null {
    return this.sprites.get(uid)?.container ?? null;
  }

  /** 显示放置预览 */
  showPreview(gridX: number, gridY: number, config: BuildingConfig, canPlace: boolean): void {
    this.clearPreview();
    const sizePx = config.size * CELL_PX;
    const g = new Graphics();

    const color = canPlace ? 0x00ff00 : 0xff0000;
    g.roundRect(0, 0, sizePx, sizePx, 3);
    g.fill({ color, alpha: 0.4 });
    g.setStrokeStyle({ width: 2, color, alpha: 0.8 });
    g.roundRect(0, 0, sizePx, sizePx, 3);
    g.stroke();

    g.x = gridX * CELL_PX;
    g.y = gridY * CELL_PX;

    this.previewGraphics = g;
    this.previewContainer.addChild(g);
  }

  /** 清除放置预览 */
  clearPreview(): void {
    if (this.previewGraphics) {
      this.previewContainer.removeChild(this.previewGraphics);
      this.previewGraphics.destroy();
      this.previewGraphics = null;
    }
  }

  /** 清除所有建筑渲染 */
  clearAll(): void {
    for (const sprite of this.sprites.values()) {
      this.buildingLayer.removeChild(sprite.container);
      sprite.container.destroy();
    }
    this.sprites.clear();
  }
}
