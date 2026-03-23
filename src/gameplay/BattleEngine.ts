// ============================================================
// 战斗引擎 — 管理战斗循环：部署→战斗→结算
// ============================================================

import { CELL_PX } from '../gameplay/GridMap.js';
import type { EventBus } from '../core/EventBus.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type {
  BattleUnit, BattleDefense, BattleBuilding, BattleResult,
  BattlePhase, BuildingInstance, ArmySlot,
} from '../types/index.js';

/** 战斗持续时限（秒） */
const BATTLE_DURATION = 180;

export class BattleEngine {
  private eventBus: EventBus;
  private configLoader: ConfigLoader;

  /** 战斗阶段 */
  phase: BattlePhase = 'preparing';

  /** 战场单位 */
  units: BattleUnit[] = [];
  /** 防御建筑 */
  defenses: BattleDefense[] = [];
  /** 非防御建筑 */
  buildings: BattleBuilding[] = [];

  /** 可部署的军队 */
  deployableArmy: ArmySlot[] = [];

  /** 战斗计时器（秒） */
  battleTimer = BATTLE_DURATION;

  /** 总建筑数（用于计算摧毁百分比） */
  private totalBuildings = 0;
  private destroyedCount = 0;
  private townHallDestroyed = false;

  /** 掠夺资源 */
  private goldAvailable = 0;
  private elixirAvailable = 0;
  private goldLooted = 0;
  private elixirLooted = 0;

  /** UID 计数器 */
  private uidCounter = 0;

  constructor(eventBus: EventBus, configLoader: ConfigLoader) {
    this.eventBus = eventBus;
    this.configLoader = configLoader;
  }

  /** 初始化战斗（用对手的建筑列表） */
  initBattle(
    enemyBuildings: BuildingInstance[],
    army: ArmySlot[],
    lootGold: number,
    lootElixir: number,
  ): void {
    this.phase = 'deploying';
    this.units = [];
    this.defenses = [];
    this.buildings = [];
    this.deployableArmy = army.map(s => ({ ...s }));
    this.battleTimer = BATTLE_DURATION;
    this.destroyedCount = 0;
    this.townHallDestroyed = false;
    this.goldAvailable = lootGold;
    this.elixirAvailable = lootElixir;
    this.goldLooted = 0;
    this.elixirLooted = 0;
    this.uidCounter = 0;

    // 设置敌方建筑
    for (const b of enemyBuildings) {
      const config = this.configLoader.getBuilding(b.configId);
      if (!config) continue;

      const levelCfg = config.levels[b.level - 1];
      if (!levelCfg) continue;

      if (config.category === 'defense') {
        this.defenses.push({
          uid: `def_${this.uidCounter++}`,
          configId: b.configId,
          gridX: b.gridX,
          gridY: b.gridY,
          size: config.size,
          hp: levelCfg.hp,
          maxHp: levelCfg.hp,
          damage: levelCfg.damage || 0,
          range: (levelCfg.range || 5) * CELL_PX,
          attackSpeed: levelCfg.attackSpeed || 1,
          attackCooldown: 0,
          targetUid: null,
          destroyed: false,
        });
      }

      // 所有建筑都加入 buildings 列表
      this.buildings.push({
        uid: `bld_${this.uidCounter++}`,
        configId: b.configId,
        gridX: b.gridX,
        gridY: b.gridY,
        size: config.size,
        hp: levelCfg.hp,
        maxHp: levelCfg.hp,
        destroyed: false,
        isTownHall: config.id === 'town_hall',
      });
    }

    this.totalBuildings = this.buildings.length;
    this.eventBus.emit('battle:started', undefined as never);
  }

  /** 部署一个单位到指定位置 */
  deployUnit(troopId: string, worldX: number, worldY: number): BattleUnit | null {
    if (this.phase !== 'deploying') return null;

    // 检查军队中是否还有该兵种
    const slot = this.deployableArmy.find(s => s.troopId === troopId && s.count > 0);
    if (!slot) return null;

    const config = this.configLoader.getTroop(troopId);
    if (!config) return null;

    const levelCfg = config.levels[0];

    const unit: BattleUnit = {
      uid: `unit_${this.uidCounter++}`,
      troopId,
      x: worldX,
      y: worldY,
      hp: levelCfg.hp,
      maxHp: levelCfg.hp,
      damage: levelCfg.damage,
      attackSpeed: levelCfg.attackSpeed,
      moveSpeed: config.moveSpeed,
      attackType: config.attackType,
      attackRange: config.attackType === 'ranged' ? (config.attackRange || 5) * CELL_PX : CELL_PX * 1.2,
      favoriteTarget: config.favoriteTarget,
      targetUid: null,
      attackCooldown: 0,
      state: 'moving',
    };

    this.units.push(unit);
    slot.count -= 1;

    // 如果所有兵种都部署完毕，自动进入战斗阶段
    if (this.deployableArmy.every(s => s.count <= 0)) {
      this.phase = 'fighting';
    }

    return unit;
  }

  /** 手动切换到战斗阶段 */
  startFighting(): void {
    if (this.phase === 'deploying') {
      this.phase = 'fighting';
    }
  }

  /** 每帧更新战斗（deltaMs 毫秒） */
  tick(deltaMs: number): BattleResult | null {
    if (this.phase !== 'deploying' && this.phase !== 'fighting') return null;

    const dt = deltaMs / 1000;

    // 更新计时器
    this.battleTimer -= dt;
    if (this.battleTimer <= 0) {
      this.battleTimer = 0;
      return this.endBattle();
    }

    // 更新单位 AI
    this.updateUnits(dt);

    // 更新防御 AI
    this.updateDefenses(dt);

    // 检查胜利条件
    if (this.buildings.every(b => b.destroyed)) {
      return this.endBattle();
    }

    // 检查所有单位死亡
    const aliveUnits = this.units.filter(u => u.state !== 'dead');
    if (aliveUnits.length === 0 && this.deployableArmy.every(s => s.count <= 0)) {
      return this.endBattle();
    }

    return null;
  }

  /** 更新所有单位 */
  private updateUnits(dt: number): void {
    for (const unit of this.units) {
      if (unit.state === 'dead') continue;

      // 寻找目标
      if (!unit.targetUid || this.isTargetDestroyed(unit.targetUid)) {
        unit.targetUid = this.findTarget(unit);
        if (!unit.targetUid) continue; // 没有目标
      }

      // 获取目标位置
      const target = this.getTargetPosition(unit.targetUid);
      if (!target) {
        unit.targetUid = null;
        continue;
      }

      // 计算距离
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= unit.attackRange) {
        // 在攻击范围内 — 攻击
        unit.state = 'attacking';
        unit.attackCooldown -= dt;
        if (unit.attackCooldown <= 0) {
          unit.attackCooldown = unit.attackSpeed;
          this.dealDamageToTarget(unit.targetUid, unit.damage);
        }
      } else {
        // 移动向目标
        unit.state = 'moving';
        const speed = unit.moveSpeed * CELL_PX * dt;
        const moveX = (dx / dist) * speed;
        const moveY = (dy / dist) * speed;
        unit.x += moveX;
        unit.y += moveY;
      }
    }
  }

  /** 更新防御 AI */
  private updateDefenses(dt: number): void {
    for (const def of this.defenses) {
      if (def.destroyed) continue;

      // 寻找攻击目标
      if (!def.targetUid || this.isUnitDead(def.targetUid)) {
        def.targetUid = this.findClosestUnit(def);
      }
      if (!def.targetUid) continue;

      // 攻击
      def.attackCooldown -= dt;
      if (def.attackCooldown <= 0) {
        def.attackCooldown = def.attackSpeed;
        this.dealDamageToUnit(def.targetUid, def.damage);
      }
    }
  }

  /** 寻找最近的活单位（防御塔用） */
  private findClosestUnit(def: BattleDefense): string | null {
    const cx = (def.gridX + def.size / 2) * CELL_PX;
    const cy = (def.gridY + def.size / 2) * CELL_PX;

    let closest: string | null = null;
    let minDist = Infinity;

    for (const unit of this.units) {
      if (unit.state === 'dead') continue;
      const dx = unit.x - cx;
      const dy = unit.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= def.range && dist < minDist) {
        minDist = dist;
        closest = unit.uid;
      }
    }

    return closest;
  }

  /** 寻找单位的攻击目标 */
  private findTarget(unit: BattleUnit): string | null {
    let candidates: (BattleBuilding | BattleDefense)[] = [];

    // 根据偏好筛选
    if (unit.favoriteTarget === 'defense') {
      candidates = this.defenses.filter(d => !d.destroyed);
      if (candidates.length === 0) {
        candidates = this.buildings.filter(b => !b.destroyed);
      }
    } else if (unit.favoriteTarget === 'resource') {
      candidates = this.buildings.filter(b => !b.destroyed && this.isResourceBuilding(b.configId));
      if (candidates.length === 0) {
        candidates = this.buildings.filter(b => !b.destroyed);
      }
    } else if (unit.favoriteTarget === 'wall') {
      candidates = this.buildings.filter(b => !b.destroyed && this.isWall(b.configId));
      if (candidates.length === 0) {
        candidates = this.buildings.filter(b => !b.destroyed);
      }
    } else {
      candidates = this.buildings.filter(b => !b.destroyed);
    }

    // 找最近的
    let closest: string | null = null;
    let minDist = Infinity;
    for (const c of candidates) {
      const cx = (c.gridX + c.size / 2) * CELL_PX;
      const cy = (c.gridY + c.size / 2) * CELL_PX;
      const dx = unit.x - cx;
      const dy = unit.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = c.uid;
      }
    }

    return closest;
  }

  /** 对建筑造成伤害 */
  private dealDamageToTarget(uid: string, damage: number): void {
    // 先检查防御建筑
    const def = this.defenses.find(d => d.uid === uid);
    if (def && !def.destroyed) {
      def.hp -= damage;
      if (def.hp <= 0) {
        def.hp = 0;
        def.destroyed = true;
      }
    }

    // 检查普通建筑
    const bld = this.buildings.find(b => b.uid === uid);
    if (bld && !bld.destroyed) {
      bld.hp -= damage;
      if (bld.hp <= 0) {
        bld.hp = 0;
        bld.destroyed = true;
        this.destroyedCount++;

        if (bld.isTownHall) {
          this.townHallDestroyed = true;
        }

        // 掠夺资源
        this.lootFromBuilding(bld);
      }
    }
  }

  /** 对单位造成伤害 */
  private dealDamageToUnit(uid: string, damage: number): void {
    const unit = this.units.find(u => u.uid === uid);
    if (unit && unit.state !== 'dead') {
      unit.hp -= damage;
      if (unit.hp <= 0) {
        unit.hp = 0;
        unit.state = 'dead';
      }
    }
  }

  /** 掠夺被摧毁建筑的资源 */
  private lootFromBuilding(bld: BattleBuilding): void {
    const config = this.configLoader.getBuilding(bld.configId);
    if (!config) return;

    if (config.category === 'resource' || config.category === 'storage') {
      // 按比例分配可掠夺资源
      const perBuilding = Math.floor(
        (config.category === 'resource' ? this.goldAvailable : this.elixirAvailable) /
        Math.max(1, this.totalBuildings)
      );

      if (config.id.includes('gold') || config.id === 'town_hall') {
        this.goldLooted += perBuilding;
      } else {
        this.elixirLooted += perBuilding;
      }
    }
  }

  /** 获取目标位置（建筑中心） */
  private getTargetPosition(uid: string): { x: number; y: number } | null {
    const def = this.defenses.find(d => d.uid === uid);
    if (def) return { x: (def.gridX + def.size / 2) * CELL_PX, y: (def.gridY + def.size / 2) * CELL_PX };

    const bld = this.buildings.find(b => b.uid === uid);
    if (bld) return { x: (bld.gridX + bld.size / 2) * CELL_PX, y: (bld.gridY + bld.size / 2) * CELL_PX };

    return null;
  }

  /** 检查目标是否已被摧毁 */
  private isTargetDestroyed(uid: string): boolean {
    const def = this.defenses.find(d => d.uid === uid);
    if (def) return def.destroyed;

    const bld = this.buildings.find(b => b.uid === uid);
    if (bld) return bld.destroyed;

    return true;
  }

  /** 检查单位是否已死亡 */
  private isUnitDead(uid: string): boolean {
    const unit = this.units.find(u => u.uid === uid);
    return !unit || unit.state === 'dead';
  }

  private isResourceBuilding(configId: string): boolean {
    const c = this.configLoader.getBuilding(configId);
    return c?.category === 'resource' || c?.category === 'storage';
  }

  private isWall(configId: string): boolean {
    const c = this.configLoader.getBuilding(configId);
    return c?.category === 'wall';
  }

  /** 结算战斗 */
  private endBattle(): BattleResult {
    this.phase = 'ended';
    const percentDestroyed = Math.floor((this.destroyedCount / Math.max(1, this.totalBuildings)) * 100);

    let stars = 0;
    if (percentDestroyed >= 50) stars++;
    if (this.townHallDestroyed) stars++;
    if (percentDestroyed >= 100) stars++;

    const result: BattleResult = {
      stars,
      percentDestroyed,
      goldLooted: this.goldLooted,
      elixirLooted: this.elixirLooted,
    };

    this.eventBus.emit('battle:ended', { result });
    return result;
  }

  /** 获取当前摧毁百分比 */
  getPercentDestroyed(): number {
    return Math.floor((this.destroyedCount / Math.max(1, this.totalBuildings)) * 100);
  }

  /** 获取当前星级 */
  getCurrentStars(): number {
    const pct = this.getPercentDestroyed();
    let stars = 0;
    if (pct >= 50) stars++;
    if (this.townHallDestroyed) stars++;
    if (pct >= 100) stars++;
    return stars;
  }
}
