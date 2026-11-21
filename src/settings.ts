import { CharacterAppearance, GameSettings, QualityPreset } from './types';

const SETTINGS_KEY = 'rollout_settings_v1';
const APPEARANCE_KEY = 'rollout_appearance_v1';

export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
}

export function getPresetValues(preset: QualityPreset): Partial<GameSettings> {
  switch (preset) {
    case 'ultra-smooth':
      return {
        qualityPreset: 'ultra-smooth',
        resolutionScale: 0.65,
        dynamicResolution: true,
        fpsLimit: 60,
        shadowQuality: 'off',
        antiAliasing: false,
        viewDistance: 'short',
        vfxQuality: 'low',
      };
    case 'low':
      return {
        qualityPreset: 'low',
        resolutionScale: 0.75,
        dynamicResolution: true,
        fpsLimit: 60,
        shadowQuality: 'low',
        antiAliasing: false,
        viewDistance: 'medium',
        vfxQuality: 'low',
      };
    case 'medium':
      return {
        qualityPreset: 'medium',
        resolutionScale: 0.9,
        dynamicResolution: true,
        fpsLimit: 60,
        shadowQuality: 'medium',
        antiAliasing: true,
        viewDistance: 'medium',
        vfxQuality: 'high',
      };
    case 'high':
      return {
        qualityPreset: 'high',
        resolutionScale: 1.0,
        dynamicResolution: false,
        fpsLimit: 0,
        shadowQuality: 'high',
        antiAliasing: true,
        viewDistance: 'far',
        vfxQuality: 'high',
      };
    case 'ultra':
      return {
        qualityPreset: 'ultra',
        resolutionScale: 1.0,
        dynamicResolution: false,
        fpsLimit: 0,
        shadowQuality: 'high',
        antiAliasing: true,
        viewDistance: 'far',
        vfxQuality: 'high',
      };
  }
}

export function createDefaultSettings(): GameSettings {
  const mobile = isTouchDevice();
  const basePreset: QualityPreset = mobile ? 'low' : 'high';
  const presetVals = getPresetValues(basePreset);

  return {
    qualityPreset: basePreset,
    resolutionScale: presetVals.resolutionScale ?? 1.0,
    dynamicResolution: presetVals.dynamicResolution ?? mobile,
    fpsLimit: (presetVals.fpsLimit ?? (mobile ? 60 : 0)) as 0 | 30 | 60 | 120,
    shadowQuality: presetVals.shadowQuality ?? (mobile ? 'low' : 'high'),
    antiAliasing: presetVals.antiAliasing ?? !mobile,
    viewDistance: presetVals.viewDistance ?? (mobile ? 'medium' : 'far'),
    vfxQuality: presetVals.vfxQuality ?? (mobile ? 'low' : 'high'),
    showFps: true,

    mouseSensitivity: 1.0,
    adsSensitivityMult: 0.6,
    touchSensitivity: 1.15,
    mobileAimAssist: 'light',
    adsMode: mobile ? 'toggle' : 'hold',
    autoSprint: mobile,
    mobileButtonScale: 1.0,
    mobileButtonOpacity: 0.85,
    invertY: false,

    fov: 72,
    cameraDistance: 'medium',
    shoulderSide: 'right',
    cameraShake: 'normal',
    crosshairColor: '#ffffff',
    crosshairSize: 1.0,
    floatingDamage: true,

    masterVolume: 0.75,
    sfxVolume: 0.85,
    hitmarkerVolume: 0.9,
    uiVolume: 0.65,
    muted: false,

    hudScale: 1.0,
    showKillFeed: true,
    showRadar: true,
    showControlsHint: !mobile,
  };
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  outfitId: 'ranger-m-buzz',
  primaryColor: '#1e90ff',
  accentColor: '#facc15',
  hairColor: '#1f1a17',
  skinColor: '#e0ac88',
};

export class SettingsManager {
  private settings: GameSettings;
  private appearance: CharacterAppearance;
  private listeners: Array<(s: GameSettings) => void> = [];

  constructor() {
    this.settings = this.loadSettings();
    this.appearance = this.loadAppearance();
  }

  private loadSettings(): GameSettings {
    const defaults = createDefaultSettings();
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  private loadAppearance(): CharacterAppearance {
    try {
      const raw = localStorage.getItem(APPEARANCE_KEY);
      if (!raw) return { ...DEFAULT_APPEARANCE };
      return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_APPEARANCE };
    }
  }

  public get(): GameSettings {
    return this.settings;
  }

  public update(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage quota errors
    }
    this.listeners.forEach((fn) => fn(this.settings));
  }

  public applyPreset(preset: QualityPreset): void {
    this.update(getPresetValues(preset));
  }

  public reset(): void {
    this.settings = createDefaultSettings();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    this.listeners.forEach((fn) => fn(this.settings));
  }

  public onChange(fn: (s: GameSettings) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public getAppearance(): CharacterAppearance {
    return this.appearance;
  }

  public saveAppearance(app: CharacterAppearance): void {
    this.appearance = { ...app };
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(this.appearance));
    } catch {
      // ignore
    }
  }
}
