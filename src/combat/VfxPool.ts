import * as THREE from 'three';
import { VfxQuality } from '../types';

interface TracerItem {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface SparkItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

/**
 * Object-pooled VFX system — zero per-frame allocations to prevent GC stutters on mobile.
 */
export class VfxPool {
  private scene: THREE.Scene;
  private tracers: TracerItem[] = [];
  private sparks: SparkItem[] = [];
  private quality: VfxQuality = 'high';

  private tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4);
  private sparkGeo = new THREE.OctahedronGeometry(0.06, 0);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tracerGeo.rotateX(Math.PI / 2);

    // Pre-allocate tracer pool
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: 0.08 });
    }

    // Pre-allocate spark/dust pool
    for (let i = 0; i < 64; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.3 });
    }
  }

  public setQuality(q: VfxQuality): void {
    this.quality = q;
    if (q === 'off') {
      this.tracers.forEach((t) => {
        t.life = 0;
        t.mesh.visible = false;
      });
      this.sparks.forEach((s) => {
        s.life = 0;
        s.mesh.visible = false;
      });
    }
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color = 0xffe066): void {
    if (this.quality === 'off') return;
    const item = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    const dist = start.distanceTo(end);
    if (dist < 0.1) return;

    item.mesh.position.copy(start).lerp(end, 0.5);
    item.mesh.lookAt(end);
    item.mesh.scale.set(1, 1, dist);
    const mat = item.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.92;
    item.mesh.visible = true;
    item.life = 0.075;
    item.maxLife = 0.075;
  }

  public spawnHitBurst(pos: THREE.Vector3, color = 0xffdd55, count = 7): void {
    if (this.quality === 'off') return;
    const n = this.quality === 'low' ? Math.max(2, Math.floor(count / 2)) : count;
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.mesh.position.copy(pos);
      s.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
      s.vel.set(
        (Math.random() - 0.5) * 6,
        1.5 + Math.random() * 4,
        (Math.random() - 0.5) * 6
      );
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 1;
      s.mesh.visible = true;
      s.life = 0.24 + Math.random() * 0.14;
      s.maxLife = s.life;
      spawned++;
      if (spawned >= n) break;
    }
  }

  public spawnRollDust(pos: THREE.Vector3): void {
    this.spawnHitBurst(
      new THREE.Vector3(pos.x, pos.y + 0.15, pos.z),
      0xcbd5e1,
      5
    );
  }

  public update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
      } else {
        (t.mesh.material as THREE.MeshBasicMaterial).opacity = t.life / t.maxLife;
      }
    }

    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
      } else {
        s.vel.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        const ratio = s.life / s.maxLife;
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
        s.mesh.scale.setScalar(ratio);
      }
    }
  }
}
