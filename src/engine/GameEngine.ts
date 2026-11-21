import * as THREE from 'three';
import {
  BotDifficulty,
  CHARACTER_OUTFITS,
  CharacterAppearance,
  DamagePopupEvent,
  GameMode,
  GameSettings,
  HudSnapshot,
  KillFeedItem,
  RadarDot,
  WEAPON_ORDER,
  WEAPONS,
  WeaponId,
} from '../types';
import { SettingsManager } from '../settings';
import { AssetManager } from './AssetManager';
import { AudioManager } from './AudioManager';
import { ArenaBuilder, ArenaData } from '../world/ArenaBuilder';
import { Fighter, FighterInput } from '../entities/Fighter';
import { BotController } from '../ai/BotController';
import { VfxPool } from '../combat/VfxPool';

export type EngineScreen = 'loading' | 'lobby' | 'playing' | 'paused';

export interface MobileInputState {
  moveX: number;
  moveZ: number;
  firing: boolean;
  aiming: boolean;
  sprinting: boolean;
  rollQueued: boolean;
  reloadQueued: boolean;
}

export interface EngineCallbacks {
  onLoadProgress: (pct: number, label: string) => void;
  onHudUpdate: (snap: HudSnapshot) => void;
  onKillFeed: (entry: KillFeedItem) => void;
  onDamagePopup: (evt: DamagePopupEvent) => void;
  onHitmarker: (headshot: boolean) => void;
  onScreenChange: (screen: EngineScreen) => void;
}

const BOT_NAMES = ['RICO', 'VEX', 'KAIRO', 'DRACO', 'NOVA', 'BLITZ', 'GHOST', 'TANK'];
const BOT_COLORS = ['#ef4444', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#84cc16'];

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private settingsMgr: SettingsManager;
  private callbacks: EngineCallbacks;

  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public assets = new AssetManager();
  public audio: AudioManager;
  private vfx: VfxPool;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private arena: ArenaData | null = null;

  private screen: EngineScreen = 'loading';
  private mode: GameMode = '1v1';
  private difficulty: BotDifficulty = 'normal';

  // Fighters
  private player: Fighter | null = null;
  private fighters: Fighter[] = [];
  private bots: Map<string, BotController> = new Map();

  // Lobby 360 turntable
  private lobbyTurntableYaw = 0.25;
  private lobbyDance = false;
  private lobbyDragging = false;
  private lobbyLastX = 0;

  // Match score
  private teamScore = 0;
  private enemyScore = 0;
  private targetScore = 5;
  private matchOver = false;
  private victory = false;
  private killFeedSeq = 1;

  // Camera state
  private camYaw = 0;
  private camPitch = 0.14;
  private camShakeAmt = 0;
  private currentCamPos = new THREE.Vector3(0, 3, 6);
  private currentCamLook = new THREE.Vector3(0, 1.4, 0);

  // PC Input state
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private adsToggled = false;
  private rollQueuedPC = false;
  private reloadQueuedPC = false;
  private pointerLocked = false;

  // Mobile Input state
  public mobileInput: MobileInputState = {
    moveX: 0,
    moveZ: 0,
    firing: false,
    aiming: false,
    sprinting: false,
    rollQueued: false,
    reloadQueued: false,
  };

  // Anti-Lag / FPS Loop state
  private rafId = 0;
  private lastTime = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private measuredFps = 60;
  private measuredFrameMs = 16.6;
  private dynamicResScale = 1.0;
  private dynamicCheckTimer = 0;
  private hudEmitTimer = 0;
  private raycaster = new THREE.Raycaster();

  constructor(
    canvas: HTMLCanvasElement,
    settingsMgr: SettingsManager,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    this.settingsMgr = settingsMgr;
    this.callbacks = callbacks;

    const s = settingsMgr.get();
    this.audio = new AudioManager(s);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: s.antiAliasing,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = s.shadowQuality !== 'off';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x69a7e8);
    this.scene.fog = new THREE.FogExp2(0x78b2ea, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      s.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      220
    );

    // Crisp sunny Los Santos lighting
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    this.sunLight.position.set(28, 44, 24);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 120;
    const d = 34;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.vfx = new VfxPool(this.scene);

    this.dynamicResScale = s.resolutionScale;
    this.applySettings(s);
    this.settingsMgr.onChange((ns) => this.applySettings(ns));

    this.bindEvents();
  }

  public async init(): Promise<void> {
    await this.assets.preloadCore((pct, label) => {
      this.callbacks.onLoadProgress(pct, label);
    });

    // Build Los Santos Port / Street Arena from CC0 GLB props
    const builder = new ArenaBuilder(this.assets);
    this.arena = builder.build();
    this.scene.add(this.arena.group);

    // Spawn player character for Lobby & Locker preview
    const app = this.settingsMgr.getAppearance();
    this.player = new Fighter('player', 'YOU', 0, true, app, this.assets);
    await this.player.loadModel(app);
    this.player.equipWeapon('pistol');
    this.player.spawnAt(new THREE.Vector3(0, 0, 5), 0);
    this.scene.add(this.player.root);
    this.fighters = [this.player];

    // Warm up shaders before first frame
    this.renderer.compile(this.scene, this.camera);

    this.setScreen('lobby');
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  public applySettings(s: GameSettings): void {
    this.audio.updateSettings(s);
    this.vfx.setQuality(s.vfxQuality);

    if (!s.dynamicResolution) {
      this.dynamicResScale = s.resolutionScale;
    } else {
      this.dynamicResScale = Math.min(this.dynamicResScale, s.resolutionScale);
    }

    this.updateRendererSize();

    // Shadows
    const shadowSizes: Record<string, number> = {
      off: 0,
      low: 512,
      medium: 1024,
      high: 2048,
    };
    const smSize = shadowSizes[s.shadowQuality] ?? 1024;
    this.renderer.shadowMap.enabled = smSize > 0;
    this.sunLight.castShadow = smSize > 0;
    if (smSize > 0 && this.sunLight.shadow.mapSize.width !== smSize) {
      this.sunLight.shadow.mapSize.set(smSize, smSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }

    // View distance & fog
    const farMap = { short: 95, medium: 155, far: 240 };
    const fogMap = { short: 0.016, medium: 0.009, far: 0.005 };
    this.camera.far = farMap[s.viewDistance];
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = fogMap[s.viewDistance];
    }
  }

  private updateRendererSize(): void {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.dynamicResScale;
    this.renderer.setPixelRatio(Math.max(0.5, dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  public async updatePlayerAppearance(app: CharacterAppearance): Promise<void> {
    this.settingsMgr.saveAppearance(app);
    if (!this.player) return;
    if (this.player.appearance.outfitId !== app.outfitId) {
      await this.player.loadModel(app);
    } else {
      this.player.applyAppearance(app);
    }
  }

  public toggleLobbyEmote(): boolean {
    this.lobbyDance = !this.lobbyDance;
    return this.lobbyDance;
  }

  public setModeAndDifficulty(mode: GameMode, diff: BotDifficulty): void {
    this.mode = mode;
    this.difficulty = diff;
  }

  public async startMatch(mode: GameMode, difficulty: BotDifficulty): Promise<void> {
    if (!this.player || !this.arena) return;
    this.audio.unlock();
    this.mode = mode;
    this.difficulty = difficulty;
    this.lobbyDance = false;
    this.teamScore = 0;
    this.enemyScore = 0;
    this.matchOver = false;
    this.victory = false;
    this.targetScore = mode === '1v1' ? 5 : mode === 'ffa' ? 10 : 12;

    // Clear old bots
    for (const f of this.fighters) {
      if (!f.isPlayer) this.scene.remove(f.root);
    }
    this.bots.clear();
    this.fighters = [this.player];
    this.player.kills = 0;
    this.player.deaths = 0;

    // Determine team roster
    const allyCount = mode === '2v2' ? 1 : mode === '3v3' ? 2 : 0;
    const enemyCount = mode === '1v1' ? 1 : mode === '2v2' ? 2 : mode === '3v3' ? 3 : 4;

    const spawnBot = async (idx: number, team: number, spawn: THREE.Vector3) => {
      const outfit = CHARACTER_OUTFITS[Math.floor(Math.random() * CHARACTER_OUTFITS.length)];
      const app: CharacterAppearance = {
        outfitId: outfit.id,
        primaryColor: team === 0 ? '#22c55e' : BOT_COLORS[idx % BOT_COLORS.length],
        accentColor: '#f8fafc',
        hairColor: '#1f1a17',
        skinColor: '#d99e78',
      };
      const name = BOT_NAMES[idx % BOT_NAMES.length];
      const bot = new Fighter(`bot_${idx}_${team}`, name, team, false, app, this.assets);
      await bot.loadModel(app);
      bot.equipWeapon('pistol');
      bot.spawnAt(spawn, Math.atan2(-spawn.x, -spawn.z));
      this.scene.add(bot.root);
      this.fighters.push(bot);
      this.bots.set(bot.id, new BotController(difficulty));
    };

    // Spawn player
    const pSpawn =
      mode === 'ffa' ? this.arena.spawnPointsFFA[0] : this.arena.spawnPointsTeamA[0];
    this.player.equipWeapon('pistol');
    this.player.spawnAt(pSpawn, Math.atan2(-pSpawn.x, -pSpawn.z));
    this.camYaw = this.player.yaw;
    this.camPitch = 0.14;

    const botPromises: Promise<void>[] = [];
    let botIdx = 0;
    for (let i = 0; i < allyCount; i++) {
      const sp = this.arena.spawnPointsTeamA[(i + 1) % this.arena.spawnPointsTeamA.length];
      botPromises.push(spawnBot(botIdx++, 0, sp));
    }
    for (let i = 0; i < enemyCount; i++) {
      const teamId = mode === 'ffa' ? i + 1 : 1;
      const sp =
        mode === 'ffa'
          ? this.arena.spawnPointsFFA[(i + 1) % this.arena.spawnPointsFFA.length]
          : this.arena.spawnPointsTeamB[i % this.arena.spawnPointsTeamB.length];
      botPromises.push(spawnBot(botIdx++, teamId, sp));
    }
    await Promise.all(botPromises);

    this.setScreen('playing');
    this.requestPointerLockIfDesktop();
  }

  public returnToLobby(): void {
    this.exitPointerLock();
    for (const f of this.fighters) {
      if (!f.isPlayer) this.scene.remove(f.root);
    }
    this.bots.clear();
    if (this.player) {
      this.fighters = [this.player];
      this.player.equipWeapon('pistol');
      this.player.spawnAt(new THREE.Vector3(0, 0, 5), 0);
    }
    this.lobbyTurntableYaw = 0.25;
    this.setScreen('lobby');
  }

  public pause(): void {
    if (this.screen === 'playing') {
      this.exitPointerLock();
      this.setScreen('paused');
    }
  }

  public resume(): void {
    if (this.screen === 'paused') {
      this.setScreen('playing');
      this.requestPointerLockIfDesktop();
    }
  }

  public selectWeapon(id: WeaponId): void {
    if (!this.player || this.screen !== 'playing') return;
    this.player.equipWeapon(id);
    this.adsToggled = false;
    this.mobileInput.aiming = false;
    this.audio.playUiClick();
  }

  public toggleShoulderSide(): void {
    const cur = this.settingsMgr.get().shoulderSide;
    this.settingsMgr.update({ shoulderSide: cur === 'right' ? 'left' : 'right' });
    this.audio.playUiClick();
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    if (this.screen !== 'playing') return;
    const s = this.settingsMgr.get();
    const mult = this.player?.isAiming ? s.adsSensitivityMult : 1;
    const sens = 0.0048 * s.touchSensitivity * mult;
    this.camYaw -= dx * sens;
    const ySign = s.invertY ? -1 : 1;
    this.camPitch = Math.max(-0.55, Math.min(0.75, this.camPitch + dy * sens * ySign));
  }

  private setScreen(s: EngineScreen): void {
    this.screen = s;
    this.callbacks.onScreenChange(s);
  }

  private requestPointerLockIfDesktop(): void {
    if ('ontouchstart' in window && navigator.maxTouchPoints > 0) return;
    try {
      this.canvas.requestPointerLock?.();
    } catch {
      // ignore
    }
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.updateRendererSize());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this.screen === 'playing' && !this.matchOver) {
        this.mouseDownLeft = false;
        this.mouseDownRight = false;
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      if (this.screen === 'lobby') {
        this.lobbyDragging = true;
        this.lobbyLastX = e.clientX;
        return;
      }
      if (this.screen !== 'playing') return;
      if (!this.pointerLocked) {
        this.requestPointerLockIfDesktop();
      }
      if (e.button === 0) this.mouseDownLeft = true;
      if (e.button === 2) {
        if (this.settingsMgr.get().adsMode === 'toggle') {
          this.adsToggled = !this.adsToggled;
        } else {
          this.mouseDownRight = true;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.lobbyDragging = false;
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.mouseDownRight = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (this.screen === 'lobby' && this.lobbyDragging) {
        this.lobbyTurntableYaw += (e.clientX - this.lobbyLastX) * 0.01;
        this.lobbyLastX = e.clientX;
        return;
      }
      if (this.screen !== 'playing' || !this.pointerLocked) return;
      const s = this.settingsMgr.get();
      const mult = this.player?.isAiming ? s.adsSensitivityMult : 1;
      const sens = 0.0024 * s.mouseSensitivity * mult;
      this.camYaw -= e.movementX * sens;
      const ySign = s.invertY ? -1 : 1;
      this.camPitch = Math.max(-0.55, Math.min(0.75, this.camPitch + e.movementY * sens * ySign));
    });

    // Touch drag on canvas for Lobby 360 turntable
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (this.screen === 'lobby' && e.touches.length === 1) {
          this.lobbyDragging = true;
          this.lobbyLastX = e.touches[0].clientX;
        }
      },
      { passive: true }
    );
    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (this.screen === 'lobby' && this.lobbyDragging && e.touches.length === 1) {
          this.lobbyTurntableYaw += (e.touches[0].clientX - this.lobbyLastX) * 0.012;
          this.lobbyLastX = e.touches[0].clientX;
        }
      },
      { passive: true }
    );
    this.canvas.addEventListener('touchend', () => {
      this.lobbyDragging = false;
    });

    window.addEventListener('wheel', (e) => {
      if (this.screen !== 'playing' || !this.player) return;
      const idx = WEAPON_ORDER.indexOf(this.player.weapon);
      const next = (idx + (e.deltaY > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      this.selectWeapon(WEAPON_ORDER[next]);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.screen === 'playing') this.pause();
        else if (this.screen === 'paused') this.resume();
        return;
      }
      if (this.screen !== 'playing') return;
      this.keys.add(e.code);

      if (e.code === 'Digit1') this.selectWeapon('fists');
      if (e.code === 'Digit2') this.selectWeapon('knife');
      if (e.code === 'Digit3') this.selectWeapon('bat');
      if (e.code === 'Digit4') this.selectWeapon('pistol');
      if (e.code === 'KeyR') this.reloadQueuedPC = true;
      if (e.code === 'KeyQ') this.toggleShoulderSide();
      if (e.code === 'Space' || e.code === 'KeyC' || e.code === 'AltLeft') {
        e.preventDefault();
        this.rollQueuedPC = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const s = this.settingsMgr.get();
    const rawDt = (now - this.lastTime) / 1000;

    // Optional FPS Cap (helps prevent mobile overheating & frame pacing stutter)
    if (s.fpsLimit > 0) {
      const minInterval = 1 / s.fpsLimit;
      if (rawDt < minInterval * 0.92) return;
    }

    this.lastTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    // FPS & Dynamic Resolution Anti-Lag monitor
    this.fpsAccum += rawDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.measuredFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.measuredFrameMs = (this.fpsAccum / this.fpsFrames) * 1000;
      this.fpsAccum = 0;
      this.fpsFrames = 0;

      if (s.dynamicResolution && this.screen === 'playing') {
        this.dynamicCheckTimer += 0.5;
        if (this.dynamicCheckTimer >= 1.5) {
          this.dynamicCheckTimer = 0;
          if (this.measuredFps < 45 && this.dynamicResScale > 0.52) {
            this.dynamicResScale = Math.max(0.5, this.dynamicResScale - 0.08);
            this.updateRendererSize();
          } else if (this.measuredFps > 57 && this.dynamicResScale < s.resolutionScale) {
            this.dynamicResScale = Math.min(s.resolutionScale, this.dynamicResScale + 0.05);
            this.updateRendererSize();
          }
        }
      }
    }

    if (this.screen === 'lobby') {
      this.updateLobby(dt);
    } else if (this.screen === 'playing') {
      this.updateMatch(dt);
    }

    this.vfx.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateLobby(dt: number): void {
    if (!this.player) return;
    if (!this.lobbyDragging) {
      this.lobbyTurntableYaw += dt * 0.22;
    }
    this.player.root.position.set(0, 0, 5);
    this.player.root.rotation.y = this.lobbyTurntableYaw;
    this.player.updateLobbyIdle(dt, this.lobbyDance);

    // Clean Fortnite-style Lobby camera framing
    this.camera.position.set(0.55, 1.55, 8.65);
    this.camera.lookAt(0.15, 1.05, 5);
  }

  private updateMatch(dt: number): void {
    if (!this.player || !this.arena) return;
    const s = this.settingsMgr.get();

    // 1. Gather Player Input (PC + Mobile merged cleanly)
    let moveX = this.mobileInput.moveX;
    let moveZ = this.mobileInput.moveZ;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX += 1;
    const mLen = Math.hypot(moveX, moveZ);
    if (mLen > 1) {
      moveX /= mLen;
      moveZ /= mLen;
    }

    // Subtle Mobile Aim Assist (pulls yaw gently toward enemy inside crosshair cone)
    if (s.mobileAimAssist !== 'off' && this.player.alive && this.player.weapon === 'pistol') {
      const assistStrength = s.mobileAimAssist === 'strong' ? 5.5 : 2.6;
      this.applyMobileAimAssist(dt, assistStrength);
    }

    const aiming =
      s.adsMode === 'toggle'
        ? this.adsToggled || this.mobileInput.aiming
        : this.mouseDownRight || this.mobileInput.aiming;

    const sprinting =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.mobileInput.sprinting ||
      (s.autoSprint && mLen > 0.85);

    const playerInput: FighterInput = {
      moveX,
      moveZ,
      yaw: this.camYaw,
      pitch: this.camPitch,
      sprint: sprinting,
      aiming,
      fire: this.mouseDownLeft || this.mobileInput.firing,
      roll: this.rollQueuedPC || this.mobileInput.rollQueued,
      reload: this.reloadQueuedPC || this.mobileInput.reloadQueued,
    };
    this.rollQueuedPC = false;
    this.reloadQueuedPC = false;
    this.mobileInput.rollQueued = false;
    this.mobileInput.reloadQueued = false;

    // 2. Step all fighters (Player + Bots)
    for (const f of this.fighters) {
      const inp = f.isPlayer
        ? playerInput
        : this.bots
            .get(f.id)!
            .computeInput(f, this.fighters, dt, (a, b) => this.hasLineOfSight(a, b));

      if (!f.alive) {
        f.update(dt, inp, this.arena.colliders, this.arena.arenaHalfSize);
        if (!this.matchOver && f.respawnTimer <= 0) {
          const sp = this.pickRespawnPoint(f);
          f.spawnAt(sp, Math.atan2(-sp.x, -sp.z));
        }
        continue;
      }

      if (inp.roll) {
        const fx = Math.sin(inp.yaw);
        const fz = Math.cos(inp.yaw);
        const rx = Math.cos(inp.yaw);
        const rz = -Math.sin(inp.yaw);
        const rollWorld = new THREE.Vector3(
          fx * inp.moveZ + rx * inp.moveX,
          0,
          fz * inp.moveZ + rz * inp.moveX
        );
        if (f.startRoll(rollWorld)) {
          this.vfx.spawnRollDust(f.position);
          if (f.isPlayer) this.audio.playRoll();
        }
      }

      if (inp.reload) {
        if (f.startReload() && f.isPlayer) {
          this.audio.playReload();
        }
      }

      f.update(dt, inp, this.arena.colliders, this.arena.arenaHalfSize);

      // Process Attack / Fire
      if (!this.matchOver && inp.fire && !f.isRolling && f.attackCooldown <= 0) {
        this.executeAttack(f, inp);
      }
    }

    // 3. Update Third-Person Over-the-Shoulder Camera
    this.updateThirdPersonCamera(dt);

    // 4. Throttled HUD Snapshot (~25Hz to keep DOM super fast on mobile)
    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.04) {
      this.hudEmitTimer = 0;
      this.emitHudSnapshot();
    }
  }

  private executeAttack(attacker: Fighter, input: FighterInput): void {
    const w = WEAPONS[attacker.weapon];

    if (w.type === 'ranged') {
      if (attacker.reloading) return;
      if (attacker.ammo <= 0) {
        if (attacker.startReload() && attacker.isPlayer) this.audio.playReload();
        return;
      }
      attacker.ammo--;
      attacker.attackCooldown = w.cooldown;
      attacker.triggerAttackAnim();

      const distToPlayer = this.player ? attacker.position.distanceTo(this.player.position) : 0;
      this.audio.playPistolShot(attacker.isPlayer ? 0 : distToPlayer);

      if (attacker.isPlayer) {
        this.addCameraShake(0.06);
      }

      // Compute ray origin & direction with spread
      const muzzle = attacker.getMuzzleWorldPos();
      let rayOrigin: THREE.Vector3;
      let aimDir: THREE.Vector3;

      if (attacker.isPlayer) {
        rayOrigin = this.camera.position.clone();
        aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      } else {
        rayOrigin = attacker.getHeadWorldPos();
        aimDir = new THREE.Vector3(
          Math.sin(input.yaw),
          -Math.sin(input.pitch),
          Math.cos(input.yaw)
        ).normalize();
      }

      // Apply spread
      const sp = attacker.currentSpread;
      aimDir.x += (Math.random() - 0.5) * sp;
      aimDir.y += (Math.random() - 0.5) * sp;
      aimDir.z += (Math.random() - 0.5) * sp;
      aimDir.normalize();

      // Check world obstacle hit distance first
      this.raycaster.set(rayOrigin, aimDir);
      this.raycaster.far = w.range;
      let maxHitDist = w.range;
      if (this.arena) {
        const worldHits = this.raycaster.intersectObjects(this.arena.raycastMeshes, true);
        if (worldHits.length > 0) {
          maxHitDist = worldHits[0].distance;
        }
      }

      // Check fighter capsule/head hit along ray
      let hitFighter: Fighter | null = null;
      let hitPoint = rayOrigin.clone().addScaledVector(aimDir, maxHitDist);
      let isHeadshot = false;
      let bestT = maxHitDist;

      for (const target of this.fighters) {
        if (target.id === attacker.id || !target.alive || target.team === attacker.team) continue;

        // Head sphere test
        const headCenter = target.getHeadWorldPos();
        const tHead = raySphereIntersect(rayOrigin, aimDir, headCenter, 0.28);
        if (tHead !== null && tHead > 0.3 && tHead < bestT) {
          bestT = tHead;
          hitFighter = target;
          isHeadshot = true;
          hitPoint = rayOrigin.clone().addScaledVector(aimDir, tHead);
          continue;
        }

        // Torso cylinder/sphere test
        const torsoCenter = target.getTorsoWorldPos();
        const tBody = raySphereIntersect(rayOrigin, aimDir, torsoCenter, 0.52);
        if (tBody !== null && tBody > 0.3 && tBody < bestT) {
          bestT = tBody;
          hitFighter = target;
          isHeadshot = false;
          hitPoint = rayOrigin.clone().addScaledVector(aimDir, tBody);
        }
      }

      this.vfx.spawnTracer(muzzle, hitPoint, attacker.isPlayer ? 0xffe066 : 0xff7b54);

      if (hitFighter) {
        const dmg = w.damage * (isHeadshot ? w.headshotMult : 1);
        this.applyHit(attacker, hitFighter, dmg, isHeadshot, hitPoint, aimDir, w.knockback);
      } else {
        this.vfx.spawnHitBurst(hitPoint, 0x94a3b8, 4);
      }
    } else {
      // Street Melee Attack (Fists / Switchblade / Street Bat)
      attacker.attackCooldown = w.cooldown;
      attacker.triggerAttackAnim();
      if (attacker.isPlayer) {
        this.audio.playMeleeSwing(attacker.weapon === 'bat');
      }

      const fwd = new THREE.Vector3(Math.sin(attacker.yaw), 0, Math.cos(attacker.yaw));
      for (const target of this.fighters) {
        if (target.id === attacker.id || !target.alive || target.team === attacker.team) continue;
        const toTarget = target.position.clone().sub(attacker.position);
        const dist = Math.hypot(toTarget.x, toTarget.z);
        if (dist > w.range) continue;

        toTarget.y = 0;
        if (toTarget.lengthSq() > 0.001) toTarget.normalize();
        const dot = fwd.dot(toTarget);
        if (dot < 0.25 && dist > 1.0) continue; // front arc

        const hitPos = target.getTorsoWorldPos();
        if (attacker.isPlayer || target.isPlayer) {
          this.audio.playMeleeHit(attacker.weapon as 'fists' | 'knife' | 'bat');
        }
        this.applyHit(attacker, target, w.damage, false, hitPos, fwd, w.knockback);
      }
    }
  }

  private applyHit(
    attacker: Fighter,
    target: Fighter,
    damage: number,
    isHeadshot: boolean,
    hitPos: THREE.Vector3,
    dir: THREE.Vector3,
    knockback: number
  ): void {
    const res = target.takeDamage(damage, dir, knockback);
    if (res.dealt <= 0) return;

    this.vfx.spawnHitBurst(
      hitPos,
      res.hitShield ? 0x38bdf8 : isHeadshot ? 0xfacc15 : 0xf43f5e,
      res.shieldBroke ? 12 : 6
    );

    if (attacker.isPlayer) {
      this.audio.playHitmarker(isHeadshot, res.shieldBroke);
      this.callbacks.onHitmarker(isHeadshot);

      if (this.settingsMgr.get().floatingDamage) {
        const proj = hitPos.clone().project(this.camera);
        if (proj.z < 1) {
          const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
          this.callbacks.onDamagePopup({
            amount: res.dealt,
            isShield: res.hitShield,
            isHeadshot,
            screenX: sx,
            screenY: sy,
          });
        }
      }
    }

    if (target.isPlayer) {
      this.addCameraShake(0.14);
    }

    if (res.killed) {
      attacker.kills++;
      if (attacker.isPlayer) {
        this.audio.playElimination();
      }

      if (this.mode === 'ffa') {
        if (attacker.isPlayer) this.teamScore = attacker.kills;
        this.enemyScore = Math.max(
          ...this.fighters.filter((f) => !f.isPlayer).map((f) => f.kills),
          0
        );
      } else {
        if (attacker.team === 0) this.teamScore++;
        else this.enemyScore++;
      }

      this.callbacks.onKillFeed({
        id: this.killFeedSeq++,
        killer: attacker.name,
        victim: target.name,
        weapon: WEAPONS[attacker.weapon].shortName,
        headshot: isHeadshot,
        killerTeam: attacker.team,
        victimTeam: target.team,
        timestamp: performance.now(),
      });

      if (this.teamScore >= this.targetScore || this.enemyScore >= this.targetScore) {
        this.matchOver = true;
        this.victory = this.teamScore >= this.targetScore;
        this.exitPointerLock();
        this.emitHudSnapshot();
      }
    }
  }

  private applyMobileAimAssist(dt: number, strength: number): void {
    if (!this.player) return;
    let bestTarget: Fighter | null = null;
    let bestAngle = 0.24; // ~14 deg cone
    for (const f of this.fighters) {
      if (f.id === this.player.id || !f.alive || f.team === this.player.team) continue;
      const dx = f.position.x - this.player.position.x;
      const dz = f.position.z - this.player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 32) continue;
      const targetYaw = Math.atan2(dx, dz);
      let diff = ((targetYaw - this.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < bestAngle) {
        bestAngle = Math.abs(diff);
        bestTarget = f;
      }
    }
    if (bestTarget) {
      const dx = bestTarget.position.x - this.player.position.x;
      const dz = bestTarget.position.z - this.player.position.z;
      const targetYaw = Math.atan2(dx, dz);
      let diff = ((targetYaw - this.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * strength);
    }
  }

  private updateThirdPersonCamera(dt: number): void {
    if (!this.player) return;
    const s = this.settingsMgr.get();

    const distBase =
      s.cameraDistance === 'close' ? 3.2 : s.cameraDistance === 'far' ? 4.9 : 4.0;
    const dist = this.player.isAiming ? distBase * 0.56 : distBase;
    const shoulderSign = s.shoulderSide === 'right' ? 1 : -1;
    const shoulderOffset = (this.player.isAiming ? 0.62 : 0.72) * shoulderSign;

    // Smooth FOV zoom on ADS
    const targetFov = this.player.isAiming ? Math.max(48, s.fov - 16) : s.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }

    const pivot = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + 1.52,
      this.player.position.z
    );

    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);
    pivot.x += rightX * shoulderOffset;
    pivot.z += rightZ * shoulderOffset;

    const horizDist = Math.cos(this.camPitch) * dist;
    const vertOffset = Math.sin(this.camPitch) * dist;

    const desiredPos = new THREE.Vector3(
      pivot.x - Math.sin(this.camYaw) * horizDist,
      Math.max(0.55, pivot.y + vertOffset),
      pivot.z - Math.cos(this.camYaw) * horizDist
    );

    // Camera wall-collision check so camera never clips inside vehicles/buildings
    if (this.arena) {
      const dir = desiredPos.clone().sub(pivot);
      const len = dir.length();
      if (len > 0.1) {
        dir.normalize();
        this.raycaster.set(pivot, dir);
        this.raycaster.far = len;
        const hits = this.raycaster.intersectObjects(this.arena.raycastMeshes, true);
        if (hits.length > 0 && hits[0].distance < len) {
          desiredPos.copy(pivot).addScaledVector(dir, Math.max(0.6, hits[0].distance - 0.25));
        }
      }
    }

    const lookTarget = new THREE.Vector3(
      pivot.x + Math.sin(this.camYaw) * 18,
      pivot.y - Math.sin(this.camPitch) * 18,
      pivot.z + Math.cos(this.camYaw) * 18
    );

    // Camera shake
    if (this.camShakeAmt > 0.001) {
      const mult = s.cameraShake === 'off' ? 0 : s.cameraShake === 'low' ? 0.45 : 1;
      desiredPos.x += (Math.random() - 0.5) * this.camShakeAmt * mult;
      desiredPos.y += (Math.random() - 0.5) * this.camShakeAmt * mult;
      this.camShakeAmt = Math.max(0, this.camShakeAmt - dt * 1.4);
    }

    this.currentCamPos.lerp(desiredPos, Math.min(1, dt * 18));
    this.currentCamLook.lerp(lookTarget, Math.min(1, dt * 22));
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamLook);
  }

  private addCameraShake(amt: number): void {
    this.camShakeAmt = Math.min(0.35, this.camShakeAmt + amt);
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (!this.arena) return true;
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.2) return true;
    dir.normalize();
    this.raycaster.set(from, dir);
    this.raycaster.far = dist - 0.3;
    const hits = this.raycaster.intersectObjects(this.arena.raycastMeshes, true);
    return hits.length === 0;
  }

  private pickRespawnPoint(f: Fighter): THREE.Vector3 {
    if (!this.arena) return new THREE.Vector3();
    const list =
      this.mode === 'ffa'
        ? this.arena.spawnPointsFFA
        : f.team === 0
        ? this.arena.spawnPointsTeamA
        : this.arena.spawnPointsTeamB;

    // Pick spawn farthest from enemies
    let best = list[0];
    let bestMinDist = -1;
    for (const sp of list) {
      let minD = Infinity;
      for (const other of this.fighters) {
        if (!other.alive || other.team === f.team) continue;
        minD = Math.min(minD, sp.distanceTo(other.position));
      }
      if (minD > bestMinDist) {
        bestMinDist = minD;
        best = sp;
      }
    }
    return best.clone();
  }

  private emitHudSnapshot(): void {
    if (!this.player || !this.arena) return;
    const w = WEAPONS[this.player.weapon];
    const half = this.arena.arenaHalfSize;

    const radarDots: RadarDot[] = this.fighters.map((f) => ({
      x: Math.max(-1, Math.min(1, f.position.x / half)),
      z: Math.max(-1, Math.min(1, f.position.z / half)),
      team: f.team,
      isSelf: f.isPlayer,
      alive: f.alive,
    }));

    this.callbacks.onHudUpdate({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      shield: this.player.shield,
      maxShield: this.player.maxShield,
      stamina: this.player.stamina,
      maxStamina: this.player.maxStamina,
      weapon: this.player.weapon,
      ammo: this.player.ammo,
      maxAmmo: w.magSize,
      reloading: this.player.reloading,
      reloadProgress:
        this.player.reloading && w.reloadTime > 0
          ? 1 - this.player.reloadTimer / w.reloadTime
          : 0,
      isAiming: this.player.isAiming,
      isRolling: this.player.isRolling,
      rollCooldownRatio: Math.max(0, 1 - this.player.rollCooldown / this.player.rollMaxCooldown),
      spread: this.player.currentSpread,
      kills: this.player.kills,
      deaths: this.player.deaths,
      teamScore: this.teamScore,
      enemyScore: this.enemyScore,
      targetScore: this.targetScore,
      mode: this.mode,
      fps: this.measuredFps,
      frameMs: this.measuredFrameMs,
      currentResScale: this.dynamicResScale,
      aliveRespawnTimer: this.player.alive ? 0 : this.player.respawnTimer,
      radarDots,
      matchOver: this.matchOver,
      victory: this.victory,
    });
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
  }
}

function raySphereIntersect(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number
): number | null {
  const oc = origin.clone().sub(center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
