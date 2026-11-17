import Phaser from 'phaser';

function g(scene: Phaser.Scene): Phaser.GameObjects.Graphics { return scene.make.graphics({}); }

function lighten(color: number, amt: number): number {
  const r = Math.min(255, ((color >> 16) & 255) + amt);
  const g0 = Math.min(255, ((color >> 8) & 255) + amt);
  const b = Math.min(255, (color & 255) + amt);
  return (r << 16) | (g0 << 8) | b;
}
function darken(color: number, amt: number): number {
  const r = Math.max(0, ((color >> 16) & 255) - amt);
  const g0 = Math.max(0, ((color >> 8) & 255) - amt);
  const b = Math.max(0, (color & 255) - amt);
  return (r << 16) | (g0 << 8) | b;
}

function wheels(gr: Phaser.GameObjects.Graphics, L: number, W: number): void {
  gr.fillStyle(0x11171c, 1);
  for (const bx of [14, L - 20]) {
    gr.fillRoundedRect(bx - 1, -3, 16, W + 6, 3);
    gr.fillStyle(0x2c363f, 1);
    gr.fillCircle(bx + 2, 0, 3); gr.fillCircle(bx + 12, 0, 3);
    gr.fillCircle(bx + 2, W, 3); gr.fillCircle(bx + 12, W, 3);
    gr.fillStyle(0x11171c, 1);
    gr.fillCircle(bx + 2, 0, 1.3); gr.fillCircle(bx + 12, 0, 1.3);
    gr.fillCircle(bx + 2, W, 1.3); gr.fillCircle(bx + 12, W, 1.3);
  }
}

/** Diesel locomotive — top-down, facing right. */
export function makeLoco(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 84, W = 28;
  // Drop shadow
  gr.fillStyle(0x000000, 0.28); gr.fillRoundedRect(3, 4, L, W, 6);

  // Chassis / bogie frame
  gr.fillStyle(0x161d24, 1); gr.fillRoundedRect(-2, -2, L + 4, W + 4, 4);
  wheels(gr, L, W);

  // Main body with subtle two-tone
  gr.fillStyle(darken(color, 35), 1); gr.fillRoundedRect(0, 0, L, W, 5);
  gr.fillStyle(color, 1); gr.fillRoundedRect(0, 1, L, W - 4, 5);
  gr.fillStyle(lighten(color, 28), 1); gr.fillRect(4, 3, L - 8, 2);

  // Roof
  gr.fillStyle(0x2b3946, 1); gr.fillRoundedRect(8, 5, L - 20, W - 10, 3);
  gr.fillStyle(0x3c4d5e, 1); gr.fillRoundedRect(10, 6, L - 24, W - 12, 2);
  // Radiator fans
  gr.fillStyle(0x141c24, 1);
  for (const fx of [20, 34]) { gr.fillCircle(fx, W / 2, 4.5); }
  gr.lineStyle(1, 0x6b7d8f, 0.8);
  for (const fx of [20, 34]) { gr.strokeCircle(fx, W / 2, 4.5); }
  // Roof handrails
  gr.lineStyle(1, 0x9fb0c0, 0.6);
  gr.lineBetween(12, 8, L - 16, 8); gr.lineBetween(12, W - 8, L - 16, W - 8);

  // Cab (front third)
  gr.fillStyle(0x1f2b36, 1); gr.fillRoundedRect(L - 30, 3, 22, W - 6, 3);
  // Windshield glazing with reflection
  gr.fillStyle(0x8ecfe8, 0.95); gr.fillRoundedRect(L - 27, 5, 15, W - 10, 2);
  gr.fillStyle(0xffffff, 0.28); gr.fillRect(L - 26, 6, 4, W - 12);
  // Side cab windows
  gr.fillStyle(0x8ecfe8, 0.8);
  gr.fillRect(L - 10, 4, 4, 6); gr.fillRect(L - 10, W - 10, 4, 6);

  // Nose: yellow warning panel + stripes
  gr.fillStyle(0xf1c40f, 1); gr.fillRoundedRect(L - 8, 3, 7, W - 6, 2);
  gr.fillStyle(0x1a1a1a, 1); gr.fillRect(L - 6, 4, 2, W - 8);
  gr.fillStyle(0xf1c40f, 1); gr.fillRect(L - 3, 6, 2, 4); gr.fillRect(L - 3, W - 10, 2, 4);
  // Headlights
  gr.fillStyle(0xfff3b0, 1); gr.fillCircle(L - 1, 8, 2.4); gr.fillCircle(L - 1, W - 8, 2.4);
  gr.fillStyle(0xffffff, 0.9); gr.fillCircle(L - 1, 8, 1.1); gr.fillCircle(L - 1, W - 8, 1.1);
  // Coupler
  gr.fillStyle(0x0f151a, 1); gr.fillRect(L - 1, W / 2 - 2, 5, 4);

  // Side livery stripes
  gr.fillStyle(lighten(color, 60), 0.7); gr.fillRect(6, 6, L - 36, 2); gr.fillRect(6, W - 8, L - 36, 2);
  // Number panel
  gr.fillStyle(0xf5f6fa, 0.9); gr.fillRoundedRect(10, 9, 12, W - 18, 1);

  gr.generateTexture(key, L + 6, W + 8);
  gr.destroy();
}

/** Streamlined express locomotive — sleeker, silver with a cyan stripe. */
export function makeExpress(scene: Phaser.Scene, key: string): void {
  const gr = g(scene);
  const L = 84, W = 28;
  gr.fillStyle(0x000000, 0.28); gr.fillRoundedRect(3, 4, L, W, 6);
  gr.fillStyle(0x161d24, 1); gr.fillRoundedRect(-2, -2, L + 4, W + 4, 4);
  wheels(gr, L, W);
  // Sleek body
  gr.fillStyle(0x8f9fa8, 1); gr.fillRoundedRect(0, 0, L, W, 7);
  gr.fillStyle(0xc7d2d9, 1); gr.fillRoundedRect(0, 1, L, W - 4, 7);
  gr.fillStyle(0xffffff, 0.45); gr.fillRect(5, 3, L - 12, 2);
  // Cyan speed stripe
  gr.fillStyle(0x00bcd4, 1); gr.fillRect(6, W / 2 - 2, L - 20, 4);
  gr.fillStyle(0x81ecec, 0.7); gr.fillRect(6, W / 2 - 2, L - 20, 1);
  // Tapered aerodynamic nose
  gr.fillStyle(0x2b3a46, 1); gr.fillRoundedRect(L - 22, 3, 21, W - 6, 6);
  gr.fillStyle(0x86dff0, 0.95); gr.fillRoundedRect(L - 18, 5, 13, W - 10, 3);
  gr.fillStyle(0xffffff, 0.3); gr.fillRect(L - 17, 6, 4, W - 12);
  // Headlights
  gr.fillStyle(0xe8ffff, 1); gr.fillCircle(L - 2, 8, 2.6); gr.fillCircle(L - 2, W - 8, 2.6);
  // Roof equipment
  gr.fillStyle(0x3b4d5b, 1); gr.fillRoundedRect(12, 7, 26, W - 14, 3);
  gr.lineStyle(1, 0x81ecec, 0.6); gr.lineBetween(14, 9, 36, 9);
  gr.generateTexture(key, L + 6, W + 8);
  gr.destroy();
}

/** Passenger coach. */
export function makeCoach(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 68, W = 26;
  gr.fillStyle(0x000000, 0.28); gr.fillRoundedRect(3, 4, L, W, 4);
  gr.fillStyle(0x161d24, 1); gr.fillRoundedRect(-2, -2, L + 4, W + 4, 3);
  wheels(gr, L, W);

  gr.fillStyle(darken(color, 24), 1); gr.fillRoundedRect(0, 0, L, W, 4);
  gr.fillStyle(color, 1); gr.fillRoundedRect(0, 1, L, W - 4, 4);
  gr.fillStyle(lighten(color, 34), 1); gr.fillRect(4, 3, L - 8, 2);

  // Roof
  gr.fillStyle(0x3b4a58, 1); gr.fillRoundedRect(5, 5, L - 10, W - 10, 2);
  gr.fillStyle(0x2b3844, 1); gr.fillRect(10, 7, 16, W - 14);
  gr.fillStyle(0x2b3844, 1); gr.fillRect(L - 26, 7, 16, W - 14);
  // Roof ribs
  gr.lineStyle(1, 0x64788a, 0.5);
  for (let x = 30; x < L - 28; x += 6) gr.lineBetween(x, 7, x, W - 7);

  // Windows
  gr.fillStyle(0x86cbe6, 0.95);
  for (let x = 12; x < L - 14; x += 10) {
    if (x > L - 30 && x < L - 18) continue; // door gap
    gr.fillRoundedRect(x, 5, 7, 5, 1);
    gr.fillRoundedRect(x, W - 10, 7, 5, 1);
  }
  gr.fillStyle(0xffffff, 0.25);
  for (let x = 13; x < L - 14; x += 10) gr.fillRect(x, 6, 2, 3);

  // Doors
  gr.fillStyle(0x22313e, 1);
  gr.fillRect(L - 28, 1, 9, W - 2);
  gr.fillStyle(0x86cbe6, 0.8); gr.fillRect(L - 27, 4, 3, 5); gr.fillRect(L - 27, W - 9, 3, 5);
  gr.fillStyle(0xf1c40f, 0.9); gr.fillRect(L - 20, 4, 2, W - 8);

  // Gangways
  gr.fillStyle(0x101820, 1); gr.fillRect(0, 8, 4, W - 16); gr.fillRect(L - 4, 8, 4, W - 16);

  gr.generateTexture(key, L + 6, W + 8);
  gr.destroy();
}

/** Container freight wagon. */
export function makeWagon(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 64, W = 26;
  gr.fillStyle(0x000000, 0.28); gr.fillRoundedRect(3, 4, L, W, 3);
  gr.fillStyle(0x161d24, 1); gr.fillRoundedRect(-2, -1, L + 4, W + 2, 3);
  wheels(gr, L, W);

  // Flatbed
  gr.fillStyle(0x2a3540, 1); gr.fillRoundedRect(0, 2, L, W - 4, 2);
  // Container
  gr.fillStyle(darken(color, 40), 1); gr.fillRoundedRect(3, 4, L - 6, W - 8, 2);
  gr.fillStyle(color, 1); gr.fillRoundedRect(3, 5, L - 6, W - 10, 2);
  gr.fillStyle(lighten(color, 30), 1); gr.fillRect(5, 6, L - 10, 2);
  // Corrugation
  gr.fillStyle(0x000000, 0.16);
  for (let x = 8; x < L - 8; x += 6) gr.fillRect(x, 8, 2, W - 16);
  // Door outlines and locks
  gr.lineStyle(1, 0x101820, 0.55);
  gr.strokeRect(L / 2 - 12, 7, 10, W - 14); gr.strokeRect(L / 2 + 2, 7, 10, W - 14);
  gr.fillStyle(0xdfe6ed, 0.85);
  for (const dx of [L / 2 - 10, L / 2 + 4]) gr.fillRect(dx, 9, 2, W - 18);
  // Logo panel
  gr.fillStyle(0xffffff, 0.18); gr.fillRoundedRect(8, 9, 14, W - 18, 1);
  // Couplers
  gr.fillStyle(0x0f151a, 1); gr.fillRect(-2, W / 2 - 2, 4, 4); gr.fillRect(L - 2, W / 2 - 2, 4, 4);

  gr.generateTexture(key, L + 6, W + 8);
  gr.destroy();
}

/** Tree for scenery. */
export function makeTree(scene: Phaser.Scene, key: string): void {
  const gr = g(scene);
  // Shadow
  gr.fillStyle(0x000000, 0.2); gr.fillEllipse(20, 36, 26, 8);
  // Trunk
  gr.fillStyle(0x5a3d2b, 1); gr.fillRect(17, 22, 6, 14);
  // Foliage layers
  gr.fillStyle(0x173d20, 1); gr.fillCircle(20, 20, 15);
  gr.fillStyle(0x256b32, 1); gr.fillCircle(15, 15, 11);
  gr.fillStyle(0x2f8b40, 1); gr.fillCircle(24, 14, 10);
  gr.fillStyle(0x46ab52, 0.85); gr.fillCircle(18, 10, 7);
  gr.fillStyle(0x7fd08a, 0.5); gr.fillCircle(16, 8, 3);
  gr.generateTexture(key, 42, 44);
  gr.destroy();
}
