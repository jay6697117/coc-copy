// ============================================================
// 升级系统 — 管理建筑升级的前置条件、费用、倒计时和效果
// ============================================================

import type { EventBus } from '../core/EventBus.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type { BuildingSystem } from './BuildingSystem.js';
import type { ResourceManager } from './ResourceManager.js';
import type { BuildingInstance } from '../types/index.js';

export class UpgradeSystem {
  private eventBus: EventBus;
  private configLoader: ConfigLoader;
  private buildingSystem: BuildingSystem;
  private resourceManager: ResourceManager;

  constructor(
    eventBus: EventBus,
    configLoader: ConfigLoader,
    buildingSystem: BuildingSystem,
    resourceManager: ResourceManager,
  ) {
    this.eventBus = eventBus;
    this.configLoader = configLoader;
    this.buildingSystem = buildingSystem;
    this.resourceManager = resourceManager;
  }

  /** 检查建筑是否可以升级 */
  canUpgrade(building: BuildingInstance): { ok: boolean; reason?: string } {
    if (building.isUpgrading) {
      return { ok: false, reason: '正在升级中' };
    }

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return { ok: false, reason: '建筑配置不存在' };

    // 检查是否已满级
    if (building.level >= config.levels.length) {
      return { ok: false, reason: '已达最高等级' };
    }

    // 获取下一级配置
    const nextLevel = config.levels[building.level];
    if (!nextLevel) return { ok: false, reason: '下一级配置不存在' };

    // 检查资源是否足够
    if (!this.resourceManager.canAfford(nextLevel.cost, nextLevel.costType)) {
      return { ok: false, reason: `${nextLevel.costType === 'gold' ? '金币' : '圣水'}不足` };
    }

    return { ok: true };
  }

  /** 获取升级费用信息 */
  getUpgradeCost(building: BuildingInstance): { cost: number; costType: 'gold' | 'elixir'; time: number } | null {
    const config = this.configLoader.getBuilding(building.configId);
    if (!config || building.level >= config.levels.length) return null;

    const nextLevel = config.levels[building.level];
    if (!nextLevel) return null;

    return {
      cost: nextLevel.cost,
      costType: nextLevel.costType,
      time: nextLevel.buildTime,
    };
  }

  /** 开始升级 */
  startUpgrade(building: BuildingInstance): boolean {
    const check = this.canUpgrade(building);
    if (!check.ok) return false;

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return false;

    const nextLevel = config.levels[building.level];
    if (!nextLevel) return false;

    // 扣费
    if (!this.resourceManager.spend(nextLevel.cost, nextLevel.costType)) return false;

    // 标记升级
    building.isUpgrading = true;
    building.upgradeEndTime = Date.now() + nextLevel.buildTime * 1000;

    return true;
  }

  /** 每帧检查升级完成（由 GameClock tick 驱动） */
  tick(): void {
    const now = Date.now();

    for (const building of this.buildingSystem.getAllBuildings()) {
      if (!building.isUpgrading || !building.upgradeEndTime) continue;

      if (now >= building.upgradeEndTime) {
        this.completeUpgrade(building);
      }
    }
  }

  /** 离线补偿：检查所有升级是否在离线期间完成 */
  compensateOffline(): void {
    this.tick(); // 直接调用 tick 检查当前时间
  }

  /** 完成升级 */
  private completeUpgrade(building: BuildingInstance): void {
    building.level += 1;
    building.isUpgrading = false;
    building.upgradeEndTime = undefined;

    this.eventBus.emit('building:upgraded', { building });
  }

  /** 获取升级剩余时间（秒） */
  getRemainingTime(building: BuildingInstance): number {
    if (!building.isUpgrading || !building.upgradeEndTime) return 0;
    return Math.max(0, (building.upgradeEndTime - Date.now()) / 1000);
  }

  /** 格式化剩余时间为可读字符串 */
  formatTime(seconds: number): string {
    if (seconds <= 0) return '完成';
    const s = Math.ceil(seconds);
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    const remainS = s % 60;
    if (m < 60) return `${m}分${remainS > 0 ? remainS + '秒' : ''}`;
    const h = Math.floor(m / 60);
    const remainM = m % 60;
    return `${h}时${remainM > 0 ? remainM + '分' : ''}`;
  }
}
