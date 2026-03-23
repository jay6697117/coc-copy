// ============================================================
// 游戏核心类型定义
// ============================================================

/** 建筑类别 */
export type BuildingCategory = 'resource' | 'storage' | 'military' | 'defense' | 'core' | 'wall';

/** 建筑等级配置 */
export interface BuildingLevelConfig {
  /** 升级费用（金币或圣水） */
  cost: number;
  /** 费用类型 */
  costType: 'gold' | 'elixir';
  /** 升级时间（秒） */
  buildTime: number;
  /** 生命值 */
  hp: number;
  /** 产出速率（每小时，仅 resource 类型有） */
  productionRate?: number;
  /** 存储容量（仅 storage 类型有） */
  storageCapacity?: number;
  /** 伤害（仅 defense 类型有） */
  damage?: number;
  /** 攻击范围（格数，仅 defense 类型有） */
  range?: number;
  /** 攻击速度（秒/次，仅 defense 类型有） */
  attackSpeed?: number;
}

/** 建筑配置（来自 JSON 数据文件） */
export interface BuildingConfig {
  /** 建筑唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 建筑类别 */
  category: BuildingCategory;
  /** 占据的网格大小（NxN） */
  size: number;
  /** 显示颜色（十六进制） */
  color: number;
  /** 显示图标（emoji） */
  icon: string;
  /** 每个大本营等级可建造的最大数量 */
  maxCount: Record<number, number>;
  /** 各等级配置 */
  levels: BuildingLevelConfig[];
}

/** 已放置的建筑实例 */
export interface BuildingInstance {
  /** 实例唯一 ID */
  uid: string;
  /** 建筑配置 ID */
  configId: string;
  /** 网格 X 坐标（左上角） */
  gridX: number;
  /** 网格 Y 坐标（左上角） */
  gridY: number;
  /** 当前等级（从 1 开始） */
  level: number;
  /** 是否正在升级 */
  isUpgrading: boolean;
  /** 升级完成时间戳（ms） */
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
  /** 大本营等级 */
  townHallLevel: number;
  /** 资源 */
  resources: PlayerResources;
  /** 已放置的建筑 */
  buildings: BuildingInstance[];
  /** 上次在线时间戳 */
  lastOnlineTime: number;
}

/** 网格单元格状态 */
export interface GridCell {
  /** 是否被建筑占用 */
  occupied: boolean;
  /** 占用该格的建筑实例 UID（如果有） */
  buildingUid?: string;
}

/** 游戏事件类型映射 */
export interface GameEvents {
  'building:placed': { building: BuildingInstance };
  'building:moved': { building: BuildingInstance; fromX: number; fromY: number };
  'building:removed': { building: BuildingInstance };
  'building:upgraded': { building: BuildingInstance };
  'resource:changed': { resources: PlayerResources };
  'clock:tick': { deltaMs: number };
  'save:loaded': { data: SaveData };
  'save:saved': undefined;
}
