import Phaser from 'phaser';

interface Track { id: string; y: number; x0: number; x1: number; }
interface Signal { id: string; track: string; x: number; state: 'red' | 'green'; }
interface Switch { id: string; x: number; y: number; state: 'straight' | 'diverge'; }
interface Train { id: string; track: string; x: number; speed: number; state: 'approach' | 'platform' | 'depart'; platform: string | null; dwell: number; color: number; }

export class GameScene extends Phaser.Scene {
  private tracks: Track[] = [];
  private signals: Signal[] = [];
  private switches: Switch[] = [];
  private trains: Train[] = [];
  private score = 0;
  private served = 0;
  private crashes = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private trainGfx!: Phaser.GameObjects.Graphics;
  private uiTimer = 0;

  constructor() { super('game'); }

  create(): void {
    this.tracks = [
      { id: 'main-in', y: 200, x0: 0, x1: 600 },
      { id: 'plat1', y: 280, x0: 200, x1: 1080 },
      { id: 'plat2', y: 360, x0: 200, x1: 1080 },
      { id: 'plat3', y: 440, x0: 200, x1: 1080 },
      { id: 'main-out', y: 520, x0: 600, x1: 1280 },
      { id: 'siding', y: 600, x0: 200, x1: 1080 },
    ];
    this.signals = [
      { id: 'sig-in', track: 'main-in', x: 580, state: 'red' },
      { id: 'sig-p1-in', track: 'plat1', x: 220, state: 'red' },
      { id: 'sig-p2-in', track: 'plat2', x: 220, state: 'red' },
      { id: 'sig-p3-in', track: 'plat3', x: 220, state: 'red' },
      { id: 'sig-p1-out', track: 'plat1', x: 1060, state: 'red' },
      { id: 'sig-p2-out', track: 'plat2', x: 1060, state: 'red' },
      { id: 'sig-p3-out', track: 'plat3', x: 1060, state: 'red' },
      { id: 'sig-out', track: 'main-out', x: 620, state: 'red' },
    ];
    this.switches = [
      { id: 'sw-in-1', x: 590, y: 240, state: 'straight' },
      { id: 'sw-in-2', x: 590, y: 320, state: 'straight' },
      { id: 'sw-in-3', x: 590, y: 400, state: 'straight' },
      { id: 'sw-out-1', x: 610, y: 320, state: 'straight' },
      { id: 'sw-out-2', x: 610, y: 400, state: 'straight' },
      { id: 'sw-out-3', x: 610, y: 480, state: 'straight' },
    ];

    this.gfx = this.add.graphics();
    this.trainGfx = this.add.graphics();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p.x, p.y));

    this.spawnTrain();
  }

  private trackY(id: string): number {
    return this.tracks.find(t => t.id === id)!.y;
  }

  private spawnTrain(): void {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6];
    const t: Train = {
      id: `train-${this.trains.length}`,
      track: 'main-in',
      x: -40,
      speed: 60,
      state: 'approach',
      platform: null,
      dwell: 3 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
    this.trains.push(t);
  }

  private handleClick(x: number, y: number): void {
    // Signal click
    for (const sig of this.signals) {
      const ty = this.trackY(sig.track);
      if (Math.abs(x - sig.x) < 12 && Math.abs(y - ty) < 12) {
        sig.state = sig.state === 'red' ? 'green' : 'red';
        return;
      }
    }
    // Switch click
    for (const sw of this.switches) {
      if (Math.abs(x - sw.x) < 12 && Math.abs(y - sw.y) < 12) {
        sw.state = sw.state === 'straight' ? 'diverge' : 'straight';
        return;
      }
    }
    // Platform assignment: click on platform track area assigns nearest approaching train
    for (const tr of this.tracks) {
      if (tr.id.startsWith('plat') && y > tr.y - 20 && y < tr.y + 20 && x > tr.x0 && x < tr.x1) {
        const approaching = this.trains.find(t => t.state === 'approach');
        if (approaching) approaching.platform = tr.id;
        return;
      }
    }
  }

  private signalState(track: string, x: number): 'red' | 'green' {
    const sigs = this.signals.filter(s => s.track === track);
    // find the signal just ahead of x
    let best: Signal | null = null;
    for (const s of sigs) {
      if (s.x > x && (!best || s.x < best.x)) best = s;
    }
    if (!best) return 'green';
    return best.state;
  }

  update(_time: number, dt: number): void {
    const seconds = Math.min(dt, 100) / 1000;
    this.elapsed += seconds;
    this.spawnTimer += seconds;
    if (this.spawnTimer > 6) { this.spawnTimer = 0; this.spawnTrain(); }

    for (const t of this.trains) {
      if (t.state === 'approach') {
        const sig = this.signalState(t.track, t.x);
        if (sig === 'green') t.speed = Math.min(t.speed + 40 * seconds, 120);
        else t.speed = Math.max(t.speed - 80 * seconds, 0);
        t.x += t.speed * seconds;
        // transition to platform if assigned and near junction
        if (t.platform && t.x > 590) {
          t.track = t.platform;
          t.x = 230;
          t.state = 'platform';
          t.speed = 0;
        }
        if (t.x > 1280) { this.trains = this.trains.filter(x => x.id !== t.id); this.score = Math.max(0, this.score - 50); }
      } else if (t.state === 'platform') {
        t.dwell -= seconds;
        if (t.dwell <= 0) {
          t.state = 'depart';
          t.track = 'main-out';
          t.x = 610;
          t.speed = 0;
        }
      } else if (t.state === 'depart') {
        const sig = this.signalState(t.track, t.x);
        if (sig === 'green') t.speed = Math.min(t.speed + 40 * seconds, 120);
        else t.speed = Math.max(t.speed - 80 * seconds, 0);
        t.x += t.speed * seconds;
        if (t.x > 1280) {
          this.trains = this.trains.filter(x => x.id !== t.id);
          this.served++;
          this.score += 100;
        }
      }
    }

    // Collision detection
    for (let i = 0; i < this.trains.length; i++) {
      for (let j = i + 1; j < this.trains.length; j++) {
        const a = this.trains[i], b = this.trains[j];
        if (a.track === b.track && Math.abs(a.x - b.x) < 30) {
          this.crashes++;
          this.trains = this.trains.filter(t => t.id !== a.id && t.id !== b.id);
        }
      }
    }

    this.draw();
    this.updateHud();
  }

  private draw(): void {
    this.gfx.clear();
    this.trainGfx.clear();

    // Tracks
    this.gfx.lineStyle(3, 0x7f8c8d, 1);
    for (const tr of this.tracks) {
      this.gfx.lineBetween(tr.x0, tr.y, tr.x1, tr.y);
    }
    // Platforms (between tracks)
    this.gfx.fillStyle(0xbdc3c7, 0.6);
    for (const tr of this.tracks) {
      if (tr.id.startsWith('plat')) {
        this.gfx.fillRect(tr.x0, tr.y - 14, tr.x1 - tr.x0, 28);
      }
    }
    // Labels
    // Signals
    for (const sig of this.signals) {
      const ty = this.trackY(sig.track);
      this.gfx.fillStyle(sig.state === 'green' ? 0x2ecc71 : 0xe74c3c, 1);
      this.gfx.fillCircle(sig.x, ty, 6);
      this.gfx.lineStyle(1, 0x000, 1);
      this.gfx.strokeCircle(sig.x, ty, 6);
    }
    // Switches
    for (const sw of this.switches) {
      this.gfx.fillStyle(0xf1c40f, 1);
      this.gfx.fillTriangle(sw.x - 8, sw.y + 8, sw.x + 8, sw.y + 8, sw.x, sw.y - 8);
      this.gfx.fillStyle(sw.state === 'diverge' ? 0xe67e22 : 0x2c3e50, 1);
      this.gfx.fillCircle(sw.x, sw.y, 3);
    }
    // Trains
    for (const t of this.trains) {
      const ty = this.trackY(t.track);
      this.trainGfx.fillStyle(t.color, 1);
      this.trainGfx.fillRect(t.x - 15, ty - 8, 30, 16);
      this.trainGfx.fillStyle(0xffffff, 0.6);
      this.trainGfx.fillRect(t.x - 10, ty - 4, 20, 3);
    }
  }

  private updateHud(): void {
    this.uiTimer += 0.016;
    if (this.uiTimer < 0.1) return;
    this.uiTimer = 0;
    const scoreEl = document.getElementById('score');
    const servedEl = document.getElementById('served');
    const crashesEl = document.getElementById('crashes');
    const timeEl = document.getElementById('time');
    if (scoreEl) scoreEl.innerText = `${this.score}`;
    if (servedEl) servedEl.innerText = `${this.served}`;
    if (crashesEl) crashesEl.innerText = `${this.crashes}`;
    if (timeEl) timeEl.innerText = `${Math.floor(this.elapsed)}`;
  }
}
