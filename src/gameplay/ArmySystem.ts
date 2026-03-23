// ============================================================
// 军队系统 — 管理兵种训练、军队编成和容量
// ============================================================

import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { ResourceManager } from './ResourceManager.js';
import type { ArmySlot } from '../types/index.js';

export class ArmySystem {
  private configLoader: ConfigLoader;
  private resourceManager: ResourceManager;

  /** 当前军队 */
  private army: ArmySlot[] = [];

  /** 最大容量（基于兵营等级） */
  private maxCapacity = 20;

  constructor(configLoader: ConfigLoader, resourceManager: ResourceManager) {
    this.configLoader = configLoader;
    this.resourceManager = resourceManager;
  }

  setMaxCapacity(capacity: number): void { this.maxCapacity = capacity; }
  getMaxCapacity(): number { return this.maxCapacity; }

  getCurrentCapacity(): number {
    let total = 0;
    for (const slot of this.army) {
      const config = this.configLoader.getTroop(slot.troopId);
      if (config) total += config.housingSpace * slot.count;
    }
    return total;
  }

  getRemainingCapacity(): number { return this.maxCapacity - this.getCurrentCapacity(); }

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
