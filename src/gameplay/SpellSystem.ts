// ============================================================
// 法术系统 — 管理法术库存、冷却和战场效果
// ============================================================

export interface SpellConfig {
  id: string;
  name: string;
  icon: string;
  cost: number;
  costType: 'gold' | 'elixir';
  radius: number;         // 效果半径（像素）
  duration: number;        // 持续时间（秒）
  cooldown: number;        // 冷却时间（秒）
  effect: 'damage' | 'heal';
  power: number;           // 每秒伤害或每秒治疗
}

export interface ActiveSpell {
  config: SpellConfig;
  x: number;
  y: number;
  remainingTime: number;
}

/** 内置法术配置 */
export const SPELL_CONFIGS: SpellConfig[] = [
  {
    id: 'lightning',
    name: '闪电法术',
    icon: '⚡',
    cost: 300,
    costType: 'elixir',
    radius: 80,
    duration: 0.5,
    cooldown: 8,
    effect: 'damage',
    power: 300,
  },
  {
    id: 'heal',
    name: '治愈法术',
    icon: '💚',
    cost: 400,
    costType: 'elixir',
    radius: 100,
    duration: 5,
    cooldown: 12,
    effect: 'heal',
    power: 30,
  },
];

export class SpellSystem {
  /** 当前激活的法术效果 */
  activeSpells: ActiveSpell[] = [];

  /** 每个法术剩余冷却 */
  private cooldowns: Map<string, number> = new Map();

  /** 每个法术剩余使用次数 */
  private charges: Map<string, number> = new Map();

  constructor() {
    // 初始化每种法术各 2 次使用机会
    for (const spell of SPELL_CONFIGS) {
      this.charges.set(spell.id, 2);
      this.cooldowns.set(spell.id, 0);
    }
  }

  /** 检查法术是否可用 */
  canCast(spellId: string): boolean {
    const charges = this.charges.get(spellId) ?? 0;
    const cooldown = this.cooldowns.get(spellId) ?? 0;
    return charges > 0 && cooldown <= 0;
  }

  /** 施放法术 */
  cast(spellId: string, x: number, y: number): ActiveSpell | null {
    if (!this.canCast(spellId)) return null;
    const config = SPELL_CONFIGS.find(c => c.id === spellId);
    if (!config) return null;

    this.charges.set(spellId, (this.charges.get(spellId) ?? 1) - 1);
    this.cooldowns.set(spellId, config.cooldown);

    const active: ActiveSpell = { config, x, y, remainingTime: config.duration };
    this.activeSpells.push(active);
    return active;
  }

  /** 获取法术信息 */
  getSpellInfo(spellId: string): { charges: number; cooldown: number } {
    return {
      charges: this.charges.get(spellId) ?? 0,
      cooldown: Math.max(0, this.cooldowns.get(spellId) ?? 0),
    };
  }

  /** 每帧更新 */
  tick(dt: number): void {
    // 更新冷却
    for (const [id, cd] of this.cooldowns) {
      if (cd > 0) this.cooldowns.set(id, cd - dt);
    }

    // 更新激活效果
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      this.activeSpells[i].remainingTime -= dt;
      if (this.activeSpells[i].remainingTime <= 0) {
        this.activeSpells.splice(i, 1);
      }
    }
  }

  /** 重置 */
  reset(): void {
    this.activeSpells = [];
    for (const spell of SPELL_CONFIGS) {
      this.charges.set(spell.id, 2);
      this.cooldowns.set(spell.id, 0);
    }
  }
}
