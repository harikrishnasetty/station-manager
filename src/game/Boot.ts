import Phaser from 'phaser';
import { makeLoco, makeCoach, makeWagon, makeTree, makeExpress } from './textures';

export class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  create(): void {
    makeLoco(this, 'loco-red', 0xc0392b);
    makeLoco(this, 'loco-blue', 0x2980b9);
    makeLoco(this, 'loco-green', 0x27ae60);
    makeExpress(this, 'loco-express');
    makeCoach(this, 'coach', 0xecf0f1);
    makeWagon(this, 'wagon-blue', 0x2980b9);
    makeWagon(this, 'wagon-orange', 0xe67e22);
    makeTree(this, 'tree');
    this.scene.start('game');
  }
}
