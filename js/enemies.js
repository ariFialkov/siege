// Enemy meshes (procedural low-poly) and the spawner/manager.
import * as THREE from 'three';
import { box, cyl, cone, M } from './maps.js';
import { SPAWNING } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pickWeighted = (defs) => {
  let total = 0;
  for (const d of defs) total += d.weight;
  let r = Math.random() * total;
  for (const d of defs) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return defs[0];
};

// ---------------------------------------------------------------------------
// factories — each returns { group, spin?, bob?, rock?, yOff? }
//  spin: meshes rotated like wheels · bob: vertical bounce amp · rock: sway amp
// ---------------------------------------------------------------------------

function soldierBody(armor, trim, helm) {
  const g = new THREE.Group();
  g.add(box(0.95, 1.35, 0.62, armor, 0, 1.55, 0));         // torso
  const head = box(0.55, 0.55, 0.55, 0xd9b38c, 0, 2.5, 0);
  g.add(head);
  g.add(box(0.65, 0.3, 0.65, helm, 0, 2.85, 0));           // helmet
  g.add(box(0.3, 0.95, 0.32, trim, -0.3, 0.5, 0));         // legs
  g.add(box(0.3, 0.95, 0.32, trim, 0.3, 0.5, 0));
  g.add(box(0.26, 1.0, 0.3, armor, -0.68, 1.6, 0));        // arms
  g.add(box(0.26, 1.0, 0.3, armor, 0.68, 1.6, 0));
  return g;
}

function horseBody(coat) {
  const g = new THREE.Group();
  g.add(box(2.4, 1.0, 0.9, coat, 0, 1.55, 0));             // body
  g.add(box(0.75, 0.7, 0.55, coat, -1.45, 2.15, 0));       // neck
  g.add(box(0.9, 0.45, 0.5, 0x3a2c1e, -1.95, 2.5, 0));     // head
  for (const lx of [-0.85, 0.85]) {
    for (const lz of [-0.3, 0.3]) g.add(box(0.26, 1.1, 0.26, coat, lx, 0.55, lz));
  }
  g.add(box(0.7, 0.5, 0.15, 0x2c2117, 1.35, 1.7, 0));      // tail
  return g;
}

const FACTORIES = {
  // --- fortress -----------------------------------------------------------
  knight() {
    const g = new THREE.Group();
    g.add(soldierBody(0x8d949c, 0x5a5f66, 0x6f767e));
    const shield = box(0.15, 1.0, 0.75, 0xa03c3c, -0.85, 1.5, 0);
    g.add(shield);
    const sword = box(0.1, 1.3, 0.1, 0xc7ccd2, 0.85, 2.3, 0);
    sword.rotation.z = -0.3;
    g.add(sword);
    return { group: g, bob: 0.14, rock: 0.06 };
  },
  horseman() {
    const g = new THREE.Group();
    g.add(horseBody(0x6b4a2e));
    const rider = soldierBody(0x94794a, 0x5a4a30, 0x7b6a45);
    rider.scale.setScalar(0.85);
    rider.position.set(0.2, 1.75, 0);
    g.add(rider);
    const lance = cyl(0.06, 0.06, 3.2, 0x8a6b3f, -0.9, 2.9, 0.4, 5);
    lance.rotation.z = 1.15;
    g.add(lance);
    g.rotation.y = Math.PI; // horse model faces -x; flip toward travel
    return { group: g, bob: 0.22, rock: 0.05 };
  },
  chariot() {
    const g = new THREE.Group();
    const cab = box(1.7, 1.1, 1.5, 0x9a6a34, 1.2, 1.35, 0);
    g.add(cab);
    g.add(box(1.75, 0.2, 1.55, 0xd8b13a, 1.2, 1.95, 0));
    const spin = [];
    for (const wz of [-0.95, 0.95]) {
      const w = cyl(0.75, 0.75, 0.22, 0x4a3826, 1.4, 0.75, wz, 8);
      w.rotation.x = Math.PI / 2;
      spin.push(w);
      g.add(w);
    }
    g.add(box(2.2, 0.14, 0.14, 0x6b4a2e, -0.4, 1.0, 0));   // yoke pole
    const horse = horseBody(0x3a2c1e);
    horse.position.x = -2.3;
    g.add(horse);
    const driver = soldierBody(0x8a4a9c, 0x5a3a66, 0x6a4a76);
    driver.scale.setScalar(0.85);
    driver.position.set(1.2, 1.15, 0);
    g.add(driver);
    g.rotation.y = Math.PI;
    return { group: g, spin, bob: 0.12, rock: 0.04 };
  },
  warlord() {
    const g = new THREE.Group();
    const horse = horseBody(0x1e1a16);
    horse.scale.setScalar(1.2);
    g.add(horse);
    const rider = soldierBody(0xd8b13a, 0x8a6a20, 0xd8b13a);
    rider.position.set(0.25, 2.2, 0);
    g.add(rider);
    const banner = box(0.08, 2.6, 0.08, 0x5a4632, 0.9, 3.4, 0);
    g.add(banner);
    g.add(box(1.1, 0.8, 0.06, 0xa03c3c, 1.45, 4.3, 0));
    g.rotation.y = Math.PI;
    return { group: g, bob: 0.18, rock: 0.05 };
  },

  // --- galleon ------------------------------------------------------------
  sloop() {
    const g = new THREE.Group();
    const hull = box(2.4, 1.4, 7.5, 0x7a5230, 0, 0.9, 0);
    g.add(hull);
    g.add(box(2.0, 0.5, 8.2, 0x5c3d22, 0, 0.2, 0));
    g.add(cyl(0.12, 0.18, 6.5, 0x5c3d22, 0, 4.4, -0.5, 6));
    const sail = box(2.6, 3.4, 0.12, 0xe8e0cc, 0, 5.2, -0.5);
    g.add(sail);
    return { group: g, bob: 0, rock: 0.06, ship: true };
  },
  brig() {
    const g = new THREE.Group();
    g.add(box(3.6, 2.0, 12, 0x6e4a2d, 0, 1.4, 0));
    g.add(box(3.0, 0.8, 13, 0x543722, 0, 0.3, 0));
    g.add(box(3.2, 1.6, 3, 0x8a623c, 0, 3.0, 4.5));       // stern castle
    for (const mz of [-3, 2]) {
      g.add(cyl(0.16, 0.22, 9, 0x543722, 0, 6.4, mz, 6));
      g.add(box(3.6, 4.2, 0.14, 0xdcd2b8, 0, 7.6, mz));
    }
    g.add(box(1.2, 0.7, 0.1, 0x1a1a1e, 0.7, 11.4, -3));   // flag
    return { group: g, bob: 0, rock: 0.05, ship: true };
  },
  galleon() {
    const g = new THREE.Group();
    g.add(box(5.2, 2.8, 17, 0x5f3f26, 0, 2.0, 0));
    g.add(box(4.4, 1.1, 18.5, 0x46301c, 0, 0.5, 0));
    g.add(box(4.8, 2.4, 4.5, 0x7d5535, 0, 4.6, 6.5));
    g.add(box(4.2, 1.8, 3, 0x7d5535, 0, 4.2, -6.5));
    for (const [mz, mh] of [[-5, 12], [0, 14], [5, 12]]) {
      g.add(cyl(0.2, 0.28, mh, 0x46301c, 0, mh / 2 + 3, mz, 6));
      g.add(box(5, mh * 0.45, 0.16, 0xd8ceb2, 0, mh * 0.62 + 3, mz));
    }
    g.add(box(1.6, 0.9, 0.1, 0xa03c3c, 0.9, 18.4, 0));
    return { group: g, bob: 0, rock: 0.04, ship: true };
  },
  ghostship() {
    const g = new THREE.Group();
    const ghost = (c) => M(c, { transparent: true, opacity: 0.65 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 14), ghost(0x9fd8c8));
    hull.position.y = 1.6;
    g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 15), ghost(0x7bbfae));
    deck.position.y = 0.4;
    g.add(deck);
    for (const mz of [-4, 3]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 10, 6), ghost(0x7bbfae));
      mast.position.set(0, 6.6, mz);
      g.add(mast);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(4, 4.6, 0.14), ghost(0xcfeee6));
      sail.position.set(0, 8, mz);
      g.add(sail);
    }
    return { group: g, bob: 0.3, rock: 0.07, ship: true, yOff: 0.6 };
  },

  // --- burm ---------------------------------------------------------------
  infantry() {
    const g = new THREE.Group();
    const s = soldierBody(0x5c6647, 0x49523a, 0x5c6647);
    g.add(s);
    const rifle = box(0.12, 0.12, 1.3, 0x2e2b26, 0.68, 1.9, -0.4);
    rifle.rotation.x = 0.25;
    g.add(rifle);
    g.add(box(0.7, 0.8, 0.35, 0x49523a, 0, 1.6, 0.5));     // pack
    return { group: g, bob: 0.13, rock: 0.05 };
  },
  jeep() {
    const g = new THREE.Group();
    g.add(box(2.2, 0.9, 4.2, 0x6d7050, 0, 1.15, 0));
    g.add(box(2.0, 0.7, 1.7, 0x5c6045, 0, 1.9, 0.6));
    g.add(box(1.9, 0.08, 0.7, 0x8b8e6a, 0, 2.3, -1.2));    // windshield frame
    const gun = box(0.14, 0.14, 1.4, 0x2e2b26, 0, 2.6, 0.5);
    gun.rotation.x = -0.15;
    g.add(gun);
    const spin = [];
    for (const wx of [-1.05, 1.05]) {
      for (const wz of [-1.35, 1.35]) {
        const w = cyl(0.55, 0.55, 0.4, 0x22211e, wx, 0.55, wz, 8);
        w.rotation.z = Math.PI / 2;
        spin.push(w);
        g.add(w);
      }
    }
    return { group: g, spin, bob: 0.05, rock: 0.03 };
  },
  tank() {
    const g = new THREE.Group();
    g.add(box(3.4, 1.1, 6.2, 0x54584a, 0, 1.35, 0));
    g.add(box(3.8, 0.9, 6.6, 0x3f4238, 0, 0.65, 0));       // tracks block
    g.add(box(2.2, 0.9, 2.6, 0x626652, 0, 2.35, 0.3));     // turret
    const barrel = cyl(0.16, 0.2, 3.6, 0x3f4238, 0, 2.5, -3.0, 6);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    g.add(box(0.5, 0.4, 0.5, 0x3f4238, 0.7, 2.95, 0.5));   // hatch
    return { group: g, bob: 0.03, rock: 0.02 };
  },
  artillery() {
    const g = new THREE.Group();
    g.add(box(3.2, 1.2, 5.4, 0x6a6d52, 0, 1.3, 0));
    g.add(box(3.6, 0.8, 5.8, 0x4c4f40, 0, 0.6, 0));
    const mount = box(2.2, 1.0, 2.2, 0x5c5f48, 0, 2.2, 0.8);
    g.add(mount);
    const barrel = cyl(0.22, 0.3, 4.6, 0x44473a, 0, 3.6, -1.2, 6);
    barrel.rotation.x = Math.PI / 2 - 0.6;                  // raised tube
    g.add(barrel);
    return { group: g, bob: 0.03, rock: 0.02 };
  },
};

// ---------------------------------------------------------------------------
// manager
// ---------------------------------------------------------------------------
export class EnemyManager {
  constructor(scene, map, defs) {
    this.scene = scene;
    this.map = map;
    this.defs = defs;
    this.enemies = [];
    this.nextSpawn = 0.5;
  }

  spawn() {
    const def = pickWeighted(this.defs);
    const made = FACTORIES[def.id]();
    const g = made.group;
    const x = rand(SPAWNING.xRange[0], SPAWNING.xRange[1]);
    const z = SPAWNING.spawnZ * rand(0.82, 1);
    g.position.set(x, this.map.groundHeight(x, z, 0) + (made.yOff || 0), z);
    g.traverse((o) => { o.castShadow = false; });
    const e = {
      group: g,
      def,
      made,
      speed: rand(def.speed[0], def.speed[1]),
      baseX: x,
      driftAmp: rand(SPAWNING.laneDriftAmp[0], SPAWNING.laneDriftAmp[1]),
      driftFreq: rand(SPAWNING.laneDriftFreq[0], SPAWNING.laneDriftFreq[1]),
      phase: Math.random() * Math.PI * 2,
      radius: def.radius,
      alive: true,
    };
    this.scene.add(g);
    this.enemies.push(e);
  }

  update(dt, t, waterTime) {
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0 && this.enemies.length < SPAWNING.maxEnemies) {
      this.spawn();
      this.nextSpawn = rand(SPAWNING.interval[0], SPAWNING.interval[1]);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const g = e.group;
      g.position.z += e.speed * dt;
      const drift = Math.sin(t * e.driftFreq + e.phase) * e.driftAmp;
      g.position.x = e.baseX + drift;

      const groundY = this.map.groundHeight(g.position.x, g.position.z, waterTime);
      const m = e.made;
      const bobY = (m.bob || 0) * Math.abs(Math.sin(t * e.speed * 1.1 + e.phase));
      g.position.y = groundY + (m.yOff || 0) + bobY;
      g.rotation.z = (m.rock || 0) * Math.sin(t * 1.6 + e.phase);
      // face travel direction (toward +z, with drift slope)
      const heading = Math.atan2(Math.cos(t * e.driftFreq + e.phase) * e.driftAmp * e.driftFreq, e.speed);
      g.rotation.y = (m.ship ? Math.PI : 0) + heading + (FACING_FLIP[e.def.id] || 0);
      if (m.spin) for (const w of m.spin) w.rotation.y += e.speed * dt * 1.6;

      if (g.position.z > SPAWNING.despawnZ) this.remove(e, i);
    }
  }

  remove(e, idx) {
    e.alive = false;
    this.scene.remove(e.group);
    if (idx === undefined) idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies.length = 0;
  }
}

// Yaw fixup per model so its "front" points toward +z (direction of travel).
// Horse-drawn models are built along -x (head at -x): need +PI/2.
// Modern units are built with their front/barrel at -z: need PI.
const FACING_FLIP = {
  horseman: Math.PI / 2,
  chariot: Math.PI / 2,
  warlord: Math.PI / 2,
  knight: Math.PI,
  infantry: Math.PI,
  jeep: Math.PI,
  tank: Math.PI,
  artillery: Math.PI,
};
