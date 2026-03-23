// ============================================================
// 事件总线 — 全局发布/订阅系统，解耦系统间通信
// ============================================================

import type { GameEvents } from '../types/index.js';

type EventCallback<T> = (data: T) => void;

/**
 * 类型安全的事件总线
 * 所有事件类型在 GameEvents 接口中定义
 */
export class EventBus {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  /** 订阅事件 */
  on<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    this.listeners.get(event as string)!.add(callback as EventCallback<unknown>);
  }

  /** 取消订阅 */
  off<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(callback as EventCallback<unknown>);
    }
  }

  /** 发布事件 */
  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.forEach(cb => cb(data));
    }
  }

  /** 清除所有监听器 */
  clear(): void {
    this.listeners.clear();
  }
}
