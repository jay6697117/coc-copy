// ============================================================
// 军队系统 — 管理兵种训练、军队编成和容量（兵营联动）
// ============================================================

import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { BuildingSystem } from './BuildingSystem.js';
import type { ResourceManager } from './ResourceManager.js';
import type { ArmySlot } from '../types/index.js';

export class ArmySystem {
  private configLoader: ConfigLoader;
  private buildingSystem: BuildingSystem;
  private resourceManager: ResourceManager;
  private army: ArmySlot[] = [];

  constructor(configLoader: ConfigLoader, buildingSystem: BuildingSystem, resourceManager: ResourceManager) {
    this.configLoader = configLoader;
    this.buildingSystem = buildingSystem;
    this.resourceManager = resourceManager;
  }

  /** 计算军队最大容量（基于所有兵营等级总和） */
  getMaxCapacity(): number {
    let total = 0;
    for (const b of this.buildingSystem.getAllBuildings()) {
      if (b.configId !== 'barracks') continue;
      const config = this.configLoader.getBuilding('barracks');
      if (!config) continue;
      const levelCfg = config.levels[b.level - 1];
      if (levelCfg && 'armyCapacity' in levelCfg) {
        total += (levelCfg as { armyCapacity: number }).armyCapacity;
      }
    }
    // 没有兵营时给默认 20 容量（方便前期游戏）
    return total > 0 ? total : 20;
  }

  getCurrentCapacity(): number {
    let total = 0;
    for (const slot of this.army) {
      const config = this.configLoader.getTroop(slot.troopId);
      if (config) total += config.housingSpace * slot.count;
    }
    return total;
  }

  getRemainingCapacity(): number { return this.getMaxCapacity() - this.getCurrentCapacity(); }

  trainTroop(troopId: string): boolean {
    const config = this.configLoader.getTroop(troopId);
    if (!config) return false;
    if (this.getRemainingCapacity() < config.housingSpace) return false;

    const levelConfig = config.levels[0];
    if (!this.resourceManager.canAfford(levelConfig.cost, levelConfig.costType)) return false;
    this.resourceManager.spend(levelConfig.cost, levelConfig.costType);

    const existing = this.army.find(s => s.troopId === troopId);
    if (existing) { existing.count += 1; }
    else { this.army.push({ troopId, count: 1, level: 1 }); }
    return true;
  }

  removeTroop(troopId: string): boolean {
    const slot = this.army.find(s => s.troopId === troopId);
    if (!slot || slot.count <= 0) return false;
    slot.count -= 1;
    if (slot.count <= 0) this.army = this.army.filter(s => s.troopId !== troopId);
    return true;
  }

  getArmy(): ArmySlot[] { return [...this.army]; }
  loadArmy(army: ArmySlot[]): void { this.army = army.map(s => ({ ...s })); }
  exportArmy(): ArmySlot[] { return this.army.map(s => ({ ...s })); }
  clearArmy(): void { this.army = []; }
  isEmpty(): boolean { return this.army.length === 0 || this.army.every(s => s.count <= 0); }
}
