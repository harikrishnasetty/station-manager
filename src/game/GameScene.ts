import Phaser from 'phaser';
import type { Car, Route, Train, TrainState } from './types';
import {
  buildNetwork, pointAt, angleAt, W, H,
  PLATFORM_Y, PLATFORM_X0, PLATFORM_X1, MAIN_Y, MAIN_IN_Y,
  JUNC_W, JUNC_E, HOLD_PROGRESS,
} from './network';

interface TrainView {
  sprites: Phaser.GameObjects.Sprite[];
  offsets: number[];
  label: Phaser.GameObjects.Text;
  halo: Phaser.GameObjects.Graphics;
}

const STATE_TEXT: Record<TrainState, string> = {
  waiting: 'WAITING - assign platform',
  approaching: 'APPROACHING',
  docked: 'DOCKED',
  departing: 'DEPARTING',
};

export class GameScene extends Phaser.Scene {
  private routes!: Route[];
  private signals!: ReturnType<typeof buildNetwork>['signals'];
  private tracks!: ReturnType<typeof buildNetwork>['tracks'];
  private trains: Train[] = [];
  private views = new Map<string, TrainView>();
  private score = 0;
  private served = 0;
  private crashes = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnEvery = 7;
  private gfx!: Phaser.GameObjects.Graphics;
  private trainId = 0;
  private hoverPlatform: number | null = null;
  private selectedId: string | null = null;
  private paused = false;
  private gameOver = false;
  public lastCrash: { ids: string[]; positions: { x: number; y: number }[] } | null = null;
  private gameOverText!: Phaser.GameObjects.Text;
  private restartHint!: Phaser.GameObjects.Text;

  constructor() { super('game'); }

  create(): void {
    const net = buildNetwork();
    this.routes = net.routes;
    this.signals = net.signals;
    this.tracks = net.tracks;

    this.trains = [];
    this.views.clear();
    this.score = 0; this.served = 0; this.crashes = 0; this.elapsed = 0;
    this.spawnTimer = 0; this.spawnEvery = 7; this.trainId = 0;
    this.selectedId = null; this.paused = false; this.gameOver = false;

    this.cameras.main.setBackgroundColor('#1e272e');
    this.gfx = this.add.graphics().setDepth(1);

    this.add.text(20, MAIN_Y - 66, 'WEST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    this.add.text(W - 110, MAIN_Y - 66, 'EAST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    for (let i = 0; i < 4; i++) {
      this.add.text(PLATFORM_X0 + 6, PLATFORM_Y[i] - 60, `PLATFORM ${i + 1}`, { fontSize: '12px', color: '#ecf0f1', fontStyle: 'bold' });
    }

    this.gameOverText = this.add.text(W / 2, H / 2 - 40, '', {
      fontSize: '30px', color: '#ff6b6b', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setDepth(50).setVisible(false);
    this.restartHint = this.add.text(W / 2, H / 2 + 20, 'Press R to restart', {
      fontSize: '16px', color: '#ecf0f1',
    }).setOrigin(0.5).setDepth(50).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handleClick(p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.handleHover(p.x, p.y));
    this.input.keyboard?.on('keydown-SPACE', () => { if (!this.gameOver) this.paused = !this.paused; });
    this.input.keyboard?.on('keydown-R', () => { if (this.gameOver) this.scene.restart(); });

    this.spawnTrain();
    this.spawnTimer = -3;
  }

  private route(id: string): Route { return this.routes.find(r => r.id === id)!; }

  private spawnTrain(): void {
    const dir: 'west' | 'east' = Math.random() < 0.5 ? 'west' : 'east';
    // Never stack trains: block if a train is already waiting in this bay, or
    // if any train is sitting near the entry point of this side.
    const alreadyWaiting = this.trains.some(t => t.state === 'waiting' && t.direction === dir);
    const spawnX = dir === 'west' ? 0 : W;
    const conflict = this.trains.some(t => {
      const p = pointAt(this.route(t.routeId).points, t.progress);
      return Math.abs(p.x - spawnX) < 220 && Math.abs(p.y - MAIN_IN_Y) < 40;
    });
    if (alreadyWaiting || conflict) return;

    const freight = Math.random() < 0.35;
    const colors = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xe67e22];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const cars: Car[] = freight
      ? [
          { kind: 'loco', offset: 0, length: 60 },
          { kind: 'wagon', offset: 68, length: 52 },
          { kind: 'wagon', offset: 124, length: 52 },
          { kind: 'wagon', offset: 180, length: 52 },
        ]
      : [
          { kind: 'loco', offset: 0, length: 58 },
          { kind: 'coach', offset: 66, length: 54 },
          { kind: 'coach', offset: 124, length: 54 },
        ];
    const length = cars[cars.length - 1].offset + cars[cars.length - 1].length;

    const t: Train = {
      id: `T${this.trainId++}`,
      name: `${freight ? 'Freight' : 'Passenger'}`,
      state: 'waiting',
      direction: dir,
      routeId: dir === 'west' ? 'w2p0' : 'e2p0',
      progress: HOLD_PROGRESS,
      holdProgress: HOLD_PROGRESS,
      speed: 0,
      maxSpeed: freight ? 58 : 82,
      cars,
      length,
      color,
      platform: null,
      dwellTimer: 0,
      freight,
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
      const sp = this.add.sprite(0, 0, key).setDepth(12 + i).setScale(0.85);
      sprites.push(sp);
      offsets.push(car.offset);
    });
    const label = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#ffffff', backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(30);
    const halo = this.add.graphics().setDepth(11);
    this.views.set(t.id, { sprites, offsets, label, halo });
  }

  private removeTrain(id: string): void {
    const view = this.views.get(id);
    if (view) {
      view.sprites.forEach(s => s.destroy());
      view.label.destroy();
      view.halo.destroy();
      this.views.delete(id);
    }
    this.trains = this.trains.filter(t => t.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  }

  private handleHover(x: number, y: number): void {
    this.hoverPlatform = null;
    for (let i = 0; i < 4; i++) {
      if (y > PLATFORM_Y[i] - 70 && y < PLATFORM_Y[i] + 20 && x > PLATFORM_X0 && x < PLATFORM_X1) {
        this.hoverPlatform = i;
      }
    }
  }

  private handleClick(x: number, y: number): void {
    if (this.gameOver || this.paused) return;

    // 1) Select a train by clicking it (or its label area).
    for (const t of this.trains) {
      const p = pointAt(this.route(t.routeId).points, t.progress);
      if (Math.abs(x - p.x) < 40 && Math.abs(y - p.y) < 34) {
        this.selectedId = t.id;
        return;
      }
    }

    // 2) Toggle a signal.
    for (const sig of this.signals) {
      if (Math.hypot(x - sig.x, y - sig.y - 32) < 18) {
        sig.state = sig.state === 'red' ? 'green' : 'red';
        return;
      }
    }

    // 3) Assign a platform.
    for (let i = 0; i < 4; i++) {
      if (y > PLATFORM_Y[i] - 70 && y < PLATFORM_Y[i] + 20 && x > PLATFORM_X0 - 10 && x < PLATFORM_X1 + 10) {
        const occupied = this.trains.some(t => t.platform === i && (t.state === 'docked' || t.state === 'approaching' || t.state === 'departing'));
        if (occupied) return;
        let train = this.selectedId ? this.trains.find(t => t.id === this.selectedId && t.state === 'waiting') : undefined;
        if (!train) {
          train = this.trains.filter(t => t.state === 'waiting')
            .sort((a, b) => (b.holdProgress - b.progress) - (a.holdProgress - a.progress))[0];
        }
        if (train) {
          train.platform = i;
          train.routeId = `${train.direction === 'west' ? 'w' : 'e'}2p${i}`;
          train.state = 'approaching';
          this.selectedId = null;
        }
        return;
      }
    }
  }

  private signalForRoute(routeId: string): boolean {
    return this.signals.filter(s => s.routes.includes(routeId)).every(s => s.state === 'green');
  }

  private sideOf(t: Train): 'west' | 'east' {
    return t.routeId.startsWith('w2p') || t.routeId.endsWith('2w') ? 'west' : 'east';
  }

  update(_time: number, dt: number): void {
    if (this.gameOver) return;
    const seconds = Math.min(dt, 100) / 1000;
    if (this.paused) { this.syncViews(); this.draw(); return; }

    this.elapsed += seconds;
    this.spawnTimer += seconds;
    if (this.spawnTimer > this.spawnEvery) {
      this.spawnTimer = 0;
      this.spawnTrain();
      this.spawnEvery = Math.max(4, this.spawnEvery - 0.12);
    }

    for (const t of this.trains) {
      const route = this.route(t.routeId);
      const L = route.length;
      const side = this.sideOf(t);

      if (t.state === 'waiting') {
        t.progress = t.holdProgress;
        t.speed = 0;
        continue;
      }

      if (t.state === 'approaching' || t.state === 'departing') {
        // One train at a time through each station throat.
        const throatBusy = this.trains.some(o => {
          if (o === t || this.sideOf(o) !== side) return false;
          if (o.state === 'approaching') return o.progress > HOLD_PROGRESS + 60;
          if (o.state === 'departing') return o.progress > 60 && o.progress < this.route(o.routeId).length - 80;
          return false;
        });
        const clear = this.signalForRoute(t.routeId) && !throatBusy;
        if (clear) t.speed = Math.min(t.speed + 46 * seconds, t.maxSpeed);
        else t.speed = Math.max(t.speed - 150 * seconds, 0);
        t.progress += t.speed * seconds;
        if (!clear) { t.progress = Math.max(0, t.progress - 0); t.speed = 0; }

        if (t.state === 'approaching' && t.progress >= L - 8) {
          t.progress = L - 8;
          t.speed = 0;
          t.state = 'docked';
          t.dwellTimer = 4 + Math.random() * 3;
          this.score += 50;
          // Arm the departure signal red so the player must release it.
          const out = this.signals.find(s => s.id === `sig-p${t.platform}-out`);
          if (out) out.state = 'red';
        }

        if (t.state === 'departing' && t.progress >= L + 12) {
          this.served++;
          this.score += 100;
          this.removeTrain(t.id);
          continue;
        }
      } else if (t.state === 'docked') {
        t.dwellTimer -= seconds;
        if (t.dwellTimer <= 0) {
          t.state = 'departing';
          t.routeId = `${t.direction === 'west' ? 'p' + t.platform + '2e' : 'p' + t.platform + '2w'}`;
          t.progress = 8;
          t.speed = 0;
        }
      }
    }

    // Collision detection — both trains are removed with visual feedback.
    const pts: { id: string; x: number; y: number }[] = this.trains.map(t => {
      const p = pointAt(this.route(t.routeId).points, t.progress);
      return { id: t.id, x: p.x, y: p.y };
    });
    let crash: [string, string] | null = null;
    for (let i = 0; i < pts.length && !crash; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 20) {
          crash = [pts[i].id, pts[j].id];
          break;
        }
      }
    }
    if (crash) {
      this.crashes++;
      this.lastCrash = {
        ids: crash,
        positions: crash.map(id => {
          const t = this.trains.find(x => x.id === id);
          return t ? pointAt(this.route(t.routeId).points, t.progress) : { x: 0, y: 0 };
        }),
      };
      this.flashCrash(crash);
      this.removeTrain(crash[0]);
      this.removeTrain(crash[1]);
      if (this.crashes >= 5) {
        this.gameOver = true;
        this.gameOverText.setText(`SHIFT ENDED\n${this.served} trains served  |  Score ${this.score}`);
        this.gameOverText.setVisible(true);
        this.restartHint.setVisible(true);
      }
    }

    this.syncViews();
    this.draw();
    this.updateHud();
  }

  private flashCrash(ids: string[]): void {
    for (const id of ids) {
      const p = pointAt(this.route(this.trains.find(t => t.id === id)!.routeId).points, this.trains.find(t => t.id === id)!.progress);
      const ring = this.add.graphics().setDepth(40);
      ring.lineStyle(3, 0xff4757, 1);
      ring.strokeCircle(p.x, p.y, 16);
      ring.fillStyle(0xff4757, 0.4);
      ring.fillCircle(p.x, p.y, 16);
      this.tweens.add({
        targets: ring, alpha: 0, scale: 2.2, duration: 450,
        onComplete: () => ring.destroy(),
      });
    }
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
      const head = pointAt(pts, t.progress);
      view.label.setPosition(head.x, head.y - 34);
      const sel = t.id === this.selectedId;
      let txt = STATE_TEXT[t.state] + (t.platform !== null ? '  P' + (t.platform + 1) : '');
      if (t.state === 'docked' && t.dwellTimer <= 0) txt = 'READY - open OUT signal';
      if (t.state === 'waiting') txt = 'WAITING - click me, then a platform';
      view.label.setText(`${t.id}  ${txt}`);
      view.label.setColor(sel ? '#ffeaa7' : '#ffffff');
      view.halo.clear();
      if (sel) {
        view.halo.lineStyle(2, 0xffeaa7, 0.9);
        view.halo.strokeCircle(head.x, head.y, 34);
      }
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x1e272e, 1); g.fillRect(0, 0, W, H);
    g.lineStyle(1, 0x2f3b45, 0.5);
    for (let x = 0; x < W; x += 60) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 60) g.lineBetween(0, y, W, y);

    for (const tr of this.tracks) {
      const pts = tr.points;
      const trackLen = tr.kind === 'main' ? 1280 : 560;
      for (let d = 0; d < trackLen; d += 10) {
        const p = pointAt(pts, d);
        const a = angleAt(pts, d);
        const nx = -Math.sin(a), ny = Math.cos(a);
        g.fillStyle(0x3d4750, 1); g.fillRect(p.x - 7, p.y - 7, 14, 14);
        g.lineStyle(2, 0x5a4a3a, 1);
        g.lineBetween(p.x + nx * 6, p.y + ny * 6, p.x - nx * 6, p.y - ny * 6);
      }
      g.lineStyle(2, 0x95a5a6, 1);
      for (const off of [-3, 3]) {
        const a0 = angleAt(pts, 0), p0 = pointAt(pts, 0);
        const a1 = angleAt(pts, trackLen), p1 = pointAt(pts, trackLen);
        g.lineBetween(p0.x - Math.sin(a0) * off, p0.y + Math.cos(a0) * off, p1.x - Math.sin(a1) * off, p1.y + Math.cos(a1) * off);
      }
    }

    for (let i = 0; i < 4; i++) {
      const y = PLATFORM_Y[i];
      const hovered = this.hoverPlatform === i;
      g.fillStyle(hovered ? 0x95a5a6 : 0x7f8c8d, 1);
      g.fillRect(PLATFORM_X0, y - 26, PLATFORM_X1 - PLATFORM_X0, 20);
      g.fillStyle(0xf1c40f, 0.9); g.fillRect(PLATFORM_X0, y - 8, PLATFORM_X1 - PLATFORM_X0, 3);
      g.fillStyle(0x34495e, 1);
      for (let x = PLATFORM_X0 + 40; x < PLATFORM_X1; x += 120) g.fillRect(x, y - 50, 4, 24);
      g.fillStyle(0x2c3e50, 1); g.fillRect(PLATFORM_X0 + 20, y - 54, PLATFORM_X1 - PLATFORM_X0 - 40, 6);
    }

    g.lineStyle(3, 0x4a5560, 1);
    for (const r of this.routes) {
      const pts = r.points;
      for (let k = 1; k < pts.length; k++) g.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
    }

    for (const sig of this.signals) {
      g.lineStyle(3, 0x7f8c8d, 1); g.lineBetween(sig.x, sig.y, sig.x, sig.y - 26);
      const col = sig.state === 'green' ? 0x2ecc71 : 0xe74c3c;
      g.fillStyle(col, 0.25); g.fillCircle(sig.x, sig.y - 32, 14);
      g.fillStyle(col, 1); g.fillCircle(sig.x, sig.y - 32, 8);
      g.lineStyle(2, 0x000, 0.6); g.strokeCircle(sig.x, sig.y - 32, 8);
    }

    for (const jx of [JUNC_W, JUNC_E]) {
      g.fillStyle(0xf1c40f, 0.8);
      g.fillTriangle(jx - 9, MAIN_Y + 9, jx + 9, MAIN_Y + 9, jx, MAIN_Y - 9);
    }

    // Waiting bays marker
    g.lineStyle(2, 0x3498db, 0.6);
    g.strokeRect(60, MAIN_IN_Y - 16, 150, 32);
    g.strokeRect(W - 210, MAIN_IN_Y - 16, 150, 32);

    if (this.paused) { g.fillStyle(0x000, 0.5); g.fillRect(0, 0, W, H); }
  }

  private updateHud(): void {
    const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('score', `${this.score}`);
    set('served', `${this.served}`);
    set('crashes', `${this.crashes}`);
    set('time', `${Math.floor(this.elapsed)}`);
    set('trains', `${this.trains.length}`);
    set('waiting', `${this.trains.filter(t => t.state === 'waiting').length}`);
  }
}
