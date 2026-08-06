// Projectile simulation: gravity ballistics, enemy + ground collision, splash.
import * as THREE from 'three';
import { M } from './maps.js';

const GEO = {
  boulder: () => new THREE.DodecahedronGeometry(1.0, 0),
  cannonball: () => new THREE.IcosahedronGeometry(0.55, 0),
  bullet: () => new THREE.CylinderGeometry(0.09, 0.09, 1.7, 5),
};
const MAT = {
  boulder: () => M(0x8d8578),
  cannonball: () => M(0x2b2f34),
  bullet: () => new THREE.MeshBasicMaterial({ color: 0xffd479 }),
};

// ballista bolt: a big fletched dart, built along +y so the shared
// velocity-orientation code works for it like it does for bullets
function makeBolt() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.8, 7), M(0x7a5a36));
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 7), M(0x4a4a50));
  head.position.y = 1.7;
  g.add(head);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.34), M(0xa03c3c));
    fin.position.y = -1.25;
    fin.rotation.y = (i / 3) * Math.PI * 2;
    fin.position.x = Math.sin(fin.rotation.y) * 0.14;
    fin.position.z = Math.cos(fin.rotation.y) * 0.14;
    g.add(fin);
  }
  return g;
}

// kinds whose mesh is oriented along the velocity vector each frame
const ORIENTED = { bullet: true, bolt: true };

const _tmp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class ProjectileManager {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.list = [];
    this.geoCache = {};
    this.matCache = {};
  }

  spawn(kind, weaponDef, pos, vel) {
    let mesh;
    if (kind === 'bolt') {
      mesh = makeBolt();
    } else {
      if (!this.geoCache[kind]) this.geoCache[kind] = GEO[kind]();
      if (!this.matCache[kind]) this.matCache[kind] = MAT[kind]();
      mesh = new THREE.Mesh(this.geoCache[kind], this.matCache[kind]);
    }
    mesh.position.copy(pos);
    if (ORIENTED[kind]) {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _tmp.copy(vel).normalize());
    }
    mesh.castShadow = kind !== 'bullet';
    this.scene.add(mesh);
    this.list.push({
      kind,
      mesh,
      vel: vel.clone(),
      gravity: weaponDef.gravity,
      radius: weaponDef.projectileRadius,
      splash: weaponDef.splash,
      life: 8,
      spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    });
  }

  // onImpact(point, projectile, hitEnemies[]) — hitEnemies may be empty (ground hit)
  update(dt, waterTime, enemyManager, onImpact) {
    const enemies = enemyManager.enemies;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (ORIENTED[p.kind]) {
        // keep the dart nosed along its (drooping) flight path
        p.mesh.quaternion.setFromUnitVectors(_up, _tmp.copy(p.vel).normalize());
      } else {
        p.mesh.rotateOnAxis(p.spinAxis, dt * 6);
      }

      const pos = p.mesh.position;
      let impact = null;
      let directHit = null;

      // enemy collision
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = _tmp.copy(e.group.position).setY(e.group.position.y + e.radius * 0.6).distanceTo(pos);
        if (d < e.radius + p.radius) {
          directHit = e;
          impact = pos.clone();
          break;
        }
      }
      // ground / water collision
      if (!impact) {
        const gy = this.map.groundHeight(pos.x, pos.z, waterTime);
        if (pos.y - p.radius <= gy) {
          impact = pos.clone().setY(gy);
        }
      }

      if (impact || p.life <= 0 || pos.z < -700 || pos.z > 60) {
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
        if (impact) {
          const hits = [];
          if (directHit) hits.push(directHit);
          if (p.splash > 0) {
            for (const e of enemies) {
              if (!e.alive || e === directHit) continue;
              if (e.group.position.distanceTo(impact) < p.splash + e.radius * 0.5) hits.push(e);
            }
          }
          onImpact(impact, p, hits);
        }
      }
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
  }
}
