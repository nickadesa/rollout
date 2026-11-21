import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager';

export interface ArenaCollider {
  box: THREE.Box3;
  center: THREE.Vector3;
  isCover: boolean;
}

export interface ArenaData {
  group: THREE.Group;
  colliders: ArenaCollider[];
  raycastMeshes: THREE.Object3D[];
  spawnPointsTeamA: THREE.Vector3[];
  spawnPointsTeamB: THREE.Vector3[];
  spawnPointsFFA: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  arenaHalfSize: number;
}

export class ArenaBuilder {
  private assets: AssetManager;

  constructor(assets: AssetManager) {
    this.assets = assets;
  }

  public build(): ArenaData {
    const group = new THREE.Group();
    const colliders: ArenaCollider[] = [];
    const raycastMeshes: THREE.Object3D[] = [];
    const coverPoints: THREE.Vector3[] = [];
    const arenaHalfSize = 27;

    // 1. Crisp Asphalt Ground with Road Markings (CanvasTexture — crisp & zero external texture fetch)
    const groundTex = this.createAsphaltTexture();
    const groundGeo = new THREE.PlaneGeometry(140, 140);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    raycastMeshes.push(ground);

    // Helper to place a real CC0 GLB prop and register its exact collision box
    const placeProp = (
      name: string,
      x: number,
      z: number,
      rotY = 0,
      scale = 1,
      collide = true,
      isCover = false
    ) => {
      const model = this.assets.getPropClone(name);
      if (!model) return;
      model.position.set(x, 0, z);
      model.rotation.y = rotY;
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);

      // Snap bottom of model cleanly onto ground Y=0
      const box = new THREE.Box3().setFromObject(model);
      if (isFinite(box.min.y)) {
        model.position.y -= box.min.y;
        model.updateMatrixWorld(true);
        box.setFromObject(model);
      }

      group.add(model);
      if (collide) {
        // Slightly tighten horizontal box for smooth sliding around props
        box.min.x += 0.08;
        box.max.x -= 0.08;
        box.min.z += 0.08;
        box.max.z -= 0.08;
        const center = new THREE.Vector3();
        box.getCenter(center);
        colliders.push({ box, center, isCover });
        raycastMeshes.push(model);

        if (isCover) {
          // Add tactical cover points around this obstacle
          const pad = 1.35;
          coverPoints.push(
            new THREE.Vector3(box.min.x - pad, 0, center.z),
            new THREE.Vector3(box.max.x + pad, 0, center.z),
            new THREE.Vector3(center.x, 0, box.min.z - pad),
            new THREE.Vector3(center.x, 0, box.max.z + pad)
          );
        }
      }
    };

    // 2. Central Street Fight / Redzone Vehicles & Cover (Los Santos Port Vibe)
    placeProp('truck', 0, -2, Math.PI * 0.12, 1.55, true, true);
    placeProp('police', -9.5, 5.5, Math.PI * 0.32, 1.55, true, true);
    placeProp('sedan-sports', 10, -7, -Math.PI * 0.25, 1.55, true, true);
    placeProp('suv', -11, -10, Math.PI * 0.72, 1.55, true, true);
    placeProp('taxi', 11.5, 9.5, -Math.PI * 0.65, 1.55, true, true);
    placeProp('van', 0.5, 13.5, Math.PI * 0.5, 1.55, true, true);
    placeProp('delivery', -1.5, -15.5, -Math.PI * 0.52, 1.55, true, true);

    // 3. Port Crates, Dumpsters, Barrels & Street Cover Clusters
    const crates: Array<[number, number, number, number]> = [
      [-6, -3, 0.2, 1.5],
      [6.5, 2.5, -0.3, 1.5],
      [-15, 0, 0, 1.6],
      [15.5, 0.5, Math.PI * 0.5, 1.6],
      [-5, 10, 0.5, 1.4],
      [6, -11, -0.4, 1.4],
      [-18, -14, 0.1, 1.6],
      [18, 14, -0.2, 1.6],
    ];
    for (const [cx, cz, rot, sc] of crates) {
      placeProp('crate', cx, cz, rot, sc, true, true);
    }

    placeProp('dumpster', -17, 10, Math.PI * 0.5, 2.2, true, true);
    placeProp('dumpster', 17, -11, -Math.PI * 0.5, 2.2, true, true);
    placeProp('dumpster', -7, -18, 0, 2.2, true, true);
    placeProp('dumpster', 8, 18, Math.PI, 2.2, true, true);

    const barrels: Array<[number, number]> = [
      [-4.2, -3.5],
      [-3.5, -2.6],
      [8.2, 3.0],
      [7.8, 1.8],
      [-14.2, 2.2],
      [14.2, -2.0],
      [2.5, 12.2],
      [-3.2, -14.2],
    ];
    for (const [bx, bz] of barrels) {
      placeProp('barrel', bx, bz, Math.random() * Math.PI, 2.2, true, false);
    }

    // Construction cones & trashcans (visual street detail, no blocking)
    const cones: Array<[number, number]> = [
      [-7.5, 3.5],
      [-6.5, 4.8],
      [8.5, -4.5],
      [3.5, -1.5],
      [-2.5, 7.5],
      [12.5, 6.5],
    ];
    for (const [cx, cz] of cones) {
      placeProp('construction-cone', cx, cz, 0, 2.0, false, false);
    }
    placeProp('trashcan', -13, 12, 0, 2.2, false, false);
    placeProp('trashcan', 13, -13, 0, 2.2, false, false);
    placeProp('cardboard-box-closed', -14.8, 1.8, 0.4, 2.0, false, false);
    placeProp('cardboard-box-closed', 14.8, -1.2, -0.3, 2.0, false, false);

    // 4. Perimeter Fences, Street Lights & Signs
    for (let i = -24; i <= 24; i += 6) {
      placeProp('fence-1x3', i, -arenaHalfSize, 0, 2.1, true, false);
      placeProp('fence-1x3', i, arenaHalfSize, Math.PI, 2.1, true, false);
      placeProp('fence-1x3', -arenaHalfSize, i, Math.PI / 2, 2.1, true, false);
      placeProp('fence-1x3', arenaHalfSize, i, -Math.PI / 2, 2.1, true, false);
    }

    // Street lights & traffic lights around perimeter
    const lights: Array<[number, number, number]> = [
      [-22, -22, Math.PI * 0.25],
      [22, -22, -Math.PI * 0.25],
      [-22, 22, Math.PI * 0.75],
      [22, 22, -Math.PI * 0.75],
      [0, -24, 0],
      [0, 24, Math.PI],
    ];
    for (const [lx, lz, rot] of lights) {
      placeProp('light-square-double', lx, lz, rot, 2.5, false, false);
    }
    placeProp('road-sign-stop', -21, 0, Math.PI / 2, 2.4, false, false);
    placeProp('traffic-light', 21, 0, -Math.PI / 2, 2.4, false, false);

    // 5. Surrounding Los Santos City Skyline (outside arena fence — pure visual atmosphere!)
    const skyline: Array<[string, number, number, number, number]> = [
      ['building-skyscraper-a', -42, -38, 0, 5.5],
      ['building-skyscraper-c', -18, -44, 0, 5.8],
      ['building-skyscraper-e', 14, -45, 0, 6.2],
      ['building-skyscraper-a', 40, -38, Math.PI / 2, 5.5],
      ['building-a', -40, -12, Math.PI / 2, 5.2],
      ['building-d', -40, 14, Math.PI / 2, 5.2],
      ['building-g', 40, -10, -Math.PI / 2, 5.2],
      ['building-m', 40, 16, -Math.PI / 2, 5.2],
      ['building-d', -26, 40, Math.PI, 5.0],
      ['building-g', 0, 42, Math.PI, 5.4],
      ['building-a', 26, 40, Math.PI, 5.0],
      ['building-skyscraper-c', -42, 36, Math.PI, 5.5],
      ['building-skyscraper-e', 42, 36, Math.PI, 5.5],
    ];
    for (const [b, x, z, rot, sc] of skyline) {
      placeProp(b, x, z, rot, sc, false, false);
    }

    // Perimeter trees for color contrast
    const trees: Array<[number, number]> = [
      [-31, -24],
      [31, -24],
      [-31, 24],
      [31, 24],
      [-32, 2],
      [32, -2],
    ];
    for (const [tx, tz] of trees) {
      placeProp('tree-large', tx, tz, Math.random() * Math.PI, 3.0, false, false);
    }

    return {
      group,
      colliders,
      raycastMeshes,
      spawnPointsTeamA: [
        new THREE.Vector3(-20, 0, 20),
        new THREE.Vector3(-12, 0, 22),
        new THREE.Vector3(-22, 0, 11),
      ],
      spawnPointsTeamB: [
        new THREE.Vector3(20, 0, -20),
        new THREE.Vector3(12, 0, -22),
        new THREE.Vector3(22, 0, -11),
      ],
      spawnPointsFFA: [
        new THREE.Vector3(-20, 0, 20),
        new THREE.Vector3(20, 0, -20),
        new THREE.Vector3(-20, 0, -20),
        new THREE.Vector3(20, 0, 20),
        new THREE.Vector3(0, 0, 21),
        new THREE.Vector3(0, 0, -21),
      ],
      coverPoints,
      arenaHalfSize: arenaHalfSize - 1.2,
    };
  }

  private createAsphaltTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dark urban asphalt
    ctx.fillStyle = '#252a34';
    ctx.fillRect(0, 0, size, size);

    // Subtle aggregate grain
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = 30 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle concrete grid & yellow hazard lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.lineWidth = 5;
    ctx.setLineDash([28, 22]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
