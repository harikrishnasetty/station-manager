import Phaser from 'phaser';
import type { Car, Route, Train, TrainState } from './types';
import {
  buildNetwork, pointAt, angleAt, W, H,
  PLATFORM_Y, PLATFORM_X0, PLATFORM_X1, MAIN_Y, MAIN_IN_Y,
  HOLD_PROGRESS,
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
  /** Only one train at a time may occupy each station throat. */
  private throatOwner: { west: string | null; east: string | null } = { west: null, east: null };
  private gameOverText!: Phaser.GameObjects.Text;
  private groundPatches: { x: number; y: number; r: number; c: number }[] = [];
  private trees: { x: number; y: number }[] = [];
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
    this.throatOwner = { west: null, east: null };

    // Deterministic scenery so the ground looks the same every frame.
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 220; i++) {
      const c = [0x25332b, 0x2b3a30, 0x30402f, 0x213027][Math.floor(rnd() * 4)];
      this.groundPatches.push({ x: rnd() * W, y: rnd() * H, r: 12 + rnd() * 46, c });
    }
    for (let i = 0; i < 22; i++) {
      const x = rnd() * W, y = rnd() * H;
      // Keep trees off the tracks and platforms.
      if (y > 100 && y < 570 && x > 150 && x < 1130) continue;
      if (y > 300 && y < 380) continue;
      this.trees.push({ x, y });
    }

    this.cameras.main.setBackgroundColor('#1e272e');
    this.gfx = this.add.graphics().setDepth(1);

    this.add.text(20, MAIN_Y - 66, 'WEST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    this.add.text(W - 110, MAIN_Y - 66, 'EAST MAIN', { fontSize: '11px', color: '#7f8c8d' });
    this.add.text(70, MAIN_IN_Y - 78, 'WEST BAY', { fontSize: '11px', color: '#81ecec' });
    this.add.text(W - 200, MAIN_IN_Y - 78, 'EAST BAY', { fontSize: '11px', color: '#81ecec' });
    for (let i = 0; i < 4; i++) {
      this.add.text(PLATFORM_X0 + 6, PLATFORM_Y[i] - 60, `PLATFORM ${i + 1}`, { fontSize: '12px', color: '#ecf0f1', fontStyle: 'bold' });
    }

    // Signal labels next to each head
    for (const sig of this.signals) {
      this.add.text(sig.x, sig.y - 48, sig.label, { fontSize: '9px', color: '#bdc3c7' }).setOrigin(0.5);
    }

    this.add.text(640, 578, 'CENTRAL STATION', { fontSize: '15px', color: '#f1c40f', fontStyle: 'bold', letterSpacing: 2 }).setOrigin(0.5);
    this.add.text(640, 664, 'CONCOURSE  •  4 PLATFORMS', { fontSize: '10px', color: '#7f8c8d' }).setOrigin(0.5);

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
      blocked: false,
      exitLocked: false,
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
      const sp = this.add.sprite(0, 0, key).setDepth(12 + i).setScale(1.15);
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

    // Signals: generous hitbox over the post + head so they're easy to click.
    for (const sig of this.signals) {
      if (Math.abs(x - sig.x) < 16 && y > sig.y - 44 && y < sig.y + 6) {
        this.setSignal(sig.id, sig.state === 'red' ? 'green' : 'red');
        return;
      }
    }
  }

  private sideOf(t: Train): 'west' | 'east' {
    return t.routeId.startsWith('w2p') || t.routeId.endsWith('2w') ? 'west' : 'east';
  }

  private sig(id: string) { return this.signals.find(s => s.id === id); }

  /** Change an aspect and stamp the time so green is visibly held. */
  private setSignal(id: string, state: 'red' | 'green'): void {
    const s = this.sig(id);
    if (s && s.state !== state) { s.state = state; s.changedAt = this.elapsed; }
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

    // Throat token: release finished trains, then grant to the first waiter.
    for (const side of ['west', 'east'] as const) {
      const owner = this.throatOwner[side];
      if (owner) {
        const t = this.trains.find(x => x.id === owner);
        if (!t || t.state === 'docked' || t.state === 'waiting') this.throatOwner[side] = null;
      }
    }
    for (const t of this.trains) {
      if (t.state !== 'approaching' && t.state !== 'departing') continue;
      const side = this.sideOf(t);
      if (this.throatOwner[side] === null) this.throatOwner[side] = t.id;
    }

    // A waiting train is routed automatically: main signal for its side GREEN
    // + that platform's signal on the same side GREEN (held briefly so the
    // green is clearly visible) -> set the route. Signals lock red on arrival.
    const GREEN_DWELL = 0.4;
    for (const t of this.trains) {
      if (t.state !== 'waiting') continue;
      const code = t.direction === 'west' ? 'w' : 'e';
      const end = code === 'w' ? 'left' : 'right';
      const mainId = code === 'w' ? 'sig-w' : 'sig-e';
      const main = this.sig(mainId);
      if (main?.state !== 'green' || this.elapsed - main.changedAt < GREEN_DWELL) continue;
      for (let p = 0; p < 4; p++) {
        const entry = this.sig(`sig-p${p}-${end}`);
        if (entry?.state !== 'green' || this.elapsed - entry.changedAt < GREEN_DWELL) continue;
        const occupied = this.trains.some(o => o.platform === p &&
          (o.state === 'approaching' || o.state === 'docked' || o.state === 'departing'));
        if (occupied) continue;
        t.platform = p;
        t.routeId = `${code}2p${p}`;
        t.state = 'approaching';
        break;
      }
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
        // Authority was already granted when the route was set; the throat
        // token alone governs movement now.
        const clear = this.throatOwner[side] === t.id;
        t.blocked = !clear;
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
          // Train is in the platform: entry, exit and approach main go red.
          if (t.platform !== null) {
            this.setSignal(t.direction === 'west' ? 'sig-w' : 'sig-e', 'red');
            this.setSignal(`sig-p${t.platform}-left`, 'red');
            this.setSignal(`sig-p${t.platform}-right`, 'red');
          }
        }

        if (t.state === 'departing' && !t.exitLocked && t.progress > 80 && t.platform !== null) {
          // The train has cleared the platform signal: lock that side's main.
          this.setSignal(t.direction === 'west' ? 'sig-e' : 'sig-w', 'red');
          this.setSignal(`sig-p${t.platform}-left`, 'red');
          this.setSignal(`sig-p${t.platform}-right`, 'red');
          t.exitLocked = true;
        }

        if (t.state === 'departing' && t.progress >= L + 12) {
          this.served++;
          this.score += 100;
          this.removeTrain(t.id);
          continue;
        }
      } else if (t.state === 'docked') {
        t.dwellTimer -= seconds;
        if (t.dwellTimer <= 0 && t.platform !== null) {
          // Exit toward the opposite side from which it arrived.
          const exitEnd = t.direction === 'west' ? 'right' : 'left';
          const exitId = `sig-p${t.platform}-${exitEnd}`;
          const exitSig = this.sig(exitId);
          // Hold green briefly so the aspect is clearly visible before departure.
          if (exitSig?.state !== 'green' || this.elapsed - exitSig.changedAt < GREEN_DWELL) {
            t.blocked = true;
            continue;
          }
          // Leave the exit signal green while the train pulls away; the main
          // on that side locks red once it clears the platform (see above).
          t.state = 'departing';
          t.routeId = `${t.direction === 'west' ? 'p' + t.platform + '2e' : 'p' + t.platform + '2w'}`;
          t.progress = 8;
          t.speed = 0;
          t.exitLocked = false;
          t.blocked = false;
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
      if (t.blocked && (t.state === 'approaching' || t.state === 'departing')) txt = 'STOPPED - red light or path busy';
      if (t.state === 'docked' && t.dwellTimer <= 0) {
        const exitEnd = t.direction === 'west' ? 'RIGHT' : 'LEFT';
        txt = `READY - open P${(t.platform ?? 0) + 1}-${exitEnd} signal to depart`;
      }
      if (t.state === 'waiting') txt = 'WAITING - open main W/E + platform signal';
      view.label.setText(`${t.id}  ${txt}`);
      view.label.setColor(t.blocked ? '#ff7675' : sel ? '#ffeaa7' : '#ffffff');
      view.halo.clear();
      // Headlight beam ahead of the leading car.
      const ang = angleAt(pts, t.progress);
      const hx = head.x + Math.cos(ang) * 26, hy = head.y + Math.sin(ang) * 26;
      view.halo.fillStyle(0xfff3b0, 0.16); view.halo.fillCircle(hx, hy, 22);
      view.halo.fillStyle(0xfff9d6, 0.28); view.halo.fillCircle(hx, hy, 10);
      if (sel) {
        view.halo.lineStyle(2, 0xffeaa7, 0.9);
        view.halo.strokeCircle(head.x, head.y, 34);
      }
    }
  }

  /** Sample a centre line and stroke it with a lateral offset (for rails). */
  private strokeLine(
    g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[],
    width: number, color: number, alpha: number, offset = 0,
  ): void {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const samples: Phaser.Math.Vector2[] = [];
    for (let d = 0; d <= total; d += 4) {
      const p = pointAt(pts, d);
      const a = angleAt(pts, Math.min(total - 0.01, Math.max(0.01, d)));
      samples.push(new Phaser.Math.Vector2(p.x - Math.sin(a) * offset, p.y + Math.cos(a) * offset));
    }
    const end = pts[pts.length - 1];
    const ea = angleAt(pts, total - 0.01);
    samples.push(new Phaser.Math.Vector2(end.x - Math.sin(ea) * offset, end.y + Math.cos(ea) * offset));
    g.lineStyle(width, color, alpha);
    g.strokePoints(samples, false, false);
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    // Ground: dark grass with soft, deterministic patches.
    g.fillStyle(0x1b2a22, 1); g.fillRect(0, 0, W, H);
    for (const p of this.groundPatches) {
      g.fillStyle(p.c, 0.35); g.fillCircle(p.x, p.y, p.r);
    }
    g.lineStyle(1, 0x32443a, 0.25);
    for (let x = 0; x < W; x += 80) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 80) g.lineBetween(0, y, W, y);

    // Tracks: ballast bed, sleepers, twin rails with specular highlights.
    for (const tr of this.tracks) {
      const pts = tr.points;
      // Ballast shoulder + core
      this.strokeLine(g, pts, 22, 0x171d23, 1);
      this.strokeLine(g, pts, 18, 0x39424b, 1);
      this.strokeLine(g, pts, 14, 0x4a535d, 1);
      // Sleepers
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      for (let d = 0; d <= total; d += 9) {
        const p = pointAt(pts, d);
        const a = angleAt(pts, Math.min(total - 0.01, Math.max(0.01, d)));
        const nx = -Math.sin(a), ny = Math.cos(a);
        g.lineStyle(3, 0x5b4632, 1);
        g.lineBetween(p.x + nx * 8, p.y + ny * 8, p.x - nx * 8, p.y - ny * 8);
        g.lineStyle(1, 0x3a2c1f, 0.8);
        g.lineBetween(p.x + nx * 7, p.y + ny * 7 + 1, p.x - nx * 7, p.y - ny * 7 + 1);
      }
      // Rails
      for (const off of [-4, 4]) {
        this.strokeLine(g, pts, 3.2, 0x6d7c88, 1, off);
        this.strokeLine(g, pts, 1.4, 0xd7e3ec, 0.95, off);
      }
    }

    // Curved connectors: ballast + rails along every route polyline.
    for (const r of this.routes) {
      const pts = r.points;
      this.strokeLine(g, pts, 16, 0x39424b, 0.9);
      this.strokeLine(g, pts, 12, 0x46505a, 1);
      for (const off of [-3.5, 3.5]) this.strokeLine(g, pts, 2.4, 0xb9c7d2, 0.9, off);
    }

    // Trees behind the station
    for (const t of this.trees) {
      g.fillStyle(0x0c1710, 0.35); g.fillEllipse(t.x + 3, t.y + 18, 26, 9);
      g.fillStyle(0x5a3d2b, 1); g.fillRect(t.x - 3, t.y + 2, 6, 16);
      g.fillStyle(0x1d5a2b, 1); g.fillCircle(t.x, t.y, 17);
      g.fillStyle(0x2a7d38, 1); g.fillCircle(t.x - 6, t.y - 5, 12);
      g.fillStyle(0x3ea34a, 1); g.fillCircle(t.x + 7, t.y - 6, 11);
      g.fillStyle(0x66c96f, 0.7); g.fillCircle(t.x - 2, t.y - 12, 7);
    }

    // Platforms: concrete deck, tactile edge, canopy, benches, lamps.
    for (let i = 0; i < 4; i++) {
      const y = PLATFORM_Y[i];
      const hovered = this.hoverPlatform === i;
      const px = PLATFORM_X0, pw = PLATFORM_X1 - PLATFORM_X0;
      // Platform shadow + deck
      g.fillStyle(0x0d141a, 0.5); g.fillRect(px, y - 24, pw, 22);
      g.fillStyle(hovered ? 0xa9b4bd : 0x8d98a2, 1); g.fillRect(px, y - 26, pw, 20);
      g.fillStyle(0xb7c1c9, 1); g.fillRect(px, y - 26, pw, 3);
      g.fillStyle(0x6e7982, 1); g.fillRect(px, y - 9, pw, 3);
      // Tactile strip
      g.fillStyle(0xf1c40f, 0.95); g.fillRect(px, y - 7, pw, 3);
      for (let x = px + 2; x < px + pw; x += 12) { g.fillStyle(0x8a6d12, 0.6); g.fillRect(x, y - 7, 2, 3); }
      // Canopy columns and roof with trim
      g.fillStyle(0x2f3d49, 1);
      for (let x = px + 50; x < px + pw - 20; x += 130) {
        g.fillRect(x, y - 52, 5, 28);
        g.fillStyle(0x1f2a33, 1); g.fillRect(x - 3, y - 25, 11, 3);
        g.fillStyle(0x2f3d49, 1);
      }
      g.fillStyle(0x27343f, 1); g.fillRect(px + 20, y - 58, pw - 40, 7);
      g.fillStyle(0x3c4d5b, 1); g.fillRect(px + 20, y - 58, pw - 40, 2);
      g.fillStyle(0x162029, 1); g.fillRect(px + 20, y - 51, pw - 40, 2);
      // Bench
      g.fillStyle(0x5b4632, 1); g.fillRect(px + 90, y - 22, 34, 4);
      g.fillStyle(0x4a3928, 1); g.fillRect(px + 92, y - 18, 3, 5); g.fillRect(px + 119, y - 18, 3, 5);
      // Lamp posts
      g.fillStyle(0x24323d, 1); g.fillRect(px + 30, y - 50, 3, 24);
      g.fillStyle(0xffeaa7, 0.85); g.fillCircle(px + 31, y - 51, 3);
      // Platform number board
      g.fillStyle(0x101820, 1); g.fillRoundedRect(px + pw - 46, y - 50, 30, 16, 2);
      g.fillStyle(0xf1c40f, 1); g.fillRect(px + pw - 43, y - 47, 24, 2);
    }

    for (const sig of this.signals) {
      // Post + signal head housing
      g.lineStyle(4, 0x1a2229, 1); g.lineBetween(sig.x, sig.y, sig.x, sig.y - 26);
      g.lineStyle(2, 0x6b7883, 1); g.lineBetween(sig.x, sig.y - 2, sig.x, sig.y - 24);
      g.fillStyle(0x0e151b, 1); g.fillRoundedRect(sig.x - 11, sig.y - 43, 22, 22, 5);
      g.fillStyle(0x2c3943, 1); g.fillRoundedRect(sig.x - 9, sig.y - 41, 18, 18, 4);
      const green = sig.state === 'green';
      const col = green ? 0x2ecc71 : 0xe74c3c;
      // Soft halo, brighter and gently pulsing while green.
      const pulse = green ? 0.28 + 0.12 * Math.sin(this.elapsed * 5) : 0.18;
      g.fillStyle(col, pulse); g.fillCircle(sig.x, sig.y - 32, green ? 17 : 13);
      g.fillStyle(col, 1); g.fillCircle(sig.x, sig.y - 32, 8);
      g.fillStyle(0xffffff, green ? 0.5 : 0.15); g.fillCircle(sig.x - 2, sig.y - 34, 2.5);
      g.lineStyle(2, 0x000, 0.6); g.strokeCircle(sig.x, sig.y - 32, 8);
    }

    // Station building / concourse
    g.fillStyle(0x0b1117, 0.5); g.fillRect(508, 606, 264, 56);
    g.fillStyle(0x2b3945, 1); g.fillRect(520, 598, 240, 58);
    g.fillStyle(0x3b4c5b, 1); g.fillRect(520, 598, 240, 8);
    // Roof with overhang and ridge
    g.fillStyle(0x1e2b35, 1); g.fillRect(498, 590, 284, 12);
    g.fillStyle(0x46596a, 1); g.fillRect(498, 590, 284, 3);
    g.fillStyle(0x121b23, 1); g.fillRect(498, 601, 284, 2);
    // Windows
    g.fillStyle(0xf7d774, 0.9);
    for (let x = 538; x < 746; x += 30) { g.fillRect(x, 612, 18, 14); }
    g.fillStyle(0xffffff, 0.22);
    for (let x = 539; x < 747; x += 30) g.fillRect(x, 613, 4, 12);
    // Entrance doors
    g.fillStyle(0x10202b, 1); g.fillRect(626, 626, 28, 30);
    g.fillStyle(0x81ecec, 0.7); g.fillRect(629, 629, 9, 12); g.fillRect(642, 629, 9, 12);
    g.fillStyle(0xf1c40f, 1); g.fillRect(636, 618, 8, 3);

    // Turnout throat markers at the start of each fan.
    for (const jx of [40, W - 40]) {
      g.fillStyle(0xf1c40f, 0.8);
      g.fillTriangle(jx - 9, MAIN_Y + 9, jx + 9, MAIN_Y + 9, jx, MAIN_Y - 9);
    }

    // Arrival (upper) and departure (lower) main line legend
    g.fillStyle(0x95a5a6, 1);
    g.fillRect(20, MAIN_IN_Y - 3, 18, 2);
    g.fillRect(20, 352 - 3, 18, 2);

    // Waiting bays
    g.lineStyle(2, 0x3498db, 0.9);
    g.strokeRect(40, MAIN_IN_Y - 20, 170, 40);
    g.strokeRect(W - 210, MAIN_IN_Y - 20, 170, 40); 
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
