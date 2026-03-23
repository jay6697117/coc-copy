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
import { MapRenderer } from './rendering/MapRenderer.js';
import { CameraController } from './rendering/CameraController.js';
import { BuildingRenderer } from './rendering/BuildingRenderer.js';
import type { BuildingConfig, SaveData } from './types/index.js';

/** 交互模式 */
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

  // 渲染
  private mapRenderer = new MapRenderer();
  private buildingRenderer!: BuildingRenderer;
  private camera!: CameraController;

  // 交互状态
  private mode: InteractionMode = 'idle';
  private placingConfig: BuildingConfig | null = null;
  private movingBuildingUid: string | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private readonly CLICK_THRESHOLD = 5;

  // 自动保存计时
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000;

  // 建筑信息弹窗当前选中的建筑
  private selectedBuildingUid: string | null = null;

  /** 初始化游戏 */
  async init(): Promise<void> {
    // 1. 初始化 PixiJS
    this.app = new Application();
    await this.app.init({
      resizeTo: document.getElementById('game-container')!,
      backgroundColor: 0x1a1a2e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });
    document.getElementById('game-container')!.appendChild(this.app.canvas);

    // 2. 初始化渲染层
    this.worldContainer = this.mapRenderer.getWorldContainer();
    this.app.stage.addChild(this.worldContainer);

    this.buildingRenderer = new BuildingRenderer(
      this.mapRenderer.buildingLayer,
      this.mapRenderer.overlayLayer,
      this.configLoader,
    );

    // 3. 初始化相机
    this.camera = new CameraController(this.worldContainer, this.app.canvas);

    // 4. 渲染地面
    this.mapRenderer.renderGround(this.gridMap);

    // 5. 初始化数据存储并加载存档
    await this.dataStore.init();
    await this.loadGame();

    // 6. 设置建造 UI
    this.setupBuildPanel();
    this.updateResourceUI();

    // 7. 设置交互事件
    this.setupInteraction();

    // 8. 设置事件监听
    this.setupEventListeners();

    // 9. 启动游戏时钟
    this.gameClock.start();

    // 10. 自动保存 + 资源产出 + 升级检查
    this.eventBus.on('clock:tick', ({ deltaMs }) => {
      // 资源产出
      this.resourceManager.tick(deltaMs);
      // 升级倒计时检查
      this.upgradeSystem.tick();
      // 更新升级中建筑的渲染
      this.updateUpgradingBuildings();
      // 自动保存
      this.autoSaveTimer += deltaMs;
      if (this.autoSaveTimer >= this.AUTO_SAVE_INTERVAL) {
        this.autoSaveTimer = 0;
        this.saveGame();
      }
    });

    // 11. 设置建筑信息弹窗事件
    this.setupBuildingInfoPanel();

    console.log('🎮 COC Clone 初始化完成！');
  }

  /** 加载存档或创建新存档 */
  private async loadGame(): Promise<void> {
    let saveData = await this.dataStore.load();
    if (!saveData) {
      saveData = DataStore.getDefaultSave();
    }

    // 恢复资源
    this.resourceManager.setResources(saveData.resources);

    // 恢复建筑
    this.buildingSystem.loadBuildings(saveData.buildings);

    // 渲染已有建筑
    for (const building of this.buildingSystem.getAllBuildings()) {
      this.buildingRenderer.addBuilding(building);
    }

    // 离线补偿
    const offlineMs = Date.now() - saveData.lastOnlineTime;
    if (offlineMs > 5000) {
      this.resourceManager.compensateOffline(offlineMs);
      this.upgradeSystem.compensateOffline();
    }
  }

  /** 保存游戏 */
  private async saveGame(): Promise<void> {
    const saveData: SaveData = {
      townHallLevel: 1,
      resources: this.resourceManager.exportResources(),
      buildings: this.buildingSystem.exportBuildings(),
      lastOnlineTime: Date.now(),
    };
    await this.dataStore.save(saveData);
  }

  /** 设置建造面板 UI（含费用显示） */
  private setupBuildPanel(): void {
    const panel = document.getElementById('build-panel')!;
    panel.innerHTML = '';

    const buildings = this.configLoader.getAllBuildings();
    for (const config of buildings) {
      const level1 = config.levels[0];
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.id = `build-${config.id}`;

      // 费用显示
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

    // 更新按钮可用状态
    this.updateBuildButtons();
  }

  /** 更新建造按钮的可用状态 */
  private updateBuildButtons(): void {
    const buildings = this.configLoader.getAllBuildings();
    for (const config of buildings) {
      const btn = document.getElementById(`build-${config.id}`);
      if (!btn) continue;

      const level1 = config.levels[0];
      const canAfford = this.resourceManager.canAfford(level1.cost, level1.costType);
      btn.classList.toggle('disabled', !canAfford);
    }
  }

  /** 进入放置模式 */
  private startPlacing(config: BuildingConfig): void {
    // 检查资源
    const level1 = config.levels[0];
    if (!this.resourceManager.canAfford(level1.cost, level1.costType)) {
      this.updateHint(`❌ ${level1.costType === 'gold' ? '金币' : '圣水'}不足！需要 ${level1.cost.toLocaleString()}`);
      return;
    }

    this.mode = 'placing';
    this.placingConfig = config;

    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`build-${config.id}`)?.classList.add('active');

    this.updateHint(`点击地图放置 ${config.name}（${config.size}x${config.size}）| 右键或 ESC 取消`);
  }

  /** 取消放置模式 */
  private cancelPlacing(): void {
    this.mode = 'idle';
    this.placingConfig = null;
    this.movingBuildingUid = null;
    this.buildingRenderer.clearPreview();
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    this.updateHint('拖拽平移 | 滚轮缩放 | 点击下方建筑开始建造');
  }

  /** 设置地图交互事件 */
  private setupInteraction(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.mode === 'placing' && this.placingConfig) {
        this.showPlacementPreview(e);
      }
      if (this.mode === 'moving' && this.movingBuildingUid) {
        this.dragBuilding(e);
      }
    });

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      const dx = e.clientX - this.pointerDownX;
      const dy = e.clientY - this.pointerDownY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isClick = distance < this.CLICK_THRESHOLD;

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
      if (this.mode !== 'idle') {
        this.cancelPlacing();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.mode !== 'idle') {
          this.cancelPlacing();
        }
        this.closeBuildingInfo();
      }
    });
  }

  /** 在鼠标位置显示放置预览 */
  private showPlacementPreview(e: PointerEvent): void {
    if (!this.placingConfig) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    const canPlace = this.gridMap.canPlace(gx, gy, this.placingConfig.size);
    this.buildingRenderer.showPreview(gx, gy, this.placingConfig, canPlace);
  }

  /** 处理建筑放置 */
  private handlePlacement(e: PointerEvent): void {
    if (!this.placingConfig) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const offset = Math.floor(this.placingConfig.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    // 再次检查资源
    const level1 = this.placingConfig.levels[0];
    if (!this.resourceManager.canAfford(level1.cost, level1.costType)) {
      this.updateHint(`❌ 资源不足！`);
      return;
    }

    // 尝试放置
    const building = this.buildingSystem.placeBuilding(this.placingConfig.id, gx, gy);
    if (building) {
      // 扣费
      this.resourceManager.spend(level1.cost, level1.costType);

      this.buildingRenderer.addBuilding(building);
      this.buildingRenderer.clearPreview();
      this.updateHint(`✅ ${this.placingConfig.name} 放置成功 | 继续点击放置更多 | 右键或 ESC 取消`);
      this.updateBuildButtons();
      this.saveGame();
    }
  }

  /** 点击已有建筑 → 打开信息弹窗 */
  private handleBuildingClick(e: PointerEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const cell = this.gridMap.getCell(grid.gridX, grid.gridY);
    if (cell?.occupied && cell.buildingUid) {
      this.showBuildingInfo(cell.buildingUid);
    }
  }

  /** 拖拽建筑 */
  private dragBuilding(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;

    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) return;

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const offset = Math.floor(config.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    const canPlace = this.gridMap.canPlace(gx, gy, config.size, this.movingBuildingUid);
    this.buildingRenderer.showPreview(gx, gy, config, canPlace);
  }

  /** 确认建筑移动 */
  private confirmMove(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;

    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) { this.cancelPlacing(); return; }

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) { this.cancelPlacing(); return; }

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const offset = Math.floor(config.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    const moved = this.buildingSystem.moveBuilding(this.movingBuildingUid, gx, gy);
    if (moved) {
      this.buildingRenderer.updateBuildingPosition(this.movingBuildingUid, gx, gy);
      this.updateHint(`✅ 移动成功`);
      this.saveGame();
    }

    this.buildingRenderer.clearPreview();
    this.mode = 'idle';
    this.movingBuildingUid = null;

    setTimeout(() => {
      if (this.mode === 'idle') {
        this.updateHint('拖拽平移 | 滚轮缩放 | 点击下方建筑开始建造');
      }
    }, 1500);
  }

  // ========== 建筑信息弹窗 ==========

  /** 设置弹窗按钮事件 */
  private setupBuildingInfoPanel(): void {
    document.getElementById('info-upgrade-btn')?.addEventListener('click', () => {
      this.handleUpgrade();
    });

    document.getElementById('info-move-btn')?.addEventListener('click', () => {
      this.handleMoveFromInfo();
    });

    document.getElementById('info-close-btn')?.addEventListener('click', () => {
      this.closeBuildingInfo();
    });

    document.getElementById('overlay')?.addEventListener('click', () => {
      this.closeBuildingInfo();
    });
  }

  /** 显示建筑信息弹窗 */
  private showBuildingInfo(uid: string): void {
    const building = this.buildingSystem.getBuilding(uid);
    if (!building) return;

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) return;

    this.selectedBuildingUid = uid;
    const levelConfig = config.levels[building.level - 1];

    // 填充信息
    const iconEl = document.getElementById('info-icon');
    const titleEl = document.getElementById('info-title');
    const levelEl = document.getElementById('info-level');
    const statsEl = document.getElementById('info-stats');
    const upgradeBtn = document.getElementById('info-upgrade-btn') as HTMLButtonElement;

    if (iconEl) iconEl.textContent = config.icon;
    if (titleEl) titleEl.textContent = config.name;
    if (levelEl) levelEl.textContent = `等级 ${building.level} / ${config.levels.length}`;

    // 构建属性列表
    let statsHtml = '';
    if (levelConfig) {
      statsHtml += `<div><span class="stat-label">生命值：</span><span class="stat-value">${levelConfig.hp}</span></div>`;
      if (levelConfig.productionRate) {
        statsHtml += `<div><span class="stat-label">产出速率：</span><span class="stat-value">${levelConfig.productionRate}/时</span></div>`;
      }
      if (levelConfig.storageCapacity) {
        statsHtml += `<div><span class="stat-label">存储容量：</span><span class="stat-value">${levelConfig.storageCapacity.toLocaleString()}</span></div>`;
      }
      if (levelConfig.damage) {
        statsHtml += `<div><span class="stat-label">伤害：</span><span class="stat-value">${levelConfig.damage}</span></div>`;
      }
      if (levelConfig.range) {
        statsHtml += `<div><span class="stat-label">射程：</span><span class="stat-value">${levelConfig.range} 格</span></div>`;
      }
    }

    // 升级信息
    if (building.isUpgrading) {
      const remaining = this.upgradeSystem.getRemainingTime(building);
      statsHtml += `<div style="color: #ffa726; margin-top: 8px;">⏳ 升级中... ${this.upgradeSystem.formatTime(remaining)}</div>`;
      upgradeBtn.textContent = '升级中...';
      upgradeBtn.disabled = true;
    } else {
      const upgradeCost = this.upgradeSystem.getUpgradeCost(building);
      if (upgradeCost) {
        const costIcon = upgradeCost.costType === 'gold' ? '🪙' : '💧';
        const timeStr = this.upgradeSystem.formatTime(upgradeCost.time);
        statsHtml += `<div style="margin-top: 8px; color: #aaa; font-size: 12px;">` +
          `下一级：${costIcon}${upgradeCost.cost.toLocaleString()} | ⏱${timeStr}` +
          `</div>`;

        const canUpgrade = this.upgradeSystem.canUpgrade(building);
        upgradeBtn.textContent = `升级 ${costIcon}${upgradeCost.cost.toLocaleString()}`;
        upgradeBtn.disabled = !canUpgrade.ok;
      } else {
        upgradeBtn.textContent = '已满级';
        upgradeBtn.disabled = true;
      }
    }

    if (statsEl) statsEl.innerHTML = statsHtml;

    // 显示弹窗
    document.getElementById('building-info')?.classList.add('show');
    document.getElementById('overlay')?.classList.add('show');
  }

  /** 处理升级按钮 */
  private handleUpgrade(): void {
    if (!this.selectedBuildingUid) return;

    const building = this.buildingSystem.getBuilding(this.selectedBuildingUid);
    if (!building) return;

    const success = this.upgradeSystem.startUpgrade(building);
    if (success) {
      this.updateHint('⬆️ 升级已开始！');
      // 刷新弹窗内容
      this.showBuildingInfo(this.selectedBuildingUid);
      this.updateBuildButtons();
      this.saveGame();
    }
  }

  /** 从信息弹窗进入移动模式 */
  private handleMoveFromInfo(): void {
    if (!this.selectedBuildingUid) return;

    const building = this.buildingSystem.getBuilding(this.selectedBuildingUid);
    if (!building) return;

    const config = this.configLoader.getBuilding(building.configId);

    this.closeBuildingInfo();
    this.mode = 'moving';
    this.movingBuildingUid = this.selectedBuildingUid;
    this.updateHint(`📦 正在移动 ${config?.name ?? '建筑'} | 拖拽到新位置 | 右键或 ESC 取消`);
  }

  /** 关闭建筑信息弹窗 */
  private closeBuildingInfo(): void {
    this.selectedBuildingUid = null;
    document.getElementById('building-info')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
  }

  // ========== 渲染更新 ==========

  /** 更新升级中建筑的渲染（进度条等） */
  private updateUpgradingBuildings(): void {
    for (const building of this.buildingSystem.getAllBuildings()) {
      if (building.isUpgrading) {
        const remaining = this.upgradeSystem.getRemainingTime(building);
        if (remaining <= 0) {
          // 升级刚完成，更新渲染
          this.buildingRenderer.updateBuildingLevel(building);
        }
      }
    }
  }

  // ========== 事件监听 ==========

  /** 设置事件监听 */
  private setupEventListeners(): void {
    // 资源变化时更新 UI
    this.eventBus.on('resource:changed', () => {
      this.updateResourceUI();
      this.updateBuildButtons();
    });

    // 建筑升级完成
    this.eventBus.on('building:upgraded', ({ building }) => {
      this.buildingRenderer.updateBuildingLevel(building);
      this.updateHint(`🎉 ${this.configLoader.getBuilding(building.configId)?.name ?? '建筑'} 升级到 ${building.level} 级！`);
      this.saveGame();
    });

    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.camera.handleResize();
    });
  }

  /** 更新资源 UI（含上限显示） */
  private updateResourceUI(): void {
    const res = this.resourceManager.getResources();
    const caps = this.resourceManager.getStorageCaps();

    const goldEl = document.getElementById('gold-value');
    const elixirEl = document.getElementById('elixir-value');
    const gemEl = document.getElementById('gem-value');
    const goldCapEl = document.getElementById('gold-cap');
    const elixirCapEl = document.getElementById('elixir-cap');

    if (goldEl) goldEl.textContent = res.gold.toLocaleString();
    if (elixirEl) elixirEl.textContent = res.elixir.toLocaleString();
    if (gemEl) gemEl.textContent = res.gems.toLocaleString();
    if (goldCapEl) goldCapEl.textContent = `/ ${caps.goldCap.toLocaleString()}`;
    if (elixirCapEl) elixirCapEl.textContent = `/ ${caps.elixirCap.toLocaleString()}`;
  }

  /** 更新提示文字 */
  private updateHint(text: string): void {
    const hintEl = document.getElementById('hint-text');
    if (hintEl) hintEl.textContent = text;
  }
}
