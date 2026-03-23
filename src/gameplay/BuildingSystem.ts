// ============================================================
// 建筑系统 — 管理建筑的放置、移动和状态
// ============================================================

import type { BuildingInstance } from '../types/index.js';
import type { EventBus } from '../core/EventBus.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { GridMap } from '../gameplay/GridMap.js';

let nextUid = 1;
/** 生成唯一建筑 ID */
function generateUid(): string {
  return `building_${nextUid++}`;
}

export class BuildingSystem {
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private gridMap: GridMap;

  /** 所有已放置的建筑 */
  private buildings: Map<string, BuildingInstance> = new Map();

  constructor(eventBus: EventBus, configLoader: ConfigLoader, gridMap: GridMap) {
    this.eventBus = eventBus;
    this.configLoader = configLoader;
    this.gridMap = gridMap;
  }

  /** 放置一个新建筑 */
  placeBuilding(configId: string, gridX: number, gridY: number): BuildingInstance | null {
    const config = this.configLoader.getBuilding(configId);
    if (!config) return null;

    // 检查是否可以放置
    if (!this.gridMap.canPlace(gridX, gridY, config.size)) return null;

    const building: BuildingInstance = {
      uid: generateUid(),
      configId,
      gridX,
      gridY,
      level: 1,
      isUpgrading: false,
    };

    // 更新网格
    this.gridMap.place(gridX, gridY, config, building.uid);

    // 记录建筑
    this.buildings.set(building.uid, building);

    // 发送事件
    this.eventBus.emit('building:placed', { building });

    return building;
  }

  /** 移动建筑到新位置 */
  moveBuilding(uid: string, newGridX: number, newGridY: number): boolean {
    const building = this.buildings.get(uid);
    if (!building) return false;

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return false;

    // 检查新位置是否可以放置（忽略自身占位）
    if (!this.gridMap.canPlace(newGridX, newGridY, config.size, uid)) return false;

    const fromX = building.gridX;
    const fromY = building.gridY;

    // 清除旧位置
    this.gridMap.remove(building.gridX, building.gridY, config.size);

    // 更新位置
    building.gridX = newGridX;
    building.gridY = newGridY;

    // 标记新位置
    this.gridMap.place(newGridX, newGridY, config, building.uid);

    // 发送事件
    this.eventBus.emit('building:moved', { building, fromX, fromY });

    return true;
  }

  /** 移除建筑 */
  removeBuilding(uid: string): boolean {
    const building = this.buildings.get(uid);
    if (!building) return false;

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return false;

    // 清除网格占位
    this.gridMap.remove(building.gridX, building.gridY, config.size);

    // 移除记录
    this.buildings.delete(uid);

    // 发送事件
    this.eventBus.emit('building:removed', { building });

    return true;
  }

  /** 获取所有建筑 */
  getAllBuildings(): BuildingInstance[] {
    return Array.from(this.buildings.values());
  }

  /** 获取单个建筑 */
  getBuilding(uid: string): BuildingInstance | undefined {
    return this.buildings.get(uid);
  }

  /** 从存档加载建筑 */
  loadBuildings(buildings: BuildingInstance[]): void {
    // 找出最大的 uid 序号，保证后续生成不会冲突
    for (const b of buildings) {
      const num = parseInt(b.uid.replace('building_', ''), 10);
      if (!isNaN(num) && num >= nextUid) {
        nextUid = num + 1;
      }
    }

    for (const building of buildings) {
      const config = this.configLoader.getBuilding(building.configId);
      if (!config) continue;

      this.gridMap.place(building.gridX, building.gridY, config, building.uid);
      this.buildings.set(building.uid, { ...building });
    }
  }

  /** 导出所有建筑为存档格式 */
  exportBuildings(): BuildingInstance[] {
    return this.getAllBuildings().map(b => ({ ...b }));
  }
}
