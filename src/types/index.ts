// ============================================================
// 游戏核心类型定义
// ============================================================

/** 建筑类别 */
export type BuildingCategory = 'resource' | 'storage' | 'military' | 'defense' | 'core' | 'wall';

/** 建筑等级配置 */
export interface BuildingLevelConfig {
  cost: number;
  costType: 'gold' | 'elixir';
  buildTime: number;
  hp: number;
  productionRate?: number;
  storageCapacity?: number;
  damage?: number;
  range?: number;
  /** 攻击速度（秒/次，仅 defense 类型有） */
  attackSpeed?: number;
  /** 军队容量（仅 military 类型有） */
  armyCapacity?: number;
}

/** 建筑配置 */
export interface BuildingConfig {
  id: string;
  name: string;
  category: BuildingCategory;
  size: number;
  color: number;
  icon: string;
  maxCount: Record<number, number>;
  levels: BuildingLevelConfig[];
}

/** 已放置的建筑实例 */
export interface BuildingInstance {
  uid: string;
  configId: string;
  gridX: number;
  gridY: number;
  level: number;
  isUpgrading: boolean;
  upgradeEndTime?: number;
}

/** 玩家资源 */
export interface PlayerResources {
  gold: number;
  elixir: number;
  gems: number;
}

/** 玩家存档数据 */
export interface SaveData {
  townHallLevel: number;
  resources: PlayerResources;
  buildings: BuildingInstance[];
  army: ArmySlot[];
  trophies: number;
  lastOnlineTime: number;
}

/** 网格单元格状态 */
export interface GridCell {
  occupied: boolean;
  buildingUid?: string;
}

// ============================================================
// 兵种相关类型
// ============================================================

/** 兵种等级配置 */
export interface TroopLevelConfig {
  cost: number;
  costType: 'gold' | 'elixir' | 'dark_elixir';
  hp: number;
  damage: number;
  attackSpeed: number;
  wallDamageMultiplier?: number;
  healPerSecond?: number;
  skillDamage?: number;
}

/** 兵种偏好目标 */
export type FavoriteTarget = 'any' | 'defense' | 'resource' | 'wall' | 'ally';

/** 兵种配置（来自 JSON） */
export interface TroopConfig {
  id: string;
  name: string;
  icon: string;
  housingSpace: number;
  trainTime: number;
  favoriteTarget: FavoriteTarget;
  moveSpeed: number;
  attackType: 'melee' | 'ranged';
  attackRange?: number;
  isSplash?: boolean;
  isHealer?: boolean;
  isHero?: boolean;
  isFlying?: boolean;
  levels: TroopLevelConfig[];
}

/** 军队槽位 */
export interface ArmySlot {
  troopId: string;
  count: number;
  level: number;
}

// ============================================================
// 战斗相关类型
// ============================================================

/** 战斗阶段 */
export type BattlePhase = 'preparing' | 'deploying' | 'fighting' | 'ended';

/** 战场上的单位实例 */
export interface BattleUnit {
  uid: string;
  troopId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  attackType: 'melee' | 'ranged';
  attackRange: number;
  favoriteTarget: FavoriteTarget;
  targetUid: string | null;
  attackCooldown: number;
  state: 'moving' | 'attacking' | 'dead';
  isHealer?: boolean;
  healPerSecond?: number;
  isSplash?: boolean;
  isHero?: boolean;
  skillDamage?: number;
  isFlying?: boolean;
}

/** 战场上的防御建筑实例 */
export interface BattleDefense {
  uid: string;
  configId: string;
  gridX: number;
  gridY: number;
  size: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  attackSpeed: number;
  attackCooldown: number;
  targetUid: string | null;
  destroyed: boolean;
}

/** 战场上的非防御建筑实例 */
export interface BattleBuilding {
  uid: string;
  configId: string;
  gridX: number;
  gridY: number;
  size: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  isTownHall: boolean;
}

/** 战斗结果 */
export interface BattleResult {
  stars: number;
  percentDestroyed: number;
  goldLooted: number;
  elixirLooted: number;
}

// ============================================================
// 事件类型映射
// ============================================================

export interface GameEvents {
  'building:placed': { building: BuildingInstance };
  'building:moved': { building: BuildingInstance; fromX: number; fromY: number };
  'building:removed': { building: BuildingInstance };
  'building:upgraded': { building: BuildingInstance };
  'resource:changed': { resources: PlayerResources };
  'clock:tick': { deltaMs: number };
  'save:loaded': { data: SaveData };
  'save:saved': undefined;
  'battle:started': undefined;
  'battle:ended': { result: BattleResult };
  'battle:unitDeployed': { unit: BattleUnit };
  'battle:unitDied': { unit: BattleUnit };
  'battle:buildingDestroyed': { building: BattleBuilding | BattleDefense };
}
