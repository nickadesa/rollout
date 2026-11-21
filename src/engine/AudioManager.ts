import { GameSettings } from '../types';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  public updateSettings(s: GameSettings): void {
    this.settings = s;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  private gainFor(channel: 'sfx' | 'hit' | 'ui', base: number): number {
    if (this.settings.muted) return 0;
    const ch =
      channel === 'sfx'
        ? this.settings.sfxVolume
        : channel === 'hit'
        ? this.settings.hitmarkerVolume
        : this.settings.uiVolume;
    return Math.max(0, Math.min(1, base * ch * this.settings.masterVolume));
  }

  public playPistolShot(distance = 0): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const atten = Math.max(0.08, 1 - distance / 55);
    const vol = this.gainFor('sfx', 0.45 * atten);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;

    // Punchy low thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    oscGain.gain.setValueAtTime(vol * 1.1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(oscGain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // Crisp gunshot crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.value = 0.8;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    src.connect(filter).connect(nGain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.15);
  }

  public playMeleeSwing(heavy = false): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const vol = this.gainFor('sfx', heavy ? 0.34 : 0.24);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 380 : 850, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 180 : 320, now + (heavy ? 0.18 : 0.11));
    filter.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.2 : 0.12));

    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.22);
  }

  public playMeleeHit(weapon: 'fists' | 'knife' | 'bat'): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const vol = this.gainFor('sfx', 0.42);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = weapon === 'knife' ? 'sawtooth' : 'sine';
    const startFreq = weapon === 'bat' ? 140 : weapon === 'knife' ? 520 : 120;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.12);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playRoll(): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const vol = this.gainFor('sfx', 0.22);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.28);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.32);
  }

  public playReload(): void {
    if (!this.ctx) return;
    const vol = this.gainFor('sfx', 0.25);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    [0, 0.22, 0.65].forEach((offset, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 2 ? 920 : 620, now + offset);
      g.gain.setValueAtTime(vol * 0.45, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.045);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.05);
    });
  }

  public playHitmarker(headshot: boolean, shieldBreak = false): void {
    if (!this.ctx) return;
    const vol = this.gainFor('hit', headshot ? 0.45 : 0.32);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = headshot ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(headshot ? 1480 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 2100 : 640, now + 0.065);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    if (shieldBreak && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2400;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.9, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(hp).connect(ng).connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.24);
    }
  }

  public playElimination(): void {
    if (!this.ctx) return;
    const vol = this.gainFor('hit', 0.38);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    [587.33, 880, 1174.66].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      g.gain.setValueAtTime(vol * 0.7, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.16);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.18);
    });
  }

  public playUiClick(): void {
    if (!this.ctx) return;
    const vol = this.gainFor('ui', 0.2);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(1020, now + 0.035);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}
