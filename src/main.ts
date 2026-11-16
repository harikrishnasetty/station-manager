import Phaser from 'phaser';
import { Boot } from './game/Boot';
import { GameScene } from './game/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: 0x1e272e,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, GameScene],
};

const game = new Phaser.Game(config);
(window as unknown as { __game: Phaser.Game }).__game = game;
