import * as THREE from 'three';
import { BotDifficulty, WeaponId } from '../types';
import { Fighter, FighterInput } from '../entities/Fighter';

export class BotController {
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 1.2 + Math.random() * 1.5;
  private preferredMelee: WeaponId;
  private difficulty: BotDifficulty;
  private reactionTimer = 0;

  constructor(difficulty: BotDifficulty) {
    this.difficulty = difficulty;
    const melees: WeaponId[] = ['fists', 'knife', 'bat'];
    this.preferredMelee = melees[Math.floor(Math.random() * melees.length)];
  }

  public setDifficulty(diff: BotDifficulty): void {
    this.difficulty = diff;
  }

  public computeInput(
    bot: Fighter,
    allFighters: Fighter[],
    dt: number,
    hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => boolean
  ): FighterInput {
    const empty: FighterInput = {
      moveX: 0,
      moveZ: 0,
      yaw: bot.yaw,
      pitch: 0,
      sprint: false,
      aiming: false,
      fire: false,
      roll: false,
      reload: false,
    };

    if (!bot.alive) return empty;

    // Find nearest living enemy
    let target: Fighter | null = null;
    let bestDist = Infinity;
    for (const f of allFighters) {
      if (f.id === bot.id || !f.alive || f.team === bot.team) continue;
      const d = bot.position.distanceTo(f.position);
      if (d < bestDist) {
        bestDist = d;
        target = f;
      }
    }
    if (!target) return empty;

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = -this.strafeDir;
      this.strafeTimer = 0.9 + Math.random() * 1.6;
    }
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);

    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(dx, dz);

    // Switch between Street Melee (close) and Pistol (mid-far)
    if (dist < 3.4) {
      if (bot.weapon !== this.preferredMelee) bot.equipWeapon(this.preferredMelee);
    } else if (dist > 5.0) {
      if (bot.weapon !== 'pistol') bot.equipWeapon('pistol');
    }

    // Reload when empty
    if (bot.weapon === 'pistol' && bot.ammo <= 0 && !bot.reloading) {
      return { ...empty, yaw: desiredYaw, reload: true, moveX: this.strafeDir * 0.8 };
    }

    const fromEye = bot.getHeadWorldPos();
    const toTarget = target.getTorsoWorldPos();
    const canSee = hasLineOfSight(fromEye, toTarget);

    let moveX = this.strafeDir * (dist < 14 ? 0.85 : 0.35);
    let moveZ = 0;
    let sprint = false;
    let aiming = false;
    let fire = false;
    let roll = false;

    if (bot.weapon === 'pistol') {
      if (!canSee || dist > 16) {
        moveZ = 1;
        sprint = dist > 14;
      } else if (dist < 7) {
        moveZ = -0.55;
      } else {
        moveZ = 0.2;
      }

      if (canSee && dist < 34) {
        aiming = this.difficulty !== 'easy';
        const fireChance =
          this.difficulty === 'hard' ? 0.92 : this.difficulty === 'normal' ? 0.65 : 0.38;
        if (this.reactionTimer <= 0 && Math.random() < fireChance) {
          fire = true;
          this.reactionTimer =
            this.difficulty === 'hard' ? 0.14 : this.difficulty === 'normal' ? 0.28 : 0.45;
        }
      }
    } else {
      // Aggressive street melee rush
      moveZ = 1;
      sprint = dist > 2.5;
      if (dist <= 2.7) {
        fire = true;
      }
    }

    // Tactical FiveM Combat Roll when under pressure or dodging
    const rollProb =
      this.difficulty === 'hard' ? 0.022 : this.difficulty === 'normal' ? 0.012 : 0.004;
    if (canSee && dist < 18 && bot.rollCooldown <= 0 && Math.random() < rollProb) {
      roll = true;
    }

    // Slight aim error based on difficulty
    const aimJitter =
      this.difficulty === 'hard' ? 0.035 : this.difficulty === 'normal' ? 0.075 : 0.14;
    const noisyYaw = desiredYaw + (Math.random() - 0.5) * aimJitter;

    return {
      moveX,
      moveZ,
      yaw: noisyYaw,
      pitch: 0,
      sprint,
      aiming,
      fire,
      roll,
      reload: false,
    };
  }
}
