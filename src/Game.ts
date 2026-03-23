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
import type { BuildingConfig, BuildingInstance, SaveData, BattleResult } from './types/index.js';

/** 游戏场景 */
type GameScene = 'village' | 'battle';
/** 村庄交互模式 */
type InteractionMode = 'idle' | 'placing' | 'moving';

export class Game {
  // PixiJS
  private app!: Application;
  private worldContainer!: Container;

  // 核心系统
  private eventBus = new EventBus();
  private configLoader = new ConfigLoader();
  private gameClock = new GameClock(this.eventBus);
  private dataStore = new DataStore();

  // 游戏逻辑
  private gridMap = new GridMap();
  private buildingSystem = new BuildingSystem(this.eventBus, this.configLoader, this.gridMap);
  private resourceManager = new ResourceManager(this.eventBus, this.configLoader, this.buildingSystem);
  private upgradeSystem = new UpgradeSystem(this.eventBus, this.configLoader, this.buildingSystem, this.resourceManager);
  private armySystem = new ArmySystem(this.configLoader, this.resourceManager);
  private battleEngine = new BattleEngine(this.eventBus, this.configLoader);

  // 渲染
  private mapRenderer = new MapRenderer();
  private buildingRenderer!: BuildingRenderer;
  private camera!: CameraController;
  private battleRenderer!: BattleRenderer;

  // 场景状态
  private scene: GameScene = 'village';
  private mode: InteractionMode = 'idle';
  private placingConfig: BuildingConfig | null = null;
  private movingBuildingUid: string | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private readonly CLICK_THRESHOLD = 5;

  // 自动保存
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000;

  // 弹窗
  private selectedBuildingUid: string | null = null;

  // 训练面板状态
  private showingTrainPanel = false;

  // 战斗部署选中的兵种
  private deployingTroopId: string | null = null;

  // 战斗循环帧 ID
  private battleFrameId: number | null = null;

  /** 初始化游戏 */
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

    // 渲染层
    this.worldContainer = this.mapRenderer.getWorldContainer();
    this.app.stage.addChild(this.worldContainer);

    this.buildingRenderer = new BuildingRenderer(
      this.mapRenderer.buildingLayer,
      this.mapRenderer.overlayLayer,
      this.configLoader,
    );

    this.camera = new CameraController(this.worldContainer, this.app.canvas);
    this.mapRenderer.renderGround(this.gridMap);

    // 战斗渲染器
    this.battleRenderer = new BattleRenderer(this.app, this.configLoader);

    // 数据
    await this.dataStore.init();
    await this.loadGame();

    // UI
    this.setupBuildPanel();
    this.updateResourceUI();
    this.updateArmyInfo();

    // 交互
    this.setupInteraction();
    this.setupEventListeners();
    this.setupBuildingInfoPanel();
    this.setupBattleUI();

    // 时钟
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
    attackBtn.addEventListener('click', () => this.startBattle());
    panel.appendChild(attackBtn);

    // 训练按钮
    const trainBtn = document.createElement('button');
    trainBtn.className = 'action-btn train-tab';
    trainBtn.id = 'train-tab-btn';
    trainBtn.innerHTML = `<span class="icon">🎖️</span><span class="label">训练</span>`;
    trainBtn.addEventListener('click', () => this.toggleTrainPanel());
    panel.appendChild(trainBtn);

    // 分隔线
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#444;flex-shrink:0;';
    panel.appendChild(sep);

    // 建筑按钮
    const buildings = this.configLoader.getAllBuildings();
    for (const config of buildings) {
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

  // ========== 训练面板 ==========

  private setupTrainPanel(): void {
    const panel = document.getElementById('train-panel')!;
    panel.innerHTML = '';

    // 返回按钮
    const backBtn = document.createElement('button');
    backBtn.className = 'action-btn';
    backBtn.innerHTML = `<span class="icon">↩️</span><span class="label">返回</span>`;
    backBtn.addEventListener('click', () => this.toggleTrainPanel());
    panel.appendChild(backBtn);

    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:50px;background:#4488cc;flex-shrink:0;';
    panel.appendChild(sep);

    // 兵种按钮
    for (const troop of this.configLoader.getAllTroops()) {
      const level1 = troop.levels[0];
      const btn = document.createElement('button');
      btn.className = 'train-btn';
      btn.id = `train-${troop.id}`;
      btn.innerHTML = `
        <span class="icon">${troop.icon}</span>
        <span class="label">${troop.name}</span>
        <span class="cost elixir">💧${level1.cost}</span>
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
    const success = this.armySystem.trainTroop(troopId);
    if (success) {
      this.updateArmyInfo();
      this.updateTrainButtons();
      this.updateHint(`✅ 训练了一个${this.configLoader.getTroop(troopId)?.name ?? '单位'}`);
    } else {
      this.updateHint('❌ 无法训练：容量不足或资源不足');
    }
  }

  private updateTrainButtons(): void {
    for (const troop of this.configLoader.getAllTroops()) {
      const btn = document.getElementById(`train-${troop.id}`);
      if (!btn) continue;
      const level1 = troop.levels[0];
      const canAfford = this.resourceManager.canAfford(level1.cost, level1.costType);
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

  // ========== 交互事件 ==========

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
        this.handlePlacement(e);
        return;
      }
      if (this.mode === 'moving' && this.movingBuildingUid) {
        this.confirmMove(e);
        return;
      }
      if (this.mode === 'idle' && isClick) {
        this.handleBuildingClick(e);
      }
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

  // ========== 村庄交互方法 ==========

  private showPlacementPreview(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;
    const canPlace = this.gridMap.canPlace(gx, gy, this.placingConfig.size);
    this.buildingRenderer.showPreview(gx, gy, this.placingConfig, canPlace);
  }

  private handlePlacement(e: PointerEvent): void {
    if (!this.placingConfig) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);
    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    const level1 = this.placingConfig.levels[0];
    if (!this.resourceManager.canAfford(level1.cost, level1.costType)) {
      this.updateHint('❌ 资源不足！');
      return;
    }

    const building = this.buildingSystem.placeBuilding(this.placingConfig.id, gx, gy);
    if (building) {
      this.resourceManager.spend(level1.cost, level1.costType);
      this.buildingRenderer.addBuilding(building);
      this.buildingRenderer.clearPreview();
      this.updateHint(`✅ ${this.placingConfig.name} 放置成功`);
      this.updateBuildButtons();
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
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

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
    const levelConfig = config.levels[building.level - 1];

    const iconEl = document.getElementById('info-icon');
    const titleEl = document.getElementById('info-title');
    const levelEl = document.getElementById('info-level');
    const statsEl = document.getElementById('info-stats');
    const upgradeBtn = document.getElementById('info-upgrade-btn') as HTMLButtonElement;

    if (iconEl) iconEl.textContent = config.icon;
    if (titleEl) titleEl.textContent = config.name;
    if (levelEl) levelEl.textContent = `等级 ${building.level} / ${config.levels.length}`;

    let statsHtml = '';
    if (levelConfig) {
      statsHtml += `<div><span class="stat-label">生命值：</span><span class="stat-value">${levelConfig.hp}</span></div>`;
      if (levelConfig.productionRate) statsHtml += `<div><span class="stat-label">产出：</span><span class="stat-value">${levelConfig.productionRate}/时</span></div>`;
      if (levelConfig.storageCapacity) statsHtml += `<div><span class="stat-label">容量：</span><span class="stat-value">${levelConfig.storageCapacity.toLocaleString()}</span></div>`;
      if (levelConfig.damage) statsHtml += `<div><span class="stat-label">伤害：</span><span class="stat-value">${levelConfig.damage}</span></div>`;
      if (levelConfig.range) statsHtml += `<div><span class="stat-label">射程：</span><span class="stat-value">${levelConfig.range}格</span></div>`;
    }

    if (building.isUpgrading) {
      const remaining = this.upgradeSystem.getRemainingTime(building);
      statsHtml += `<div style="color:#ffa726;margin-top:8px">⏳ 升级中... ${this.upgradeSystem.formatTime(remaining)}</div>`;
      upgradeBtn.textContent = '升级中...';
      upgradeBtn.disabled = true;
    } else {
      const cost = this.upgradeSystem.getUpgradeCost(building);
      if (cost) {
        const ci = cost.costType === 'gold' ? '🪙' : '💧';
        statsHtml += `<div style="margin-top:8px;color:#aaa;font-size:12px">下一级：${ci}${cost.cost.toLocaleString()} | ⏱${this.upgradeSystem.formatTime(cost.time)}</div>`;
        const can = this.upgradeSystem.canUpgrade(building);
        upgradeBtn.textContent = `升级 ${ci}${cost.cost.toLocaleString()}`;
        upgradeBtn.disabled = !can.ok;
      } else {
        upgradeBtn.textContent = '已满级';
        upgradeBtn.disabled = true;
      }
    }

    if (statsEl) statsEl.innerHTML = statsHtml;
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
      this.saveGame();
    }
  }

  private handleMoveFromInfo(): void {
    if (!this.selectedBuildingUid) return;
    const building = this.buildingSystem.getBuilding(this.selectedBuildingUid);
    if (!building) return;
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

  // ========== 战斗系统 ==========

  private setupBattleUI(): void {
    document.getElementById('end-battle-btn')?.addEventListener('click', () => this.endBattleEarly());
    document.getElementById('result-return-btn')?.addEventListener('click', () => this.returnToVillage());
  }

  /** 生成 AI 对手基地 */
  private generateEnemyBase(): BuildingInstance[] {
    const base: BuildingInstance[] = [];
    let uid = 0;

    // 大本营在中央
    base.push({ uid: `e${uid++}`, configId: 'town_hall', gridX: 18, gridY: 18, level: 1, isUpgrading: false });

    // 金矿
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 10, gridY: 10, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'gold_mine', gridX: 25, gridY: 10, level: 1, isUpgrading: false });

    // 圣水收集器
    base.push({ uid: `e${uid++}`, configId: 'elixir_collector', gridX: 10, gridY: 25, level: 1, isUpgrading: false });

    // 金库
    base.push({ uid: `e${uid++}`, configId: 'gold_storage', gridX: 14, gridY: 14, level: 1, isUpgrading: false });

    // 加农炮
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 15, gridY: 23, level: 1, isUpgrading: false });
    base.push({ uid: `e${uid++}`, configId: 'cannon', gridX: 23, gridY: 15, level: 1, isUpgrading: false });

    return base;
  }

  /** 开始战斗 */
  private startBattle(): void {
    if (this.armySystem.isEmpty()) {
      this.updateHint('❌ 没有军队！先训练士兵');
      return;
    }

    this.scene = 'battle';

    // 隐藏村庄 UI
    document.getElementById('build-panel')!.style.display = 'none';
    document.getElementById('train-panel')!.classList.remove('show');
    document.getElementById('resource-panel')!.style.display = 'none';
    document.getElementById('hint-text')!.style.display = 'none';

    // 显示战斗 UI
    document.getElementById('battle-hud')?.classList.add('show');
    document.getElementById('deploy-panel')?.classList.add('show');

    // 隐藏村庄渲染
    this.worldContainer.visible = false;

    // 初始化战斗
    const enemyBase = this.generateEnemyBase();
    const army = this.armySystem.getArmy();
    this.battleEngine.initBattle(enemyBase, army, 2000, 2000);

    // 初始化战斗渲染
    this.battleRenderer.initBattlefield(this.battleEngine);
    this.app.stage.addChild(this.battleRenderer.getWorldContainer());

    // 设置部署面板
    this.setupDeployPanel();

    // 启动战斗循环
    let lastTime = performance.now();
    const battleLoop = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;

      // 更新战斗
      const result = this.battleEngine.tick(deltaMs);

      // 更新渲染
      this.battleRenderer.update(this.battleEngine);

      // 更新 HUD
      this.updateBattleHUD();

      if (result) {
        this.showBattleResult(result);
        return;
      }

      this.battleFrameId = requestAnimationFrame(battleLoop);
    };
    this.battleFrameId = requestAnimationFrame(battleLoop);
  }

  /** 设置部署面板 */
  private setupDeployPanel(): void {
    const panel = document.getElementById('deploy-panel')!;
    panel.innerHTML = '';

    // 开战按钮
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

  /** 更新部署面板计数 */
  private refreshDeployPanel(): void {
    for (const slot of this.battleEngine.deployableArmy) {
      const btn = document.getElementById(`deploy-${slot.troopId}`);
      if (!btn) continue;
      const countEl = btn.querySelector('.count');
      if (countEl) countEl.textContent = `x${slot.count}`;
      if (slot.count <= 0) btn.style.opacity = '0.3';
    }
  }

  /** 处理战斗部署点击 */
  private handleBattleDeploy(e: PointerEvent): void {
    if (!this.deployingTroopId) return;
    if (this.battleEngine.phase === 'ended') return;

    const battleWorld = this.battleRenderer.getWorldContainer();
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldX = (screenX - battleWorld.x) / battleWorld.scale.x;
    const worldY = (screenY - battleWorld.y) / battleWorld.scale.y;

    const unit = this.battleEngine.deployUnit(this.deployingTroopId, worldX, worldY);
    if (unit) {
      this.refreshDeployPanel();
    }
  }

  /** 更新战斗 HUD */
  private updateBattleHUD(): void {
    const timer = document.getElementById('battle-timer');
    if (timer) {
      const s = Math.ceil(this.battleEngine.battleTimer);
      const min = Math.floor(s / 60);
      const sec = s % 60;
      timer.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    }

    const pct = document.getElementById('battle-percent');
    if (pct) pct.textContent = `${this.battleEngine.getPercentDestroyed()}%`;

    const stars = this.battleEngine.getCurrentStars();
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById(`star${i}`);
      if (el) el.classList.toggle('earned', i <= stars);
    }
  }

  /** 提前结束战斗 */
  private endBattleEarly(): void {
    this.battleEngine.startFighting();
    // 设置计时器为 0 触发结算
    this.battleEngine.battleTimer = 0;
  }

  /** 显示战斗结算 */
  private showBattleResult(result: BattleResult): void {
    if (this.battleFrameId !== null) {
      cancelAnimationFrame(this.battleFrameId);
      this.battleFrameId = null;
    }

    const titleEl = document.getElementById('result-title');
    const starsEl = document.getElementById('result-stars');
    const statsEl = document.getElementById('result-stats');

    if (titleEl) titleEl.textContent = result.stars >= 2 ? '🎉 胜利！' : result.stars >= 1 ? '⚔️ 部分胜利' : '💀 失败';
    if (starsEl) {
      let starStr = '';
      for (let i = 0; i < 3; i++) starStr += i < result.stars ? '⭐' : '☆';
      starsEl.textContent = starStr;
    }
    if (statsEl) {
      statsEl.innerHTML = `
        <div>摧毁率：${result.percentDestroyed}%</div>
        <div>掠夺金币：🪙 ${result.goldLooted.toLocaleString()}</div>
        <div>掠夺圣水：💧 ${result.elixirLooted.toLocaleString()}</div>
      `;
    }

    document.getElementById('battle-result')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');

    // 获取掠夺的资源
    this.resourceManager.earn(result.goldLooted, 'gold');
    this.resourceManager.earn(result.elixirLooted, 'elixir');
  }

  /** 返回村庄 */
  private returnToVillage(): void {
    this.scene = 'village';
    this.closeBattleResult();

    // 清理战斗
    this.app.stage.removeChild(this.battleRenderer.getWorldContainer());
    this.battleRenderer.clearAll();
    this.armySystem.clearArmy();

    // 恢复村庄 UI
    this.worldContainer.visible = true;
    document.getElementById('build-panel')!.style.display = 'flex';
    document.getElementById('resource-panel')!.style.display = 'flex';
    document.getElementById('hint-text')!.style.display = 'block';
    document.getElementById('battle-hud')?.classList.remove('show');
    document.getElementById('deploy-panel')?.classList.remove('show');

    this.deployingTroopId = null;
    this.updateResourceUI();
    this.updateArmyInfo();
    this.saveGame();
  }

  private closeBattleResult(): void {
    document.getElementById('battle-result')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ========== 事件监听 ==========

  private setupEventListeners(): void {
    this.eventBus.on('resource:changed', () => {
      this.updateResourceUI();
      this.updateBuildButtons();
    });

    this.eventBus.on('building:upgraded', ({ building }) => {
      this.buildingRenderer.updateBuildingLevel(building);
      this.saveGame();
    });

    window.addEventListener('resize', () => this.camera.handleResize());
  }

  /** 更新资源 UI */
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
  }

  private updateHint(text: string): void {
    const hintEl = document.getElementById('hint-text');
    if (hintEl) hintEl.textContent = text;
  }
}
