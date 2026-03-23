// ============================================================
// 建筑渲染器 — 增强版：渐变/阴影/光泽/升级进度条/放置动画
// ============================================================

import { Container, Graphics, Text } from 'pixi.js';
import { CELL_PX } from '../gameplay/GridMap.js';
import type { BuildingConfig, BuildingInstance } from '../types/index.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';

interface BuildingSprite {
  container: Container;
  background: Graphics;
  icon: Text;
  levelBadge: Container;
  levelText: Text;
  progressBar: Graphics | null;
}

/** 颜色加亮 */
function lightenColor(c: number, pct: number): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + Math.floor(255 * pct));
  const g = Math.min(255, ((c >> 8) & 0xff) + Math.floor(255 * pct));
  const b = Math.min(255, (c & 0xff) + Math.floor(255 * pct));
  return (r << 16) | (g << 8) | b;
}

/** 颜色加暗 */
function darkenColor(c: number, pct: number): number {
  const r = Math.max(0, ((c >> 16) & 0xff) - Math.floor(255 * pct));
  const g = Math.max(0, ((c >> 8) & 0xff) - Math.floor(255 * pct));
  const b = Math.max(0, (c & 0xff) - Math.floor(255 * pct));
  return (r << 16) | (g << 8) | b;
}

export class BuildingRenderer {
  private configLoader: ConfigLoader;
  private sprites: Map<string, BuildingSprite> = new Map();
  private buildingLayer: Container;
  private previewGraphics: Graphics | null = null;
  private previewContainer: Container;

  constructor(buildingLayer: Container, overlayLayer: Container, configLoader: ConfigLoader) {
    this.buildingLayer = buildingLayer;
    this.configLoader = configLoader;
    this.previewContainer = overlayLayer;
  }

  addBuilding(building: BuildingInstance): void {
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;

    const container = new Container();
    const sizePx = config.size * CELL_PX;
    const baseColor = config.color;

    // 底部阴影
    const shadow = new Graphics();
    shadow.roundRect(3, 3, sizePx - 2, sizePx - 2, 4);
    shadow.fill({ color: 0x000000, alpha: 0.35 });
    container.addChild(shadow);

    // 主体 — 渐变效果
    const bg = new Graphics();
    // 底色
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 4);
    bg.fill(baseColor);
    // 顶部高光
    bg.roundRect(1, 1, sizePx - 2, (sizePx - 2) * 0.4, 4);
    bg.fill({ color: lightenColor(baseColor, 0.15), alpha: 0.6 });
    // 底部暗调
    bg.roundRect(1, sizePx * 0.7, sizePx - 2, sizePx * 0.3 - 1, 2);
    bg.fill({ color: darkenColor(baseColor, 0.12), alpha: 0.5 });
    // 边框
    bg.setStrokeStyle({ width: 1.5, color: lightenColor(baseColor, 0.3), alpha: 0.5 });
    bg.roundRect(1, 1, sizePx - 2, sizePx - 2, 4);
    bg.stroke();
    // 光泽条纹
    bg.roundRect(4, 3, sizePx * 0.4, 2, 1);
    bg.fill({ color: 0xffffff, alpha: 0.25 });
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

    // 等级标识 — 增强版
    const badgeContainer = new Container();
    const badge = new Graphics();
    badge.circle(0, 0, 8);
    badge.fill({ color: 0x1a1a3a, alpha: 0.85 });
    badge.circle(0, 0, 8);
    badge.stroke({ color: 0xffd700, width: 1.5, alpha: 0.7 });
    badgeContainer.addChild(badge);

    const levelText = new Text({
      text: String(building.level),
      style: { fontSize: 9, fill: 0xffd700, fontWeight: 'bold' },
    });
    levelText.anchor?.set(0.5);
    badgeContainer.addChild(levelText);
    badgeContainer.x = sizePx - 10;
    badgeContainer.y = sizePx - 10;
    container.addChild(badgeContainer);

    // 升级进度条（默认隐藏）
    let progressBar: Graphics | null = null;
    if (building.isUpgrading) {
      progressBar = new Graphics();
      progressBar.y = -8;
      container.addChild(progressBar);
    }

    container.x = building.gridX * CELL_PX;
    container.y = building.gridY * CELL_PX;
    container.eventMode = 'static';
    container.cursor = 'pointer';

    // 放置弹跳动画
    container.scale.set(0.5);
    container.alpha = 0.5;
    let t = 0;
    const bounce = () => {
      t += 0.05;
      if (t >= 1) {
        container.scale.set(1);
        container.alpha = 1;
        return;
      }
      // 弹跳曲线
      const scale = 1 + Math.sin(t * Math.PI) * 0.15 * (1 - t);
      container.scale.set(0.5 + t * 0.5 * (1 + scale - 1));
      container.alpha = 0.5 + t * 0.5;
      requestAnimationFrame(bounce);
    };
    requestAnimationFrame(bounce);

    this.buildingLayer.addChild(container);
    this.sprites.set(building.uid, { container, background: bg, icon, levelBadge: badgeContainer, levelText, progressBar });
  }

  updateBuildingLevel(building: BuildingInstance): void {
    const sprite = this.sprites.get(building.uid);
    if (!sprite) return;
    sprite.levelText.text = String(building.level);
  }

  /** 更新升级进度条 */
  updateUpgradeProgress(uid: string, progress: number, sizePx: number): void {
    const sprite = this.sprites.get(uid);
    if (!sprite) return;

    if (!sprite.progressBar) {
      sprite.progressBar = new Graphics();
      sprite.progressBar.y = -8;
      sprite.container.addChild(sprite.progressBar);
    }

    const bar = sprite.progressBar;
    bar.clear();
    bar.rect(0, 0, sizePx, 4);
    bar.fill({ color: 0x333333, alpha: 0.7 });
    bar.rect(0, 0, sizePx * Math.min(1, progress), 4);
    bar.fill(0x44ff44);
  }

  /** 移除升级进度条 */
  clearUpgradeProgress(uid: string): void {
    const sprite = this.sprites.get(uid);
    if (sprite?.progressBar) {
      sprite.container.removeChild(sprite.progressBar);
      sprite.progressBar.destroy();
      sprite.progressBar = null;
    }
  }

  removeBuilding(uid: string): void {
    const sprite = this.sprites.get(uid);
    if (sprite) {
      this.buildingLayer.removeChild(sprite.container);
      sprite.container.destroy();
      this.sprites.delete(uid);
    }
  }

  updateBuildingPosition(uid: string, gridX: number, gridY: number): void {
    const sprite = this.sprites.get(uid);
    if (sprite) {
      sprite.container.x = gridX * CELL_PX;
      sprite.container.y = gridY * CELL_PX;
    }
  }

  getBuildingContainer(uid: string): Container | null {
    return this.sprites.get(uid)?.container ?? null;
  }

  showPreview(gridX: number, gridY: number, config: BuildingConfig, canPlace: boolean): void {
    this.clearPreview();
    const sizePx = config.size * CELL_PX;
    const g = new Graphics();
    const color = canPlace ? 0x00ff00 : 0xff0000;

    // 半透明填充 + 脉冲边框
    g.roundRect(0, 0, sizePx, sizePx, 4);
    g.fill({ color, alpha: 0.3 });
    g.setStrokeStyle({ width: 2, color, alpha: 0.8 });
    g.roundRect(0, 0, sizePx, sizePx, 4);
    g.stroke();

    // 十字准星
    const cx = sizePx / 2, cy = sizePx / 2;
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 });
    g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy);
    g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6);
    g.stroke();

    g.x = gridX * CELL_PX;
    g.y = gridY * CELL_PX;
    this.previewGraphics = g;
    this.previewContainer.addChild(g);
  }

  clearPreview(): void {
    if (this.previewGraphics) {
      this.previewContainer.removeChild(this.previewGraphics);
      this.previewGraphics.destroy();
      this.previewGraphics = null;
    }
  }

  clearAll(): void {
    for (const sprite of this.sprites.values()) {
      this.buildingLayer.removeChild(sprite.container);
      sprite.container.destroy();
    }
    this.sprites.clear();
  }
}
