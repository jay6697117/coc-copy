// ============================================================
// 资源管理器 — 管理金币/圣水/宝石的产出、消耗和存储上限
// ============================================================

import type { EventBus } from '../core/EventBus.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { BuildingSystem } from './BuildingSystem.js';
import type { PlayerResources } from '../types/index.js';

export class ResourceManager {
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private buildingSystem: BuildingSystem;

  /** 当前资源 */
  private resources: PlayerResources = { gold: 0, elixir: 0, gems: 0 };

  /** 资源累加器（处理小数产出） */
  private goldAccumulator = 0;
  private elixirAccumulator = 0;

  constructor(eventBus: EventBus, configLoader: ConfigLoader, buildingSystem: BuildingSystem) {
    this.eventBus = eventBus;
    this.configLoader = configLoader;
    this.buildingSystem = buildingSystem;
  }

  /** 设置初始资源 */
  setResources(resources: PlayerResources): void {
    this.resources = { ...resources };
    this.emitChange();
  }

  /** 获取当前资源 */
  getResources(): PlayerResources {
    return { ...this.resources };
  }

  /** 计算存储上限 */
  getStorageCaps(): { goldCap: number; elixirCap: number } {
    let goldCap = 5000; // 大本营自带的基础上限
    let elixirCap = 5000;

    for (const building of this.buildingSystem.getAllBuildings()) {
      const config = this.configLoader.getBuilding(building.configId);
      if (!config) continue;
      if (building.isUpgrading) continue; // 升级中不计算

      const levelConfig = config.levels[building.level - 1];
      if (!levelConfig) continue;

      if (config.id === 'gold_storage' && levelConfig.storageCapacity) {
        goldCap += levelConfig.storageCapacity;
      }
      // 圣水瓶（未来添加时使用相同逻辑）
      if (config.id === 'elixir_storage' && levelConfig.storageCapacity) {
        elixirCap += levelConfig.storageCapacity;
      }
    }

    return { goldCap, elixirCap };
  }

  /** 检查是否负担得起 */
  canAfford(amount: number, type: 'gold' | 'elixir' | 'gems'): boolean {
    return this.resources[type] >= amount;
  }

  /** 消耗资源（返回是否成功） */
  spend(amount: number, type: 'gold' | 'elixir' | 'gems'): boolean {
    if (!this.canAfford(amount, type)) return false;
    this.resources[type] -= amount;
    this.emitChange();
    return true;
  }

  /** 获得资源（不超过上限） */
  earn(amount: number, type: 'gold' | 'elixir' | 'gems'): void {
    if (type === 'gems') {
      this.resources.gems += amount;
    } else {
      const caps = this.getStorageCaps();
      const cap = type === 'gold' ? caps.goldCap : caps.elixirCap;
      this.resources[type] = Math.min(this.resources[type] + amount, cap);
    }
    this.emitChange();
  }

  /** 每帧调用：根据产出建筑计算资源增长 */
  tick(deltaMs: number): void {
    const deltaHours = deltaMs / 3600000; // 毫秒转小时

    for (const building of this.buildingSystem.getAllBuildings()) {
      if (building.isUpgrading) continue; // 升级中不产出

      const config = this.configLoader.getBuilding(building.configId);
      if (!config || config.category !== 'resource') continue;

      const levelConfig = config.levels[building.level - 1];
      if (!levelConfig?.productionRate) continue;

      // 计算产出量
      const produced = levelConfig.productionRate * deltaHours;

      if (config.id === 'gold_mine') {
        this.goldAccumulator += produced;
      } else if (config.id === 'elixir_collector') {
        this.elixirAccumulator += produced;
      }
    }

    // 整数部分加入资源
    let changed = false;
    if (this.goldAccumulator >= 1) {
      const whole = Math.floor(this.goldAccumulator);
      this.goldAccumulator -= whole;
      const caps = this.getStorageCaps();
      this.resources.gold = Math.min(this.resources.gold + whole, caps.goldCap);
      changed = true;
    }
    if (this.elixirAccumulator >= 1) {
      const whole = Math.floor(this.elixirAccumulator);
      this.elixirAccumulator -= whole;
      const caps = this.getStorageCaps();
      this.resources.elixir = Math.min(this.resources.elixir + whole, caps.elixirCap);
      changed = true;
    }

    if (changed) {
      this.emitChange();
    }
  }

  /** 离线资源补偿 */
  compensateOffline(offlineMs: number): void {
    if (offlineMs <= 0) return;
    // 直接调用 tick 一次性补算
    this.tick(offlineMs);
  }

  /** 导出资源用于保存 */
  exportResources(): PlayerResources {
    return { ...this.resources };
  }

  private emitChange(): void {
    this.eventBus.emit('resource:changed', { resources: { ...this.resources } });
  }
}
