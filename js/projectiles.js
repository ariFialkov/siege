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

const _tmp = new THREE.Vector3();

export class ProjectileManager {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.list = [];
    this.geoCache = {};
    this.matCache = {};
  }

  spawn(kind, weaponDef, pos, vel) {
    if (!this.geoCache[kind]) this.geoCache[kind] = GEO[kind]();
    if (!this.matCache[kind]) this.matCache[kind] = MAT[kind]();
    const mesh = new THREE.Mesh(this.geoCache[kind], this.matCache[kind]);
    mesh.position.copy(pos);
    if (kind === 'bullet') {
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
      if (p.kind !== 'bullet') {
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
