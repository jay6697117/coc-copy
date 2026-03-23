// ============================================================
// 战斗特效系统 — 伤害数字、攻击闪光、摧毁爆炸、部署烟雾
// ============================================================

import { Container, Graphics, Text } from 'pixi.js';

/** 特效粒子 */
interface FxParticle {
  container: Container;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  fadeOut: boolean;
}

export class BattleFx {
  private fxLayer: Container;
  private particles: FxParticle[] = [];

  constructor(parent: Container) {
    this.fxLayer = new Container();
    parent.addChild(this.fxLayer);
  }

  /** 显示伤害数字 */
  showDamage(x: number, y: number, damage: number): void {
    const text = new Text({
      text: `-${damage}`,
      style: {
        fontSize: 12,
        fill: '#ff4444',
        fontWeight: 'bold',
        stroke: { color: '#000000', width: 2 },
      },
    });
    text.anchor?.set(0.5);
    text.x = x + (Math.random() - 0.5) * 10;
    text.y = y - 10;

    const container = new Container();
    container.addChild(text);
    this.fxLayer.addChild(container);

    this.particles.push({
      container,
      vx: (Math.random() - 0.5) * 30,
      vy: -60,
      life: 0.8,
      maxLife: 0.8,
      fadeOut: true,
    });
  }

  /** 攻击闪光 */
  showAttackFlash(x: number, y: number, color = 0xffaa00): void {
    const g = new Graphics();
    g.circle(0, 0, 6);
    g.fill({ color, alpha: 0.8 });
    g.circle(0, 0, 10);
    g.fill({ color: 0xffffff, alpha: 0.3 });

    const container = new Container();
    container.addChild(g);
    container.x = x;
    container.y = y;
    this.fxLayer.addChild(container);

    this.particles.push({
      container,
      vx: 0, vy: 0,
      life: 0.15,
      maxLife: 0.15,
      fadeOut: true,
    });
  }

  /** 摧毁爆炸 */
  showExplosion(x: number, y: number): void {
    // 大爆炸闪光
    const blast = new Graphics();
    blast.circle(0, 0, 20);
    blast.fill({ color: 0xff6600, alpha: 0.7 });
    blast.circle(0, 0, 30);
    blast.fill({ color: 0xff3300, alpha: 0.3 });

    const blastContainer = new Container();
    blastContainer.addChild(blast);
    blastContainer.x = x;
    blastContainer.y = y;
    this.fxLayer.addChild(blastContainer);

    this.particles.push({
      container: blastContainer,
      vx: 0, vy: 0,
      life: 0.4,
      maxLife: 0.4,
      fadeOut: true,
    });

    // 碎片粒子
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 80 + Math.random() * 40;
      const g = new Graphics();
      g.rect(-2, -2, 4, 4);
      g.fill(Math.random() > 0.5 ? 0xff6600 : 0x888888);

      const c = new Container();
      c.addChild(g);
      c.x = x;
      c.y = y;
      this.fxLayer.addChild(c);

      this.particles.push({
        container: c,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5,
        maxLife: 0.5,
        fadeOut: true,
      });
    }
  }

  /** 部署落地烟雾 */
  showDeploySmoke(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const g = new Graphics();
      const size = 4 + Math.random() * 4;
      g.circle(0, 0, size);
      g.fill({ color: 0xccccaa, alpha: 0.6 });

      const c = new Container();
      c.addChild(g);
      c.x = x;
      c.y = y;
      this.fxLayer.addChild(c);

      this.particles.push({
        container: c,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40 - 20,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        fadeOut: true,
      });
    }
  }

  /** 每帧更新 */
  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.fxLayer.removeChild(p.container);
        p.container.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      // 移动
      p.container.x += p.vx * dt;
      p.container.y += p.vy * dt;

      // 渐隐
      if (p.fadeOut) {
        p.container.alpha = Math.max(0, p.life / p.maxLife);
      }

      // 重力
      p.vy += 100 * dt;
    }
  }

  /** 清除全部 */
  clearAll(): void {
    for (const p of this.particles) {
      this.fxLayer.removeChild(p.container);
      p.container.destroy();
    }
    this.particles = [];
  }
}
