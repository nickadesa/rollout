import * as THREE from 'three';
import {
  CharacterAppearance,
  WEAPONS,
  WeaponId,
} from '../types';
import { AssetManager } from '../engine/AssetManager';
import { ArenaCollider } from '../world/ArenaBuilder';

export type FighterAnimState =
  | 'idle'
  | 'walk'
  | 'jog'
  | 'sprint'
  | 'roll'
  | 'melee_a'
  | 'melee_b'
  | 'shoot'
  | 'dead'
  | 'dance';

export interface FighterInput {
  moveX: number; // -1..1 in camera/local right
  moveZ: number; // -1..1 in camera/local forward
  yaw: number;   // facing yaw
  pitch: number; // aim pitch
  sprint: boolean;
  aiming: boolean;
  fire: boolean;
  roll: boolean;
  reload: boolean;
}

export class Fighter {
  public readonly id: string;
  public readonly name: string;
  public readonly team: number; // 0 = Player/Blue, 1 = Enemy/Red, or unique in FFA
  public readonly isPlayer: boolean;

  public root = new THREE.Group();
  public model: THREE.Group | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAnim: string = '';

  // Bones for weapon attachment & procedural pistol aiming
  private handRightBone: THREE.Object3D | null = null;
  private upperArmRightBone: THREE.Object3D | null = null;
  private lowerArmRightBone: THREE.Object3D | null = null;
  private spineBone: THREE.Object3D | null = null;
  private weaponMount = new THREE.Group();
  private weaponMeshes: Partial<Record<WeaponId, THREE.Group>> = {};

  // Appearance
  public appearance: CharacterAppearance;

  // Physics & Transform
  public position = new THREE.Vector3();
  public velocity = new THREE.Vector3();
  public yaw = 0;
  public pitch = 0;
  public readonly radius = 0.45;
  public readonly height = 1.75;

  // Combat State
  public hp = 100;
  public maxHp = 100;
  public shield = 50;
  public maxShield = 50;
  public stamina = 100;
  public maxStamina = 100;
  public alive = true;
  public respawnTimer = 0;

  // Weapon State
  public weapon: WeaponId = 'pistol';
  public ammo = WEAPONS.pistol.magSize;
  public reloading = false;
  public reloadTimer = 0;
  public attackCooldown = 0;
  public attackAnimTimer = 0;
  public meleeCombo = 0;
  public isAiming = false;
  public recoilKick = 0;
  public currentSpread = WEAPONS.pistol.spreadBase;

  // FiveM Combat Roll State
  public isRolling = false;
  public rollTimer = 0;
  public rollDuration = 0.52;
  public rollCooldown = 0;
  public rollMaxCooldown = 1.05;
  public rollDir = new THREE.Vector3();
  public invulnTimer = 0;

  // Stats
  public kills = 0;
  public deaths = 0;

  // Team ring indicator under feet (subtle, clean)
  private teamRing: THREE.Mesh;

  private assets: AssetManager;

  constructor(
    id: string,
    name: string,
    team: number,
    isPlayer: boolean,
    appearance: CharacterAppearance,
    assets: AssetManager
  ) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.appearance = { ...appearance };
    this.assets = assets;

    // Subtle ground ring to distinguish allies/enemies cleanly
    const ringGeo = new THREE.RingGeometry(0.42, 0.54, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringColor = isPlayer ? 0x38bdf8 : team === 0 ? 0x22c55e : 0xf43f5e;
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: isPlayer ? 0.45 : 0.65,
      side: THREE.DoubleSide,
    });
    this.teamRing = new THREE.Mesh(ringGeo, ringMat);
    this.teamRing.position.y = 0.03;
    this.root.add(this.teamRing);
  }

  public async loadModel(appearance?: CharacterAppearance): Promise<void> {
    if (appearance) {
      this.appearance = { ...appearance };
    }
    if (this.model) {
      this.root.remove(this.model);
      this.mixer?.stopAllAction();
      this.actions.clear();
    }

    const clone = await this.assets.getCharacterClone(this.appearance.outfitId);
    this.model = clone;
    this.root.add(clone);

    // Find bones
    this.handRightBone = null;
    this.upperArmRightBone = null;
    this.lowerArmRightBone = null;
    this.spineBone = null;

    clone.traverse((obj) => {
      if (obj.name === 'hand_r') this.handRightBone = obj;
      if (obj.name === 'upperarm_r') this.upperArmRightBone = obj;
      if (obj.name === 'lowerarm_r') this.lowerArmRightBone = obj;
      if (obj.name === 'spine_02') this.spineBone = obj;
    });

    // Attach weapon mount to hand_r
    this.weaponMount.clear();
    this.weaponMeshes = {};
    const weaponIds: WeaponId[] = ['pistol', 'knife', 'bat'];
    for (const wid of weaponIds) {
      const wMesh = this.assets.getWeaponClone(wid);
      if (wMesh) {
        wMesh.visible = false;
        this.weaponMount.add(wMesh);
        this.weaponMeshes[wid] = wMesh;
      }
    }
    const handBone = this.handRightBone as THREE.Object3D | null;
    if (handBone) {
      handBone.add(this.weaponMount);
    }

    // Bind shared Quaternius UAL animations directly by bone name
    this.mixer = new THREE.AnimationMixer(clone);
    const clipNames = [
      'Idle_Loop',
      'Walk_Loop',
      'Jog_Fwd_Loop',
      'Sprint_Loop',
      'Roll',
      'Sword_Regular_A',
      'Sword_Dash',
      'OverhandThrow',
      'Spell_Simple_Shoot',
      'Death01',
      'Dance_Loop',
    ];
    for (const cn of clipNames) {
      const clip = this.assets.getAnimationClip(cn);
      if (clip) {
        const action = this.mixer.clipAction(clip);
        if (
          cn === 'Roll' ||
          cn === 'Death01' ||
          cn === 'Sword_Regular_A' ||
          cn === 'Sword_Dash' ||
          cn === 'OverhandThrow' ||
          cn === 'Spell_Simple_Shoot'
        ) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = cn === 'Death01';
        }
        this.actions.set(cn, action);
      }
    }

    this.applyAppearance(this.appearance);
    this.equipWeapon(this.weapon);
    this.currentAnim = '';
    this.playClip('Idle_Loop', 0.05);
  }

  public applyAppearance(app: CharacterAppearance): void {
    this.appearance = { ...app };
    if (!this.model) return;

    const primary = new THREE.Color(app.primaryColor);
    const accent = new THREE.Color(app.accentColor);
    const hair = new THREE.Color(app.hairColor);
    const skin = new THREE.Color(app.skinColor);

    this.model.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std || !std.color) continue;
        const n = std.name || '';
        if (n.includes('Hair')) {
          std.color.copy(hair);
        } else if (n.includes('Superhero') || n.includes('Regular')) {
          std.color.copy(skin);
        } else if (n.includes('Eyes')) {
          // keep eyes crisp
        } else if (n.endsWith('.001')) {
          std.color.copy(accent);
        } else if (n.startsWith('MI_')) {
          std.color.copy(primary);
        }
      }
    });
  }

  public equipWeapon(id: WeaponId): void {
    if (this.weapon !== id) {
      this.reloading = false;
      this.reloadTimer = 0;
    }
    this.weapon = id;
    (['pistol', 'knife', 'bat'] as WeaponId[]).forEach((wid) => {
      const m = this.weaponMeshes[wid];
      if (m) m.visible = wid === id;
    });
  }

  public spawnAt(pos: THREE.Vector3, yaw = 0): void {
    this.position.copy(pos);
    this.position.y = 0;
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.respawnTimer = 0;
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollCooldown = 0;
    this.invulnTimer = 0.6;
    this.ammo = WEAPONS.pistol.magSize;
    this.reloading = false;
    this.reloadTimer = 0;
    this.attackCooldown = 0;
    this.attackAnimTimer = 0;
    this.teamRing.visible = true;
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.playClip('Idle_Loop', 0.1, true);
  }

  public startRoll(worldDir: THREE.Vector3): boolean {
    if (!this.alive || this.isRolling || this.rollCooldown > 0 || this.stamina < 24) {
      return false;
    }
    this.isRolling = true;
    this.rollTimer = this.rollDuration;
    this.rollCooldown = this.rollMaxCooldown;
    this.invulnTimer = 0.36; // brief i-frames during FiveM Combat Roll
    this.stamina = Math.max(0, this.stamina - 24);
    this.reloading = false;
    this.reloadTimer = 0;

    if (worldDir.lengthSq() > 0.01) {
      this.rollDir.copy(worldDir).normalize();
    } else {
      this.rollDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }
    this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.playClip('Roll', 0.06, true, 1.35);
    return true;
  }

  public startReload(): boolean {
    const def = WEAPONS[this.weapon];
    if (
      !this.alive ||
      this.isRolling ||
      def.type !== 'ranged' ||
      this.reloading ||
      this.ammo >= def.magSize
    ) {
      return false;
    }
    this.reloading = true;
    this.reloadTimer = def.reloadTime;
    return true;
  }

  public triggerAttackAnim(): void {
    if (this.weapon === 'pistol') {
      this.recoilKick = 1.0;
      this.attackAnimTimer = 0.14;
      this.playClip('Spell_Simple_Shoot', 0.04, true, 1.9);
    } else if (this.weapon === 'fists') {
      this.meleeCombo = (this.meleeCombo + 1) % 2;
      this.attackAnimTimer = 0.32;
      this.playClip(this.meleeCombo === 0 ? 'OverhandThrow' : 'Sword_Regular_A', 0.05, true, 1.75);
    } else if (this.weapon === 'knife') {
      this.attackAnimTimer = 0.34;
      this.playClip('Sword_Regular_A', 0.05, true, 1.85);
    } else {
      this.attackAnimTimer = 0.48;
      this.playClip('Sword_Dash', 0.06, true, 1.35);
    }
  }

  public takeDamage(
    amount: number,
    knockbackDir?: THREE.Vector3,
    knockbackForce = 0
  ): { dealt: number; hitShield: boolean; shieldBroke: boolean; killed: boolean } {
    if (!this.alive || this.invulnTimer > 0) {
      return { dealt: 0, hitShield: false, shieldBroke: false, killed: false };
    }

    let remaining = Math.round(amount);
    let hitShield = false;
    let shieldBroke = false;

    if (this.shield > 0) {
      hitShield = true;
      if (this.shield >= remaining) {
        this.shield -= remaining;
        remaining = 0;
      } else {
        remaining -= this.shield;
        this.shield = 0;
        shieldBroke = true;
      }
    }

    if (remaining > 0) {
      this.hp = Math.max(0, this.hp - remaining);
    }

    if (knockbackDir && knockbackForce > 0) {
      this.velocity.addScaledVector(knockbackDir, knockbackForce);
    }

    const killed = this.hp <= 0;
    if (killed) {
      this.alive = false;
      this.deaths++;
      this.respawnTimer = 3.2;
      this.isRolling = false;
      this.teamRing.visible = false;
      this.playClip('Death01', 0.08, true, 1.1);
    }

    return { dealt: Math.round(amount), hitShield, shieldBroke, killed };
  }

  public update(
    dt: number,
    input: FighterInput,
    colliders: ArenaCollider[],
    arenaHalfSize: number
  ): void {
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackAnimTimer = Math.max(0, this.attackAnimTimer - dt);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 6.5);

    if (!this.alive) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      this.mixer?.update(dt);
      return;
    }

    // Reload timer
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = WEAPONS.pistol.magSize;
      }
    }

    this.isAiming = input.aiming && this.weapon === 'pistol' && !this.isRolling;
    this.pitch = input.pitch;

    // Movement vector in world space from input yaw
    const moveLen = Math.hypot(input.moveX, input.moveZ);
    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    const wishDir = new THREE.Vector3(
      forwardX * input.moveZ + rightX * input.moveX,
      0,
      forwardZ * input.moveZ + rightZ * input.moveX
    );
    if (wishDir.lengthSq() > 0.001) wishDir.normalize();

    if (this.isRolling) {
      this.rollTimer -= dt;
      const rollSpeed = 9.2;
      this.position.x += this.rollDir.x * rollSpeed * dt;
      this.position.z += this.rollDir.z * rollSpeed * dt;
      if (this.rollTimer <= 0) {
        this.isRolling = false;
      }
    } else {
      const sprinting = input.sprint && moveLen > 0.25 && !this.isAiming && this.stamina > 3;
      const speed = this.isAiming ? 3.2 : sprinting ? 7.0 : 4.8;

      if (sprinting) {
        this.stamina = Math.max(0, this.stamina - 18 * dt);
      } else {
        this.stamina = Math.min(this.maxStamina, this.stamina + 24 * dt);
      }

      if (moveLen > 0.05) {
        this.position.x += wishDir.x * speed * Math.min(1, moveLen) * dt;
        this.position.z += wishDir.z * speed * Math.min(1, moveLen) * dt;
      }

      // Apply knockback velocity with smooth damping
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.velocity.multiplyScalar(Math.max(0, 1 - 10 * dt));

      // Character facing: face aim yaw when aiming/shooting/attacking, else smoothly face movement direction
      let targetYaw = this.yaw;
      if (this.isAiming || this.attackAnimTimer > 0 || this.weapon === 'pistol') {
        targetYaw = input.yaw;
      } else if (moveLen > 0.1) {
        targetYaw = Math.atan2(wishDir.x, wishDir.z);
      }
      this.yaw = lerpAngle(this.yaw, targetYaw, Math.min(1, dt * 14));

      // Animation selection
      if (this.attackAnimTimer <= 0) {
        if (moveLen < 0.1) {
          this.playClip('Idle_Loop', 0.14);
        } else if (sprinting) {
          this.playClip('Sprint_Loop', 0.12);
        } else if (this.isAiming) {
          this.playClip('Walk_Loop', 0.12);
        } else {
          this.playClip('Jog_Fwd_Loop', 0.12);
        }
      }
    }

    // Dynamic spread calculation for crosshair & pistol accuracy
    const wDef = WEAPONS.pistol;
    const baseSpread = this.isAiming ? wDef.spreadAds : wDef.spreadBase;
    const movePenalty = moveLen > 0.1 ? (input.sprint ? 0.025 : 0.012) : 0;
    const targetSpread = baseSpread + movePenalty + this.recoilKick * 0.02;
    this.currentSpread += (targetSpread - this.currentSpread) * Math.min(1, dt * 12);

    // Resolve collisions against arena bounds & GLB prop boxes
    this.resolveCollisions(colliders, arenaHalfSize);

    // Update Three.js transform
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;

    // Advance skeletal animation
    this.mixer?.update(dt);

    // Procedural upper-body pistol aiming & recoil overlay (cleanly layered post-mixer)
    if (this.weapon === 'pistol' && !this.isRolling && this.alive) {
      if (this.upperArmRightBone) {
        this.upperArmRightBone.rotation.x += -1.05 - this.pitch * 0.65 - this.recoilKick * 0.25;
        this.upperArmRightBone.rotation.z += 0.22;
      }
      if (this.lowerArmRightBone) {
        this.lowerArmRightBone.rotation.x += -0.35;
      }
      if (this.spineBone && this.isAiming) {
        this.spineBone.rotation.x += this.pitch * 0.25;
      }
    }
  }

  public updateLobbyIdle(dt: number, dance = false): void {
    this.playClip(dance ? 'Dance_Loop' : 'Idle_Loop', 0.2);
    this.mixer?.update(dt);
  }

  private resolveCollisions(colliders: ArenaCollider[], halfSize: number): void {
    // Arena boundary clamp
    this.position.x = Math.max(-halfSize, Math.min(halfSize, this.position.x));
    this.position.z = Math.max(-halfSize, Math.min(halfSize, this.position.z));

    // Circle vs AABB push-out
    for (const c of colliders) {
      const closestX = Math.max(c.box.min.x, Math.min(this.position.x, c.box.max.x));
      const closestZ = Math.max(c.box.min.z, Math.min(this.position.z, c.box.max.z));
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < this.radius * this.radius) {
        if (distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = this.radius - dist;
          this.position.x += (dx / dist) * push;
          this.position.z += (dz / dist) * push;
        } else {
          // Inside box center fallback
          const overlapX = Math.min(
            Math.abs(this.position.x - c.box.min.x),
            Math.abs(c.box.max.x - this.position.x)
          );
          const overlapZ = Math.min(
            Math.abs(this.position.z - c.box.min.z),
            Math.abs(c.box.max.z - this.position.z)
          );
          if (overlapX < overlapZ) {
            this.position.x =
              this.position.x < c.center.x ? c.box.min.x - this.radius : c.box.max.x + this.radius;
          } else {
            this.position.z =
              this.position.z < c.center.z ? c.box.min.z - this.radius : c.box.max.z + this.radius;
          }
        }
      }
    }
  }

  public getMuzzleWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.handRightBone) {
      this.handRightBone.getWorldPosition(out);
      out.x += Math.sin(this.yaw) * 0.35;
      out.z += Math.cos(this.yaw) * 0.35;
      return out;
    }
    return out.set(
      this.position.x + Math.sin(this.yaw) * 0.5,
      this.position.y + 1.38,
      this.position.z + Math.cos(this.yaw) * 0.5
    );
  }

  public getHeadWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + 1.56, this.position.z);
  }

  public getTorsoWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + 1.05, this.position.z);
  }

  private playClip(name: string, fade = 0.12, forceRestart = false, speed = 1.0): void {
    if (!this.mixer) return;
    if (this.currentAnim === name && !forceRestart) return;
    const next = this.actions.get(name);
    if (!next) return;

    const prev = this.actions.get(this.currentAnim);
    next.reset();
    next.setEffectiveTimeScale(speed);
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fade, false);
    }
    this.currentAnim = name;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
