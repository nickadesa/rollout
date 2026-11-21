import './ui/styles.css';
import { SettingsManager } from './settings';
import { GameEngine } from './engine/GameEngine';
import { UIManager } from './ui/UIManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const settingsMgr = new SettingsManager();

let ui: UIManager;

const engine = new GameEngine(canvas, settingsMgr, {
  onLoadProgress: (pct, label) => ui?.setLoadProgress(pct, label),
  onHudUpdate: (snap) => ui?.updateHud(snap),
  onKillFeed: (entry) => ui?.pushKillFeed(entry),
  onDamagePopup: (evt) => ui?.showDamagePopup(evt),
  onHitmarker: (hs) => ui?.showHitmarker(hs),
  onScreenChange: (screen) => ui?.onScreenChange(screen),
});

ui = new UIManager(uiRoot, engine, settingsMgr);

engine.init().catch((err) => {
  console.error('Failed to initialize ROLLOUT:', err);
  ui.setLoadProgress(100, 'Error loading assets — check console');
});
