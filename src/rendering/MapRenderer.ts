// ============================================================
// 地图渲染器 — 渲染网格线和地面
// ============================================================

import { Container, Graphics } from 'pixi.js';
import { GRID_SIZE, CELL_PX, type GridMap } from '../gameplay/GridMap.js';

export class MapRenderer {
  /** 地面图层 */
  readonly groundLayer: Container;
  /** 建筑图层 */
  readonly buildingLayer: Container;
  /** 覆盖层（放置预览等） */
  readonly overlayLayer: Container;

  constructor() {
    this.groundLayer = new Container();
    this.buildingLayer = new Container();
    this.overlayLayer = new Container();
  }

  /** 初始化地面渲染（网格线 + 地面颜色） */
  renderGround(gridMap: GridMap): void {
    this.groundLayer.removeChildren();

    const totalPx = GRID_SIZE * CELL_PX;
    const g = new Graphics();

    // 地面底色（草绿色）
    g.rect(0, 0, totalPx, totalPx);
    g.fill(0x4a7c3f);

    // 可建造区域高亮（稍浅的绿色）
    const bMin = gridMap.buildableMin * CELL_PX;
    const bSize = (gridMap.buildableMax - gridMap.buildableMin) * CELL_PX;
    g.rect(bMin, bMin, bSize, bSize);
    g.fill(0x5a9c4f);

    // 绘制网格线
    g.setStrokeStyle({ width: 0.5, color: 0x3a6c2f, alpha: 0.4 });
    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = i * CELL_PX;
      // 水平线
      g.moveTo(0, pos);
      g.lineTo(totalPx, pos);
      g.stroke();
      // 垂直线
      g.moveTo(pos, 0);
      g.lineTo(pos, totalPx);
      g.stroke();
    }

    // 可建造区域边界（虚线效果用实线模拟）
    g.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 0.2 });
    g.rect(bMin, bMin, bSize, bSize);
    g.stroke();

    this.groundLayer.addChild(g);
  }

  /** 获取所有图层组成的容器 */
  getWorldContainer(): Container {
    const world = new Container();
    world.addChild(this.groundLayer);
    world.addChild(this.buildingLayer);
    world.addChild(this.overlayLayer);
    return world;
  }
}
