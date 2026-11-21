export type WeaponId = 'fists' | 'knife' | 'bat' | 'pistol';

export type GameMode = '1v1' | '2v2' | '3v3' | 'ffa';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type QualityPreset = 'ultra-smooth' | 'low' | 'medium' | 'high' | 'ultra';

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export type VfxQuality = 'off' | 'low' | 'high';

export type ViewDistance = 'short' | 'medium' | 'far';

export type AimAssistLevel = 'off' | 'light' | 'strong';

export interface WeaponDef {
  id: WeaponId;
  slot: number;
  name: string;
  shortName: string;
  type: 'melee' | 'ranged';
  damage: number;
  headshotMult: number;
  range: number;
  cooldown: number;
  knockback: number;
  magSize: number;
  reloadTime: number;
  spreadBase: number;
  spreadAds: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: {
    id: 'fists',
    slot: 1,
    name: 'Street Fists',
    shortName: 'FISTS',
    type: 'melee',
    damage: 18,
    headshotMult: 1.4,
    range: 2.1,
    cooldown: 0.36,
    knockback: 3.5,
    magSize: 0,
    reloadTime: 0,
    spreadBase: 0,
    spreadAds: 0,
  },
  knife: {
    id: 'knife',
    slot: 2,
    name: 'Switchblade',
    shortName: 'KNIFE',
    type: 'melee',
    damage: 32,
    headshotMult: 1.5,
    range: 2.4,
    cooldown: 0.44,
    knockback: 2.5,
    magSize: 0,
    reloadTime: 0,
    spreadBase: 0,
    spreadAds: 0,
  },
  bat: {
    id: 'bat',
    slot: 3,
    name: 'Street Bat',
    shortName: 'BAT',
    type: 'melee',
    damage: 45,
    headshotMult: 1.5,
    range: 2.9,
    cooldown: 0.68,
    knockback: 8.5,
    magSize: 0,
    reloadTime: 0,
    spreadBase: 0,
    spreadAds: 0,
  },
  pistol: {
    id: 'pistol',
    slot: 4,
    name: 'Combat Pistol',
    shortName: 'PISTOL',
    type: 'ranged',
    damage: 24,
    headshotMult: 2.0,
    range: 70,
    cooldown: 0.24,
    knockback: 1.2,
    magSize: 12,
    reloadTime: 1.35,
    spreadBase: 0.032,
    spreadAds: 0.008,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['fists', 'knife', 'bat', 'pistol'];

export interface CharacterOutfitOption {
  id: string;
  label: string;
  category: 'Street' | 'Tactical' | 'Jacket' | 'Armored';
  gender: 'Male' | 'Female';
  file: string;
}

export const CHARACTER_OUTFITS: CharacterOutfitOption[] = [
  { id: 'ranger-m-buzz', label: 'Street Runner (Buzz)', category: 'Tactical', gender: 'Male', file: 'Ranger_Male_Buzzed.glb' },
  { id: 'ranger-m-part', label: 'Street Runner (Parted)', category: 'Tactical', gender: 'Male', file: 'Ranger_Male_SimpleParted.glb' },
  { id: 'ranger-f-buns', label: 'Viper (Buns)', category: 'Tactical', gender: 'Female', file: 'Ranger_Female_Buns.glb' },
  { id: 'ranger-f-long', label: 'Viper (Long)', category: 'Tactical', gender: 'Female', file: 'Ranger_Female_Long.glb' },
  { id: 'peasant-m-buzz', label: 'OG Brawler (Buzz)', category: 'Street', gender: 'Male', file: 'Peasant_Male_Buzzed.glb' },
  { id: 'peasant-m-part', label: 'OG Brawler (Parted)', category: 'Street', gender: 'Male', file: 'Peasant_Male_SimpleParted.glb' },
  { id: 'peasant-f-buns', label: 'Hustler (Buns)', category: 'Street', gender: 'Female', file: 'Peasant_Female_Buns.glb' },
  { id: 'peasant-f-long', label: 'Hustler (Long)', category: 'Street', gender: 'Female', file: 'Peasant_Female_Long.glb' },
  { id: 'noble-m-buzz', label: 'Boss Jacket (Buzz)', category: 'Jacket', gender: 'Male', file: 'Noble_Male_Buzzed.glb' },
  { id: 'noble-m-part', label: 'Boss Jacket (Parted)', category: 'Jacket', gender: 'Male', file: 'Noble_Male_SimpleParted.glb' },
  { id: 'noble-f-buns', label: 'Syndicate (Buns)', category: 'Jacket', gender: 'Female', file: 'Noble_Female_Buns.glb' },
  { id: 'noble-f-long', label: 'Syndicate (Long)', category: 'Jacket', gender: 'Female', file: 'Noble_Female_Long.glb' },
  { id: 'knight-m', label: 'Heavy Enforcer (M)', category: 'Armored', gender: 'Male', file: 'Knight_Male.glb' },
  { id: 'knight-f', label: 'Heavy Enforcer (F)', category: 'Armored', gender: 'Female', file: 'Knight_Female.glb' },
];

export interface CharacterAppearance {
  outfitId: string;
  primaryColor: string;
  accentColor: string;
  hairColor: string;
  skinColor: string;
}

export interface GameSettings {
  // Graphics & Anti-Lag
  qualityPreset: QualityPreset;
  resolutionScale: number; // 0.5 .. 1.0
  dynamicResolution: boolean;
  fpsLimit: 0 | 30 | 60 | 120;
  shadowQuality: ShadowQuality;
  antiAliasing: boolean;
  viewDistance: ViewDistance;
  vfxQuality: VfxQuality;
  showFps: boolean;

  // Controls & Mobile
  mouseSensitivity: number; // 0.2 .. 2.5
  adsSensitivityMult: number; // 0.3 .. 1.0
  touchSensitivity: number; // 0.3 .. 2.5
  mobileAimAssist: AimAssistLevel;
  adsMode: 'hold' | 'toggle';
  autoSprint: boolean;
  mobileButtonScale: number; // 0.8 .. 1.3
  mobileButtonOpacity: number; // 0.3 .. 1.0
  invertY: boolean;

  // Camera & Gameplay
  fov: number; // 60 .. 95
  cameraDistance: 'close' | 'medium' | 'far';
  shoulderSide: 'right' | 'left';
  cameraShake: 'off' | 'low' | 'normal';
  crosshairColor: string;
  crosshairSize: number; // 0.7 .. 1.5
  floatingDamage: boolean;

  // Audio
  masterVolume: number; // 0 .. 1
  sfxVolume: number; // 0 .. 1
  hitmarkerVolume: number; // 0 .. 1
  uiVolume: number; // 0 .. 1
  muted: boolean;

  // HUD
  hudScale: number; // 0.8 .. 1.2
  showKillFeed: boolean;
  showRadar: boolean;
  showControlsHint: boolean;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  killerTeam: number;
  victimTeam: number;
  timestamp: number;
}

export interface DamagePopupEvent {
  amount: number;
  isShield: boolean;
  isHeadshot: boolean;
  screenX: number;
  screenY: number;
}

export interface RadarDot {
  x: number; // normalized -1..1
  z: number; // normalized -1..1
  team: number;
  isSelf: boolean;
  alive: boolean;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  maxStamina: number;
  weapon: WeaponId;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadProgress: number;
  isAiming: boolean;
  isRolling: boolean;
  rollCooldownRatio: number;
  spread: number;
  kills: number;
  deaths: number;
  teamScore: number;
  enemyScore: number;
  targetScore: number;
  mode: GameMode;
  fps: number;
  frameMs: number;
  currentResScale: number;
  aliveRespawnTimer: number;
  radarDots: RadarDot[];
  matchOver: boolean;
  victory: boolean;
}
