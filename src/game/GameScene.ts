import Phaser from 'phaser';

// ---- Track layout ----
// A station with 4 parallel platform tracks + 1 arrival + 1 departure track.
// Tracks run horizontally. Switches at x=200 (entry) and x=1080 (exit).

interface TrackDef { id: string; y: number; x0: number; x1: number; kind: 'main' | 'platform' | 'arrival' | 'departure'; }
interface SignalDef { id: string; track: string; x: number; }
interface Train { id: string; track: string; x: number; speed: number; state: 'approach' | 'platform' | 'depart'; platform: string | null; dwell: number; color: number; dir: 1 | -1; }

const TRACKS: TrackDef[] = [
  { id: 'arrival', y: 180, x0: 0, x1: 200, kind: 'arrival' },
  { id: 'p1', y: 260, x0: 200, x1: 1080, kind: 'platform' },
  { id: 'p2', y: 340, x0: 200, x1: 1080, kind: 'platform' },
  { id: 'p3', y: 420, x0: 200, x1: 1080, kind: 'platform' },
  { id: 'p4', y: 500, x0: 200, x1: 1080, kind: 'platform' },
  { id: 'departure', y: 580, x0: 1080, x1: 1280, kind: 'departure' },
];

const SIGNALS: SignalDef[] = [
  { id: 'sig-arr', track: 'arrival', x: 180 },
  { id: 'sig-p1-in', track: 'p1', x: 220 },
  { id: 'sig-p2-in', track: 'p2', x: 220 },
  { id: 'sig-p3-in', track: 'p3', x: 220 },
  { id: 'sig-p4-in', track: 'p4', x: 220 },
  { id: 'sig-p1-out', track: 'p1', x: 1060 },
  { id: 'sig-p2-out', track: 'p2', x: 1060 },
  { id: 'sig-p3-out', track: 'p3', x: 1060 },
  { id: 'sig-p4-out', track: 'p4', x: 1060 },
  { id: 'sig-dep', track: 'departure', x: 1100 },
];

const SWITCHES: { id: string; x: number; y: number; }[] = [
  { id: 'sw-arr', x: 195, y: 180 },
  { id: 'sw-dep', x: 1085, y: 580 },
];

export class GameScene extends Phaser.Scene {
  private tracks = TRACKS;
  private signals: { id: string; track: string; x: number; state: 'red' | 'green' }[] = [];
  private switches: { id: string; x: number; y: number; state: 'straight' | 'diverge' }[] = [];
  private trains: Train[] = [];
  private score = 0;
  private served = 0;
  private crashes = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnInterval = 8;
  private gfx!: Phaser.GameObjects.Graphics;
  private trainGfx!: Phaser.GameObjects.Graphics;
  private uiTimer = 0;
  private gameOver = false;

  constructor() { super('game'); }

  create(): void {
    this.signals = SIGNALS.map(s => ({ ...s, state: 'red' as const }));
    this.switches = SWITCHES.map(s => ({ ...s, state: 'straight' as const }));
    this.gfx = this.add.graphics();
    this.trainGfx = this.add.graphics();

    for (let i = 0; i < 4; i++) {
      const tr = this.tracks[1 + i];
      this.add.text(tr.x0 + 10, tr.y - 40, `Platform ${i + 1}`, { fontSize: '13px', color: '#ecf0f1', fontStyle: 'bold' }).setOrigin(0, 0.5);
    }
    this.add.text(20, 150, 'ARRIVAL', { fontSize: '12px', color: '#95a5a6' }).setOrigin(0, 0.5);
    this.add.text(1100, 550, 'DEPARTURE', { fontSize: '12px', color: '#95a5a6' }).setOrigin(0, 0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p.x, p.y));

    this.spawnTrain();
  }

  private trackY(id: string): number {
    return this.tracks.find(t => t.id === id)!.y;
  }

  private spawnTrain(): void {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c];
    const t: Train = {
      id: `train-${this.trains.length}`,
      track: 'arrival',
      x: -50,
      speed: 80,
      state: 'approach',
      platform: null,
      dwell: 4 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      dir: 1,
    };
    this.trains.push(t);
  }

  private handleClick(x: number, y: number): void {
    if (this.gameOver) return;
    // Signal click
    for (const sig of this.signals) {
      const ty = this.trackY(sig.track);
      if (Math.abs(x - sig.x) < 14 && Math.abs(y - ty) < 14) {
        sig.state = sig.state === 'red' ? 'green' : 'red';
        return;
      }
    }
    // Switch click
    for (const sw of this.switches) {
      if (Math.abs(x - sw.x) < 14 && Math.abs(y - sw.y) < 14) {
        sw.state = sw.state === 'straight' ? 'diverge' : 'straight';
        return;
      }
    }
    // Platform assignment: click on a platform track
    for (const tr of this.tracks) {
      if (tr.kind === 'platform' && y > tr.y - 22 && y < tr.y + 22 && x > tr.x0 + 20 && x < tr.x1 - 20) {
        const approaching = this.trains.find(t => t.state === 'approach');
        if (approaching) approaching.platform = tr.id;
        return;
      }
    }
  }

  private signalState(track: string, x: number): 'red' | 'green' {
    const sigs = this.signals.filter(s => s.track === track);
    let best: { id: string; track: string; x: number; state: 'red' | 'green' } | null = null;
    for (const s of sigs) {
      if (s.x > x && (!best || s.x < best.x)) best = s;
    }
    if (!best) return 'green';
    return best.state;
  }

  update(_time: number, dt: number): void {
    if (this.gameOver) return;
    const seconds = Math.min(dt, 100) / 1000;
    this.elapsed += seconds;
    this.spawnTimer += seconds;
    if (this.spawnTimer > this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnTrain();
      this.spawnInterval = Math.max(3, this.spawnInterval - 0.1);
    }

    for (const t of this.trains) {
      if (t.state === 'approach') {
        const sig = this.signalState(t.track, t.x);
        if (sig === 'green') t.speed = Math.min(t.speed + 60 * seconds, 140);
        else t.speed = Math.max(t.speed - 100 * seconds, 0);
        t.x += t.speed * seconds * t.dir;

        // Transition to platform if assigned and at junction
        if (t.platform && t.x > 195) {
          t.track = t.platform;
          t.x = 230;
          t.state = 'platform';
          t.speed = 0;
        }
        // Missed train (passed through without platform)
        if (t.x > 210 && !t.platform) {
          // still approaching, nudge to assign
        }
        if (t.x > 1280) {
          this.trains = this.trains.filter(x => x.id !== t.id);
          this.score = Math.max(0, this.score - 50);
        }
      } else if (t.state === 'platform') {
        t.dwell -= seconds;
        if (t.dwell <= 0) {
          t.state = 'depart';
          t.track = 'departure';
          t.x = 1090;
          t.speed = 0;
        }
      } else if (t.state === 'depart') {
        const sig = this.signalState(t.track, t.x);
        if (sig === 'green') t.speed = Math.min(t.speed + 60 * seconds, 140);
        else t.speed = Math.max(t.speed - 100 * seconds, 0);
        t.x += t.speed * seconds * t.dir;
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
        if (a.track === b.track && Math.abs(a.x - b.x) < 35) {
          this.crashes++;
          this.trains = this.trains.filter(t => t.id !== a.id && t.id !== b.id);
          if (this.crashes >= 5) this.gameOver = true;
        }
      }
    }

    this.draw();
    this.updateHud();
  }

  private draw(): void {
    this.gfx.clear();
    this.trainGfx.clear();

    // Background
    this.gfx.fillStyle(0x2c3e50, 1);
    this.gfx.fillRect(0, 0, 1280, 720);

    // Track bed (ballast)
    for (const tr of this.tracks) {
      this.gfx.fillStyle(0x555, 1);
      this.gfx.fillRect(tr.x0, tr.y - 6, tr.x1 - tr.x0, 12);
    }
    // Rails
    this.gfx.lineStyle(2, 0x95a5a6, 1);
    for (const tr of this.tracks) {
      this.gfx.lineBetween(tr.x0, tr.y - 2, tr.x1, tr.y - 2);
      this.gfx.lineBetween(tr.x0, tr.y + 2, tr.x1, tr.y + 2);
    }
    // Sleepers
    this.gfx.lineStyle(1, 0x34495e, 1);
    for (const tr of this.tracks) {
      for (let x = tr.x0; x < tr.x1; x += 12) {
        this.gfx.lineBetween(x, tr.y - 5, x, tr.y + 5);
      }
    }
    // Platforms
    for (const tr of this.tracks) {
      if (tr.kind === 'platform') {
        this.gfx.fillStyle(0xbdc3c7, 0.8);
        this.gfx.fillRect(tr.x0, tr.y - 22, tr.x1 - tr.x0, 18);
        this.gfx.fillStyle(0xf1c40f, 0.9);
        this.gfx.fillRect(tr.x0, tr.y - 22, tr.x1 - tr.x0, 3);
      }
    }

    // Signals
    for (const sig of this.signals) {
      const ty = this.trackY(sig.track);
      // Signal post
      this.gfx.lineStyle(2, 0x7f8c8d, 1);
      this.gfx.lineBetween(sig.x, ty, sig.x, ty - 18);
      // Signal head
      this.gfx.fillStyle(sig.state === 'green' ? 0x2ecc71 : 0xe74c3c, 1);
      this.gfx.fillCircle(sig.x, ty - 22, 7);
      this.gfx.fillStyle(0x000, 0.3);
      this.gfx.fillCircle(sig.x, ty - 22, 7);
      this.gfx.lineStyle(1, 0x000, 1);
      this.gfx.strokeCircle(sig.x, ty - 22, 7);
    }
    // Switches
    for (const sw of this.switches) {
      this.gfx.fillStyle(0xf1c40f, 1);
      this.gfx.fillTriangle(sw.x - 10, sw.y + 10, sw.x + 10, sw.y + 10, sw.x, sw.y - 10);
      this.gfx.fillStyle(sw.state === 'diverge' ? 0xe67e22 : 0x2c3e50, 1);
      this.gfx.fillCircle(sw.x, sw.y, 4);
    }
    // Trains
    for (const t of this.trains) {
      const ty = this.trackY(t.track);
      // Shadow
      this.trainGfx.fillStyle(0x000, 0.3);
      this.trainGfx.fillRect(t.x - 16, ty - 7, 32, 16);
      // Body
      this.trainGfx.fillStyle(t.color, 1);
      this.trainGfx.fillRect(t.x - 15, ty - 8, 30, 16);
      // Cab
      this.trainGfx.fillStyle(0xffffff, 0.7);
      this.trainGfx.fillRect(t.x + 5, ty - 6, 8, 12);
      // Wheels
      this.trainGfx.fillStyle(0x2c3e50, 1);
      this.trainGfx.fillRect(t.x - 12, ty - 10, 4, 3);
      this.trainGfx.fillRect(t.x - 12, ty + 7, 4, 3);
      this.trainGfx.fillRect(t.x + 8, ty - 10, 4, 3);
      this.trainGfx.fillRect(t.x + 8, ty + 7, 4, 3);
    }
    // Game over overlay
    if (this.gameOver) {
      this.gfx.fillStyle(0x000, 0.7);
      this.gfx.fillRect(0, 0, 1280, 720);
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
