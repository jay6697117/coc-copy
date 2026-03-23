// ============================================================
// 配置数据加载器 — 从 JSON 读取并提供建筑配置查询
// ============================================================

import type { BuildingConfig } from '../types/index.js';
import buildingsData from '../data/buildings.json';

/** 配置数据加载器（单例） */
export class ConfigLoader {
  private buildings: Map<string, BuildingConfig> = new Map();

  constructor() {
    // 加载建筑配置
    for (const b of buildingsData as unknown as BuildingConfig[]) {
      this.buildings.set(b.id, b);
    }
  }

  /** 获取单个建筑配置 */
  getBuilding(id: string): BuildingConfig | undefined {
    return this.buildings.get(id);
  }

  /** 获取所有建筑配置 */
  getAllBuildings(): BuildingConfig[] {
    return Array.from(this.buildings.values());
  }

  /** 获取某个类别的所有建筑 */
  getBuildingsByCategory(category: string): BuildingConfig[] {
    return this.getAllBuildings().filter(b => b.category === category);
  }
}
