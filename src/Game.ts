// ============================================================
// Game 主类 — 整合所有系统，管理游戏生命周期和交互
// ============================================================

import { Application, Container } from 'pixi.js';
import { EventBus } from './core/EventBus.js';
import { ConfigLoader } from './core/ConfigLoader.js';
import { GameClock } from './core/GameClock.js';
import { DataStore } from './core/DataStore.js';
import { GridMap } from './gameplay/GridMap.js';
import { GRID_SIZE, CELL_PX } from './gameplay/GridMap.js';
import { BuildingSystem } from './gameplay/BuildingSystem.js';
import { ResourceManager } from './gameplay/ResourceManager.js';
import { UpgradeSystem } from './gameplay/UpgradeSystem.js';
import { ArmySystem } from './gameplay/ArmySystem.js';
import { BattleEngine } from './gameplay/BattleEngine.js';
import { MapRenderer } from './rendering/MapRenderer.js';
import { CameraController } from './rendering/CameraController.js';
import { BuildingRenderer } from './rendering/BuildingRenderer.js';
import { BattleRenderer } from './rendering/BattleRenderer.js';
import { BattleFx } from './rendering/BattleFx.js';
import { SPELL_CONFIGS } from './gameplay/SpellSystem.js';
import { AudioManager } from './core/AudioManager.js';
import type { BuildingConfig, SaveData, BattleResult } from './types/index.js';

type GameScene = 'village' | 'battle';
type InteractionMode = 'idle' | 'placing' | 'moving';

const LEAGUES = [
  { name: '青铜', min: 0, emoji: '🥉' },
  { name: '白银', min: 400, emoji: '🥈' },
  { name: '黄金', min: 800, emoji: '🥇' },
  { name: '水晶', min: 1200, emoji: '💎' },
  { name: '冠军', min: 2000, emoji: '👑' },
];
function getLeague(t: number) { let l = LEAGUES[0]; for (const x of LEAGUES) if (t >= x.min) l = x; return l; }

/** 成就定义 */
const ACHIEVEMENTS = [
  { id: 'first_build', name: '🔨 初次建造', desc: '建造你的第一个建筑', check: (s: GameStats) => s.buildingsPlaced >= 1 },
  { id: 'builder', name: '🏗️ 建设者', desc: '建造 5 个建筑', check: (s: GameStats) => s.buildingsPlaced >= 5 },
  { id: 'first_blood', name: '⚔️ 首胜', desc: '赢得第一场战斗', check: (s: GameStats) => s.battlesWon >= 1 },
  { id: 'warrior', name: '🗡️ 战士', desc: '赢得 5 场战斗', check: (s: GameStats) => s.battlesWon >= 5 },
  { id: 'bronze', name: '🥉 青铜联赛', desc: '奖杯达到 100', check: (_s: GameStats, t: number) => t >= 100 },
  { id: 'silver', name: '🥈 白银联赛', desc: '奖杯达到 400', check: (_s: GameStats, t: number) => t >= 400 },
  { id: 'gold_league', name: '🥇 黄金联赛', desc: '奖杯达到 800', check: (_s: GameStats, t: number) => t >= 800 },
  { id: 'rich', name: '💰 富翁', desc: '同时拥有 10000 金币', check: (s: GameStats) => s.peakGold >= 10000 },
  { id: 'trainer', name: '🎖️ 训练大师', desc: '训练 50 个单位', check: (s: GameStats) => s.troopsTrained >= 50 },
  { id: 'looter', name: '🏴‍☠️ 掠夺者', desc: '总掠夺金币 10000', check: (s: GameStats) => s.totalGoldLooted >= 10000 },
  { id: 'veteran', name: '🌟 老兵', desc: '赢得 10 场战斗', check: (s: GameStats) => s.battlesWon >= 10 },
  { id: 'architect', name: '🏗️ 大建筑师', desc: '建造 15 个建筑', check: (s: GameStats) => s.buildingsPlaced >= 15 },
  { id: 'crystal', name: '💎 水晶联赛', desc: '奖杯达到 1200', check: (_s: GameStats, t: number) => t >= 1200 },
  { id: 'millionaire', name: '💰 百万富翁', desc: '总掠夺金币 100000', check: (s: GameStats) => s.totalGoldLooted >= 100000 },
  { id: 'trainer_pro', name: '🏅 训练专家', desc: '训练 100 个单位', check: (s: GameStats) => s.troopsTrained >= 100 },
  { id: 'champion', name: '👑 冠军联赛', desc: '奖杯达到 2000', check: (_s: GameStats, t: number) => t >= 2000 },
];

/** 每日登录奖励（7 天循环） */
const DAILY_REWARDS = [
  { day: 1, gold: 500, elixir: 500, gems: 0 },
  { day: 2, gold: 800, elixir: 800, gems: 0 },
  { day: 3, gold: 1000, elixir: 1000, gems: 5 },
  { day: 4, gold: 1500, elixir: 1500, gems: 0 },
  { day: 5, gold: 2000, elixir: 2000, gems: 10 },
  { day: 6, gold: 3000, elixir: 3000, gems: 0 },
  { day: 7, gold: 5000, elixir: 5000, gems: 20 },
];

/** NPC 排行榜玩家 */
const NPC_PLAYERS = [
  { name: '德莫德', trophies: 2800, league: '👑' },
  { name: '小红', trophies: 2200, league: '👑' },
  { name: '天降正义', trophies: 1800, league: '💎' },
  { name: '无敵小强', trophies: 1500, league: '💎' },
  { name: '花花公子', trophies: 1100, league: '🥇' },
  { name: '战神007', trophies: 900, league: '🥇' },
  { name: '开心果', trophies: 600, league: '🥈' },
  { name: '小美女', trophies: 350, league: '🥉' },
];

/** 部落模拟数据 */
interface ClanData {
  name: string;
  members: { name: string; trophies: number; role: string }[];
  messages: { sender: string; text: string; time: number }[];
}

interface GameStats {
  battlesTotal: number;
  battlesWon: number;
  buildingsPlaced: number;
  troopsTrained: number;
  totalGoldLooted: number;
  totalElixirLooted: number;
  peakGold: number;
  peakTrophies: number;
  unlockedAchievements: string[];
}

function defaultStats(): GameStats {
  return { battlesTotal: 0, battlesWon: 0, buildingsPlaced: 0, troopsTrained: 0,
    totalGoldLooted: 0, totalElixirLooted: 0, peakGold: 0, peakTrophies: 0, unlockedAchievements: [] };
}

/** 防御日志条目 */
interface DefenseLogEntry {
  time: number;
  stars: number;
  percent: number;
  trophyChange: number;
  goldLost: number;
  elixirLost: number;
}

export class Game {
  private app!: Application;
  private worldContainer!: Container;

  private eventBus = new EventBus();
  private configLoader = new ConfigLoader();
  private gameClock = new GameClock(this.eventBus);
  private dataStore = new DataStore();

  private gridMap = new GridMap();
  private buildingSystem = new BuildingSystem(this.eventBus, this.configLoader, this.gridMap);
  private resourceManager = new ResourceManager(this.eventBus, this.configLoader, this.buildingSystem);
  private upgradeSystem = new UpgradeSystem(this.eventBus, this.configLoader, this.buildingSystem, this.resourceManager);
  private armySystem = new ArmySystem(this.configLoader, this.buildingSystem, this.resourceManager);
  private battleEngine = new BattleEngine(this.eventBus, this.configLoader);

  private mapRenderer = new MapRenderer();
  private buildingRenderer!: BuildingRenderer;
  private camera!: CameraController;
  private battleRenderer!: BattleRenderer;
  private battleFx: BattleFx | null = null;

  private scene: GameScene = 'village';
  private mode: InteractionMode = 'idle';
  private placingConfig: BuildingConfig | null = null;
  private movingBuildingUid: string | null = null;
  private pointerDownX = 0; private pointerDownY = 0;
  private readonly CLICK_THRESHOLD = 5;
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000;
  private selectedBuildingUid: string | null = null;
  private showingTrainPanel = false;
  private deployingTroopId: string | null = null;
  private battleFrameId: number | null = null;
  private trophies = 0;
  private stats: GameStats = defaultStats();
  private castingSpellId: string | null = null;
  private tutorialStep = 0;
  private tutorialShown = false;
  private audio = new AudioManager();
  private battleSpeed = 1;
  private defenseLog: DefenseLogEntry[] = [];
  private armyPresets: { name: string; army: { troopId: string; count: number }[] }[] = [];
  private playerName = '首领';
  private lastDailyRewardDate = '';
  private dailyStreak = 0;
  private clan: ClanData | null = null;
  private notifications: { text: string; time: number }[] = [];

  async init(): Promise<void> {
    this.updateLoadingProgress(10, '初始化引擎...');

    this.app = new Application();
    await this.app.init({
      resizeTo: document.getElementById('game-container')!,
      backgroundColor: 0x1a1a2e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });
    document.getElementById('game-container')!.appendChild(this.app.canvas);
    this.updateLoadingProgress(30, '加载配置...');

    this.worldContainer = this.mapRenderer.getWorldContainer();
    this.app.stage.addChild(this.worldContainer);
    this.buildingRenderer = new BuildingRenderer(
      this.mapRenderer.buildingLayer, this.mapRenderer.overlayLayer, this.configLoader,
    );
    this.camera = new CameraController(this.worldContainer, this.app.canvas);
    this.mapRenderer.renderGround(this.gridMap);
    this.battleRenderer = new BattleRenderer(this.app, this.configLoader);
    this.updateLoadingProgress(50, '加载存档...');

    await this.dataStore.init();
    await this.loadGame();
    this.updateLoadingProgress(70, '初始化 UI...');

    this.setupBuildPanel();
    this.updateResourceUI();
    this.updateArmyInfo();
    this.setupInteraction();
    this.setupEventListeners();
    this.setupBuildingInfoPanel();
    this.setupBattleUI();
    this.setupSettingsPanel();
    this.setupStatsPanel();
    this.setupMinimap();
    this.setupTutorial();
    this.updateLoadingProgress(90, '启动时钟...');

    this.gameClock.start();
    this.eventBus.on('clock:tick', ({ deltaMs }) => {
      if (this.scene === 'village') {
        this.resourceManager.tick(deltaMs);
        this.upgradeSystem.tick();
        this.autoSaveTimer += deltaMs;
        if (this.autoSaveTimer >= this.AUTO_SAVE_INTERVAL) {
          this.autoSaveTimer = 0;
          this.saveGame();
        }
        const res = this.resourceManager.getResources();
        if (res.gold > this.stats.peakGold) this.stats.peakGold = res.gold;
        this.renderMinimap();
        this.updateWeather(deltaMs);
        this.updateFps(deltaMs);
      }
    });

    this.updateLoadingProgress(100, '完成！');
    setTimeout(() => { document.getElementById('loading-screen')?.classList.add('hidden'); this.maybeShowTutorial(); }, 600);
    this.setupKeyboardShortcuts();
    this.checkDailyReward();
    this.audio.playBgm('village');
    console.log('🎮 COC Clone v1.0 初始化完成！');
  }

  // ===== 加载屏 =====

  private updateLoadingProgress(pct: number, text: string): void {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.textContent = text;
  }

  // ===== Toast 通知 =====

  private showToast(message: string, type: 'success' | 'error' | 'achievement' | 'info' = 'info'): void {
    const container = document.getElementById('toast-container')!;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3100);
  }

  // ===== 存档 =====

  private async loadGame(): Promise<void> {
    let saveData = await this.dataStore.load();
    if (!saveData) saveData = DataStore.getDefaultSave();
    this.resourceManager.setResources(saveData.resources);
    this.buildingSystem.loadBuildings(saveData.buildings);
    if (saveData.army) this.armySystem.loadArmy(saveData.army);
    this.trophies = saveData.trophies ?? 0;
    // 加载统计数据（兼容旧存档）
    const s = (saveData as unknown as Record<string, unknown>);
    if (s['stats']) this.stats = s['stats'] as GameStats;

    for (const building of this.buildingSystem.getAllBuildings()) {
      this.buildingRenderer.addBuilding(building);
    }

    const offlineMs = Date.now() - saveData.lastOnlineTime;
    if (offlineMs > 5000) {
      this.resourceManager.compensateOffline(offlineMs);
      this.upgradeSystem.compensateOffline();
    }
  }

  private async saveGame(): Promise<void> {
    const saveData: SaveData & { stats: GameStats } = {
      townHallLevel: 1,
      resources: this.resourceManager.exportResources(),
      buildings: this.buildingSystem.exportBuildings(),
      army: this.armySystem.exportArmy(),
      trophies: this.trophies,
      lastOnlineTime: Date.now(),
      stats: this.stats,
    };
    await this.dataStore.save(saveData as unknown as SaveData);
  }

  // ===== 建造面板 =====

  private setupBuildPanel(): void {
    const panel = document.getElementById('build-panel')!;
    panel.innerHTML = '';

    const attackBtn = document.createElement('button');
    attackBtn.className = 'action-btn attack';
    attackBtn.id = 'attack-btn';
    attackBtn.innerHTML = `<span class="icon">⚔️</span><span class="label">进攻!</span>`;
    attackBtn.addEventListener('click', () => this.showSearchAnimation());
    panel.appendChild(attackBtn);

    const trainBtn = document.createElement('button');
    trainBtn.className = 'action-btn train-tab';
    trainBtn.id = 'train-tab-btn';
    trainBtn.innerHTML = `<span class="icon">🎖️</span><span class="label">训练</span>`;
    trainBtn.addEventListener('click', () => this.toggleTrainPanel());
    panel.appendChild(trainBtn);

    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#444;flex-shrink:0;';
    panel.appendChild(sep);

    for (const config of this.configLoader.getAllBuildings()) {
      const level1 = config.levels[0];
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.id = `build-${config.id}`;
      const costIcon = level1.costType === 'gold' ? '🪙' : '💧';
      const costClass = level1.costType === 'elixir' ? 'cost elixir' : 'cost';
      btn.innerHTML = `<span class="icon">${config.icon}</span><span class="label">${config.name}</span><span class="${costClass}">${costIcon}${level1.cost.toLocaleString()}</span>`;
      btn.addEventListener('click', () => this.startPlacing(config));
      panel.appendChild(btn);
    }
    this.updateBuildButtons();
    this.setupTrainPanel();
  }

  private updateBuildButtons(): void {
    for (const config of this.configLoader.getAllBuildings()) {
      const btn = document.getElementById(`build-${config.id}`);
      if (!btn) continue;
      btn.classList.toggle('disabled', !this.resourceManager.canAfford(config.levels[0].cost, config.levels[0].costType));
    }
  }

  // ===== 训练 =====

  private setupTrainPanel(): void {
    const panel = document.getElementById('train-panel')!;
    panel.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'action-btn';
    backBtn.innerHTML = `<span class="icon">↩️</span><span class="label">返回</span>`;
    backBtn.addEventListener('click', () => this.toggleTrainPanel());
    panel.appendChild(backBtn);

    for (const troop of this.configLoader.getAllTroops()) {
      const l1 = troop.levels[0];
      const btn = document.createElement('button');
      btn.className = 'train-btn';
      btn.id = `train-${troop.id}`;
      btn.innerHTML = `<span class="icon">${troop.icon}</span><span class="label">${troop.name}</span><span class="cost elixir">💧${l1.cost}</span>`;
      btn.addEventListener('click', () => this.trainTroop(troop.id));
      panel.appendChild(btn);
    }
  }

  private toggleTrainPanel(): void {
    this.showingTrainPanel = !this.showingTrainPanel;
    document.getElementById('build-panel')!.style.display = this.showingTrainPanel ? 'none' : 'flex';
    document.getElementById('train-panel')!.classList.toggle('show', this.showingTrainPanel);
    this.updateTrainButtons();
  }

  private trainTroop(troopId: string): void {
    if (this.armySystem.trainTroop(troopId)) {
      this.stats.troopsTrained++;
      this.updateArmyInfo();
      this.updateTrainButtons();
      this.showToast(`✅ 训练了一个${this.configLoader.getTroop(troopId)?.name ?? '单位'}`, 'success');
      this.checkAchievements();
    } else {
      this.showToast('❌ 容量不足或资源不足', 'error');
    }
  }

  private updateTrainButtons(): void {
    for (const troop of this.configLoader.getAllTroops()) {
      const btn = document.getElementById(`train-${troop.id}`);
      if (!btn) continue;
      const l1 = troop.levels[0];
      const costType = l1.costType === 'dark_elixir' ? 'elixir' : l1.costType;
      btn.classList.toggle('disabled', !this.resourceManager.canAfford(l1.cost, costType as 'gold' | 'elixir' | 'gems') || this.armySystem.getRemainingCapacity() < troop.housingSpace);
    }
  }

  private updateArmyInfo(): void {
    const el = document.getElementById('army-info');
    if (el) el.textContent = `⚔️ ${this.armySystem.getCurrentCapacity()}/${this.armySystem.getMaxCapacity()}`;
  }

  // ===== 放置 =====

  /** 获取空闲工人数 */
  private getFreeBuilders(): number {
    const huts = this.buildingSystem.getAllBuildings().filter(b => b.configId === 'builder_hut').length;
    const total = Math.max(1, huts); // 至少 1 工人
    const busy = this.buildingSystem.getAllBuildings().filter(b => b.isUpgrading).length;
    return total - busy;
  }

  private startPlacing(config: BuildingConfig): void {
    if (config.id !== 'builder_hut' && this.getFreeBuilders() <= 0) {
      this.showToast('❌ 没有空闲工人！建造工人小屋', 'error'); return;
    }
    if (!this.resourceManager.canAfford(config.levels[0].cost, config.levels[0].costType)) {
      this.showToast('❌ 资源不足！', 'error'); return;
    }
    this.mode = 'placing'; this.placingConfig = config;
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`build-${config.id}`)?.classList.add('active');
    this.updateHint(`点击地图放置 ${config.name} | 右键或 ESC 取消`);
  }

  private cancelPlacing(): void {
    this.mode = 'idle'; this.placingConfig = null; this.movingBuildingUid = null;
    this.buildingRenderer.clearPreview();
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    this.updateHint('拖拽平移 | 滚轮缩放 | 点击建筑查看信息');
  }

  // ===== 交互 =====

  private setupInteraction(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener('pointerdown', (e) => { this.pointerDownX = e.clientX; this.pointerDownY = e.clientY; });
    canvas.addEventListener('pointermove', (e) => {
      if (this.scene !== 'village') return;
      if (this.mode === 'placing' && this.placingConfig) this.showPlacementPreview(e);
      if (this.mode === 'moving' && this.movingBuildingUid) this.dragBuilding(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      const dx = e.clientX - this.pointerDownX, dy = e.clientY - this.pointerDownY;
      const isClick = Math.sqrt(dx * dx + dy * dy) < this.CLICK_THRESHOLD;
      if (this.scene === 'battle') { if (isClick) this.handleBattleDeploy(e); return; }
      if (this.mode === 'placing' && this.placingConfig && isClick) { this.handlePlacement(e); return; }
      if (this.mode === 'moving' && this.movingBuildingUid) { this.confirmMove(e); return; }
      if (this.mode === 'idle' && isClick) this.handleBuildingClick(e);
    });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.mode !== 'idle') this.cancelPlacing(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (this.mode !== 'idle') this.cancelPlacing(); this.closeBuildingInfo(); } });
  }

  private showPlacementPreview(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const r = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const g = this.gridMap.pixelToGrid(w.x, w.y);
    const o = Math.floor(this.placingConfig.size / 2);
    this.buildingRenderer.showPreview(g.gridX - o, g.gridY - o, this.placingConfig, this.gridMap.canPlace(g.gridX - o, g.gridY - o, this.placingConfig.size));
  }

  private handlePlacement(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const r = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const g = this.gridMap.pixelToGrid(w.x, w.y);
    const o = Math.floor(this.placingConfig.size / 2);
    const gx = g.gridX - o, gy = g.gridY - o;
    const l1 = this.placingConfig.levels[0];
    if (!this.resourceManager.canAfford(l1.cost, l1.costType)) { this.showToast('❌ 资源不足！', 'error'); return; }
    const building = this.buildingSystem.placeBuilding(this.placingConfig.id, gx, gy);
    if (building) {
      this.resourceManager.spend(l1.cost, l1.costType);
      this.buildingRenderer.addBuilding(building);
      this.buildingRenderer.clearPreview();
      this.showToast(`✅ ${this.placingConfig.name} 放置成功`, 'success');
      this.audio.play('build');
      this.stats.buildingsPlaced++;
      this.updateBuildButtons(); this.updateArmyInfo(); this.checkAchievements(); this.saveGame();
    }
  }

  private handleBuildingClick(e: PointerEvent): void {
    const r = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const g = this.gridMap.pixelToGrid(w.x, w.y);
    const c = this.gridMap.getCell(g.gridX, g.gridY);
    if (c?.occupied && c.buildingUid) this.showBuildingInfo(c.buildingUid);
  }

  private dragBuilding(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) return;
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;
    const r = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const g = this.gridMap.pixelToGrid(w.x, w.y);
    const o = Math.floor(config.size / 2);
    this.buildingRenderer.showPreview(g.gridX - o, g.gridY - o, config, this.gridMap.canPlace(g.gridX - o, g.gridY - o, config.size, this.movingBuildingUid));
  }

  private confirmMove(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) { this.cancelPlacing(); return; }
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) { this.cancelPlacing(); return; }
    const r = this.app.canvas.getBoundingClientRect();
    const w = this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const g = this.gridMap.pixelToGrid(w.x, w.y);
    const o = Math.floor(config.size / 2);
    if (this.buildingSystem.moveBuilding(this.movingBuildingUid, g.gridX - o, g.gridY - o)) {
      this.buildingRenderer.updateBuildingPosition(this.movingBuildingUid, g.gridX - o, g.gridY - o);
      this.saveGame();
    }
    this.buildingRenderer.clearPreview(); this.mode = 'idle'; this.movingBuildingUid = null;
  }

  // ===== 建筑信息 =====

  private setupBuildingInfoPanel(): void {
    document.getElementById('info-upgrade-btn')?.addEventListener('click', () => this.handleUpgrade());
    document.getElementById('info-move-btn')?.addEventListener('click', () => this.handleMoveFromInfo());
    document.getElementById('info-close-btn')?.addEventListener('click', () => this.closeBuildingInfo());
    document.getElementById('overlay')?.addEventListener('click', () => { this.closeBuildingInfo(); this.closeBattleResult(); this.closeModal('settings-panel'); this.closeModal('stats-panel'); });
  }

  private showBuildingInfo(uid: string): void {
    const building = this.buildingSystem.getBuilding(uid);
    if (!building) return;
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;
    this.selectedBuildingUid = uid;
    const lc = config.levels[building.level - 1];

    const iconEl = document.getElementById('info-icon');
    const titleEl = document.getElementById('info-title');
    const levelEl = document.getElementById('info-level');
    const statsEl = document.getElementById('info-stats');
    const upgradeBtn = document.getElementById('info-upgrade-btn') as HTMLButtonElement;

    if (iconEl) iconEl.textContent = config.icon;
    if (titleEl) titleEl.textContent = config.name;
    if (levelEl) levelEl.textContent = `等级 ${building.level} / ${config.levels.length}`;

    let html = '';
    if (lc) {
      html += `<div><span class="stat-label">生命值：</span><span class="stat-value">${lc.hp}</span></div>`;
      if (lc.productionRate) html += `<div><span class="stat-label">产出：</span><span class="stat-value">${lc.productionRate}/时</span></div>`;
      if (lc.storageCapacity) html += `<div><span class="stat-label">容量：</span><span class="stat-value">${lc.storageCapacity.toLocaleString()}</span></div>`;
      if (lc.damage) html += `<div><span class="stat-label">伤害：</span><span class="stat-value">${lc.damage}</span></div>`;
      if (lc.range) html += `<div><span class="stat-label">射程：</span><span class="stat-value">${lc.range}格</span></div>`;
      if (lc.armyCapacity) html += `<div><span class="stat-label">军队容量：</span><span class="stat-value">${lc.armyCapacity}</span></div>`;
    }
    if (building.isUpgrading) {
      const rem = this.upgradeSystem.getRemainingTime(building);
      html += `<div style="color:#ffa726;margin-top:8px">⏳ 升级中... ${this.upgradeSystem.formatTime(rem)}</div>`;
      upgradeBtn.textContent = '升级中...'; upgradeBtn.disabled = true;
    } else {
      const cost = this.upgradeSystem.getUpgradeCost(building);
      if (cost) {
        const ci = cost.costType === 'gold' ? '🪙' : '💧';
        html += `<div style="margin-top:8px;color:#888;font-size:12px">下一级：${ci}${cost.cost.toLocaleString()} | ⏱${this.upgradeSystem.formatTime(cost.time)}</div>`;
        upgradeBtn.textContent = `升级 ${ci}${cost.cost.toLocaleString()}`;
        upgradeBtn.disabled = !this.upgradeSystem.canUpgrade(building).ok;
      } else { upgradeBtn.textContent = '已满级'; upgradeBtn.disabled = true; }
    }
    if (statsEl) statsEl.innerHTML = html;
    document.getElementById('building-info')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
  }

  private handleUpgrade(): void {
    if (!this.selectedBuildingUid) return;
    const b = this.buildingSystem.getBuilding(this.selectedBuildingUid);
    if (!b) return;
    if (this.upgradeSystem.startUpgrade(b)) {
      this.showBuildingInfo(this.selectedBuildingUid);
      this.updateBuildButtons(); this.updateArmyInfo(); this.saveGame();
      this.showToast('⬆️ 升级开始！', 'success');
    }
  }

  private handleMoveFromInfo(): void {
    if (!this.selectedBuildingUid) return;
    this.closeBuildingInfo();
    this.mode = 'moving'; this.movingBuildingUid = this.selectedBuildingUid;
    this.updateHint('📦 拖拽到新位置 | 右键或 ESC 取消');
  }

  private closeBuildingInfo(): void {
    this.selectedBuildingUid = null;
    document.getElementById('building-info')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ===== 搜索 =====

  private showSearchAnimation(): void {
    if (this.armySystem.isEmpty()) { this.showToast('❌ 没有军队！先训练士兵', 'error'); return; }
    const overlay = document.getElementById('overlay')!;
    const box = document.getElementById('search-box')!;
    overlay.classList.add('show'); box.classList.add('show');
    document.getElementById('search-trophies')!.textContent = `🏆 ${this.trophies}`;
    const txt = document.getElementById('search-text')!;
    let dots = 0;
    const si = setInterval(() => { dots = (dots + 1) % 4; txt.textContent = '搜索对手中' + '.'.repeat(dots); }, 400);
    setTimeout(() => { clearInterval(si); txt.textContent = '✅ 找到对手！'; setTimeout(() => { box.classList.remove('show'); overlay.classList.remove('show'); this.startBattle(); }, 600); }, 1500 + Math.random() * 1000);
  }

  // ===== 战斗 =====

  private setupBattleUI(): void {
    document.getElementById('end-battle-btn')?.addEventListener('click', () => this.endBattleEarly());
    document.getElementById('result-return-btn')?.addEventListener('click', () => this.returnToVillage());
  }

  /** 3 种战斗地图布局 */
  private generateEnemyBase() {
    const difficulty = Math.min(3, Math.floor(this.trophies / 400) + 1);
    const layouts = [this.layoutCentered, this.layoutSpread, this.layoutFortress];
    const layout = layouts[Math.floor(Math.random() * layouts.length)];
    return layout.call(this, difficulty);
  }

  private layoutCentered(diff: number) {
    const base: { uid: string; configId: string; gridX: number; gridY: number; level: number; isUpgrading: false }[] = [];
    let uid = 0;
    base.push({ uid: `e${uid++}`, configId: 'town_hall', gridX: 18, gridY: 18, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 16, gridY: 14, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'elixir_collector', gridX: 22, gridY: 14, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_storage', gridX: 16, gridY: 22, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 20, gridY: 16, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 16, gridY: 20, level: Math.min(diff, 3), isUpgrading: false });
    if (diff >= 2) base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 22, gridY: 20, level: Math.min(diff - 1, 3), isUpgrading: false });
    if (diff >= 3) base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 18, gridY: 24, level: 1, isUpgrading: false });
    return base;
  }

  private layoutSpread(diff: number) {
    const base: { uid: string; configId: string; gridX: number; gridY: number; level: number; isUpgrading: false }[] = [];
    let uid = 0;
    base.push({ uid: `e${uid++}`, configId: 'town_hall', gridX: 20, gridY: 20, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 8, gridY: 8, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 28, gridY: 8, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'elixir_collector', gridX: 8, gridY: 28, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_storage', gridX: 28, gridY: 28, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 14, gridY: 14, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 24, gridY: 24, level: Math.min(diff, 3), isUpgrading: false });
    if (diff >= 2) base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 24, gridY: 14, level: Math.min(diff - 1, 3), isUpgrading: false });
    return base;
  }

  private layoutFortress(diff: number) {
    const base: { uid: string; configId: string; gridX: number; gridY: number; level: number; isUpgrading: false }[] = [];
    let uid = 0;
    base.push({ uid: `e${uid++}`, configId: 'town_hall', gridX: 18, gridY: 18, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_storage', gridX: 16, gridY: 16, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'elixir_collector', gridX: 22, gridY: 16, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 14, gridY: 18, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 24, gridY: 18, level: Math.min(diff, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 18, gridY: 14, level: Math.min(diff, 3), isUpgrading: false });
    if (diff >= 2) {
      base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 14, gridY: 22, level: Math.min(diff - 1, 3), isUpgrading: false });
      base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 24, gridY: 22, level: Math.min(diff - 1, 3), isUpgrading: false });
    }
    return base;
  }

  private startBattle(): void {
    this.scene = 'battle';
    document.getElementById('build-panel')!.style.display = 'none';
    document.getElementById('train-panel')!.classList.remove('show');
    document.getElementById('resource-panel')!.style.display = 'none';
    document.getElementById('hint-text')!.style.display = 'none';
    document.getElementById('battle-hud')?.classList.add('show');
    document.getElementById('deploy-panel')?.classList.add('show');
    this.worldContainer.visible = false;

    const enemyBase = this.generateEnemyBase();
    const army = this.armySystem.getArmy();
    const lootGold = 1500 + this.trophies * 2;
    const lootElixir = 1500 + this.trophies * 2;
    this.battleEngine.initBattle(enemyBase, army, lootGold, lootElixir);
    this.battleRenderer.initBattlefield(this.battleEngine);
    this.app.stage.addChild(this.battleRenderer.getWorldContainer());
    this.battleFx = new BattleFx(this.battleRenderer.getWorldContainer());
    this.setupDeployPanel();
    this.setupSpellButtons();
    this.castingSpellId = null;
    this.audio.playBgm('battle');

    let lastTime = performance.now();
    const lastUnitHp = new Map<string, number>();
    const lastBldHp = new Map<string, number>();
    for (const u of this.battleEngine.units) lastUnitHp.set(u.uid, u.hp);
    for (const b of this.battleEngine.buildings) lastBldHp.set(b.uid, b.hp);

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const result = this.battleEngine.tick((now - (now - dt * 1000)) * this.battleSpeed);
      this.battleRenderer.update(this.battleEngine);

      if (this.battleFx) {
        for (const u of this.battleEngine.units) {
          const prev = lastUnitHp.get(u.uid) ?? u.maxHp;
          if (u.hp < prev) { this.battleFx.showDamage(u.x, u.y, Math.round(prev - u.hp)); this.battleFx.showAttackFlash(u.x, u.y, 0xff4444); }
          lastUnitHp.set(u.uid, u.hp);
        }
        for (const b of this.battleEngine.buildings) {
          const prev = lastBldHp.get(b.uid) ?? b.maxHp;
          const cx = (b.gridX + b.size / 2) * 32, cy = (b.gridY + b.size / 2) * 32;
          if (b.hp < prev) { this.battleFx.showDamage(cx, cy, Math.round(prev - b.hp)); this.battleFx.showAttackFlash(cx, cy); }
          if (b.destroyed && prev > 0) { this.battleFx.showExplosion(cx, cy); this.audio.play('explosion'); }
          lastBldHp.set(b.uid, b.hp);
        }
        this.battleFx.update(dt);
      }
      this.updateBattleHUD();
      if (result) { this.showBattleResult(result); return; }
      this.battleFrameId = requestAnimationFrame(loop);
    };
    this.battleFrameId = requestAnimationFrame(loop);
  }

  private setupDeployPanel(): void {
    const panel = document.getElementById('deploy-panel')!;
    panel.innerHTML = '';
    const fb = document.createElement('button');
    fb.className = 'deploy-btn'; fb.style.borderColor = '#44ff44';
    fb.innerHTML = `<span class="icon">⚡</span><span class="label">全力进攻</span>`;
    fb.addEventListener('click', () => this.battleEngine.startFighting());
    panel.appendChild(fb);

    for (const slot of this.battleEngine.deployableArmy) {
      const config = this.configLoader.getTroop(slot.troopId);
      if (!config) continue;
      const btn = document.createElement('button');
      btn.className = 'deploy-btn'; btn.id = `deploy-${slot.troopId}`;
      btn.innerHTML = `<span class="icon">${config.icon}</span><span class="label">${config.name}</span><span class="count">x${slot.count}</span>`;
      btn.addEventListener('click', () => {
        this.deployingTroopId = slot.troopId;
        document.querySelectorAll('.deploy-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      panel.appendChild(btn);
    }
  }

  private refreshDeployPanel(): void {
    for (const slot of this.battleEngine.deployableArmy) {
      const btn = document.getElementById(`deploy-${slot.troopId}`);
      if (!btn) continue;
      const c = btn.querySelector('.count');
      if (c) c.textContent = `x${slot.count}`;
      if (slot.count <= 0) btn.style.opacity = '0.3';
    }
  }

  private handleBattleDeploy(e: PointerEvent): void {
    if (this.battleEngine.phase === 'ended') return;
    const bw = this.battleRenderer.getWorldContainer();
    const r = this.app.canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - bw.x) / bw.scale.x;
    const wy = (e.clientY - r.top - bw.y) / bw.scale.y;

    // 法术施放
    if (this.castingSpellId) {
      const spell = this.battleEngine.spellSystem.cast(this.castingSpellId, wx, wy);
      if (spell) {
        this.battleFx?.showExplosion(wx, wy);
        this.audio.play('spell');
        this.refreshSpellButtons();
      }
      return;
    }

    // 兵种部署
    if (!this.deployingTroopId) return;
    const unit = this.battleEngine.deployUnit(this.deployingTroopId, wx, wy);
    if (unit) { this.battleFx?.showDeploySmoke(wx, wy); this.audio.play('deploy'); this.refreshDeployPanel(); }
  }

  private updateBattleHUD(): void {
    const t = document.getElementById('battle-timer');
    if (t) { const s = Math.ceil(this.battleEngine.battleTimer); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    const p = document.getElementById('battle-percent');
    if (p) p.textContent = `${this.battleEngine.getPercentDestroyed()}%`;
    const stars = this.battleEngine.getCurrentStars();
    for (let i = 1; i <= 3; i++) document.getElementById(`star${i}`)?.classList.toggle('earned', i <= stars);
    this.refreshSpellButtons();
  }

  private endBattleEarly(): void { this.battleEngine.startFighting(); this.battleEngine.battleTimer = 0; }

  private showBattleResult(result: BattleResult): void {
    if (this.battleFrameId !== null) { cancelAnimationFrame(this.battleFrameId); this.battleFrameId = null; }
    this.audio.play(result.stars >= 1 ? 'victory' : 'defeat');

    let tc = 0;
    if (result.stars >= 3) tc = 30; else if (result.stars >= 2) tc = 20; else if (result.stars >= 1) tc = 10; else tc = -10;
    this.trophies = Math.max(0, this.trophies + tc);
    if (this.trophies > this.stats.peakTrophies) this.stats.peakTrophies = this.trophies;
    const league = getLeague(this.trophies);

    this.stats.battlesTotal++;
    if (result.stars >= 1) this.stats.battlesWon++;
    this.stats.totalGoldLooted += result.goldLooted;
    this.stats.totalElixirLooted += result.elixirLooted;
    this.addDefenseLog(result, tc);
    this.battlePassStars += result.stars;

    const te = document.getElementById('result-title');
    const se = document.getElementById('result-stars');
    const ste = document.getElementById('result-stats');
    if (te) te.textContent = result.stars >= 2 ? '🎉 胜利！' : result.stars >= 1 ? '⚔️ 部分胜利' : '💀 失败';
    if (se) { let s = ''; for (let i = 0; i < 3; i++) s += i < result.stars ? '⭐' : '☆'; se.textContent = s; }
    const sign = tc >= 0 ? '+' : '';
    if (ste) ste.innerHTML = `<div>摧毁率：${result.percentDestroyed}%</div><div>掠夺金币：🪙 ${result.goldLooted.toLocaleString()}</div><div>掠夺圣水：💧 ${result.elixirLooted.toLocaleString()}</div><div style="margin-top:8px;font-weight:700">🏆 ${sign}${tc} 奖杯 → ${this.trophies}</div><div>${league.emoji} ${league.name}联赛</div>`;
    document.getElementById('battle-result')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
    this.resourceManager.earn(result.goldLooted, 'gold');
    this.resourceManager.earn(result.elixirLooted, 'elixir');
    this.checkAchievements();
  }

  private returnToVillage(): void {
    this.scene = 'village';
    this.closeBattleResult();
    this.app.stage.removeChild(this.battleRenderer.getWorldContainer());
    this.battleRenderer.clearAll(); this.battleFx?.clearAll(); this.battleFx = null;
    this.armySystem.clearArmy();
    this.worldContainer.visible = true;
    this.audio.playBgm('village');
    document.getElementById('build-panel')!.style.display = 'flex';
    document.getElementById('resource-panel')!.style.display = 'flex';
    document.getElementById('hint-text')!.style.display = 'block';
    document.getElementById('battle-hud')?.classList.remove('show');
    document.getElementById('deploy-panel')?.classList.remove('show');
    this.deployingTroopId = null;
    this.updateResourceUI(); this.updateArmyInfo(); this.updateTrophyDisplay(); this.saveGame();
  }

  private closeBattleResult(): void {
    document.getElementById('battle-result')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ===== 成就 =====

  private checkAchievements(): void {
    for (const a of ACHIEVEMENTS) {
      if (this.stats.unlockedAchievements.includes(a.id)) continue;
      if (a.check(this.stats, this.trophies)) {
        this.stats.unlockedAchievements.push(a.id);
        this.showToast(`🏅 ${a.name} — ${a.desc}`, 'achievement');
      }
    }
  }

  // ===== 设置面板 =====

  private setupSettingsPanel(): void {
    document.getElementById('clear-save-btn')?.addEventListener('click', async () => {
      if (confirm('确定清除所有存档？此操作不可撤销！')) {
        await this.dataStore.save(DataStore.getDefaultSave());
        window.location.reload();
      }
    });
    document.getElementById('settings-close-btn')?.addEventListener('click', () => this.closeModal('settings-panel'));
    document.getElementById('toggle-audio-btn')?.addEventListener('click', () => {
      this.audio.setEnabled(!this.audio.isEnabled());
      const btn = document.getElementById('toggle-audio-btn');
      if (btn) btn.textContent = this.audio.isEnabled() ? '开' : '关';
    });
  }

  // ===== 统计面板 =====

  private setupStatsPanel(): void {
    // 奖杯点击打开统计
    document.getElementById('trophy-display')?.addEventListener('click', () => this.showStatsPanel());
    document.getElementById('stats-close-btn')?.addEventListener('click', () => this.closeModal('stats-panel'));
  }

  private showStatsPanel(): void {
    const league = getLeague(this.trophies);
    const el = document.getElementById('stats-content');
    if (!el) return;

    el.innerHTML = `
      <div class="stat-row"><span class="stat-name">🏆 奖杯</span><span class="stat-val">${this.trophies}</span></div>
      <div class="stat-row"><span class="stat-name">${league.emoji} 联赛</span><span class="stat-val">${league.name}</span></div>
      <div class="stat-row"><span class="stat-name">🏆 最高奖杯</span><span class="stat-val">${this.stats.peakTrophies}</span></div>
      <div class="stat-row"><span class="stat-name">⚔️ 总战斗</span><span class="stat-val">${this.stats.battlesTotal}</span></div>
      <div class="stat-row"><span class="stat-name">🏆 胜利</span><span class="stat-val">${this.stats.battlesWon}</span></div>
      <div class="stat-row"><span class="stat-name">🔨 建造</span><span class="stat-val">${this.stats.buildingsPlaced}</span></div>
      <div class="stat-row"><span class="stat-name">🎖️ 训练</span><span class="stat-val">${this.stats.troopsTrained}</span></div>
      <div class="stat-row"><span class="stat-name">🪙 总掠夺金币</span><span class="stat-val">${this.stats.totalGoldLooted.toLocaleString()}</span></div>
      <div class="stat-row"><span class="stat-name">💧 总掠夺圣水</span><span class="stat-val">${this.stats.totalElixirLooted.toLocaleString()}</span></div>
      <div class="stat-row"><span class="stat-name">🏅 成就</span><span class="stat-val">${this.stats.unlockedAchievements.length}/${ACHIEVEMENTS.length}</span></div>
    `;

    document.getElementById('stats-panel')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
  }

  private closeModal(id: string): void {
    document.getElementById(id)?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ===== 事件 =====

  private setupEventListeners(): void {
    this.eventBus.on('resource:changed', () => { this.updateResourceUI(); this.updateBuildButtons(); });
    this.eventBus.on('building:upgraded', ({ building }) => {
      this.buildingRenderer.updateBuildingLevel(building);
      this.updateArmyInfo(); this.saveGame();
      this.showToast(`⬆️ ${this.configLoader.getBuilding(building.configId)?.name ?? '建筑'} 升级完成！`, 'success');
    });
    window.addEventListener('resize', () => this.camera.handleResize());
  }

  private updateResourceUI(): void {
    const res = this.resourceManager.getResources();
    const caps = this.resourceManager.getStorageCaps();
    const g = document.getElementById('gold-value'), e = document.getElementById('elixir-value'), gem = document.getElementById('gem-value');
    const gc = document.getElementById('gold-cap'), ec = document.getElementById('elixir-cap');
    if (g) g.textContent = res.gold.toLocaleString();
    if (e) e.textContent = res.elixir.toLocaleString();
    if (gem) gem.textContent = res.gems.toLocaleString();
    if (gc) gc.textContent = `/ ${caps.goldCap.toLocaleString()}`;
    if (ec) ec.textContent = `/ ${caps.elixirCap.toLocaleString()}`;
    this.updateTrophyDisplay();
  }

  private updateTrophyDisplay(): void {
    const el = document.getElementById('trophy-display');
    if (el) { const l = getLeague(this.trophies); el.textContent = `${l.emoji} ${this.trophies}`; }
  }

  private updateHint(text: string): void {
    const h = document.getElementById('hint-text');
    if (h) h.textContent = text;
  }

  // ===== 小地图 =====

  private setupMinimap(): void {
    const mc = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    mc?.addEventListener('click', (e) => {
      const rect = mc.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      this.camera.centerOnGrid(Math.floor(rx * GRID_SIZE), Math.floor(ry * GRID_SIZE));
    });
  }

  private renderMinimap(): void {
    const mc = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!mc) return;
    const ctx = mc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 120);
    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, 0, 120, 120);
    const mapPx = GRID_SIZE * CELL_PX;
    const scale = 120 / mapPx;
    for (const b of this.buildingSystem.getAllBuildings()) {
      const config = this.configLoader.getBuilding(b.configId);
      if (!config) continue;
      const x = b.gridX * CELL_PX * scale;
      const y = b.gridY * CELL_PX * scale;
      const s = config.size * CELL_PX * scale;
      const c = config.color;
      ctx.fillStyle = `rgb(${(c>>16)&0xff},${(c>>8)&0xff},${c&0xff})`;
      ctx.fillRect(x, y, s, s);
    }
  }

  // ===== 新手引导 =====

  private setupTutorial(): void {
    document.getElementById('tutorial-btn')?.addEventListener('click', () => this.nextTutorialStep());
  }

  private maybeShowTutorial(): void {
    if (this.stats.buildingsPlaced > 0 || this.tutorialShown) return;
    this.tutorialShown = true;
    this.tutorialStep = 0;
    this.showTutorialStep();
    document.getElementById('tutorial-panel')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
  }

  private showTutorialStep(): void {
    const steps = [
      { icon: '🏗️', text: '欢迎！点击下方建筑按钮，\n在地图上放置你的第一个建筑。' },
      { icon: '⚔️', text: '训练士兵组建军队，\n然后点击「进攻」按钮攻击其他玩家！' },
      { icon: '🏆', text: '赢得战斗获取奖杯和资源，\n升级建筑让你的村庄更强大！' },
    ];
    const step = steps[this.tutorialStep];
    const content = document.getElementById('tutorial-content');
    if (content) content.innerHTML = `<div class="tutorial-icon">${step.icon}</div><div class="tutorial-text">${step.text}</div>`;
    const dots = document.getElementById('tutorial-dots');
    if (dots) dots.innerHTML = steps.map((_, i) => `<div class="tutorial-dot ${i === this.tutorialStep ? 'active' : ''}"></div>`).join('');
    const btn = document.getElementById('tutorial-btn');
    if (btn) btn.textContent = this.tutorialStep >= steps.length - 1 ? '开始游戏！' : '下一步';
  }

  private nextTutorialStep(): void {
    this.tutorialStep++;
    if (this.tutorialStep >= 3) {
      this.closeModal('tutorial-panel');
    } else {
      this.showTutorialStep();
    }
  }

  // ===== 法术部署 =====

  private setupSpellButtons(): void {
    const panel = document.getElementById('deploy-panel')!;
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#555;flex-shrink:0;margin:0 4px;';
    panel.appendChild(sep);

    for (const spell of SPELL_CONFIGS) {
      const btn = document.createElement('button');
      btn.className = 'spell-btn';
      btn.id = `spell-${spell.id}`;
      const info = this.battleEngine.spellSystem.getSpellInfo(spell.id);
      btn.innerHTML = `${spell.icon}<span class="spell-charges">${info.charges}</span>`;
      btn.title = `${spell.name} — ${spell.effect === 'damage' ? `${spell.power}伤害` : `${spell.power}/秒回血`}`;
      btn.addEventListener('click', () => {
        this.castingSpellId = spell.id;
        this.deployingTroopId = null;
        document.querySelectorAll('.deploy-btn,.spell-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      panel.appendChild(btn);
    }
  }

  private refreshSpellButtons(): void {
    for (const spell of SPELL_CONFIGS) {
      const btn = document.getElementById(`spell-${spell.id}`);
      if (!btn) continue;
      const info = this.battleEngine.spellSystem.getSpellInfo(spell.id);
      const charges = btn.querySelector('.spell-charges');
      if (charges) charges.textContent = String(info.charges);
      btn.classList.toggle('cooldown', !this.battleEngine.spellSystem.canCast(spell.id));
    }
  }

  // ===== 快捷键 =====

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (this.scene !== 'battle') {
        // N 通知中心 / C 部落 / R 排行榜 / U 个人资料
        if (e.key === 'n' || e.key === 'N') {
          this.showNotifications();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'c' || e.key === 'C') {
          this.showClanPanel();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'r' || e.key === 'R') {
          this.showLeaderboard();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'u' || e.key === 'U') {
          this.showProfile();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'h' || e.key === 'H') {
          this.showHelp();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 's' || e.key === 'S') {
          this.showSeasonShop();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'b' || e.key === 'B') {
          this.showBattlePass();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'v' || e.key === 'V') {
          this.showVillageLayouts();
          document.getElementById('stats-panel')?.classList.add('show');
          document.getElementById('overlay')?.classList.add('show');
        }
        if (e.key === 'F1') { e.preventDefault(); this.saveVillageLayout(0); }
        if (e.key === 'F2') { e.preventDefault(); this.saveVillageLayout(1); }
        if (e.key === 'F3') { e.preventDefault(); this.saveVillageLayout(2); }
        return;
      }

      // 数字键 1-9 选择兵种
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const slots = this.battleEngine.deployableArmy.filter(s => s.count > 0);
        if (num <= slots.length) {
          this.deployingTroopId = slots[num - 1].troopId;
          this.castingSpellId = null;
          document.querySelectorAll('.deploy-btn,.spell-btn').forEach(b => b.classList.remove('active'));
          document.getElementById(`deploy-${this.deployingTroopId}`)?.classList.add('active');
        }
      }

      // Q/E 选择法术
      if (e.key === 'q' || e.key === 'Q') {
        this.castingSpellId = 'lightning';
        this.deployingTroopId = null;
        document.querySelectorAll('.deploy-btn,.spell-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('spell-lightning')?.classList.add('active');
      }
      if (e.key === 'e' || e.key === 'E') {
        this.castingSpellId = 'heal';
        this.deployingTroopId = null;
        document.querySelectorAll('.deploy-btn,.spell-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('spell-heal')?.classList.add('active');
      }

      // Space 全部署
      if (e.key === ' ') {
        e.preventDefault();
        this.battleEngine.startFighting();
      }

      // 倍速控制 (X 键切换)
      if (e.key === 'x' || e.key === 'X') {
        this.battleSpeed = this.battleSpeed >= 3 ? 1 : this.battleSpeed + 1;
        this.showToast(`⚓ 战斗速度: ${this.battleSpeed}x`, 'info');
      }

      // D 键显示防御日志
      if (e.key === 'd' || e.key === 'D') {
        this.showDefenseLog();
        document.getElementById('stats-panel')?.classList.add('show');
        document.getElementById('overlay')?.classList.add('show');
      }

      // P 键保存编队 / L 键加载编队
      if (e.key === 'p' || e.key === 'P') {
        this.saveArmyPreset(`编队${this.armyPresets.length + 1}`);
      }
      if (e.key === 'l' || e.key === 'L') {
        if (this.armyPresets.length > 0) this.loadArmyPreset(this.armyPresets[0].name);
      }
    });
  }

  // ===== 防御日志 =====

  private addDefenseLog(result: BattleResult, trophyChange: number): void {
    this.defenseLog.unshift({
      time: Date.now(),
      stars: result.stars,
      percent: result.percentDestroyed,
      trophyChange,
      goldLost: result.goldLooted,
      elixirLost: result.elixirLooted,
    });
    if (this.defenseLog.length > 10) this.defenseLog.pop();
  }

  private showDefenseLog(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    let html = '<div style="font-weight:700;margin-bottom:8px">🛡️ 最近战斗记录</div>';
    if (this.defenseLog.length === 0) {
      html += '<div style="color:#888;text-align:center;padding:16px">暂无记录</div>';
    } else {
      for (const e of this.defenseLog) {
        const t = new Date(e.time);
        const ts = `${t.getMonth()+1}/${t.getDate()} ${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}`;
        html += `<div class="stat-row"><span class="stat-name">${ts} ${'⭐'.repeat(e.stars)} ${e.percent}%</span><span class="stat-val" style="color:${e.trophyChange>=0?'#4f4':'#f44'}">${e.trophyChange>=0?'+':''}${e.trophyChange}</span></div>`;
      }
    }
    content.innerHTML = html;
  }

  // ===== 部队预设 =====

  private saveArmyPreset(name: string): void {
    const army = this.armySystem.getArmy().map(s => ({ troopId: s.troopId, count: s.count }));
    const existing = this.armyPresets.findIndex(p => p.name === name);
    if (existing >= 0) this.armyPresets[existing].army = army;
    else this.armyPresets.push({ name, army });
    if (this.armyPresets.length > 5) this.armyPresets.pop();
    this.showToast(`💾 编队「${name}」已保存`, 'success');
  }

  private loadArmyPreset(name: string): void {
    const preset = this.armyPresets.find(p => p.name === name);
    if (!preset) { this.showToast('❌ 预设不存在', 'error'); return; }
    this.armySystem.clearArmy();
    for (const s of preset.army) {
      for (let i = 0; i < s.count; i++) this.armySystem.trainTroop(s.troopId);
    }
    this.updateTrainButtons();
    this.updateArmyInfo();
    this.showToast(`✅ 编队「${name}」已加载`, 'success');
  }

  // ===== 每日奖励 =====

  private checkDailyReward(): void {
    const today = new Date().toDateString();
    if (this.lastDailyRewardDate === today) return;
    this.lastDailyRewardDate = today;
    this.dailyStreak = (this.dailyStreak % 7) + 1;
    const reward = DAILY_REWARDS[this.dailyStreak - 1];
    this.resourceManager.earn(reward.gold, 'gold');
    this.resourceManager.earn(reward.elixir, 'elixir');
    if (reward.gems > 0) this.resourceManager.earn(reward.gems, 'gems');
    const gemText = reward.gems > 0 ? ` + ${reward.gems}💎` : '';
    this.showToast(`🎁 第${this.dailyStreak}天登录: +${reward.gold}金 +${reward.elixir}圣水${gemText}`, 'success');
    this.addNotification(`每日奖励: +${reward.gold}💰 +${reward.elixir}💧${gemText}`);
  }

  // ===== 通知中心 =====

  private addNotification(text: string): void {
    this.notifications.unshift({ text, time: Date.now() });
    if (this.notifications.length > 20) this.notifications.pop();
  }

  private showNotifications(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    let html = '<div style="font-weight:700;margin-bottom:8px">🔔 通知中心</div>';
    if (this.notifications.length === 0) {
      html += '<div style="color:#888;text-align:center;padding:16px">暂无通知</div>';
    } else {
      for (const n of this.notifications) {
        const t = new Date(n.time);
        const ts = `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}`;
        html += `<div class="stat-row"><span class="stat-name">${ts}</span><span class="stat-val">${n.text}</span></div>`;
      }
    }
    content.innerHTML = html;
  }

  // ===== 部落系统（本地模拟） =====

  private createClan(name: string): void {
    this.clan = {
      name,
      members: [
        { name: this.playerName, trophies: this.trophies, role: '首领' },
        { name: '小兵甲', trophies: 200, role: '成员' },
        { name: '小兵乙', trophies: 350, role: '成员' },
        { name: '智囊团', trophies: 500, role: '长老' },
      ],
      messages: [
        { sender: '系统', text: `部落「${name}」创建成功！`, time: Date.now() },
        { sender: '智囊团', text: '欢迎加入！一起战斗吧！🎉', time: Date.now() + 1000 },
      ],
    };
    this.showToast(`🏰 部落「${name}」创建成功！`, 'success');
    this.addNotification(`创建部落: ${name}`);
  }

  private showClanPanel(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    if (!this.clan) {
      content.innerHTML = '<div style="font-weight:700;margin-bottom:8px">🏰 部落</div>' +
        '<div style="color:#888;text-align:center;padding:16px">你还没有加入部落</div>' +
        '<div style="text-align:center"><button onclick="window.__clanCreate()" style="padding:8px 16px;background:#4a7;color:#fff;border:none;border-radius:8px;cursor:pointer">创建部落</button></div>';
      (window as unknown as Record<string, unknown>).__clanCreate = () => { this.createClan('勇者联盟'); this.showClanPanel(); };
      return;
    }
    let html = `<div style="font-weight:700;margin-bottom:8px">🏰 ${this.clan.name}</div>`;
    html += '<div style="font-weight:600;margin:8px 0">成员</div>';
    for (const m of this.clan.members) {
      html += `<div class="stat-row"><span class="stat-name">${m.role === '首领' ? '👑' : m.role === '长老' ? '⭐' : '👤'} ${m.name}</span><span class="stat-val">🏆${m.trophies}</span></div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0">聊天</div>';
    for (const msg of this.clan.messages.slice(-5)) {
      html += `<div class="stat-row"><span class="stat-name" style="color:#aaa">${msg.sender}</span><span class="stat-val">${msg.text}</span></div>`;
    }
    content.innerHTML = html;
  }

  // ===== 排行榜 =====

  private showLeaderboard(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    const allPlayers = [...NPC_PLAYERS, { name: `⭐ ${this.playerName}`, trophies: this.trophies, league: getLeague(this.trophies).emoji }];
    allPlayers.sort((a, b) => b.trophies - a.trophies);
    let html = '<div style="font-weight:700;margin-bottom:8px">🏆 排行榜</div>';
    allPlayers.forEach((p, i) => {
      const isMe = p.name.startsWith('⭐');
      html += `<div class="stat-row" style="${isMe ? 'background:#333;border-radius:6px;padding:4px 8px' : ''}"><span class="stat-name">${i+1}. ${p.league} ${p.name}</span><span class="stat-val">${p.trophies}🏆</span></div>`;
    });
    content.innerHTML = html;
  }

  // ===== 个人资料 =====

  private showProfile(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    const league = getLeague(this.trophies);
    let html = '<div style="font-weight:700;margin-bottom:12px;font-size:16px">👤 个人资料</div>';
    html += `<div class="stat-row"><span class="stat-name">名字</span><span class="stat-val">${this.playerName}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">联赛</span><span class="stat-val">${league.emoji} ${league.name}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">奖杯</span><span class="stat-val">${this.trophies}🏆</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">总战斗</span><span class="stat-val">${this.stats.battlesTotal}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">胜场</span><span class="stat-val">${this.stats.battlesWon}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">建筑</span><span class="stat-val">${this.stats.buildingsPlaced}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">训练</span><span class="stat-val">${this.stats.troopsTrained}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">部落</span><span class="stat-val">${this.clan ? this.clan.name : '无'}</span></div>`;
    html += `<div class="stat-row"><span class="stat-name">连续登录</span><span class="stat-val">${this.dailyStreak}天</span></div>`;
    content.innerHTML = html;
  }

  // ===== 天气系统 =====

  private weatherType: 'sunny' | 'cloudy' | 'rainy' = 'sunny';
  private weatherTimer = 0;

  private updateWeather(dt: number): void {
    this.weatherTimer += dt;
    if (this.weatherTimer < 60000) return; // 每 60 秒切换
    this.weatherTimer = 0;
    const r = Math.random();
    this.weatherType = r < 0.5 ? 'sunny' : r < 0.8 ? 'cloudy' : 'rainy';
    const canvas = this.app.canvas;
    switch (this.weatherType) {
      case 'sunny': canvas.style.filter = 'brightness(1.0)'; break;
      case 'cloudy': canvas.style.filter = 'brightness(0.85)'; break;
      case 'rainy': canvas.style.filter = 'brightness(0.7) saturate(0.8)'; break;
    }
  }

  // ===== 赛季商店 =====

  private showSeasonShop(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    const items = [
      { name: '1000 金币', cost: 10, icon: '💰', type: 'gold' as const, amount: 1000 },
      { name: '1000 圣水', cost: 10, icon: '💧', type: 'elixir' as const, amount: 1000 },
      { name: '5000 金币', cost: 40, icon: '💰', type: 'gold' as const, amount: 5000 },
      { name: '5000 圣水', cost: 40, icon: '💧', type: 'elixir' as const, amount: 5000 },
      { name: '工人药水（加速建造）', cost: 50, icon: '⚡', type: 'gold' as const, amount: 0 },
    ];
    let html = '<div style="font-weight:700;margin-bottom:8px">🏪 赛季商店</div>';
    for (const item of items) {
      html += `<div class="stat-row"><span class="stat-name">${item.icon} ${item.name}</span><span class="stat-val">${item.cost}💎</span></div>`;
    }
    html += '<div style="color:#888;text-align:center;margin-top:8px;font-size:12px">点击商品使用宝石购买（功能演示）</div>';
    content.innerHTML = html;
  }

  // ===== 战斗通行证 =====

  private battlePassStars = 0;

  private showBattlePass(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    const tiers = [
      { stars: 5, reward: '500 金', icon: '💰' },
      { stars: 10, reward: '500 圣水', icon: '💧' },
      { stars: 20, reward: '10 宝石', icon: '💎' },
      { stars: 35, reward: '2000 金', icon: '💰' },
      { stars: 50, reward: '50 宝石', icon: '💎' },
      { stars: 75, reward: '5000 金+圣水', icon: '🏆' },
      { stars: 100, reward: '100 宝石', icon: '👑' },
    ];
    let html = `<div style="font-weight:700;margin-bottom:8px">🎖️ 战斗通行证 (${this.battlePassStars}⭐)</div>`;
    for (const tier of tiers) {
      const unlocked = this.battlePassStars >= tier.stars;
      html += `<div class="stat-row" style="${unlocked ? 'opacity:0.5' : ''}"><span class="stat-name">${tier.icon} ${tier.reward}</span><span class="stat-val">${unlocked ? '✅' : `${tier.stars}⭐`}</span></div>`;
    }
    content.innerHTML = html;
  }

  // ===== 村庄布局保存 =====

  private villageLayouts: { name: string; buildings: { configId: string; gridX: number; gridY: number; level: number }[] }[] = [];

  private saveVillageLayout(slot: number): void {
    const buildings = this.buildingSystem.getAllBuildings().map(b => ({
      configId: b.configId, gridX: b.gridX, gridY: b.gridY, level: b.level,
    }));
    const name = `布局 ${slot + 1}`;
    this.villageLayouts[slot] = { name, buildings };
    this.showToast(`💾 ${name} 已保存（${buildings.length} 建筑）`, 'success');
  }

  private showVillageLayouts(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    let html = '<div style="font-weight:700;margin-bottom:8px">🗺️ 村庄布局</div>';
    for (let i = 0; i < 3; i++) {
      const layout = this.villageLayouts[i];
      if (layout) {
        html += `<div class="stat-row"><span class="stat-name">📐 ${layout.name} (${layout.buildings.length}建筑)</span><span class="stat-val">已保存</span></div>`;
      } else {
        html += `<div class="stat-row"><span class="stat-name">📐 布局 ${i+1}</span><span class="stat-val" style="color:#888">空</span></div>`;
      }
    }
    html += '<div style="color:#888;text-align:center;margin-top:8px;font-size:12px">按 F1/F2/F3 保存对应槽位</div>';
    content.innerHTML = html;
  }

  // ===== 帮助面板 =====

  private showHelp(): void {
    const content = document.getElementById('stats-content');
    if (!content) return;
    let html = '<div style="font-weight:700;margin-bottom:8px">❓ 游戏帮助</div>';
    const shortcuts = [
      ['N', '通知中心'], ['C', '部落面板'], ['R', '排行榜'], ['U', '个人资料'],
      ['H', '帮助/快捷键'], ['S', '赛季商店'], ['B', '战斗通行证'], ['V', '村庄布局'],
      ['1-9', '选择兵种（战斗）'], ['Q/E', '闪电/治愈法术'], ['Space', '全部署'],
      ['X', '倍速切换'], ['D', '防御日志'], ['P/L', '保存/加载编队'],
      ['F1-F3', '保存村庄布局'],
    ];
    html += '<div style="font-weight:600;margin:8px 0">⌨️ 快捷键</div>';
    for (const [key, desc] of shortcuts) {
      html += `<div class="stat-row"><span class="stat-name" style="font-family:monospace;background:#333;padding:2px 6px;border-radius:4px">${key}</span><span class="stat-val">${desc}</span></div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0">📖 玩法说明</div>';
    html += '<div style="color:#ccc;font-size:12px;line-height:1.8">建造建筑 → 训练军队 → 搜索对手 → 部署作战 → 掠夺资源 → 升级壮大</div>';
    content.innerHTML = html;
  }

  // ===== FPS 监控 =====

  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsDisplay = 60;

  private updateFps(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1000) {
      this.fpsDisplay = Math.round(this.fpsFrames * 1000 / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      const el = document.getElementById('fps-counter');
      if (el) el.textContent = `${this.fpsDisplay} FPS`;
    }
  }
}
