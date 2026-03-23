// ============================================================
// 相机控制器 — 地图平移和缩放
// ============================================================

import { Container } from 'pixi.js';

export class CameraController {
  /** 游戏世界容器（通过移动它来实现相机效果） */
  private world: Container;
  /** 画布元素 */
  private canvas: HTMLCanvasElement;

  // 相机状态
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private scale = 1.0;
  private readonly minScale = 0.4;
  private readonly maxScale = 3.0;

  constructor(world: Container, canvas: HTMLCanvasElement) {
    this.world = world;
    this.canvas = canvas;
    this.setupEvents();
    // 初始居中：将地图中心移到画面中心
    this.centerOnGrid(20, 20);
  }

  /** 将视角居中到某个网格坐标 */
  centerOnGrid(gridX: number, gridY: number): void {
    const cellPx = 20;
    const worldX = gridX * cellPx;
    const worldY = gridY * cellPx;
    const rect = this.canvas.getBoundingClientRect();
    this.world.x = rect.width / 2 - worldX * this.scale;
    this.world.y = rect.height / 2 - worldY * this.scale;
  }

  /** 屏幕坐标 → 世界坐标 */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.world.x) / this.scale,
      y: (screenY - this.world.y) / this.scale,
    };
  }

  /** 获取当前缩放 */
  getScale(): number {
    return this.scale;
  }

  /** 设置初始位置（窗口 resize 时调用） */
  handleResize(): void {
    this.centerOnGrid(20, 20);
  }

  private setupEvents(): void {
    // 鼠标/触摸拖拽平移
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      // 只在空白区域拖拽（非 UI 区域）
      if (e.button === 0) {
        this.isDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.world.x += dx;
      this.world.y += dy;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // 滚轮缩放
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

      // 以鼠标位置为中心缩放
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 计算缩放前鼠标指向的世界坐标
      const worldX = (mouseX - this.world.x) / this.scale;
      const worldY = (mouseY - this.world.y) / this.scale;

      this.scale = newScale;
      this.world.scale.set(this.scale);

      // 调整位置，使鼠标仍然指向同一个世界坐标
      this.world.x = mouseX - worldX * this.scale;
      this.world.y = mouseY - worldY * this.scale;
    }, { passive: false });
  }

  /** 检查当前是否正在拖拽 */
  get dragging(): boolean {
    return this.isDragging;
  }
}
