// ============================================================
// 网格地图 — 管理基地的二维网格数据结构
// ============================================================

import type { GridCell, BuildingConfig } from '../types/index.js';

/** 地图常量 */
export const GRID_SIZE = 40; // 40x40 网格
export const CELL_PX = 20; // 每个网格单元的像素大小

export class GridMap {
  /** 网格数据（二维数组） */
  private cells: GridCell[][];
  /** 可建造区域的边界（中心 30x30 区域可建造） */
  readonly buildableMin = 5;
  readonly buildableMax = 35;

  constructor() {
    // 初始化空网格
    this.cells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      this.cells[y] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        this.cells[y][x] = { occupied: false };
      }
    }
  }

  /** 检查某个区域是否可以放置建筑 */
  canPlace(gridX: number, gridY: number, size: number, ignoreUid?: string): boolean {
    // 检查是否在可建造范围内
    if (gridX < this.buildableMin || gridY < this.buildableMin) return false;
    if (gridX + size > this.buildableMax || gridY + size > this.buildableMax) return false;

    // 检查每个格子是否被占用
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cell = this.cells[gridY + dy]?.[gridX + dx];
        if (!cell) return false;
        if (cell.occupied && cell.buildingUid !== ignoreUid) return false;
      }
    }
    return true;
  }

  /** 放置建筑（标记格子为已占用） */
  place(gridX: number, gridY: number, config: BuildingConfig, uid: string): void {
    for (let dy = 0; dy < config.size; dy++) {
      for (let dx = 0; dx < config.size; dx++) {
        this.cells[gridY + dy][gridX + dx] = {
          occupied: true,
          buildingUid: uid,
        };
      }
    }
  }

  /** 移除建筑（清除格子占用） */
  remove(gridX: number, gridY: number, size: number): void {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cy = gridY + dy;
        const cx = gridX + dx;
        if (cy >= 0 && cy < GRID_SIZE && cx >= 0 && cx < GRID_SIZE) {
          this.cells[cy][cx] = { occupied: false };
        }
      }
    }
  }

  /** 获取某个格子的状态 */
  getCell(x: number, y: number): GridCell | null {
    return this.cells[y]?.[x] ?? null;
  }

  /** 将像素坐标转换为网格坐标 */
  pixelToGrid(px: number, py: number): { gridX: number; gridY: number } {
    return {
      gridX: Math.floor(px / CELL_PX),
      gridY: Math.floor(py / CELL_PX),
    };
  }

  /** 将网格坐标转换为像素坐标（左上角） */
  gridToPixel(gridX: number, gridY: number): { px: number; py: number } {
    return {
      px: gridX * CELL_PX,
      py: gridY * CELL_PX,
    };
  }
}
