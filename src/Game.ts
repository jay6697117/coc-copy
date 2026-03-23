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
import { MapRenderer } from './rendering/MapRenderer.js';
import { CameraController } from './rendering/CameraController.js';
import { BuildingRenderer } from './rendering/BuildingRenderer.js';
import type { BuildingConfig, PlayerResources, SaveData } from './types/index.js';

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

  // 渲染
  private mapRenderer = new MapRenderer();
  private buildingRenderer!: BuildingRenderer;
  private camera!: CameraController;

  // 玩家数据
  private resources: PlayerResources = { gold: 5000, elixir: 5000, gems: 100 };

  // 交互状态
  private mode: InteractionMode = 'idle';
  private placingConfig: BuildingConfig | null = null;
  private movingBuildingUid: string | null = null;
  // 用距离阈值区分点击和拖拽
  private pointerDownX = 0;
  private pointerDownY = 0;
  private readonly CLICK_THRESHOLD = 5; // 像素

  // 自动保存计时
  private autoSaveTimer = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000; // 30 秒自动保存

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

    // 6. 设置 UI
    this.setupBuildPanel();
    this.updateResourceUI();

    // 7. 设置交互事件
    this.setupInteraction();

    // 8. 设置事件监听
    this.setupEventListeners();

    // 9. 启动游戏时钟
    this.gameClock.start();

    // 10. 设置自动保存
    this.eventBus.on('clock:tick', ({ deltaMs }) => {
      this.autoSaveTimer += deltaMs;
      if (this.autoSaveTimer >= this.AUTO_SAVE_INTERVAL) {
        this.autoSaveTimer = 0;
        this.saveGame();
      }
    });

    console.log('🎮 COC Clone 初始化完成！');
  }

  /** 加载存档或创建新存档 */
  private async loadGame(): Promise<void> {
    let saveData = await this.dataStore.load();
    if (!saveData) {
      saveData = DataStore.getDefaultSave();
    }

    // 恢复资源
    this.resources = { ...saveData.resources };

    // 恢复建筑
    this.buildingSystem.loadBuildings(saveData.buildings);

    // 渲染已有建筑
    for (const building of this.buildingSystem.getAllBuildings()) {
      this.buildingRenderer.addBuilding(building);
    }
  }

  /** 保存游戏 */
  private async saveGame(): Promise<void> {
    const saveData: SaveData = {
      townHallLevel: 1,
      resources: { ...this.resources },
      buildings: this.buildingSystem.exportBuildings(),
      lastOnlineTime: Date.now(),
    };
    await this.dataStore.save(saveData);
    this.eventBus.emit('save:saved', undefined);
  }

  /** 设置建造面板 UI */
  private setupBuildPanel(): void {
    const panel = document.getElementById('build-panel')!;
    panel.innerHTML = '';

    const buildings = this.configLoader.getAllBuildings();
    for (const config of buildings) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.id = `build-${config.id}`;
      btn.innerHTML = `<span class="icon">${config.icon}</span><span class="label">${config.name}</span>`;
      btn.addEventListener('click', () => this.startPlacing(config));
      panel.appendChild(btn);
    }
  }

  /** 进入放置模式 */
  private startPlacing(config: BuildingConfig): void {
    this.mode = 'placing';
    this.placingConfig = config;

    // 高亮选中的按钮
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`build-${config.id}`)?.classList.add('active');

    this.updateHint(`点击地图放置 ${config.name}（${config.size}x${config.size}）| 右键或 ESC 取消`);
  }

  /** 取消放置模式 */
  private cancelPlacing(): void {
    this.mode = 'idle';
    this.placingConfig = null;
    this.buildingRenderer.clearPreview();
    document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
    this.updateHint('拖拽平移 | 滚轮缩放 | 点击下方建筑开始建造');
  }

  /** 设置地图交互事件 */
  private setupInteraction(): void {
    const canvas = this.app.canvas;

    // 记录按下位置（区分点击和拖拽）
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {

      // 放置模式下显示预览
      if (this.mode === 'placing' && this.placingConfig) {
        this.showPlacementPreview(e);
      }
      // 移动模式下拖拽建筑
      if (this.mode === 'moving' && this.movingBuildingUid) {
        this.dragBuilding(e);
      }
    });

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      // 计算拖拽距离来区分点击和拖拽
      const dx = e.clientX - this.pointerDownX;
      const dy = e.clientY - this.pointerDownY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isClick = distance < this.CLICK_THRESHOLD;

      // 放置模式：点击放置建筑
      if (this.mode === 'placing' && this.placingConfig && isClick) {
        this.handlePlacement(e);
        return;
      }

      // 移动模式：松手确认移动
      if (this.mode === 'moving' && this.movingBuildingUid) {
        this.confirmMove(e);
        return;
      }

      // 空闲模式：点击建筑进入移动模式
      if (this.mode === 'idle' && isClick) {
        this.handleBuildingClick(e);
      }
    });

    // ESC 和右键取消
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.mode !== 'idle') {
        this.cancelPlacing();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.mode !== 'idle') {
        this.cancelPlacing();
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

    // 居中对齐到建筑大小
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

    // 尝试放置
    const building = this.buildingSystem.placeBuilding(this.placingConfig.id, gx, gy);
    if (building) {
      this.buildingRenderer.addBuilding(building);
      this.buildingRenderer.clearPreview();
      // 放置完继续保持放置模式（方便连续放置，如城墙）
      this.updateHint(`✅ ${this.placingConfig.name} 放置成功 | 继续点击放置更多 | 右键或 ESC 取消`);
      // 自动保存
      this.saveGame();
    }
  }

  /** 点击已有建筑 → 进入移动模式 */
  private handleBuildingClick(e: PointerEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    // 检查点击位置是否有建筑
    const cell = this.gridMap.getCell(grid.gridX, grid.gridY);
    if (cell?.occupied && cell.buildingUid) {
      this.mode = 'moving';
      this.movingBuildingUid = cell.buildingUid;

      const building = this.buildingSystem.getBuilding(cell.buildingUid);
      const config = building ? this.configLoader.getBuilding(building.configId) : null;
      this.updateHint(`📦 正在移动 ${config?.name ?? '建筑'} | 拖拽到新位置 | 右键或 ESC 取消`);
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

    // 显示预览
    const canPlace = this.gridMap.canPlace(gx, gy, config.size, this.movingBuildingUid);
    this.buildingRenderer.showPreview(gx, gy, config, canPlace);
  }

  /** 确认建筑移动 */
  private confirmMove(e: PointerEvent): void {
    if (!this.movingBuildingUid) return;

    const building = this.buildingSystem.getBuilding(this.movingBuildingUid);
    if (!building) {
      this.cancelPlacing();
      return;
    }

    const config = this.configLoader.getBuilding(building.configId);
    if (!config) {
      this.cancelPlacing();
      return;
    }

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);
    const grid = this.gridMap.pixelToGrid(world.x, world.y);

    const offset = Math.floor(config.size / 2);
    const gx = grid.gridX - offset;
    const gy = grid.gridY - offset;

    // 尝试移动
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

  /** 设置事件监听 */
  private setupEventListeners(): void {
    // 资源变化时更新 UI
    this.eventBus.on('resource:changed', ({ resources }) => {
      this.resources = resources;
      this.updateResourceUI();
    });

    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.camera.handleResize();
    });
  }

  /** 更新资源 UI */
  private updateResourceUI(): void {
    const goldEl = document.getElementById('gold-value');
    const elixirEl = document.getElementById('elixir-value');
    const gemEl = document.getElementById('gem-value');
    if (goldEl) goldEl.textContent = this.resources.gold.toLocaleString();
    if (elixirEl) elixirEl.textContent = this.resources.elixir.toLocaleString();
    if (gemEl) gemEl.textContent = this.resources.gems.toLocaleString();
  }

  /** 更新提示文字 */
  private updateHint(text: string): void {
    const hintEl = document.getElementById('hint-text');
    if (hintEl) hintEl.textContent = text;
  }
}
