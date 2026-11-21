import {
  BotDifficulty,
  CHARACTER_OUTFITS,
  CharacterAppearance,
  DamagePopupEvent,
  GameMode,
  GameSettings,
  HudSnapshot,
  KillFeedItem,
  QualityPreset,
  WEAPON_ORDER,
  WEAPONS,
} from '../types';
import { isTouchDevice, SettingsManager } from '../settings';
import { EngineScreen, GameEngine } from '../engine/GameEngine';

const PRIMARY_PALETTE = [
  '#1e90ff', '#ef4444', '#22c55e', '#a855f7', '#facc15', '#f97316',
  '#14b8a6', '#ec4899', '#1e293b', '#f8fafc', '#64748b', '#7c2d12',
];
const ACCENT_PALETTE = [
  '#facc15', '#38bdf8', '#f43f5e', '#4ade80', '#f8fafc', '#0f172a', '#fb923c', '#c084fc',
];
const HAIR_PALETTE = ['#1f1a17', '#4a3222', '#d4a359', '#9a2a2a', '#e2e8f0', '#38bdf8', '#f472b6'];
const SKIN_PALETTE = ['#f5d0b5', '#e0ac88', '#c6865c', '#9c6240', '#6d4128', '#4a2b1a'];

type LobbyTab = 'play' | 'locker';
type SettingsTab = 'graphics' | 'controls' | 'camera' | 'audio' | 'hud';

export class UIManager {
  private root: HTMLElement;
  private engine: GameEngine;
  private settingsMgr: SettingsManager;

  private screen: EngineScreen = 'loading';
  private lobbyTab: LobbyTab = 'play';
  private settingsOpen = false;
  private settingsTab: SettingsTab = 'graphics';

  private selectedMode: GameMode = '1v1';
  private selectedDiff: BotDifficulty = 'normal';
  private killFeed: KillFeedItem[] = [];
  private hitmarkerTimeout = 0;

  // Cached DOM refs for fast 25Hz HUD updates without full re-renders
  private loadingBar!: HTMLElement;
  private loadingSub!: HTMLElement;
  private loadingScreen!: HTMLElement;
  private lobbyEl!: HTMLElement;
  private hudEl!: HTMLElement;
  private pauseModal!: HTMLElement;
  private victoryModal!: HTMLElement;
  private settingsModal!: HTMLElement;

  // HUD live nodes
  private fpsEl!: HTMLElement;
  private scoreBlueEl!: HTMLElement;
  private scoreRedEl!: HTMLElement;
  private scoreMetaEl!: HTMLElement;
  private shieldFill!: HTMLElement;
  private shieldVal!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpVal!: HTMLElement;
  private staminaFill!: HTMLElement;
  private ammoEl!: HTMLElement;
  private killFeedEl!: HTMLElement;
  private radarEl!: HTMLElement;
  private crosshairEl!: HTMLElement;
  private hitmarkerEl!: HTMLElement;
  private respawnBanner!: HTMLElement;
  private controlsHintEl!: HTMLElement;
  private mobileControlsEl!: HTMLElement;
  private slotEls: Map<string, HTMLElement> = new Map();

  constructor(root: HTMLElement, engine: GameEngine, settingsMgr: SettingsManager) {
    this.root = root;
    this.engine = engine;
    this.settingsMgr = settingsMgr;

    this.buildBaseDOM();
    this.applyHudSettings(settingsMgr.get());
    settingsMgr.onChange((s) => this.applyHudSettings(s));
  }

  private buildBaseDOM(): void {
    this.root.innerHTML = `
      <div id="loading-screen" class="loading-screen interactive">
        <div class="loading-logo font-display">ROLL<span>OUT</span></div>
        <div class="loading-bar-wrap"><div id="loading-bar" class="loading-bar-fill"></div></div>
        <div id="loading-sub" class="loading-sub">Loading CC0 3D Assets...</div>
      </div>

      <div id="lobby-wrap" class="lobby-wrap hidden"></div>

      <div id="hud-root" class="hud-root hidden">
        <div id="hud-fps" class="hud-fps">60 FPS</div>

        <div class="hud-scoreboard font-display">
          <div id="score-blue" class="score-team score-blue">0</div>
          <div id="score-meta" class="score-meta">1V1<br/>FIRST TO 5</div>
          <div id="score-red" class="score-team score-red">0</div>
        </div>

        <div class="hud-topright">
          <div class="hud-top-actions">
            <button id="btn-hud-settings" class="hud-mini-btn font-display">⚙ SETTINGS</button>
            <button id="btn-hud-pause" class="hud-mini-btn font-display">❚❚ PAUSE</button>
          </div>
          <div id="radar-box" class="radar-box"></div>
          <div id="kill-feed" class="kill-feed"></div>
        </div>

        <div id="crosshair" class="crosshair">
          <div class="ch-dot"></div>
          <div class="ch-line" data-dir="top"></div>
          <div class="ch-line" data-dir="bottom"></div>
          <div class="ch-line" data-dir="left"></div>
          <div class="ch-line" data-dir="right"></div>
        </div>
        <div id="hitmarker" class="hitmarker"></div>

        <div id="respawn-banner" class="respawn-banner hidden">
          <div class="font-display" style="font-size:1.3rem;color:#f43f5e;font-weight:800;">ELIMINATED</div>
          <div id="respawn-sec" style="font-size:0.85rem;color:#cbd5e1;margin-top:4px;">Respawning...</div>
        </div>

        <div id="controls-hint" class="controls-hint">
          WASD Move · SHIFT Sprint · SPACE/C Combat Roll · LMB Attack · RMB Aim · 1-4 Weapons · R Reload · Q Shoulder
        </div>

        <div class="hud-vitals">
          <div class="vital-row">
            <div id="shield-fill" class="vital-fill shield" style="width:100%"></div>
            <div class="vital-text"><span>SHIELD</span><span id="shield-val">50</span></div>
          </div>
          <div class="vital-row">
            <div id="hp-fill" class="vital-fill hp" style="width:100%"></div>
            <div class="vital-text"><span>HP</span><span id="hp-val">100</span></div>
          </div>
          <div class="stamina-row"><div id="stamina-fill" class="stamina-fill" style="width:100%"></div></div>
        </div>

        <div class="hud-hotbar-wrap">
          <div id="ammo-pill" class="ammo-pill font-display">12 / ∞</div>
          <div id="hotbar" class="hotbar">
            ${WEAPON_ORDER.map(
              (wid) => `
              <button class="hotbar-slot font-display" data-weapon="${wid}">
                <span class="slot-num">${WEAPONS[wid].slot}</span>
                <span class="slot-name">${WEAPONS[wid].shortName}</span>
              </button>`
            ).join('')}
          </div>
        </div>

        <div id="mobile-controls" class="mobile-controls ${isTouchDevice() ? '' : 'hidden'}">
          <div id="touch-look-zone" class="touch-look-zone"></div>
          <div id="joystick-base" class="joystick-base">
            <div id="joystick-knob" class="joystick-knob"></div>
          </div>
          <div class="mobile-actions">
            <button id="m-fire" class="m-btn m-fire font-display">FIRE</button>
            <button id="m-roll" class="m-btn m-roll font-display">ROLL</button>
            <button id="m-aim" class="m-btn m-aim font-display">AIM</button>
            <button id="m-reload" class="m-btn m-reload font-display">R</button>
            <button id="m-shoulder" class="m-btn m-shoulder font-display">Q</button>
          </div>
        </div>
      </div>

      <div id="pause-modal" class="modal-backdrop interactive hidden">
        <div class="modal-card" style="max-width:380px;text-align:center;">
          <div class="modal-header">
            <strong class="font-display" style="font-size:1.2rem;">PAUSED</strong>
          </div>
          <div class="modal-body">
            <button id="btn-resume" class="play-btn font-display" style="width:100%;padding:12px;font-size:1.15rem;">RESUME</button>
            <button id="btn-pause-settings" class="btn-secondary font-display" style="width:100%;padding:10px;">SETTINGS</button>
            <button id="btn-pause-lobby" class="btn-secondary font-display" style="width:100%;padding:10px;color:#fda4af;">RETURN TO LOBBY</button>
          </div>
        </div>
      </div>

      <div id="victory-modal" class="modal-backdrop interactive hidden">
        <div class="modal-card" style="max-width:420px;text-align:center;">
          <div class="modal-body" style="padding:28px 22px;gap:14px;">
            <div id="victory-title" class="font-display" style="font-size:2.4rem;font-weight:800;font-style:italic;color:#facc15;">VICTORY</div>
            <div id="victory-stats" style="font-size:0.95rem;color:#cbd5e1;"></div>
            <button id="btn-play-again" class="play-btn font-display" style="width:100%;padding:12px;font-size:1.2rem;">PLAY AGAIN</button>
            <button id="btn-victory-lobby" class="btn-secondary font-display" style="width:100%;padding:10px;">BACK TO LOBBY</button>
          </div>
        </div>
      </div>

      <div id="settings-modal" class="modal-backdrop interactive hidden"></div>
    `;

    this.loadingScreen = this.root.querySelector('#loading-screen')!;
    this.loadingBar = this.root.querySelector('#loading-bar')!;
    this.loadingSub = this.root.querySelector('#loading-sub')!;
    this.lobbyEl = this.root.querySelector('#lobby-wrap')!;
    this.hudEl = this.root.querySelector('#hud-root')!;
    this.pauseModal = this.root.querySelector('#pause-modal')!;
    this.victoryModal = this.root.querySelector('#victory-modal')!;
    this.settingsModal = this.root.querySelector('#settings-modal')!;

    this.fpsEl = this.root.querySelector('#hud-fps')!;
    this.scoreBlueEl = this.root.querySelector('#score-blue')!;
    this.scoreRedEl = this.root.querySelector('#score-red')!;
    this.scoreMetaEl = this.root.querySelector('#score-meta')!;
    this.shieldFill = this.root.querySelector('#shield-fill')!;
    this.shieldVal = this.root.querySelector('#shield-val')!;
    this.hpFill = this.root.querySelector('#hp-fill')!;
    this.hpVal = this.root.querySelector('#hp-val')!;
    this.staminaFill = this.root.querySelector('#stamina-fill')!;
    this.ammoEl = this.root.querySelector('#ammo-pill')!;
    this.killFeedEl = this.root.querySelector('#kill-feed')!;
    this.radarEl = this.root.querySelector('#radar-box')!;
    this.crosshairEl = this.root.querySelector('#crosshair')!;
    this.hitmarkerEl = this.root.querySelector('#hitmarker')!;
    this.respawnBanner = this.root.querySelector('#respawn-banner')!;
    this.controlsHintEl = this.root.querySelector('#controls-hint')!;
    this.mobileControlsEl = this.root.querySelector('#mobile-controls')!;

    this.root.querySelectorAll<HTMLElement>('.hotbar-slot').forEach((el) => {
      const wid = el.dataset.weapon!;
      this.slotEls.set(wid, el);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.engine.selectWeapon(wid as keyof typeof WEAPONS);
      });
    });

    this.root.querySelector('#btn-hud-pause')!.addEventListener('click', () => this.engine.pause());
    this.root.querySelector('#btn-hud-settings')!.addEventListener('click', () => {
      this.engine.pause();
      this.openSettings();
    });
    this.root.querySelector('#btn-resume')!.addEventListener('click', () => this.engine.resume());
    this.root.querySelector('#btn-pause-settings')!.addEventListener('click', () => this.openSettings());
    this.root.querySelector('#btn-pause-lobby')!.addEventListener('click', () => {
      this.victoryModal.classList.add('hidden');
      this.engine.returnToLobby();
    });
    this.root.querySelector('#btn-play-again')!.addEventListener('click', () => {
      this.victoryModal.classList.add('hidden');
      this.engine.startMatch(this.selectedMode, this.selectedDiff);
    });
    this.root.querySelector('#btn-victory-lobby')!.addEventListener('click', () => {
      this.victoryModal.classList.add('hidden');
      this.engine.returnToLobby();
    });

    this.bindMobileControls();
    this.renderLobby();
  }

  private bindMobileControls(): void {
    // Left virtual joystick
    const base = this.root.querySelector('#joystick-base') as HTMLElement;
    const knob = this.root.querySelector('#joystick-knob') as HTMLElement;
    let joyTouchId: number | null = null;

    const updateJoy = (clientX: number, clientY: number) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width * 0.42;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Engine uses moveX (+left/-right) and moveZ (+fwd/-back)
      this.engine.mobileInput.moveX = -(dx / maxR);
      this.engine.mobileInput.moveZ = -(dy / maxR);
      this.engine.mobileInput.sprinting = dist / maxR > 0.84;
    };

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.audio.unlock();
      if (joyTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        updateJoy(t.clientX, t.clientY);
      }
    });
    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyTouchId) updateJoy(t.clientX, t.clientY);
      }
    });
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyTouchId) {
          joyTouchId = null;
          knob.style.transform = 'translate(0px, 0px)';
          this.engine.mobileInput.moveX = 0;
          this.engine.mobileInput.moveZ = 0;
          this.engine.mobileInput.sprinting = false;
        }
      }
    };
    base.addEventListener('touchend', endJoy);
    base.addEventListener('touchcancel', endJoy);

    // Right touch camera look zone
    const lookZone = this.root.querySelector('#touch-look-zone') as HTMLElement;
    let lookTouchId: number | null = null;
    let lastLookX = 0;
    let lastLookY = 0;

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.audio.unlock();
      if (lookTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        lookTouchId = t.identifier;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
      }
    });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === lookTouchId) {
          this.engine.addTouchLookDelta(t.clientX - lastLookX, t.clientY - lastLookY);
          lastLookX = t.clientX;
          lastLookY = t.clientY;
        }
      }
    });
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === lookTouchId) lookTouchId = null;
      }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);

    // Action buttons
    const fireBtn = this.root.querySelector('#m-fire')!;
    fireBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.audio.unlock();
      this.engine.mobileInput.firing = true;
    });
    fireBtn.addEventListener('touchend', () => {
      this.engine.mobileInput.firing = false;
    });
    fireBtn.addEventListener('touchcancel', () => {
      this.engine.mobileInput.firing = false;
    });

    const aimBtn = this.root.querySelector('#m-aim')!;
    aimBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.settingsMgr.get().adsMode === 'toggle') {
        this.engine.mobileInput.aiming = !this.engine.mobileInput.aiming;
        aimBtn.classList.toggle('active', this.engine.mobileInput.aiming);
      } else {
        this.engine.mobileInput.aiming = true;
        aimBtn.classList.add('active');
      }
    });
    aimBtn.addEventListener('touchend', () => {
      if (this.settingsMgr.get().adsMode === 'hold') {
        this.engine.mobileInput.aiming = false;
        aimBtn.classList.remove('active');
      }
    });

    this.root.querySelector('#m-roll')!.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.mobileInput.rollQueued = true;
    });
    this.root.querySelector('#m-reload')!.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.mobileInput.reloadQueued = true;
    });
    this.root.querySelector('#m-shoulder')!.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.toggleShoulderSide();
    });
  }

  public setLoadProgress(pct: number, label: string): void {
    this.loadingBar.style.width = `${pct}%`;
    this.loadingSub.textContent = `Loading ${label} (${pct}%)`;
  }

  public onScreenChange(screen: EngineScreen): void {
    this.screen = screen;
    this.loadingScreen.classList.toggle('hidden', screen !== 'loading');
    this.lobbyEl.classList.toggle('hidden', screen !== 'lobby');
    this.hudEl.classList.toggle('hidden', screen !== 'playing' && screen !== 'paused');
    this.pauseModal.classList.toggle('hidden', screen !== 'paused' || this.settingsOpen);
    if (screen === 'lobby') {
      this.victoryModal.classList.add('hidden');
      this.killFeed = [];
      this.killFeedEl.innerHTML = '';
      this.renderLobby();
    }
  }

  private renderLobby(): void {
    const app = this.settingsMgr.getAppearance();
    const isLocker = this.lobbyTab === 'locker';

    this.lobbyEl.innerHTML = `
      <div class="lobby-topbar">
        <div class="brand-pill font-display">ROLL<span>OUT</span></div>
        <div class="nav-tabs interactive">
          <button class="nav-tab font-display ${!isLocker ? 'active' : ''}" data-tab="play">PLAY</button>
          <button class="nav-tab font-display ${isLocker ? 'active' : ''}" data-tab="locker">LOCKER</button>
          <button class="nav-tab font-display" id="btn-lobby-settings">SETTINGS</button>
        </div>
      </div>

      <div class="lobby-body">
        ${
          !isLocker
            ? `
          <div class="lobby-left interactive">
            <div class="fn-card">
              <div class="fn-label">SELECT MODE · PORT REDZONE</div>
              <div class="mode-grid">
                ${(['1v1', '2v2', '3v3', 'ffa'] as GameMode[])
                  .map(
                    (m) => `
                  <button class="mode-btn font-display ${this.selectedMode === m ? 'active' : ''}" data-mode="${m}">
                    ${m === '1v1' ? '1v1 DUEL' : m === '2v2' ? '2v2 GANG' : m === '3v3' ? '3v3 GANG' : 'FREE FOR ALL'}
                  </button>`
                  )
                  .join('')}
              </div>
            </div>

            <div class="fn-card">
              <div class="fn-label">BOT DIFFICULTY</div>
              <div class="diff-row">
                ${(['easy', 'normal', 'hard'] as BotDifficulty[])
                  .map(
                    (d) => `
                  <button class="diff-btn font-display ${this.selectedDiff === d ? 'active' : ''}" data-diff="${d}">
                    ${d.toUpperCase()}
                  </button>`
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `
            : `
          <div class="fn-card locker-panel interactive">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div class="fn-label" style="margin:0;">CHARACTER LOCKER (14 OUTFITS)</div>
              <button id="btn-randomize" class="btn-secondary font-display" style="padding:4px 10px;font-size:0.72rem;">🎲 RANDOM</button>
            </div>
            <div class="outfit-grid">
              ${CHARACTER_OUTFITS.map(
                (o) => `
                <button class="outfit-chip ${app.outfitId === o.id ? 'active' : ''}" data-outfit="${o.id}">
                  <div>${o.label}</div>
                  <div style="font-size:0.65rem;color:#94a3b8;">${o.category} · ${o.gender}</div>
                </button>`
              ).join('')}
            </div>

            <div>
              <div class="fn-label">OUTFIT PRIMARY</div>
              <div class="swatch-row">
                ${PRIMARY_PALETTE.map(
                  (c) => `<button class="swatch ${app.primaryColor === c ? 'active' : ''}" style="background:${c}" data-color-key="primaryColor" data-color="${c}"></button>`
                ).join('')}
              </div>
            </div>

            <div>
              <div class="fn-label">ACCENT / TRIM</div>
              <div class="swatch-row">
                ${ACCENT_PALETTE.map(
                  (c) => `<button class="swatch ${app.accentColor === c ? 'active' : ''}" style="background:${c}" data-color-key="accentColor" data-color="${c}"></button>`
                ).join('')}
              </div>
            </div>

            <div>
              <div class="fn-label">HAIR COLOR</div>
              <div class="swatch-row">
                ${HAIR_PALETTE.map(
                  (c) => `<button class="swatch ${app.hairColor === c ? 'active' : ''}" style="background:${c}" data-color-key="hairColor" data-color="${c}"></button>`
                ).join('')}
              </div>
            </div>

            <div>
              <div class="fn-label">SKIN TONE</div>
              <div class="swatch-row">
                ${SKIN_PALETTE.map(
                  (c) => `<button class="swatch ${app.skinColor === c ? 'active' : ''}" style="background:${c}" data-color-key="skinColor" data-color="${c}"></button>`
                ).join('')}
              </div>
            </div>
          </div>
        `
        }

        <div class="lobby-right interactive">
          <div class="drag-hint">↻ Drag to rotate character 360°</div>
          <button id="btn-emote" class="emote-btn font-display">🕺 EMOTE PREVIEW</button>
          <button id="btn-play" class="play-btn font-display">PLAY</button>
        </div>
      </div>
    `;

    this.lobbyEl.querySelectorAll<HTMLElement>('.nav-tab[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.engine.audio.unlock();
        this.engine.audio.playUiClick();
        this.lobbyTab = btn.dataset.tab as LobbyTab;
        this.renderLobby();
      });
    });

    this.lobbyEl.querySelector('#btn-lobby-settings')!.addEventListener('click', () => {
      this.engine.audio.unlock();
      this.engine.audio.playUiClick();
      this.openSettings();
    });

    this.lobbyEl.querySelectorAll<HTMLElement>('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.engine.audio.playUiClick();
        this.selectedMode = btn.dataset.mode as GameMode;
        this.renderLobby();
      });
    });

    this.lobbyEl.querySelectorAll<HTMLElement>('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.engine.audio.playUiClick();
        this.selectedDiff = btn.dataset.diff as BotDifficulty;
        this.renderLobby();
      });
    });

    this.lobbyEl.querySelectorAll<HTMLElement>('.outfit-chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.engine.audio.playUiClick();
        const next: CharacterAppearance = {
          ...this.settingsMgr.getAppearance(),
          outfitId: btn.dataset.outfit!,
        };
        await this.engine.updatePlayerAppearance(next);
        this.renderLobby();
      });
    });

    this.lobbyEl.querySelectorAll<HTMLElement>('.swatch').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.engine.audio.playUiClick();
        const key = btn.dataset.colorKey as keyof CharacterAppearance;
        const next: CharacterAppearance = {
          ...this.settingsMgr.getAppearance(),
          [key]: btn.dataset.color!,
        };
        await this.engine.updatePlayerAppearance(next);
        this.renderLobby();
      });
    });

    this.lobbyEl.querySelector('#btn-randomize')?.addEventListener('click', async () => {
      this.engine.audio.playUiClick();
      const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
      const next: CharacterAppearance = {
        outfitId: pick(CHARACTER_OUTFITS).id,
        primaryColor: pick(PRIMARY_PALETTE),
        accentColor: pick(ACCENT_PALETTE),
        hairColor: pick(HAIR_PALETTE),
        skinColor: pick(SKIN_PALETTE),
      };
      await this.engine.updatePlayerAppearance(next);
      this.renderLobby();
    });

    this.lobbyEl.querySelector('#btn-emote')!.addEventListener('click', () => {
      this.engine.audio.unlock();
      this.engine.audio.playUiClick();
      this.engine.toggleLobbyEmote();
    });

    this.lobbyEl.querySelector('#btn-play')!.addEventListener('click', () => {
      this.engine.audio.unlock();
      this.engine.audio.playUiClick();
      this.engine.startMatch(this.selectedMode, this.selectedDiff);
    });
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.pauseModal.classList.add('hidden');
    this.settingsModal.classList.remove('hidden');
    this.renderSettings();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsModal.classList.add('hidden');
    if (this.screen === 'paused') {
      this.pauseModal.classList.remove('hidden');
    }
  }

  private renderSettings(): void {
    const s = this.settingsMgr.get();
    const tabs: Array<{ id: SettingsTab; label: string }> = [
      { id: 'graphics', label: 'GRAPHICS & ANTI-LAG' },
      { id: 'controls', label: 'CONTROLS & MOBILE' },
      { id: 'camera', label: 'CAMERA & GAMEPLAY' },
      { id: 'audio', label: 'AUDIO' },
      { id: 'hud', label: 'HUD' },
    ];

    let bodyHtml = '';
    if (this.settingsTab === 'graphics') {
      bodyHtml = `
        <div class="setting-row">
          <div><label>Quality Preset</label><small>Quickly tune graphics for PC or Mobile</small></div>
          <div class="setting-control">
            <select data-preset>
              ${(['ultra-smooth', 'low', 'medium', 'high', 'ultra'] as QualityPreset[])
                .map((p) => `<option value="${p}" ${s.qualityPreset === p ? 'selected' : ''}>${p.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Resolution Scale (${Math.round(s.resolutionScale * 100)}%)</label><small>Lower = huge FPS boost on mobile while HUD stays sharp</small></div>
          <div class="setting-control"><input type="range" min="0.5" max="1" step="0.05" value="${s.resolutionScale}" data-key="resolutionScale" /></div>
        </div>
        <div class="setting-row">
          <div><label>Dynamic Resolution (Auto Anti-Lag)</label><small>Automatically scales resolution down if FPS drops below 45</small></div>
          <div class="setting-control"><input type="checkbox" ${s.dynamicResolution ? 'checked' : ''} data-bool="dynamicResolution" /></div>
        </div>
        <div class="setting-row">
          <div><label>FPS Limit</label><small>Cap at 30/60 on mobile to reduce heat & stutter</small></div>
          <div class="setting-control">
            <select data-num="fpsLimit">
              ${[0, 30, 60, 120]
                .map((v) => `<option value="${v}" ${s.fpsLimit === v ? 'selected' : ''}>${v === 0 ? 'UNLIMITED' : `${v} FPS`}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Shadow Quality</label><small>Turning Off gives +30-50% FPS boost</small></div>
          <div class="setting-control">
            <select data-str="shadowQuality">
              ${['off', 'low', 'medium', 'high']
                .map((v) => `<option value="${v}" ${s.shadowQuality === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>View Distance & Fog</label><small>Short reduces far city rendering cost</small></div>
          <div class="setting-control">
            <select data-str="viewDistance">
              ${['short', 'medium', 'far']
                .map((v) => `<option value="${v}" ${s.viewDistance === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>VFX & Particles</label><small>Bullet tracers, hit sparks, and roll dust</small></div>
          <div class="setting-control">
            <select data-str="vfxQuality">
              ${['off', 'low', 'high']
                .map((v) => `<option value="${v}" ${s.vfxQuality === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Show FPS Counter</label><small>Display live FPS, frame time & resolution scale</small></div>
          <div class="setting-control"><input type="checkbox" ${s.showFps ? 'checked' : ''} data-bool="showFps" /></div>
        </div>
      `;
    } else if (this.settingsTab === 'controls') {
      bodyHtml = `
        <div class="setting-row">
          <div><label>Mouse Sensitivity (${s.mouseSensitivity.toFixed(2)})</label></div>
          <div class="setting-control"><input type="range" min="0.2" max="2.5" step="0.05" value="${s.mouseSensitivity}" data-key="mouseSensitivity" /></div>
        </div>
        <div class="setting-row">
          <div><label>ADS Aim Sensitivity (${Math.round(s.adsSensitivityMult * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0.3" max="1" step="0.05" value="${s.adsSensitivityMult}" data-key="adsSensitivityMult" /></div>
        </div>
        <div class="setting-row">
          <div><label>Touch Camera Sensitivity (${s.touchSensitivity.toFixed(2)})</label></div>
          <div class="setting-control"><input type="range" min="0.3" max="2.5" step="0.05" value="${s.touchSensitivity}" data-key="touchSensitivity" /></div>
        </div>
        <div class="setting-row">
          <div><label>Mobile Aim Assist</label><small>Soft crosshair lock onto nearby enemies</small></div>
          <div class="setting-control">
            <select data-str="mobileAimAssist">
              ${['off', 'light', 'strong']
                .map((v) => `<option value="${v}" ${s.mobileAimAssist === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>ADS Aim Mode</label></div>
          <div class="setting-control">
            <select data-str="adsMode">
              <option value="hold" ${s.adsMode === 'hold' ? 'selected' : ''}>HOLD</option>
              <option value="toggle" ${s.adsMode === 'toggle' ? 'selected' : ''}>TOGGLE</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Auto-Sprint</label><small>Automatically sprint when pushing full forward</small></div>
          <div class="setting-control"><input type="checkbox" ${s.autoSprint ? 'checked' : ''} data-bool="autoSprint" /></div>
        </div>
        <div class="setting-row">
          <div><label>Mobile Button Size (${Math.round(s.mobileButtonScale * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0.8" max="1.3" step="0.05" value="${s.mobileButtonScale}" data-key="mobileButtonScale" /></div>
        </div>
        <div class="setting-row">
          <div><label>Mobile Button Opacity (${Math.round(s.mobileButtonOpacity * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0.3" max="1" step="0.05" value="${s.mobileButtonOpacity}" data-key="mobileButtonOpacity" /></div>
        </div>
        <div class="setting-row">
          <div><label>Invert Y-Axis</label></div>
          <div class="setting-control"><input type="checkbox" ${s.invertY ? 'checked' : ''} data-bool="invertY" /></div>
        </div>
      `;
    } else if (this.settingsTab === 'camera') {
      bodyHtml = `
        <div class="setting-row">
          <div><label>Field of View (${s.fov}°)</label></div>
          <div class="setting-control"><input type="range" min="60" max="95" step="1" value="${s.fov}" data-key="fov" /></div>
        </div>
        <div class="setting-row">
          <div><label>Camera Distance</label></div>
          <div class="setting-control">
            <select data-str="cameraDistance">
              ${['close', 'medium', 'far']
                .map((v) => `<option value="${v}" ${s.cameraDistance === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Shoulder Side (Press Q in-game)</label></div>
          <div class="setting-control">
            <select data-str="shoulderSide">
              <option value="right" ${s.shoulderSide === 'right' ? 'selected' : ''}>RIGHT</option>
              <option value="left" ${s.shoulderSide === 'left' ? 'selected' : ''}>LEFT</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Camera Shake</label></div>
          <div class="setting-control">
            <select data-str="cameraShake">
              ${['off', 'low', 'normal']
                .map((v) => `<option value="${v}" ${s.cameraShake === v ? 'selected' : ''}>${v.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Crosshair Color</label></div>
          <div class="setting-control">
            <select data-str="crosshairColor">
              <option value="#ffffff" ${s.crosshairColor === '#ffffff' ? 'selected' : ''}>WHITE</option>
              <option value="#4ade80" ${s.crosshairColor === '#4ade80' ? 'selected' : ''}>NEON GREEN</option>
              <option value="#38bdf8" ${s.crosshairColor === '#38bdf8' ? 'selected' : ''}>CYAN</option>
              <option value="#facc15" ${s.crosshairColor === '#facc15' ? 'selected' : ''}>YELLOW</option>
              <option value="#f43f5e" ${s.crosshairColor === '#f43f5e' ? 'selected' : ''}>RED</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div><label>Crosshair Size (${Math.round(s.crosshairSize * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0.7" max="1.5" step="0.1" value="${s.crosshairSize}" data-key="crosshairSize" /></div>
        </div>
        <div class="setting-row">
          <div><label>Floating Damage Numbers</label></div>
          <div class="setting-control"><input type="checkbox" ${s.floatingDamage ? 'checked' : ''} data-bool="floatingDamage" /></div>
        </div>
      `;
    } else if (this.settingsTab === 'audio') {
      bodyHtml = `
        <div class="setting-row">
          <div><label>Mute All Audio</label></div>
          <div class="setting-control"><input type="checkbox" ${s.muted ? 'checked' : ''} data-bool="muted" /></div>
        </div>
        <div class="setting-row">
          <div><label>Master Volume (${Math.round(s.masterVolume * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0" max="1" step="0.05" value="${s.masterVolume}" data-key="masterVolume" /></div>
        </div>
        <div class="setting-row">
          <div><label>Combat SFX (${Math.round(s.sfxVolume * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" data-key="sfxVolume" /></div>
        </div>
        <div class="setting-row">
          <div><label>Hitmarker & Kill Sound (${Math.round(s.hitmarkerVolume * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0" max="1" step="0.05" value="${s.hitmarkerVolume}" data-key="hitmarkerVolume" /></div>
        </div>
        <div class="setting-row">
          <div><label>UI Clicks (${Math.round(s.uiVolume * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0" max="1" step="0.05" value="${s.uiVolume}" data-key="uiVolume" /></div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="setting-row">
          <div><label>HUD Scale (${Math.round(s.hudScale * 100)}%)</label></div>
          <div class="setting-control"><input type="range" min="0.8" max="1.2" step="0.05" value="${s.hudScale}" data-key="hudScale" /></div>
        </div>
        <div class="setting-row">
          <div><label>Show Kill Feed</label></div>
          <div class="setting-control"><input type="checkbox" ${s.showKillFeed ? 'checked' : ''} data-bool="showKillFeed" /></div>
        </div>
        <div class="setting-row">
          <div><label>Show Mini-Radar</label></div>
          <div class="setting-control"><input type="checkbox" ${s.showRadar ? 'checked' : ''} data-bool="showRadar" /></div>
        </div>
        <div class="setting-row">
          <div><label>Show PC Controls Hint</label></div>
          <div class="setting-control"><input type="checkbox" ${s.showControlsHint ? 'checked' : ''} data-bool="showControlsHint" /></div>
        </div>
      `;
    }

    this.settingsModal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <strong class="font-display" style="font-size:1.2rem;">SETTINGS</strong>
          <button id="btn-close-settings" class="btn-secondary" style="padding:4px 12px;">✕</button>
        </div>
        <div class="settings-tabs">
          ${tabs
            .map(
              (t) => `<button class="s-tab font-display ${this.settingsTab === t.id ? 'active' : ''}" data-stab="${t.id}">${t.label}</button>`
            )
            .join('')}
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          <button id="btn-reset-settings" class="btn-secondary font-display">RESET DEFAULT</button>
          <button id="btn-done-settings" class="btn-primary font-display">APPLY & CLOSE</button>
        </div>
      </div>
    `;

    this.settingsModal.querySelector('#btn-close-settings')!.addEventListener('click', () => this.closeSettings());
    this.settingsModal.querySelector('#btn-done-settings')!.addEventListener('click', () => this.closeSettings());
    this.settingsModal.querySelector('#btn-reset-settings')!.addEventListener('click', () => {
      this.settingsMgr.reset();
      this.renderSettings();
    });

    this.settingsModal.querySelectorAll<HTMLElement>('.s-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settingsTab = btn.dataset.stab as SettingsTab;
        this.renderSettings();
      });
    });

    this.settingsModal.querySelector<HTMLSelectElement>('select[data-preset]')?.addEventListener('change', (e) => {
      this.settingsMgr.applyPreset((e.target as HTMLSelectElement).value as QualityPreset);
      this.renderSettings();
    });

    this.settingsModal.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((inp) => {
      inp.addEventListener('input', () => {
        this.settingsMgr.update({ [inp.dataset.key!]: parseFloat(inp.value) } as Partial<GameSettings>);
        this.renderSettings();
      });
    });

    this.settingsModal.querySelectorAll<HTMLInputElement>('input[data-bool]').forEach((inp) => {
      inp.addEventListener('change', () => {
        this.settingsMgr.update({ [inp.dataset.bool!]: inp.checked } as Partial<GameSettings>);
      });
    });

    this.settingsModal.querySelectorAll<HTMLSelectElement>('select[data-str]').forEach((sel) => {
      sel.addEventListener('change', () => {
        this.settingsMgr.update({ [sel.dataset.str!]: sel.value } as Partial<GameSettings>);
      });
    });

    this.settingsModal.querySelectorAll<HTMLSelectElement>('select[data-num]').forEach((sel) => {
      sel.addEventListener('change', () => {
        this.settingsMgr.update({ [sel.dataset.num!]: parseInt(sel.value, 10) } as Partial<GameSettings>);
      });
    });
  }

  private applyHudSettings(s: GameSettings): void {
    document.documentElement.style.setProperty('--hud-scale', String(s.hudScale));
    document.documentElement.style.setProperty('--btn-scale', String(s.mobileButtonScale));
    document.documentElement.style.setProperty('--btn-opacity', String(s.mobileButtonOpacity));
    this.fpsEl.classList.toggle('hidden', !s.showFps);
    this.killFeedEl.classList.toggle('hidden', !s.showKillFeed);
    this.radarEl.classList.toggle('hidden', !s.showRadar);
    this.controlsHintEl.classList.toggle('hidden', !s.showControlsHint || isTouchDevice());
    this.mobileControlsEl.classList.toggle('hidden', !isTouchDevice());

    this.crosshairEl.querySelectorAll<HTMLElement>('.ch-line, .ch-dot').forEach((el) => {
      el.style.background = s.crosshairColor;
    });
  }

  public updateHud(snap: HudSnapshot): void {
    const s = this.settingsMgr.get();

    if (s.showFps) {
      this.fpsEl.textContent = `${snap.fps} FPS · ${snap.frameMs.toFixed(1)}ms · ${Math.round(snap.currentResScale * 100)}%`;
    }

    this.scoreBlueEl.textContent = String(snap.teamScore);
    this.scoreRedEl.textContent = String(snap.enemyScore);
    this.scoreMetaEl.innerHTML = `${snap.mode.toUpperCase()}<br/>FIRST TO ${snap.targetScore}`;

    this.shieldFill.style.width = `${(snap.shield / snap.maxShield) * 100}%`;
    this.shieldVal.textContent = String(Math.ceil(snap.shield));
    this.hpFill.style.width = `${(snap.hp / snap.maxHp) * 100}%`;
    this.hpVal.textContent = String(Math.ceil(snap.hp));
    this.staminaFill.style.width = `${(snap.stamina / snap.maxStamina) * 100}%`;

    // Weapon hotbar & ammo
    this.slotEls.forEach((el, wid) => {
      el.classList.toggle('active', wid === snap.weapon);
    });
    if (snap.maxAmmo > 0) {
      this.ammoEl.textContent = snap.reloading
        ? `RELOADING ${Math.round(snap.reloadProgress * 100)}%`
        : `${snap.ammo} / ∞`;
    } else {
      this.ammoEl.textContent = 'MELEE';
    }

    // Dynamic crosshair spread
    const gap = Math.round((6 + snap.spread * 280) * s.crosshairSize);
    const len = Math.round(9 * s.crosshairSize);
    const thick = 2;
    this.crosshairEl.querySelectorAll<HTMLElement>('.ch-line').forEach((el) => {
      const dir = el.dataset.dir;
      if (dir === 'top') {
        el.style.cssText = `background:${s.crosshairColor};width:${thick}px;height:${len}px;left:${-thick / 2}px;top:${-(gap + len)}px;`;
      } else if (dir === 'bottom') {
        el.style.cssText = `background:${s.crosshairColor};width:${thick}px;height:${len}px;left:${-thick / 2}px;top:${gap}px;`;
      } else if (dir === 'left') {
        el.style.cssText = `background:${s.crosshairColor};width:${len}px;height:${thick}px;left:${-(gap + len)}px;top:${-thick / 2}px;`;
      } else {
        el.style.cssText = `background:${s.crosshairColor};width:${len}px;height:${thick}px;left:${gap}px;top:${-thick / 2}px;`;
      }
    });

    // Respawn banner
    if (snap.aliveRespawnTimer > 0 && !snap.matchOver) {
      this.respawnBanner.classList.remove('hidden');
      this.root.querySelector('#respawn-sec')!.textContent = `Respawning in ${snap.aliveRespawnTimer.toFixed(1)}s`;
    } else {
      this.respawnBanner.classList.add('hidden');
    }

    // Mini-Radar
    if (s.showRadar) {
      this.radarEl.innerHTML = snap.radarDots
        .filter((d) => d.alive)
        .map((d) => {
          const left = 50 + d.x * 44;
          const top = 50 + d.z * 44;
          const color = d.isSelf ? '#facc15' : d.team === 0 ? '#38bdf8' : '#f43f5e';
          return `<div class="radar-dot" style="left:${left}%;top:${top}%;background:${color};"></div>`;
        })
        .join('');
    }

    // Victory / Defeat modal
    if (snap.matchOver && this.victoryModal.classList.contains('hidden')) {
      const title = this.root.querySelector('#victory-title') as HTMLElement;
      title.textContent = snap.victory ? 'VICTORY ROYALE' : 'DEFEAT';
      title.style.color = snap.victory ? '#facc15' : '#f43f5e';
      this.root.querySelector('#victory-stats')!.textContent = `SCORE ${snap.teamScore} - ${snap.enemyScore} · KILLS ${snap.kills} · DEATHS ${snap.deaths}`;
      this.victoryModal.classList.remove('hidden');
    }
  }

  public pushKillFeed(entry: KillFeedItem): void {
    this.killFeed.unshift(entry);
    if (this.killFeed.length > 4) this.killFeed.pop();
    this.killFeedEl.innerHTML = this.killFeed
      .map(
        (k) => `
        <div class="kill-item">
          <span style="color:${k.killerTeam === 0 ? '#38bdf8' : '#f43f5e'}">${k.killer}</span>
          <span style="color:#94a3b8;margin:0 5px;">[${k.weapon}${k.headshot ? ' 🎯' : ''}]</span>
          <span style="color:${k.victimTeam === 0 ? '#38bdf8' : '#f43f5e'}">${k.victim}</span>
        </div>`
      )
      .join('');
  }

  public showHitmarker(headshot: boolean): void {
    this.hitmarkerEl.classList.toggle('headshot', headshot);
    this.hitmarkerEl.classList.add('show');
    window.clearTimeout(this.hitmarkerTimeout);
    this.hitmarkerTimeout = window.setTimeout(() => {
      this.hitmarkerEl.classList.remove('show');
    }, 110);
  }

  public showDamagePopup(evt: DamagePopupEvent): void {
    const el = document.createElement('div');
    el.className = 'dmg-popup';
    el.textContent = String(evt.amount);
    el.style.left = `${evt.screenX + (Math.random() - 0.5) * 24}px`;
    el.style.top = `${evt.screenY - 12}px`;
    el.style.color = evt.isHeadshot ? '#facc15' : evt.isShield ? '#38bdf8' : '#ffffff';
    this.hudEl.appendChild(el);
    window.setTimeout(() => el.remove(), 660);
  }
}
