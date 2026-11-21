# ROLLOUT — 3D FiveM-Style Street PvP Web Game

**ROLLOUT** is a 3D Third-Person Street Fight & Pistol PvP web game inspired by FiveM Redzone combat with a clean **Fortnite-style UI & HUD**, **100% CC0 3D `.glb` models & skeletal animations**, **14 modular customizable character outfits**, **PC + Mobile touch controls**, and an **Anti-Lag Performance & Settings suite**.

## Play Online
- **GitHub Pages:** `https://nickadesa.github.io/rollout/` (auto-deployed via `.github/workflows/deploy.yml`)

## Features
- **FiveM-Style Movement & Combat Roll:** 360° Over-the-Shoulder TPS camera with wall-collision & Shoulder Swap (`Q`), directional Combat Roll with brief i-frames & stamina, sprinting, and smooth skeletal animations.
- **Street Fight + Pistol Loadout (4 Slots):**
  1. **Street Fists** — Fast close-range melee combo
  2. **Switchblade** — High-speed blade slash
  3. **Street Bat** — Heavy knockback melee swing
  4. **Combat Pistol** — ADS zoom, dynamic spread, headshot multiplier, tracers, reload
- **PvP Modes vs Smart AI Bots:** `1v1 Duel`, `2v2 Gang`, `3v3 Gang`, and `Free-For-All` (`Easy` / `Normal` / `Hard` bots that strafe, combat-roll, and switch between pistol & melee).
- **Character Locker (360° Turntable):** 14 rigged CC0 character outfits/hairstyles + live customization for Primary Color, Accent, Hair Color, Skin Tone, and Emote Preview.
- **Fortnite-Style Clean HUD & Mobile Gamepad:** Shield/HP/Stamina bars, elevated Weapon Hotbar, Kill Feed, Mini-Radar, Dynamic Crosshair, Hitmarkers, Floating Damage Numbers, and responsive Mobile Virtual Joystick + Action Buttons + Aim Assist.
- **5-Tab Settings & Anti-Lag Engine:** Quality Presets (`Ultra-Smooth` to `Ultra` + Auto-Detect), Resolution Scale, Dynamic Resolution Auto Anti-Lag, FPS Cap (`30/60/120/Unlimited`), Shadow Quality, View Distance/Fog, VFX Quality, Object-Pooled VFX, Controls/Mobile Button Scale & Opacity, Camera FOV & Shake, Audio Mixer, and HUD Scale.

## Controls
| Action | PC | Mobile |
| :--- | :--- | :--- |
| Move / Sprint | `WASD` + `Shift` | Left Virtual Joystick (push full = Sprint) |
| Look / Aim Camera | Mouse (Pointer Lock) | Drag Right Half of Screen |
| Attack / Shoot | `Left Click` | `FIRE` Button |
| Aim Down Sights | `Right Click` | `AIM` Button |
| Combat Roll | `Space` / `C` / `Alt` | `ROLL` Button |
| Switch Weapon | `1`–`4` / Mouse Wheel | Tap Hotbar Slots |
| Reload / Shoulder | `R` / `Q` | `R` / `Q` Buttons |

## Local Development
```bash
npm install
npm run dev
npm run build
```

## Asset Credits (CC0 / Open-Source)
- **Characters & Universal Animation Library:** Quaternius (CC0 1.0) via `benjamincanac/avelune`
- **Vehicles, Urban Props, Skyscrapers & Pistol:** Kenney (CC0 1.0) via `Gdevelop-game/GDevelop-Open-Game`
- **Switchblade Model:** `StarKnightt/counter-strike-in-browser` (open-source procedural GLB)
