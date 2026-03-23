// ============================================================
// Game 主类 — 整合所有系统，管理游戏生命周期和交互
// ============================================================

import { Application, Container } from 'pixi.js';
import { EventBus } from './core/EventBus.js';
import { ConfigLoader } from './core/ConfigLoader.js';
import { GameClock } from './core/GameClock.js';
import { DataStore } from './core/DataStore.js';
import { GridMap } from './gameplay/GridMap.js';
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
import type { BuildingConfig, SaveData, BattleResult } from './types/index.js';

type GameScene = 'village' | 'battle';
type InteractionMode = 'idle' | 'placing' | 'moving';

/** 联赛等级名称 */
const LEAGUES = [
  { name: '青铜', min: 0, emoji: '🥉' },
  { name: '白银', min: 400, emoji: '🥈' },
  { name: '黄金', min: 800, emoji: '🥇' },
  { name: '水晶', min: 1200, emoji: '💎' },
  { name: '冠军', min: 2000, emoji: '👑' },
];

function getLeague(trophies: number) {
  let league = LEAGUES[0];
  for (const l of LEAGUES) { if (trophies >= l.min) league = l; }
  return league;
}

export class Game {
  private app!: Application;
  private worldContainer!: Container;

  // 核心
  private eventBus = new EventBus();
  private configLoader = new ConfigLoader();
  private gameClock = new GameClock(this.eventBus);
  private dataStore = new DataStore();

  // 逻辑
  private gridMap = new GridMap();
  private buildingSystem = new BuildingSystem(this.eventBus, this.configLoader, this.gridMap);
  private resourceManager = new ResourceManager(this.eventBus, this.configLoader, this.buildingSystem);
  private upgradeSystem = new UpgradeSystem(this.eventBus, this.configLoader, this.buildingSystem, this.resourceManager);
  private armySystem = new ArmySystem(this.configLoader, this.buildingSystem, this.resourceManager);
  private battleEngine = new BattleEngine(this.eventBus, this.configLoader);

  // 渲染
  private mapRenderer = new MapRenderer();
  private buildingRenderer!: BuildingRenderer;
  private camera!: CameraController;
  private battleRenderer!: BattleRenderer;
  private battleFx: BattleFx | null = null;

  // 状态
  private scene: GameScene = 'village';
  private mode: InteractionMode = 'idle';
  private placingConfig: BuildingConfig | null = null;
  private movingBuildingUid: string | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private readonly CLICK_THRESHOLD = 5;
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000;
  private selectedBuildingUid: string | null = null;
  private showingTrainPanel = false;
  private deployingTroopId: string | null = null;
  private battleFrameId: number | null = null;
  private trophies = 0;

  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: document.getElementById('game-container')!,
      backgroundColor: 0x1a1a2e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });
    document.getElementById('game-container')!.appendChild(this.app.canvas);

    this.worldContainer = this.mapRenderer.getWorldContainer();
    this.app.stage.addChild(this.worldContainer);
    this.buildingRenderer = new BuildingRenderer(
      this.mapRenderer.buildingLayer, this.mapRenderer.overlayLayer, this.configLoader,
    );
    this.camera = new CameraController(this.worldContainer, this.app.canvas);
    this.mapRenderer.renderGround(this.gridMap);
    this.battleRenderer = new BattleRenderer(this.app, this.configLoader);

    await this.dataStore.init();
    await this.loadGame();

    this.setupBuildPanel();
    this.updateResourceUI();
    this.updateArmyInfo();
    this.setupInteraction();
    this.setupEventListeners();
    this.setupBuildingInfoPanel();
    this.setupBattleUI();

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
      }
    });

    console.log('🎮 COC Clone 初始化完成！');
  }

  // ========== 存档 ==========

  private async loadGame(): Promise<void> {
    let saveData = await this.dataStore.load();
    if (!saveData) saveData = DataStore.getDefaultSave();
    this.resourceManager.setResources(saveData.resources);
    this.buildingSystem.loadBuildings(saveData.buildings);
    if (saveData.army) this.armySystem.loadArmy(saveData.army);
    this.trophies = saveData.trophies ?? 0;

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
    const saveData: SaveData = {
      townHallLevel: 1,
      resources: this.resourceManager.exportResources(),
      buildings: this.buildingSystem.exportBuildings(),
      army: this.armySystem.exportArmy(),
      trophies: this.trophies,
      lastOnlineTime: Date.now(),
    };
    await this.dataStore.save(saveData);
  }

  // ========== 建造面板 ==========

  private setupBuildPanel(): void {
    const panel = document.getElementById('build-panel')!;
    panel.innerHTML = '';

    // 攻击按钮
    const attackBtn = document.createElement('button');
    attackBtn.className = 'action-btn attack';
    attackBtn.id = 'attack-btn';
    attackBtn.innerHTML = `<span class="icon">⚔️</span><span class="label">进攻!</span>`;
    attackBtn.addEventListener('click', () => this.showSearchAnimation());
    panel.appendChild(attackBtn);

    // 训练按钮
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
      const costClass = level1.costType === 'elixir' ? 'cost elixir' : 'cost';
      const costIcon = level1.costType === 'gold' ? '🪙' : '💧';
      btn.innerHTML = `
        <span class="icon">${config.icon}</span>
        <span class="label">${config.name}</span>
        <span class="${costClass}">${costIcon}${level1.cost.toLocaleString()}</span>
      `;
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
      const canAfford = this.resourceManager.canAfford(config.levels[0].cost, config.levels[0].costType);
      btn.classList.toggle('disabled', !canAfford);
    }
  }

  // ========== 训练 ==========

  private setupTrainPanel(): void {
    const panel = document.getElementById('train-panel')!;
    panel.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'action-btn';
    backBtn.innerHTML = `<span class="icon">↩️</span><span class="label">返回</span>`;
    backBtn.addEventListener('click', () => this.toggleTrainPanel());
    panel.appendChild(backBtn);

    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#4488cc;flex-shrink:0;';
    panel.appendChild(sep);

    for (const troop of this.configLoader.getAllTroops()) {
      const l1 = troop.levels[0];
      const btn = document.createElement('button');
      btn.className = 'train-btn';
      btn.id = `train-${troop.id}`;
      btn.innerHTML = `
        <span class="icon">${troop.icon}</span>
        <span class="label">${troop.name}</span>
        <span class="cost elixir">💧${l1.cost}</span>
      `;
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
      this.updateArmyInfo();
      this.updateTrainButtons();
      this.updateHint(`✅ 训练了一个${this.configLoader.getTroop(troopId)?.name ?? '单位'}`);
    } else {
      this.updateHint('❌ 容量不足或资源不足');
    }
  }

  private updateTrainButtons(): void {
    for (const troop of this.configLoader.getAllTroops()) {
      const btn = document.getElementById(`train-${troop.id}`);
      if (!btn) continue;
      const l1 = troop.levels[0];
      const canAfford = this.resourceManager.canAfford(l1.cost, l1.costType);
      const hasCapacity = this.armySystem.getRemainingCapacity() >= troop.housingSpace;
      btn.classList.toggle('disabled', !canAfford || !hasCapacity);
    }
  }

  private updateArmyInfo(): void {
    const el = document.getElementById('army-info');
    if (el) el.textContent = `⚔️ ${this.armySystem.getCurrentCapacity()}/${this.armySystem.getMaxCapacity()}`;
  }

  // ========== 放置/移动 ==========

  private startPlacing(config: BuildingConfig): void {
    if (!this.resourceManager.canAfford(config.levels[0].cost, config.levels[0].costType)) {
      this.updateHint(`❌ 资源不足！`);
      return;
    }
    this.mode = 'placing';
    this.placingConfig = config;
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`build-${config.id}`)?.classList.add('active');
    this.updateHint(`点击地图放置 ${config.name} | 右键或 ESC 取消`);
  }

  private cancelPlacing(): void {
    this.mode = 'idle';
    this.placingConfig = null;
    this.movingBuildingUid = null;
    this.buildingRenderer.clearPreview();
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    this.updateHint('拖拽平移 | 滚轮缩放 | 点击建筑查看信息');
  }

  // ========== 交互 ==========

  private setupInteraction(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.scene === 'village') {
        if (this.mode === 'placing' && this.placingConfig) this.showPlacementPreview(e);
        if (this.mode === 'moving' && this.movingBuildingUid) this.dragBuilding(e);
      }
    });

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      const dx = e.clientX - this.pointerDownX;
      const dy = e.clientY - this.pointerDownY;
      const isClick = Math.sqrt(dx * dx + dy * dy) < this.CLICK_THRESHOLD;

      if (this.scene === 'battle') {
        if (isClick) this.handleBattleDeploy(e);
        return;
      }
      if (this.mode === 'placing' && this.placingConfig && isClick) {
        this.handlePlacement(e); return;
      }
      if (this.mode === 'moving' && this.movingBuildingUid) {
        this.confirmMove(e); return;
      }
      if (this.mode === 'idle' && isClick) this.handleBuildingClick(e);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.mode !== 'idle') this.cancelPlacing();
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.mode !== 'idle') this.cancelPlacing();
        this.closeBuildingInfo();
      }
    });
  }

  private showPlacementPreview(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset, gy = grid.gridY - offset;
    this.buildingRenderer.showPreview(gx, gy, this.placingConfig, this.gridMap.canPlace(gx, gy, this.placingConfig.size));
  }

  private handlePlacement(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset, gy = grid.gridY - offset;
    const l1 = this.placingConfig.levels[0];
    if (!this.resourceManager.canAfford(l1.cost, l1.costType)) { this.updateHint('❌ 资源不足！'); return; }
    const building = this.buildingSystem.placeBuilding(this.placingConfig.id, gx, gy);
    if (building) {
      this.resourceManager.spend(l1.cost, l1.costType);
      this.buildingRenderer.addBuilding(building);
      this.buildingRenderer.clearPreview();
      this.updateHint(`✅ ${this.placingConfig.name} 放置成功`);
      this.updateBuildButtons();
      this.updateArmyInfo(); // 兵营放置后更新容量
      this.saveGame();
    }
  }

  private handleBuildingClick(e: PointerEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const cell = this.gridMap.getCell(grid.gridX, grid.gridY);
    if (cell?.occupied && cell.buildingUid) this.showBuildingInfo(cell.buildingUid);
  }

  private dragBuilding(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) return;
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(config.size / 2);
    this.buildingRenderer.showPreview(grid.gridX - offset, grid.gridY - offset, config,
      this.gridMap.canPlace(grid.gridX - offset, grid.gridY - offset, config.size, this.movingBuildingUid));
  }

  private confirmMove(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) { this.cancelPlacing(); return; }
    const config = this.configLoader.getBuilding(building.configId);
    if (!config) { this.cancelPlacing(); return; }
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(config.size / 2);
    const gx = grid.gridX - offset, gy = grid.gridY - offset;
    if (this.buildingSystem.moveBuilding(this.movingBuildingUid, gx, gy)) {
      this.buildingRenderer.updateBuildingPosition(this.movingBuildingUid, gx, gy);
      this.saveGame();
    }
    this.buildingRenderer.clearPreview();
    this.mode = 'idle';
    this.movingBuildingUid = null;
  }

  // ========== 建筑信息弹窗 ==========

  private setupBuildingInfoPanel(): void {
    document.getElementById('info-upgrade-btn')?.addEventListener('click', () => this.handleUpgrade());
    document.getElementById('info-move-btn')?.addEventListener('click', () => this.handleMoveFromInfo());
    document.getElementById('info-close-btn')?.addEventListener('click', () => this.closeBuildingInfo());
    document.getElementById('overlay')?.addEventListener('click', () => {
      this.closeBuildingInfo();
      this.closeBattleResult();
    });
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
      const remaining = this.upgradeSystem.getRemainingTime(building);
      html += `<div style="color:#ffa726;margin-top:8px">⏳ 升级中... ${this.upgradeSystem.formatTime(remaining)}</div>`;
      upgradeBtn.textContent = '升级中...';
      upgradeBtn.disabled = true;
    } else {
      const cost = this.upgradeSystem.getUpgradeCost(building);
      if (cost) {
        const ci = cost.costType === 'gold' ? '🪙' : '💧';
        html += `<div style="margin-top:8px;color:#aaa;font-size:12px">下一级：${ci}${cost.cost.toLocaleString()} | ⏱${this.upgradeSystem.formatTime(cost.time)}</div>`;
        const can = this.upgradeSystem.canUpgrade(building);
        upgradeBtn.textContent = `升级 ${ci}${cost.cost.toLocaleString()}`;
        upgradeBtn.disabled = !can.ok;
      } else {
        upgradeBtn.textContent = '已满级';
        upgradeBtn.disabled = true;
      }
    }

    if (statsEl) statsEl.innerHTML = html;
    document.getElementById('building-info')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
  }

  private handleUpgrade(): void {
    if (!this.selectedBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.selectedBuildingUid);
    if (!building) return;
    if (this.upgradeSystem.startUpgrade(building)) {
      this.showBuildingInfo(this.selectedBuildingUid);
      this.updateBuildButtons();
      this.updateArmyInfo(); // 兵营升级后更新容量
      this.saveGame();
    }
  }

  private handleMoveFromInfo(): void {
    if (!this.selectedBuildingUid) return;
    this.closeBuildingInfo();
    this.mode = 'moving';
    this.movingBuildingUid = this.selectedBuildingUid;
    this.updateHint('📦 拖拽到新位置 | 右键或 ESC 取消');
  }

  private closeBuildingInfo(): void {
    this.selectedBuildingUid = null;
    document.getElementById('building-info')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ========== 搜索动画 ==========

  private showSearchAnimation(): void {
    if (this.armySystem.isEmpty()) {
      this.updateHint('❌ 没有军队！先训练士兵');
      return;
    }

    const overlay = document.getElementById('overlay')!;
    const searchBox = document.getElementById('search-box')!;
    overlay.classList.add('show');
    searchBox.classList.add('show');

    const searchText = document.getElementById('search-text')!;
    const searchTrophies = document.getElementById('search-trophies')!;
    searchTrophies.textContent = `🏆 ${this.trophies}`;

    // 模拟搜索
    let dots = 0;
    const searching = setInterval(() => {
      dots = (dots + 1) % 4;
      searchText.textContent = '搜索对手中' + '.'.repeat(dots);
    }, 400);

    setTimeout(() => {
      clearInterval(searching);
      searchText.textContent = '✅ 找到对手！';

      setTimeout(() => {
        searchBox.classList.remove('show');
        overlay.classList.remove('show');
        this.startBattle();
      }, 600);
    }, 1500 + Math.random() * 1000);
  }

  // ========== 战斗系统 ==========

  private setupBattleUI(): void {
    document.getElementById('end-battle-btn')?.addEventListener('click', () => this.endBattleEarly());
    document.getElementById('result-return-btn')?.addEventListener('click', () => this.returnToVillage());
  }

  private generateEnemyBase() {
    // 根据奖杯数调整难度
    const difficulty = Math.min(3, Math.floor(this.trophies / 400) + 1);
    const base = [];
    let uid = 0;

    base.push({ uid: `e${uid++}`, configId: 'town_hall', gridX: 18, gridY: 18, level: Math.min(difficulty, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 10, gridY: 10, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 25, gridY: 10, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'elixir_collector', gridX: 10, gridY: 25, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_storage', gridX: 14, gridY: 14, level: 1, isUpgrading: false });

    // 加农炮
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 15, gridY: 23, level: Math.min(difficulty, 3), isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 23, gridY: 15, level: Math.min(difficulty, 3), isUpgrading: false });

    // 高奖杯加弓箭塔
    if (difficulty >= 2) {
      base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 20, gridY: 12, level: Math.min(difficulty - 1, 3), isUpgrading: false });
    }
    if (difficulty >= 3) {
      base.push({ uid: `e${uid++}`, configId: 'archer_tower', gridX: 12, gridY: 20, level: 1, isUpgrading: false });
    }

    return base;
  }

  private startBattle(): void {
    this.scene = 'battle';

    // 隐藏村庄 UI
    document.getElementById('build-panel')!.style.display = 'none';
    document.getElementById('train-panel')!.classList.remove('show');
    document.getElementById('resource-panel')!.style.display = 'none';
    document.getElementById('hint-text')!.style.display = 'none';

    // 显示战斗 UI
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

    // 初始化特效系统
    this.battleFx = new BattleFx(this.battleRenderer.getWorldContainer());

    this.setupDeployPanel();

    // 战斗循环（含特效）
    let lastTime = performance.now();
    let lastUnitHp = new Map<string, number>();
    let lastBldHp = new Map<string, number>();

    // 记录初始 HP
    for (const u of this.battleEngine.units) lastUnitHp.set(u.uid, u.hp);
    for (const b of this.battleEngine.buildings) lastBldHp.set(b.uid, b.hp);

    const battleLoop = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;
      const dt = deltaMs / 1000;

      const result = this.battleEngine.tick(deltaMs);
      this.battleRenderer.update(this.battleEngine);

      // 特效：检查 HP 变化
      if (this.battleFx) {
        for (const u of this.battleEngine.units) {
          const prev = lastUnitHp.get(u.uid) ?? u.maxHp;
          if (u.hp < prev) {
            const dmg = prev - u.hp;
            this.battleFx.showDamage(u.x, u.y, Math.round(dmg));
            this.battleFx.showAttackFlash(u.x, u.y, 0xff4444);
          }
          lastUnitHp.set(u.uid, u.hp);
        }

        for (const b of this.battleEngine.buildings) {
          const prev = lastBldHp.get(b.uid) ?? b.maxHp;
          const cx = (b.gridX + b.size / 2) * 32;
          const cy = (b.gridY + b.size / 2) * 32;
          if (b.hp < prev) {
            const dmg = prev - b.hp;
            this.battleFx.showDamage(cx, cy, Math.round(dmg));
            this.battleFx.showAttackFlash(cx, cy);
          }
          if (b.destroyed && prev > 0) {
            this.battleFx.showExplosion(cx, cy);
          }
          lastBldHp.set(b.uid, b.hp);
        }

        this.battleFx.update(dt);
      }

      this.updateBattleHUD();

      if (result) {
        this.showBattleResult(result);
        return;
      }
      this.battleFrameId = requestAnimationFrame(battleLoop);
    };
    this.battleFrameId = requestAnimationFrame(battleLoop);
  }

  private setupDeployPanel(): void {
    const panel = document.getElementById('deploy-panel')!;
    panel.innerHTML = '';

    const fightBtn = document.createElement('button');
    fightBtn.className = 'deploy-btn';
    fightBtn.style.borderColor = '#44ff44';
    fightBtn.innerHTML = `<span class="icon">⚡</span><span class="label">全力进攻</span>`;
    fightBtn.addEventListener('click', () => this.battleEngine.startFighting());
    panel.appendChild(fightBtn);

    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#cc3333;flex-shrink:0;';
    panel.appendChild(sep);

    for (const slot of this.battleEngine.deployableArmy) {
      const config = this.configLoader.getTroop(slot.troopId);
      if (!config) continue;
      const btn = document.createElement('button');
      btn.className = 'deploy-btn';
      btn.id = `deploy-${slot.troopId}`;
      btn.innerHTML = `
        <span class="icon">${config.icon}</span>
        <span class="label">${config.name}</span>
        <span class="count">x${slot.count}</span>
      `;
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
      const countEl = btn.querySelector('.count');
      if (countEl) countEl.textContent = `x${slot.count}`;
      if (slot.count <= 0) btn.style.opacity = '0.3';
    }
  }

  private handleBattleDeploy(e: PointerEvent): void {
    if (!this.deployingTroopId) return;
    if (this.battleEngine.phase === 'ended') return;

    const bw = this.battleRenderer.getWorldContainer();
    const rect = this.app.canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - bw.x) / bw.scale.x;
    const worldY = (e.clientY - rect.top - bw.y) / bw.scale.y;

    const unit = this.battleEngine.deployUnit(this.deployingTroopId, worldX, worldY);
    if (unit) {
      // 部署烟雾特效
      this.battleFx?.showDeploySmoke(worldX, worldY);
      this.refreshDeployPanel();
    }
  }

  private updateBattleHUD(): void {
    const timer = document.getElementById('battle-timer');
    if (timer) {
      const s = Math.ceil(this.battleEngine.battleTimer);
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    const pct = document.getElementById('battle-percent');
    if (pct) pct.textContent = `${this.battleEngine.getPercentDestroyed()}%`;

    const stars = this.battleEngine.getCurrentStars();
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById(`star${i}`);
      if (el) el.classList.toggle('earned', i <= stars);
    }
  }

  private endBattleEarly(): void {
    this.battleEngine.startFighting();
    this.battleEngine.battleTimer = 0;
  }

  private showBattleResult(result: BattleResult): void {
    if (this.battleFrameId !== null) {
      cancelAnimationFrame(this.battleFrameId);
      this.battleFrameId = null;
    }

    // 奖杯计算
    let trophyChange = 0;
    if (result.stars >= 3) trophyChange = 30;
    else if (result.stars >= 2) trophyChange = 20;
    else if (result.stars >= 1) trophyChange = 10;
    else trophyChange = -10;

    this.trophies = Math.max(0, this.trophies + trophyChange);
    const league = getLeague(this.trophies);

    const titleEl = document.getElementById('result-title');
    const starsEl = document.getElementById('result-stars');
    const statsEl = document.getElementById('result-stats');

    if (titleEl) titleEl.textContent = result.stars >= 2 ? '🎉 胜利！' : result.stars >= 1 ? '⚔️ 部分胜利' : '💀 失败';
    if (starsEl) {
      let s = '';
      for (let i = 0; i < 3; i++) s += i < result.stars ? '⭐' : '☆';
      starsEl.textContent = s;
    }

    const sign = trophyChange >= 0 ? '+' : '';
    if (statsEl) {
      statsEl.innerHTML = `
        <div>摧毁率：${result.percentDestroyed}%</div>
        <div>掠夺金币：🪙 ${result.goldLooted.toLocaleString()}</div>
        <div>掠夺圣水：💧 ${result.elixirLooted.toLocaleString()}</div>
        <div style="margin-top:8px;font-weight:bold">🏆 ${sign}${trophyChange} 奖杯 → ${this.trophies}</div>
        <div>${league.emoji} ${league.name}联赛</div>
      `;
    }

    document.getElementById('battle-result')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');

    this.resourceManager.earn(result.goldLooted, 'gold');
    this.resourceManager.earn(result.elixirLooted, 'elixir');
  }

  private returnToVillage(): void {
    this.scene = 'village';
    this.closeBattleResult();

    this.app.stage.removeChild(this.battleRenderer.getWorldContainer());
    this.battleRenderer.clearAll();
    this.battleFx?.clearAll();
    this.battleFx = null;
    this.armySystem.clearArmy();

    this.worldContainer.visible = true;
    document.getElementById('build-panel')!.style.display = 'flex';
    document.getElementById('resource-panel')!.style.display = 'flex';
    document.getElementById('hint-text')!.style.display = 'block';
    document.getElementById('battle-hud')?.classList.remove('show');
    document.getElementById('deploy-panel')?.classList.remove('show');

    this.deployingTroopId = null;
    this.updateResourceUI();
    this.updateArmyInfo();
    this.updateTrophyDisplay();
    this.saveGame();
  }

  private closeBattleResult(): void {
    document.getElementById('battle-result')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ========== 事件 ==========

  private setupEventListeners(): void {
    this.eventBus.on('resource:changed', () => {
      this.updateResourceUI();
      this.updateBuildButtons();
    });
    this.eventBus.on('building:upgraded', ({ building }) => {
      this.buildingRenderer.updateBuildingLevel(building);
      this.updateArmyInfo(); // 兵营升级后更新容量
      this.saveGame();
    });
    window.addEventListener('resize', () => this.camera.handleResize());
  }

  private updateResourceUI(): void {
    const res = this.resourceManager.getResources();
    const caps = this.resourceManager.getStorageCaps();
    const g = document.getElementById('gold-value');
    const e = document.getElementById('elixir-value');
    const gem = document.getElementById('gem-value');
    const gc = document.getElementById('gold-cap');
    const ec = document.getElementById('elixir-cap');
    if (g) g.textContent = res.gold.toLocaleString();
    if (e) e.textContent = res.elixir.toLocaleString();
    if (gem) gem.textContent = res.gems.toLocaleString();
    if (gc) gc.textContent = `/ ${caps.goldCap.toLocaleString()}`;
    if (ec) ec.textContent = `/ ${caps.elixirCap.toLocaleString()}`;
    this.updateTrophyDisplay();
  }

  private updateTrophyDisplay(): void {
    const el = document.getElementById('trophy-display');
    if (el) {
      const league = getLeague(this.trophies);
      el.textContent = `${league.emoji} ${this.trophies}`;
    }
  }

  private updateHint(text: string): void {
    const hintEl = document.getElementById('hint-text');
    if (hintEl) hintEl.textContent = text;
  }
}
