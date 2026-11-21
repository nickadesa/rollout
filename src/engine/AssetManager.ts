import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_OUTFITS, WeaponId } from '../types';

export interface LoadedCharacterTemplate {
  scene: THREE.Group;
  file: string;
}

export class AssetManager {
  private loader = new GLTFLoader();
  private animations: Map<string, THREE.AnimationClip> = new Map();
  private characterCache: Map<string, THREE.Group> = new Map();
  private propCache: Map<string, THREE.Group> = new Map();
  private weaponCache: Map<WeaponId, THREE.Group> = new Map();

  public async preloadCore(onProgress?: (pct: number, label: string) => void): Promise<void> {
    const coreProps = [
      'police',
      'sedan-sports',
      'suv',
      'taxi',
      'truck',
      'van',
      'delivery',
      'dumpster',
      'construction-cone',
      'light-square',
      'light-square-double',
      'road-sign-stop',
      'traffic-light',
      'fence-1x3',
      'tree-large',
      'barrel',
      'cardboard-box-closed',
      'trashcan',
      'crate',
      'building-a',
      'building-d',
      'building-g',
      'building-m',
      'building-skyscraper-a',
      'building-skyscraper-c',
      'building-skyscraper-e',
    ];

    const totalSteps = 1 + 3 + coreProps.length;
    let done = 0;
    const step = (label: string) => {
      done++;
      onProgress?.(Math.min(100, Math.round((done / totalSteps) * 100)), label);
    };

    // 1. Shared Quaternius UAL 65-bone animation library
    const animGltf = await this.loadGLTF('./assets/animations/avelune-anims.glb');
    for (const clip of animGltf.animations) {
      this.animations.set(clip.name, clip);
    }
    step('Animations');

    // 2. Real 3D Weapon GLB models
    await Promise.all([
      this.loadWeaponModel('pistol', './assets/weapons/blaster-pistol.glb').then(() => step('Pistol')),
      this.loadWeaponModel('knife', './assets/weapons/knife.glb').then(() => step('Knife')),
      this.loadWeaponModel('bat', './assets/weapons/bat.glb').then(() => step('Street Bat')),
    ]);

    // 3. Arena Props (in parallel batches of 6 for mobile stability)
    for (let i = 0; i < coreProps.length; i += 6) {
      const batch = coreProps.slice(i, i + 6);
      await Promise.all(
        batch.map(async (name) => {
          try {
            const gltf = await this.loadGLTF(`./assets/props/${name}.glb`);
            this.prepareStaticMesh(gltf.scene);
            this.propCache.set(name, gltf.scene);
          } catch (err) {
            console.warn(`Failed to load prop ${name}:`, err);
          }
          step(`Arena ${name}`);
        })
      );
    }
  }

  private loadGLTF(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }

  private prepareStaticMesh(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }

  private async loadWeaponModel(id: WeaponId, url: string): Promise<void> {
    const gltf = await this.loadGLTF(url);
    const root = new THREE.Group();
    const raw = gltf.scene;

    // For CS2 knife.glb, strip out first-person viewmodel hands/arms so only the blade+handle remains
    if (id === 'knife') {
      const toRemove: THREE.Object3D[] = [];
      raw.traverse((obj) => {
        const n = obj.name.toLowerCase();
        if (n.includes('hand') || n.includes('arm') || n.includes('glove')) {
          toRemove.push(obj);
        }
      });
      toRemove.forEach((o) => o.parent?.remove(o));
    }

    // Normalize bounding box & center so it attaches cleanly to the character's hand_r bone
    raw.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(raw);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    let targetLen = 0.32;
    if (id === 'knife') targetLen = 0.34;
    if (id === 'bat') targetLen = 0.85;
    if (id === 'pistol') targetLen = 0.32;

    const scale = targetLen / maxDim;
    raw.scale.setScalar(scale);
    raw.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

    // Orient weapons cleanly for hand_r attachment
    if (id === 'pistol') {
      raw.rotation.set(0, Math.PI, 0);
      raw.position.z += 0.08;
    } else if (id === 'knife') {
      raw.rotation.set(Math.PI * 0.5, 0, 0);
      raw.position.y += 0.08;
    } else if (id === 'bat') {
      raw.rotation.set(0, 0, 0);
      raw.position.y += 0.32;
    }

    raw.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });

    root.add(raw);
    this.weaponCache.set(id, root);
  }

  public async getCharacterClone(outfitId: string): Promise<THREE.Group> {
    const def = CHARACTER_OUTFITS.find((o) => o.id === outfitId) ?? CHARACTER_OUTFITS[0];
    let template = this.characterCache.get(def.file);
    if (!template) {
      const gltf = await this.loadGLTF(`./assets/characters/${def.file}`);
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false; // prevent skinned mesh culling glitches during roll
        }
      });
      template = gltf.scene;
      this.characterCache.set(def.file, template);
    }

    const clone = SkeletonUtils.clone(template) as THREE.Group;
    // Clone materials per fighter so each fighter can have unique outfit/hair/skin colors
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });
    return clone;
  }

  public getWeaponClone(id: WeaponId): THREE.Group | null {
    const tpl = this.weaponCache.get(id);
    if (!tpl) return null;
    return tpl.clone(true);
  }

  public getPropClone(name: string): THREE.Group | null {
    const tpl = this.propCache.get(name);
    if (!tpl) return null;
    return tpl.clone(true);
  }

  public getAnimationClip(name: string): THREE.AnimationClip | undefined {
    return this.animations.get(name);
  }

  public getAllAnimations(): Map<string, THREE.AnimationClip> {
    return this.animations;
  }
}
