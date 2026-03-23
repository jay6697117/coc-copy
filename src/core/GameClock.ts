// ============================================================
// 游戏时钟 — 管理游戏时间、倒计时和离线时间计算
// ============================================================

import type { EventBus } from './EventBus.js';

export class GameClock {
  private eventBus: EventBus;
  private lastTime: number = 0;
  private running: boolean = false;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** 启动时钟 */
  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.tick();
  }

  /** 停止时钟 */
  stop(): void {
    this.running = false;
  }

  /** 获取当前时间戳（毫秒） */
  now(): number {
    return Date.now();
  }

  /** 计算离线时长（毫秒） */
  getOfflineDuration(lastOnlineTime: number): number {
    return Math.max(0, Date.now() - lastOnlineTime);
  }

  /** 主循环 tick */
  private tick(): void {
    if (!this.running) return;

    const currentTime = performance.now();
    const deltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // 发布 tick 事件
    this.eventBus.emit('clock:tick', { deltaMs });

    requestAnimationFrame(() => this.tick());
  }
}
