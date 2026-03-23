// ============================================================
// 配置数据加载器 — 从 JSON 读取建筑和兵种配置
// ============================================================

import type { BuildingConfig, TroopConfig } from '../types/index.js';
import buildingsData from '../data/buildings.json';
import troopsData from '../data/troops.json';

/** 配置数据加载器 */
export class ConfigLoader {
  private buildings: Map<string, BuildingConfig> = new Map();
  private troops: Map<string, TroopConfig> = new Map();

  constructor() {
    // 加载建筑配置
    for (const b of buildingsData as unknown as BuildingConfig[]) {
      this.buildings.set(b.id, b);
    }
    // 加载兵种配置
    for (const t of troopsData as unknown as TroopConfig[]) {
      this.troops.set(t.id, t);
    }
  }

  getBuilding(id: string): BuildingConfig | undefined {
    return this.buildings.get(id);
  }

  getAllBuildings(): BuildingConfig[] {
    return Array.from(this.buildings.values());
  }

  getBuildingsByCategory(category: string): BuildingConfig[] {
    return this.getAllBuildings().filter(b => b.category === category);
  }

  /** 获取单个兵种配置 */
  getTroop(id: string): TroopConfig | undefined {
    return this.troops.get(id);
  }

  /** 获取所有兵种配置 */
  getAllTroops(): TroopConfig[] {
    return Array.from(this.troops.values());
  }
}
