import Phaser from 'phaser';
import type { Car, Route, Train } from './types';
import { buildNetwork, pointAt, angleAt, W, H, PLATFORM_Y, PLATFORM_X0, PLATFORM_X1, MAIN_Y, JUNC_W, JUNC_E } from './network';

export class GameScene extends Phaser.Scene {
  private routes!: Route[];
  private signals!: ReturnType<typeof buildNetwork>['signals'];
  private tracks!: ReturnType<typeof buildNetwork>['tracks'];
  private trains: Train[] = [];
  private views = new Map<string, { sprites: Phaser.GameObjects.Sprite[]; offsets: number[] }>();
  private score = 0;
  private served = 0;
  private crashes = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnEvery = 5;
  private gfx!: Phaser.GameObjects.Graphics;
  private trainId = 0;
  public lastCrash: { ids: string[]; positions: { x: number; y: number }[] } | null = null;
  private hoverPlatform: number | null = null;
  private selectedForAssign: string | null = null;
  private paused = false;
  private gameOver = false;

  constructor() { super('game'); }

  create(): void {
    const net = buildNetwork();
    this.routes = net.routes;
    this.signals = net.signals;
    this.tracks = net.tracks;

    // Background
    this.cameras.main.setBackgroundColor('#1e272e');
    this.add.image(W / 2, H / 2, '__DEFAULT').setVisible(false);

    this.gfx = this.add.graphics().setDepth(1);

    // Static labels
    this.add.text(20, MAIN_Y - 40, 'WEST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    this.add.text(W - 110, MAIN_Y - 40, 'EAST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    for (let i = 0; i < 4; i++) {
      this.add.text(PLATFORM_X0 + 6, PLATFORM_Y[i] - 46, `PLATFORM ${i + 1}`, { fontSize: '12px', color: '#ecf0f1', fontStyle: 'bold' });
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.handleHover(p.x, p.y));

    this.keysSetup();
    this.spawnTrain();
    this.spawnTimer = -2;
  }

  private keysSetup(): void {
    this.input.keyboard?.on('keydown-SPACE', () => { this.paused = !this.paused; });
  }

  private route(id: string): Route { return this.routes.find(r => r.id === id)!; }

  private spawnTrain(): void {
    // Don't stack a new service on top of one already waiting at the same entry.
    const dir: 'west' | 'east' = Math.random() < 0.5 ? 'west' : 'east';
    const busy = this.trains.some(t => {
      const p = pointAt(this.route(t.routeId).points, t.progress);
      const spawnX = dir === 'west' ? -40 : W + 40;
      return Math.hypot(p.x - spawnX, p.y - MAIN_Y) < 80;
    });
    if (busy) return;
    const freight = Math.random() < 0.35;
    const colors = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xe67e22];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const cars: Car[] = [];
    if (freight) {
      cars.push({ kind: 'loco', offset: 0, length: 60 });
      cars.push({ kind: 'wagon', offset: 68, length: 52 });
      cars.push({ kind: 'wagon', offset: 124, length: 52 });
      cars.push({ kind: 'wagon', offset: 180, length: 52 });
    } else {
      cars.push({ kind: 'loco', offset: 0, length: 58 });
      cars.push({ kind: 'coach', offset: 66, length: 54 });
      cars.push({ kind: 'coach', offset: 124, length: 54 });
    }
    const length = cars[cars.length - 1].offset + cars[cars.length - 1].length;

    const t: Train = {
      id: `t${this.trainId++}`,
      name: `${freight ? 'Freight' : 'Passenger'} ${dir === 'west' ? 'W' : 'E'}${this.trainId}`,
      phase: 'approach',
      direction: dir,
      routeId: dir === 'west' ? 'w2p0' : 'e2p0',
      progress: 0,
      speed: 36,
      maxSpeed: freight ? 60 : 86,
      cars,
      length,
      color,
      platform: null,
      dwellTimer: 0,
      freight,
      arrived: false,
    };
    this.trains.push(t);
    this.buildView(t);
  }

  private buildView(t: Train): void {
    const sprites: Phaser.GameObjects.Sprite[] = [];
    const offsets: number[] = [];
    const locoKey = t.color === 0xc0392b ? 'loco-red' : t.color === 0x2980b9 ? 'loco-blue' : 'loco-green';
    t.cars.forEach((car, i) => {
      let key = locoKey;
      if (car.kind === 'coach') key = 'coach';
      if (car.kind === 'wagon') key = i % 2 === 0 ? 'wagon-blue' : 'wagon-orange';
      const sp = this.add.sprite(0, 0, key).setDepth(10 + i).setScale(0.85);
      sprites.push(sp);
      offsets.push(car.offset);
    });
    this.views.set(t.id, { sprites, offsets });
  }

  private handleHover(x: number, y: number): void {
    this.hoverPlatform = null;
    for (let i = 0; i < 4; i++) {
      if (y > PLATFORM_Y[i] - 30 && y < PLATFORM_Y[i] + 16 && x > PLATFORM_X0 && x < PLATFORM_X1) {
        this.hoverPlatform = i;
      }
    }
  }

  private handleClick(x: number, y: number): void {
    if (this.gameOver || this.paused) return;
    // Signal click
    for (const sig of this.signals) {
      if (Math.hypot(x - sig.x, y - sig.y) < 20) {
        sig.state = sig.state === 'red' ? 'green' : 'red';
        return;
      }
    }
    // Platform click -> assign selected or nearest approaching train
    for (let i = 0; i < 4; i++) {
      if (y > PLATFORM_Y[i] - 34 && y < PLATFORM_Y[i] + 20 && x > PLATFORM_X0 - 10 && x < PLATFORM_X1 + 10) {
        const occupied = this.trains.some(t => t.platform === i && t.phase === 'dwell');
        if (occupied) return;
        let train: Train | undefined;
        if (this.selectedForAssign) train = this.trains.find(t => t.id === this.selectedForAssign && t.phase === 'approach');
        if (!train) train = this.trains.filter(t => t.phase === 'approach' && !t.platform).sort((a, b) => b.progress - a.progress)[0];
        if (train) {
          train.platform = i;
          train.routeId = `${train.direction === 'west' ? 'w' : 'e'}2p${i}`;
          train.arrived = false;
          this.selectedForAssign = null;
        }
        return;
      }
    }
  }

  private signalForRoute(routeId: string): boolean {
    const sigs = this.signals.filter(s => s.routes.includes(routeId));
    return sigs.every(s => s.state === 'green');
  }

  update(_time: number, dt: number): void {
    if (this.gameOver) return;
    const seconds = Math.min(dt, 100) / 1000;
    if (this.paused) { this.draw(); return; }

    this.elapsed += seconds;
    this.spawnTimer += seconds;
    if (this.spawnTimer > this.spawnEvery) {
      this.spawnTimer = 0;
      this.spawnTrain();
      this.spawnEvery = Math.max(3, this.spawnEvery - 0.15);
    }

    for (const t of this.trains) {
      const route = this.route(t.routeId);
      const L = route.length;
      const side: 'west' | 'east' = t.routeId.startsWith('w2p') || t.routeId.endsWith('2w') ? 'west' : 'east';
      const isApproach = t.routeId.startsWith('w2p') || t.routeId.startsWith('e2p');

      if (t.phase === 'approach' || t.phase === 'depart') {
        // Must have a platform assigned before entering (approach only).
        const ready = t.phase === 'depart' || t.platform !== null;
        if (!ready) {
          t.speed = 0;
          t.progress = Math.min(t.progress, 0);
          this.syncViews(); this.draw(); this.updateHud();
          continue;
        }

        // One train at a time per side on the shared throat. Others wait clear.
        const sideBusy = this.trains.some(o => {
          if (o === t) return false;
          const oSide: 'west' | 'east' = o.routeId.startsWith('w2p') || o.routeId.endsWith('2w') ? 'west' : 'east';
          if (oSide !== side) return false;
          const oApp = o.routeId.startsWith('w2p') || o.routeId.startsWith('e2p');
          const oL = this.route(o.routeId).length;
          // Occupying the throat: approaching past the off-map point, or departing before the exit.
          return (oApp && o.progress > 20 && o.progress < oL - 40) ||
                 (!oApp && o.progress > 40 && o.progress < oL - 20);
        });
        const clear = this.signalForRoute(t.routeId) && !sideBusy;

        if (clear) t.speed = Math.min(t.speed + 45 * seconds, t.maxSpeed);
        else t.speed = Math.max(t.speed - 140 * seconds, 0);

        t.progress += t.speed * seconds;
        if (!clear) {
          const hold = isApproach ? Math.min(t.progress, 0) : Math.min(t.progress, 30);
          t.progress = hold;
          t.speed = 0;
        }

        // Arrival at platform centre
        const stopAt = L - 6;
        if (t.phase === 'approach' && t.platform !== null && t.progress >= stopAt) {
          t.progress = stopAt;
          t.speed = 0;
          t.phase = 'dwell';
          t.dwellTimer = 4 + Math.random() * 3;
          this.score += 50;
        }
        // Departed off screen
        if (t.progress >= L + 10) {
          if (t.phase === 'depart') { this.served++; this.score += 100; }
          this.trains = this.trains.filter(x => x.id !== t.id);
          this.views.delete(t.id);
          continue;
        }
      } else if (t.phase === 'dwell') {
        t.dwellTimer -= seconds;
        if (t.dwellTimer <= 0) {
          t.phase = 'depart';
          t.routeId = `${t.direction === 'west' ? 'p' + t.platform + '2e' : 'p' + t.platform + '2w'}`;
          // ensure departure signal is red initially
          const sig = this.signals.find(s => s.id === `sig-p${t.platform}-out`);
          if (sig) sig.state = 'red';
          t.progress = 0;
          t.speed = 0;
        }
      }
    }

    // Collision detection using actual sprite positions across all trains
    const pts: { id: string; x: number; y: number }[] = [];
    for (const t of this.trains) {
      const v = this.views.get(t.id);
      if (!v) continue;
      const p = pointAt(this.route(t.routeId).points, t.progress);
      pts.push({ id: t.id, x: p.x, y: p.y });
    }
    let crashed: [string, string] | null = null;
    for (let i = 0; i < pts.length && !crashed; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 18) {
          crashed = [pts[i].id, pts[j].id];
          break;
        }
      }
    }
    if (crashed) {
      this.crashes++;
      this.lastCrash = { ids: crashed, positions: crashed.map(id => {
        const t = this.trains.find(x => x.id === id);
        return t ? pointAt(this.route(t.routeId).points, t.progress) : { x: 0, y: 0 };
      }), details: crashed.map(id => {
        const t = this.trains.find(x => x.id === id);
        return t ? { id: t.id, phase: t.phase, route: t.routeId, prog: Math.round(t.progress) } : null;
      }) } as never;
      this.trains = this.trains.filter(t => t.id !== crashed![0] && t.id !== crashed![1]);
      this.views.delete(crashed[0]); this.views.delete(crashed[1]);
      if (this.crashes >= 5) this.gameOver = true;
    }

    this.syncViews();
    this.draw();
    this.updateHud();
  }

  private syncViews(): void {
    for (const t of this.trains) {
      const view = this.views.get(t.id);
      if (!view) continue;
      const pts = this.route(t.routeId).points;
      view.sprites.forEach((sp, i) => {
        const d = t.progress - view.offsets[i];
        const p = pointAt(pts, d);
        sp.setPosition(p.x, p.y);
        sp.setRotation(angleAt(pts, d));
      });
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    // Ground
    g.fillStyle(0x1e272e, 1); g.fillRect(0, 0, W, H);
    // Subtle grid
    g.lineStyle(1, 0x2f3b45, 0.5);
    for (let x = 0; x < W; x += 60) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 60) g.lineBetween(0, y, W, y);

    // Tracks (ballast, sleepers, rails)
    for (const tr of this.tracks) {
      const pts = tr.points;
      const trackLen = tr.kind === 'main' ? 1280 : 560;
      for (let d = 0; d < trackLen; d += 10) {
        const p = pointAt(pts, d);
        const a = angleAt(pts, d);
        const nx = -Math.sin(a), ny = Math.cos(a);
        // Ballast
        g.fillStyle(0x3d4750, 1);
        g.fillRect(p.x - 7, p.y - 7, 14, 14);
        // Sleepers
        g.lineStyle(2, 0x5a4a3a, 1);
        g.lineBetween(p.x + nx * 6, p.y + ny * 6, p.x - nx * 6, p.y - ny * 6);
      }
      // Rails
      g.lineStyle(2, 0x95a5a6, 1);
      for (const off of [-3, 3]) {
        const a0 = angleAt(pts, 0);
        const p0 = pointAt(pts, 0);
        const a1 = angleAt(pts, tr.kind === 'main' ? 1280 : 560);
        const p1 = pointAt(pts, tr.kind === 'main' ? 1280 : 560);
        g.lineBetween(p0.x - Math.sin(a0) * off, p0.y + Math.cos(a0) * off, p1.x - Math.sin(a1) * off, p1.y + Math.cos(a1) * off);
      }
    }

    // Platform surface + canopy
    for (let i = 0; i < 4; i++) {
      const y = PLATFORM_Y[i];
      const hovered = this.hoverPlatform === i;
      g.fillStyle(hovered ? 0x95a5a6 : 0x7f8c8d, 1);
      g.fillRect(PLATFORM_X0, y - 26, PLATFORM_X1 - PLATFORM_X0, 20);
      // Tactile edge
      g.fillStyle(0xf1c40f, 0.9);
      g.fillRect(PLATFORM_X0, y - 8, PLATFORM_X1 - PLATFORM_X0, 3);
      // Canopy pillars
      g.fillStyle(0x34495e, 1);
      for (let x = PLATFORM_X0 + 40; x < PLATFORM_X1; x += 120) g.fillRect(x, y - 50, 4, 24);
      // Canopy roof
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(PLATFORM_X0 + 20, y - 54, PLATFORM_X1 - PLATFORM_X0 - 40, 6);
    }

    // Curved connectors (route segments that aren't the main line or platforms)
    g.lineStyle(3, 0x4a5560, 1);
    for (const r of this.routes) {
      const pts = r.points;
      for (let k = 1; k < pts.length; k++) {
        g.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
      }
    }

    // Signals
    for (const sig of this.signals) {
      g.lineStyle(3, 0x7f8c8d, 1);
      g.lineBetween(sig.x, sig.y, sig.x, sig.y - 26);
      g.fillStyle(sig.state === 'green' ? 0x2ecc71 : 0xe74c3c, 1);
      g.fillCircle(sig.x, sig.y - 32, 8);
      g.lineStyle(2, 0x000, 0.6);
      g.strokeCircle(sig.x, sig.y - 32, 8);
      // Glow
      g.fillStyle(sig.state === 'green' ? 0x2ecc71 : 0xe74c3c, 0.25);
      g.fillCircle(sig.x, sig.y - 32, 14);
    }

    // Junction markers
    for (const jx of [JUNC_W, JUNC_E]) {
      g.fillStyle(0xf1c40f, 0.8);
      g.fillTriangle(jx - 9, MAIN_Y + 9, jx + 9, MAIN_Y + 9, jx, MAIN_Y - 9);
    }

    // Train label boxes
    for (const t of this.trains) {
      const pts = this.route(t.routeId).points;
      const p = pointAt(pts, t.progress);
      g.fillStyle(0x000000, 0.6);
      g.fillRect(p.x - 26, p.y - 48, 52, 14);
    }

    if (this.gameOver) {
      g.fillStyle(0x000, 0.75); g.fillRect(0, 0, W, H);
    }
    if (this.paused) {
      g.fillStyle(0x000, 0.5); g.fillRect(0, 0, W, H);
    }
  }

  private updateHud(): void {
    const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('score', `${this.score}`);
    set('served', `${this.served}`);
    set('crashes', `${this.crashes}`);
    set('time', `${Math.floor(this.elapsed)}`);
    set('trains', `${this.trains.length}`);
  }
}
