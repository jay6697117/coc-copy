// ============================================================
// 入口文件 — 启动游戏
// ============================================================

import { Game } from './Game.js';

async function main() {
  const game = new Game();
  await game.init();
}

main().catch(console.error);
