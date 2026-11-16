import Phaser from 'phaser';

function g(scene: Phaser.Scene): Phaser.GameObjects.Graphics { return scene.make.graphics({}); }

/** Locomotive — top-down, 76x26 */
export function makeLoco(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 76, W = 26;
  // Shadow
  gr.fillStyle(0x000000, 0.25); gr.fillRoundedRect(2, 3, L, W, 5);
  // Body
  gr.fillStyle(color, 1); gr.fillRoundedRect(0, 0, L, W, 5);
  // Roof
  gr.fillStyle(0x2c3e50, 1); gr.fillRoundedRect(6, 3, L - 12, W - 6, 3);
  // Nose warning panel (front = right)
  gr.fillStyle(0xf1c40f, 1); gr.fillRoundedRect(L - 12, 3, 10, W - 6, 2);
  gr.fillStyle(0x000000, 0.35); gr.fillRect(L - 11, 5, 2, W - 10);
  // Headlights
  gr.fillStyle(0xfff9c4, 1); gr.fillCircle(L - 4, 6, 2.2); gr.fillCircle(L - 4, W - 6, 2.2);
  // Cab windows
  gr.fillStyle(0x9fd8ee, 0.9); gr.fillRect(L - 20, 4, 7, 6); gr.fillRect(L - 20, W - 10, 7, 6);
  // Side windows
  gr.fillStyle(0x7fb8d0, 0.8);
  for (let x = 12; x < L - 24; x += 9) { gr.fillRect(x, 4, 6, 5); gr.fillRect(x, W - 9, 6, 5); }
  // Roof vents
  gr.fillStyle(0x1a252f, 1);
  gr.fillRect(16, 10, 10, 6); gr.fillRect(30, 10, 10, 6);
  // Bogies
  gr.fillStyle(0x1c2833, 1);
  gr.fillRoundedRect(12, -2, 14, 4, 1); gr.fillRoundedRect(12, W - 2, 14, 4, 1);
  gr.fillRoundedRect(L - 26, -2, 14, 4, 1); gr.fillRoundedRect(L - 26, W - 2, 14, 4, 1);
  gr.generateTexture(key, L + 4, W + 4);
  gr.destroy();
}

/** Coach — 64x24 */
export function makeCoach(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 64, W = 24;
  gr.fillStyle(0x000000, 0.25); gr.fillRoundedRect(2, 3, L, W, 4);
  gr.fillStyle(color, 1); gr.fillRoundedRect(0, 0, L, W, 4);
  gr.fillStyle(0x34495e, 1); gr.fillRoundedRect(4, 3, L - 8, W - 6, 2);
  // Windows
  gr.fillStyle(0x9fd8ee, 0.9);
  for (let x = 9; x < L - 9; x += 9) { gr.fillRect(x, 5, 6, 5); gr.fillRect(x, W - 10, 6, 5); }
  // Doors
  gr.fillStyle(0x2c3e50, 1); gr.fillRect(L - 16, 0, 3, W); gr.fillRect(13, 0, 3, W);
  // Gangway
  gr.fillStyle(0x1a252f, 1); gr.fillRect(0, 8, 3, W - 16); gr.fillRect(L - 3, 8, 3, W - 16);
  gr.generateTexture(key, L + 4, W + 4);
  gr.destroy();
}

/** Freight container wagon — 60x24 */
export function makeWagon(scene: Phaser.Scene, key: string, color: number): void {
  const gr = g(scene);
  const L = 60, W = 24;
  gr.fillStyle(0x000000, 0.25); gr.fillRoundedRect(2, 3, L, W, 3);
  gr.fillStyle(0x2c3e50, 1); gr.fillRoundedRect(0, 0, L, W, 3);
  // Container
  gr.fillStyle(color, 1); gr.fillRoundedRect(4, 3, L - 8, W - 6, 2);
  // Container ribs
  gr.fillStyle(0x000000, 0.15);
  for (let x = 8; x < L - 8; x += 7) gr.fillRect(x, 4, 2, W - 8);
  gr.fillStyle(0xffffff, 0.25); gr.fillRect(4, 4, L - 8, 2);
  // Bogies
  gr.fillStyle(0x1c2833, 1);
  gr.fillRect(10, -2, 12, 3); gr.fillRect(10, W - 1, 12, 3);
  gr.fillRect(L - 22, -2, 12, 3); gr.fillRect(L - 22, W - 1, 12, 3);
  gr.generateTexture(key, L + 4, W + 4);
  gr.destroy();
}

/** Tree */
export function makeTree(scene: Phaser.Scene, key: string): void {
  const gr = g(scene);
  gr.fillStyle(0x1e4620, 1); gr.fillCircle(16, 18, 13);
  gr.fillStyle(0x2d6a2e, 1); gr.fillCircle(13, 14, 10);
  gr.fillStyle(0x3d8b40, 1); gr.fillCircle(12, 12, 6);
  gr.generateTexture(key, 32, 34);
  gr.destroy();
}
