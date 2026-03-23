// ============================================================
// 战斗引擎 — 部署→战斗→结算，支持治疗者/法术/范围攻击
// ============================================================

import { CELL_PX } from '../gameplay/GridMap.js';
import type { EventBus } from '../core/EventBus.js';
import type { ConfigLoader } from '../core/ConfigLoader.js';
import type {
  BattleUnit, BattleDefense, BattleBuilding, BattleResult,
  BattlePhase, BuildingInstance, ArmySlot,
} from '../types/index.js';
import { SpellSystem } from './SpellSystem.js';

const BATTLE_DURATION = 180;

export class BattleEngine {
  private eventBus: EventBus;
  private configLoader: ConfigLoader;

  phase: BattlePhase = 'preparing';
  units: BattleUnit[] = [];
  defenses: BattleDefense[] = [];
  buildings: BattleBuilding[] = [];
  deployableArmy: ArmySlot[] = [];
  battleTimer = BATTLE_DURATION;
  spellSystem = new SpellSystem();

  private totalBuildings = 0;
  private destroyedCount = 0;
  private townHallDestroyed = false;
  private goldAvailable = 0;
  private elixirAvailable = 0;
  private goldLooted = 0;
  private elixirLooted = 0;
  private uidCounter = 0;

  constructor(eventBus: EventBus, configLoader: ConfigLoader) {
    this.eventBus = eventBus;
    this.configLoader = configLoader;
  }

  initBattle(enemyBuildings: BuildingInstance[], army: ArmySlot[], lootGold: number, lootElixir: number): void {
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
    this.spellSystem.reset();

    for (const b of enemyBuildings) {
      const config = this.configLoader.getBuilding(b.configId);
      if (!config) continue;
      const levelCfg = config.levels[b.level - 1];
      if (!levelCfg) continue;

      if (config.category === 'defense') {
        this.defenses.push({
          uid: `def_${this.uidCounter++}`, configId: b.configId,
          gridX: b.gridX, gridY: b.gridY, size: config.size,
          hp: levelCfg.hp, maxHp: levelCfg.hp,
          damage: levelCfg.damage || 0, range: (levelCfg.range || 5) * CELL_PX,
          attackSpeed: levelCfg.attackSpeed || 1, attackCooldown: 0,
          targetUid: null, destroyed: false,
        });
      }
      this.buildings.push({
        uid: `bld_${this.uidCounter++}`, configId: b.configId,
        gridX: b.gridX, gridY: b.gridY, size: config.size,
        hp: levelCfg.hp, maxHp: levelCfg.hp,
        destroyed: false, isTownHall: config.id === 'town_hall',
      });
    }

    this.totalBuildings = this.buildings.length;
    this.eventBus.emit('battle:started', undefined as never);
  }

  deployUnit(troopId: string, worldX: number, worldY: number): BattleUnit | null {
    if (this.phase !== 'deploying') return null;
    const slot = this.deployableArmy.find(s => s.troopId === troopId && s.count > 0);
    if (!slot) return null;
    const config = this.configLoader.getTroop(troopId);
    if (!config) return null;
    const lc = config.levels[0];

    const unit: BattleUnit = {
      uid: `unit_${this.uidCounter++}`, troopId,
      x: worldX, y: worldY,
      hp: lc.hp, maxHp: lc.hp, damage: lc.damage,
      attackSpeed: lc.attackSpeed, moveSpeed: config.moveSpeed,
      attackType: config.attackType,
      attackRange: config.attackType === 'ranged' ? (config.attackRange || 5) * CELL_PX : CELL_PX * 1.2,
      favoriteTarget: config.favoriteTarget,
      targetUid: null, attackCooldown: 0, state: 'moving',
      isHealer: config.isHealer ?? false,
      healPerSecond: lc.healPerSecond,
      isSplash: config.isSplash ?? false,
      isHero: config.isHero ?? false,
      skillDamage: lc.skillDamage,
      isFlying: config.isFlying ?? false,
    };

    this.units.push(unit);
    slot.count -= 1;
    if (this.deployableArmy.every(s => s.count <= 0)) this.phase = 'fighting';
    return unit;
  }

  startFighting(): void { if (this.phase === 'deploying') this.phase = 'fighting'; }

  tick(deltaMs: number): BattleResult | null {
    if (this.phase !== 'deploying' && this.phase !== 'fighting') return null;
    const dt = deltaMs / 1000;
    this.battleTimer -= dt;
    if (this.battleTimer <= 0) { this.battleTimer = 0; return this.endBattle(); }

    this.updateUnits(dt);
    this.updateDefenses(dt);
    this.spellSystem.tick(dt);
    this.applySpellEffects(dt);

    if (this.buildings.every(b => b.destroyed)) return this.endBattle();
    const alive = this.units.filter(u => u.state !== 'dead');
    if (alive.length === 0 && this.deployableArmy.every(s => s.count <= 0)) return this.endBattle();
    return null;
  }

  /** 应用法术区域效果 */
  private applySpellEffects(dt: number): void {
    for (const spell of this.spellSystem.activeSpells) {
      if (spell.config.effect === 'damage') {
        // 闪电法术 — 对范围内建筑造成伤害（只在第一帧造成全部伤害）
        if (spell.remainingTime >= spell.config.duration - dt * 1.5) {
          for (const bld of this.buildings) {
            if (bld.destroyed) continue;
            const cx = (bld.gridX + bld.size / 2) * CELL_PX;
            const cy = (bld.gridY + bld.size / 2) * CELL_PX;
            const d = Math.sqrt((cx - spell.x) ** 2 + (cy - spell.y) ** 2);
            if (d <= spell.config.radius) this.dealDamageToTarget(bld.uid, spell.config.power);
          }
          for (const def of this.defenses) {
            if (def.destroyed) continue;
            const cx = (def.gridX + def.size / 2) * CELL_PX;
            const cy = (def.gridY + def.size / 2) * CELL_PX;
            const d = Math.sqrt((cx - spell.x) ** 2 + (cy - spell.y) ** 2);
            if (d <= spell.config.radius) this.dealDamageToTarget(def.uid, spell.config.power);
          }
        }
      } else if (spell.config.effect === 'heal') {
        // 治愈法术 — 对范围内友军持续回血
        for (const unit of this.units) {
          if (unit.state === 'dead') continue;
          const d = Math.sqrt((unit.x - spell.x) ** 2 + (unit.y - spell.y) ** 2);
          if (d <= spell.config.radius) {
            unit.hp = Math.min(unit.maxHp, unit.hp + spell.config.power * dt);
          }
        }
      }
    }
  }

  private updateUnits(dt: number): void {
    for (const unit of this.units) {
      if (unit.state === 'dead') continue;

      // 治疗者逻辑 — 跟随最低血量友军并回血
      if (unit.isHealer && unit.healPerSecond) {
        const target = this.findLowestHpAlly(unit);
        if (target) {
          const dx = target.x - unit.x, dy = target.y - unit.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= unit.attackRange) {
            unit.state = 'attacking';
            target.hp = Math.min(target.maxHp, target.hp + unit.healPerSecond * dt);
          } else {
            unit.state = 'moving';
            const speed = unit.moveSpeed * CELL_PX * dt;
            unit.x += (dx / dist) * speed;
            unit.y += (dy / dist) * speed;
          }
        }
        continue;
      }

      // 普通单位逻辑
      if (!unit.targetUid || this.isTargetDestroyed(unit.targetUid)) {
        unit.targetUid = this.findTarget(unit);
        if (!unit.targetUid) continue;
      }
      const target = this.getTargetPosition(unit.targetUid);
      if (!target) { unit.targetUid = null; continue; }
      const dx = target.x - unit.x, dy = target.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= unit.attackRange) {
        unit.state = 'attacking';
        unit.attackCooldown -= dt;
        if (unit.attackCooldown <= 0) {
          unit.attackCooldown = unit.attackSpeed;
          this.dealDamageToTarget(unit.targetUid, unit.damage);
          // 范围攻击 — 对目标周围建筑也造成半伤
          if (unit.isSplash) {
            const tp = this.getTargetPosition(unit.targetUid);
            if (tp) {
              for (const bld of this.buildings) {
                if (bld.destroyed || bld.uid === unit.targetUid) continue;
                const bx = (bld.gridX + bld.size / 2) * CELL_PX;
                const by = (bld.gridY + bld.size / 2) * CELL_PX;
                const sd = Math.sqrt((bx - tp.x) ** 2 + (by - tp.y) ** 2);
                if (sd <= CELL_PX * 2) this.dealDamageToTarget(bld.uid, Math.floor(unit.damage * 0.5));
              }
            }
          }
        }
      } else {
        unit.state = 'moving';
        const speed = unit.moveSpeed * CELL_PX * dt;
        unit.x += (dx / dist) * speed;
        unit.y += (dy / dist) * speed;
      }
    }
  }

  /** 找血量最低的友军（治疗者用） */
  private findLowestHpAlly(healer: BattleUnit): BattleUnit | null {
    let target: BattleUnit | null = null;
    let lowestRatio = 1;
    for (const u of this.units) {
      if (u.uid === healer.uid || u.state === 'dead' || u.isHealer) continue;
      const ratio = u.hp / u.maxHp;
      if (ratio < lowestRatio) { lowestRatio = ratio; target = u; }
    }
    return target;
  }

  private updateDefenses(dt: number): void {
    for (const def of this.defenses) {
      if (def.destroyed) continue;
      if (!def.targetUid || this.isUnitDead(def.targetUid)) def.targetUid = this.findClosestUnit(def);
      if (!def.targetUid) continue;
      def.attackCooldown -= dt;
      if (def.attackCooldown <= 0) { def.attackCooldown = def.attackSpeed; this.dealDamageToUnit(def.targetUid, def.damage); }
    }
  }

  private findClosestUnit(def: BattleDefense): string | null {
    const cx = (def.gridX + def.size / 2) * CELL_PX, cy = (def.gridY + def.size / 2) * CELL_PX;
    // 检查是否为防空（只打飞行）
    const bldConfig = this.configLoader.getBuilding(def.configId);
    const airOnly = (bldConfig as unknown as Record<string, unknown>)?.['airOnly'] === true;
    let closest: string | null = null; let minDist = Infinity;
    for (const unit of this.units) {
      if (unit.state === 'dead') continue;
      // 防空只打飞行，普通防御不打飞行
      if (airOnly && !unit.isFlying) continue;
      if (!airOnly && unit.isFlying) continue;
      const d = Math.sqrt((unit.x - cx) ** 2 + (unit.y - cy) ** 2);
      if (d <= def.range && d < minDist) { minDist = d; closest = unit.uid; }
    }
    return closest;
  }

  private findTarget(unit: BattleUnit): string | null {
    let candidates: (BattleBuilding | BattleDefense)[] = [];
    if (unit.favoriteTarget === 'defense') {
      candidates = this.defenses.filter(d => !d.destroyed);
      if (candidates.length === 0) candidates = this.buildings.filter(b => !b.destroyed);
    } else if (unit.favoriteTarget === 'resource') {
      candidates = this.buildings.filter(b => !b.destroyed && this.isResourceBuilding(b.configId));
      if (candidates.length === 0) candidates = this.buildings.filter(b => !b.destroyed);
    } else if (unit.favoriteTarget === 'wall') {
      candidates = this.buildings.filter(b => !b.destroyed && this.isWall(b.configId));
      if (candidates.length === 0) candidates = this.buildings.filter(b => !b.destroyed);
    } else {
      candidates = this.buildings.filter(b => !b.destroyed);
    }
    let closest: string | null = null; let minDist = Infinity;
    for (const c of candidates) {
      const cx = (c.gridX + c.size / 2) * CELL_PX, cy = (c.gridY + c.size / 2) * CELL_PX;
      const d = Math.sqrt((unit.x - cx) ** 2 + (unit.y - cy) ** 2);
      if (d < minDist) { minDist = d; closest = c.uid; }
    }
    return closest;
  }

  private dealDamageToTarget(uid: string, damage: number): void {
    const def = this.defenses.find(d => d.uid === uid);
    if (def && !def.destroyed) { def.hp -= damage; if (def.hp <= 0) { def.hp = 0; def.destroyed = true; } }
    const bld = this.buildings.find(b => b.uid === uid);
    if (bld && !bld.destroyed) {
      bld.hp -= damage;
      if (bld.hp <= 0) { bld.hp = 0; bld.destroyed = true; this.destroyedCount++; if (bld.isTownHall) this.townHallDestroyed = true; this.lootFromBuilding(bld); }
    }
  }

  private dealDamageToUnit(uid: string, damage: number): void {
    const unit = this.units.find(u => u.uid === uid);
    if (unit && unit.state !== 'dead') { unit.hp -= damage; if (unit.hp <= 0) { unit.hp = 0; unit.state = 'dead'; } }
  }

  private lootFromBuilding(bld: BattleBuilding): void {
    const config = this.configLoader.getBuilding(bld.configId);
    if (!config) return;
    if (config.category === 'resource' || config.category === 'storage') {
      const perBuilding = Math.floor((config.category === 'resource' ? this.goldAvailable : this.elixirAvailable) / Math.max(1, this.totalBuildings));
      if (config.id.includes('gold') || config.id === 'town_hall') this.goldLooted += perBuilding;
      else this.elixirLooted += perBuilding;
    }
  }

  private getTargetPosition(uid: string): { x: number; y: number } | null {
    const def = this.defenses.find(d => d.uid === uid);
    if (def) return { x: (def.gridX + def.size / 2) * CELL_PX, y: (def.gridY + def.size / 2) * CELL_PX };
    const bld = this.buildings.find(b => b.uid === uid);
    if (bld) return { x: (bld.gridX + bld.size / 2) * CELL_PX, y: (bld.gridY + bld.size / 2) * CELL_PX };
    return null;
  }

  private isTargetDestroyed(uid: string): boolean {
    const def = this.defenses.find(d => d.uid === uid);
    if (def) return def.destroyed;
    const bld = this.buildings.find(b => b.uid === uid);
    if (bld) return bld.destroyed;
    return true;
  }

  private isUnitDead(uid: string): boolean { const u = this.units.find(u => u.uid === uid); return !u || u.state === 'dead'; }
  private isResourceBuilding(configId: string): boolean { const c = this.configLoader.getBuilding(configId); return c?.category === 'resource' || c?.category === 'storage'; }
  private isWall(configId: string): boolean { const c = this.configLoader.getBuilding(configId); return c?.category === 'wall'; }

  private endBattle(): BattleResult {
    this.phase = 'ended';
    const percentDestroyed = Math.floor((this.destroyedCount / Math.max(1, this.totalBuildings)) * 100);
    let stars = 0;
    if (percentDestroyed >= 50) stars++;
    if (this.townHallDestroyed) stars++;
    if (percentDestroyed >= 100) stars++;
    const result: BattleResult = { stars, percentDestroyed, goldLooted: this.goldLooted, elixirLooted: this.elixirLooted };
    this.eventBus.emit('battle:ended', { result });
    return result;
  }

  getPercentDestroyed(): number { return Math.floor((this.destroyedCount / Math.max(1, this.totalBuildings)) * 100); }
  getCurrentStars(): number { const p = this.getPercentDestroyed(); let s = 0; if (p >= 50) s++; if (this.townHallDestroyed) s++; if (p >= 100) s++; return s; }
}
