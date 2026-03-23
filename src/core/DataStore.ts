// ============================================================
// 数据存储 — 基于 IndexedDB 的玩家数据持久化
// ============================================================

import type { SaveData } from '../types/index.js';

const DB_NAME = 'coc_clone';
const DB_VERSION = 1;
const STORE_NAME = 'save_data';
const SAVE_KEY = 'player_save';

export class DataStore {
  private db: IDBDatabase | null = null;

  /** 初始化数据库连接 */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /** 保存玩家数据 */
  async save(data: SaveData): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, SAVE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /** 加载玩家数据 */
  async load(): Promise<SaveData | null> {
    if (!this.db) throw new Error('数据库未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SAVE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  /** 获取默认初始存档 */
  static getDefaultSave(): SaveData {
    return {
      townHallLevel: 1,
      resources: { gold: 5000, elixir: 5000, gems: 100 },
      buildings: [
        // 初始大本营放在地图中央
        {
          uid: 'building_1',
          configId: 'town_hall',
          gridX: 18,
          gridY: 18,
          level: 1,
          isUpgrading: false,
        },
      ],
      lastOnlineTime: Date.now(),
    };
  }
}
