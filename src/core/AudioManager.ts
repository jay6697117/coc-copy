// ============================================================
// 音效管理器 — Web Audio API 合成音效（无需加载外部文件）
// ============================================================

type SoundId = 'click' | 'build' | 'upgrade' | 'collect' |
  'deploy' | 'attack' | 'explosion' | 'victory' | 'defeat' | 'spell' | 'heal';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private volume = 0.3;
  private enabled = true;

  /** 延迟初始化（需要用户交互后才能创建 AudioContext） */
  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** 播放音效 */
  play(id: SoundId): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    switch (id) {
      case 'click': this.playTone(ctx, 800, 0.05, 'square', 0.1); break;
      case 'build': this.playTone(ctx, 300, 0.15, 'sawtooth', 0.2); this.playTone(ctx, 500, 0.1, 'square', 0.15, 0.1); break;
      case 'upgrade': this.playTone(ctx, 400, 0.1, 'sine', 0.2); this.playTone(ctx, 600, 0.1, 'sine', 0.2, 0.1); this.playTone(ctx, 800, 0.15, 'sine', 0.25, 0.2); break;
      case 'collect': this.playTone(ctx, 1200, 0.03, 'sine', 0.15); this.playTone(ctx, 1500, 0.03, 'sine', 0.1, 0.03); break;
      case 'deploy': this.playNoise(ctx, 0.1, 0.15); this.playTone(ctx, 200, 0.08, 'sawtooth', 0.1); break;
      case 'attack': this.playTone(ctx, 150, 0.06, 'sawtooth', 0.2); this.playNoise(ctx, 0.05, 0.12); break;
      case 'explosion': this.playNoise(ctx, 0.3, 0.3); this.playTone(ctx, 80, 0.2, 'sine', 0.3); break;
      case 'victory': this.playMelody(ctx, [523, 659, 784, 1047], 0.12, 'sine', 0.2); break;
      case 'defeat': this.playMelody(ctx, [400, 350, 300, 250], 0.15, 'sawtooth', 0.15); break;
      case 'spell': this.playTone(ctx, 600, 0.15, 'sine', 0.2); this.playTone(ctx, 900, 0.1, 'sine', 0.15, 0.1); this.playNoise(ctx, 0.1, 0.1, 0.15); break;
      case 'heal': this.playTone(ctx, 500, 0.2, 'sine', 0.1); this.playTone(ctx, 700, 0.15, 'sine', 0.1, 0.1); break;
    }
  }

  /** 生成单音 */
  private playTone(ctx: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.value = vol * this.volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + dur);
  }

  /** 生成噪声 */
  private playNoise(ctx: AudioContext, dur: number, vol: number, delay = 0): void {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol * this.volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    src.connect(gain); gain.connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  }

  /** 播放旋律 */
  private playMelody(ctx: AudioContext, freqs: number[], noteDur: number, type: OscillatorType, vol: number): void {
    freqs.forEach((f, i) => this.playTone(ctx, f, noteDur, type, vol, i * noteDur));
  }

  setVolume(v: number): void { this.volume = Math.max(0, Math.min(1, v)); }
  setEnabled(e: boolean): void { this.enabled = e; if (!e) this.stopBgm(); }
  isEnabled(): boolean { return this.enabled; }

  // ===== 背景音乐 =====

  private bgmNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private bgmType: 'village' | 'battle' | null = null;

  /** 播放循环 BGM */
  playBgm(type: 'village' | 'battle'): void {
    if (!this.enabled) return;
    if (this.bgmType === type) return;
    this.stopBgm();
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.bgmType = type;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    // 淡入
    gain.gain.linearRampToValueAtTime(this.volume * 0.08, ctx.currentTime + 1);

    const oscs: OscillatorNode[] = [];
    const notes = type === 'village'
      ? [262, 330, 392] // C 大调和弦（温暖村庄）
      : [220, 277, 330]; // A 小调和弦（紧张战斗）

    for (const freq of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      oscs.push(osc);
    }

    this.bgmNodes = { osc: oscs, gain };
  }

  /** 停止 BGM */
  stopBgm(): void {
    if (!this.bgmNodes) return;
    try {
      this.bgmNodes.gain.gain.linearRampToValueAtTime(0, (this.ctx?.currentTime ?? 0) + 0.5);
      const nodes = this.bgmNodes;
      setTimeout(() => { nodes.osc.forEach(o => { try { o.stop(); } catch {} }); }, 600);
    } catch {}
    this.bgmNodes = null;
    this.bgmType = null;
  }
}
