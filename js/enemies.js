// Enemy meshes (procedural med-poly) and the spawner/manager.
import * as THREE from 'three';
import { box, cyl, cone, capsule, sph, sailCurved, M } from './maps.js';
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
// shared sub-assemblies
// ---------------------------------------------------------------------------

function soldierBody(armor, trim, helm, { plume = null, skin = 0xd9b38c } = {}) {
  const g = new THREE.Group();
  const torso = capsule(0.46, 0.68, armor, 0, 1.62, 0);    // rounded torso
  torso.scale.z = 0.72;
  g.add(torso);
  g.add(cyl(0.44, 0.48, 0.28, trim, 0, 1.05, 0, 12));      // belt
  g.add(sph(0.35, skin, 0, 2.52, 0));                      // head
  const helmet = sph(0.38, helm, 0, 2.62, 0);              // helmet dome
  helmet.scale.y = 0.8;
  g.add(helmet);
  g.add(cyl(0.44, 0.46, 0.1, helm, 0, 2.55, 0, 12));       // helmet brim
  if (plume) {
    const crest = cone(0.15, 0.6, plume, 0, 3.15, 0, 8);
    crest.scale.z = 0.55;
    g.add(crest);
  }
  for (const s of [-1, 1]) {
    g.add(capsule(0.15, 0.55, trim, s * 0.26, 0.55, 0));   // legs
    g.add(sph(0.17, 0x3a3028, s * 0.26, 0.12, 0.06));      // boots
    const arm = capsule(0.13, 0.6, armor, s * 0.64, 1.62, 0);
    arm.rotation.z = -s * 0.12;
    g.add(arm);
    g.add(sph(0.13, skin, s * 0.7, 1.12, 0));              // hands
  }
  return g;
}

function horseBody(coat, { mane = 0x2c2117, tack = null } = {}) {
  const g = new THREE.Group();
  const body = capsule(0.55, 1.5, coat, 0, 1.65, 0);       // barrel body
  body.rotation.z = Math.PI / 2;
  g.add(body);
  g.add(sph(0.58, coat, -0.95, 1.75, 0));                  // chest
  const neck = capsule(0.3, 0.85, coat, -1.5, 2.25, 0);    // arched neck
  neck.rotation.z = 0.55;
  g.add(neck);
  const head = capsule(0.24, 0.5, coat, -2.05, 2.72, 0);   // head
  head.rotation.z = Math.PI / 2 - 0.35;
  g.add(head);
  g.add(sph(0.2, 0x1f1812, -2.5, 2.58, 0));                // muzzle
  for (const s of [-1, 1]) {
    const ear = cone(0.09, 0.28, coat, -1.92, 3.06, s * 0.16, 6);
    ear.rotation.x = -s * 0.25;
    g.add(ear);
  }
  const maneMesh = box(0.65, 0.8, 0.14, mane, -1.42, 2.68, 0);
  maneMesh.rotation.z = 0.5;
  g.add(maneMesh);
  for (const lx of [-0.85, 0.85]) {
    for (const lz of [-0.3, 0.3]) {
      g.add(capsule(0.13, 0.85, coat, lx, 0.75, lz));      // legs
      g.add(cyl(0.14, 0.16, 0.16, 0x1f1812, lx, 0.1, lz, 8)); // hooves
    }
  }
  const tail = capsule(0.12, 0.6, mane, 1.32, 1.6, 0);
  tail.rotation.z = -0.55;
  g.add(tail);
  if (tack) {
    g.add(box(1.0, 0.14, 1.06, tack, 0.1, 2.2, 0));        // saddle blanket
    const saddle = sph(0.36, 0x4a3826, 0.1, 2.32, 0);
    saddle.scale.set(1, 0.6, 1.1);
    g.add(saddle);
  }
  return g;
}

function shipHull(w, h, len, color, dark) {
  const g = new THREE.Group();
  g.add(box(w, h, len, color, 0, h * 0.65, 0));            // main hull
  g.add(box(w * 0.82, h * 0.5, len * 1.06, dark, 0, h * 0.22, 0)); // waterline strake
  g.add(box(w * 1.06, h * 0.22, len * 0.92, dark, 0, h * 1.12, 0)); // rail
  const bow = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, len * 0.24, 4), M(color));
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, h * 0.6, -len * 0.58);
  g.add(bow);
  g.add(cyl(0.07, 0.07, len * 0.3, dark, 0, h * 1.1, -len * 0.62, 6).rotateX(1.25)); // bowsprit
  return g;
}

const sail = sailCurved; // enemy ships share the billowing sail

function gunports(g, w, len, count, y) {
  for (let i = 0; i < count; i++) {
    const z = -len * 0.32 + (i / (count - 1)) * len * 0.64;
    g.add(box(0.16, 0.34, 0.34, 0x1c1611, -w / 2 - 0.02, y, z));
    g.add(box(0.16, 0.34, 0.34, 0x1c1611, w / 2 + 0.02, y, z));
  }
}

// ---------------------------------------------------------------------------
// factories — each returns { group, spin?, bob?, rock?, yOff? }
//  spin: meshes rotated like wheels · bob: vertical bounce amp · rock: sway amp
// ---------------------------------------------------------------------------
const FACTORIES = {
  // --- fortress -----------------------------------------------------------
  knight() {
    const g = new THREE.Group();
    g.add(soldierBody(0x8d949c, 0x5a5f66, 0x6f767e, { plume: 0xa03c3c }));
    const shield = new THREE.Group();
    shield.add(box(0.16, 1.05, 0.8, 0xa03c3c));
    shield.add(box(0.18, 0.62, 0.18, 0xd8b13a));           // emblem cross
    shield.add(box(0.18, 0.18, 0.5, 0xd8b13a));
    shield.position.set(-0.92, 1.5, 0);
    g.add(shield);
    const sword = new THREE.Group();
    sword.add(box(0.09, 1.15, 0.09, 0xc7ccd2, 0, 0.5, 0));
    sword.add(box(0.4, 0.09, 0.12, 0x8a6b3f, 0, -0.1, 0)); // crossguard
    sword.add(box(0.11, 0.28, 0.11, 0x4a3826, 0, -0.28, 0));
    sword.position.set(0.85, 2.1, 0);
    sword.rotation.z = -0.35;
    g.add(sword);
    return { group: g, bob: 0.14, rock: 0.06 };
  },
  horseman() {
    const g = new THREE.Group();
    g.add(horseBody(0x6b4a2e, { tack: 0xa03c3c }));
    const rider = soldierBody(0x94794a, 0x5a4a30, 0x7b6a45, { plume: 0x3a5a8c });
    rider.scale.setScalar(0.85);
    rider.position.set(0.1, 2.35, 0);
    g.add(rider);
    const lance = new THREE.Group();
    lance.add(cyl(0.05, 0.07, 3.4, 0x8a6b3f, 0, 0, 0, 6));
    lance.add(cone(0.11, 0.42, 0xc7ccd2, 0, 1.85, 0, 6));
    lance.add(box(0.34, 0.5, 0.06, 0x3a5a8c, 0.1, 1.3, 0)); // pennant
    lance.position.set(-0.8, 3.1, 0.42);
    lance.rotation.z = 1.12;
    g.add(lance);
    return { group: g, bob: 0.22, rock: 0.05 };
  },
  chariot() {
    const g = new THREE.Group();
    const cab = new THREE.Group();
    cab.add(box(1.7, 1.05, 1.55, 0x9a6a34, 0, 1.35, 0));
    cab.add(box(1.75, 0.2, 1.6, 0xd8b13a, 0, 1.95, 0));    // gold trim
    cab.add(box(0.2, 0.7, 1.6, 0xd8b13a, 0.88, 1.5, 0));   // back plate
    cab.add(box(1.75, 0.5, 0.14, 0x7d5327, 0, 1.15, 0.82));
    cab.add(box(1.75, 0.5, 0.14, 0x7d5327, 0, 1.15, -0.82));
    cab.position.x = 1.2;
    g.add(cab);
    const spin = [];
    for (const wz of [-1.0, 1.0]) {
      const wheel = new THREE.Group();
      wheel.add(cyl(0.78, 0.78, 0.14, 0x4a3826, 0, 0, 0, 12).rotateX(Math.PI / 2));
      for (let s = 0; s < 4; s++) {
        const spoke = box(0.1, 1.45, 0.08, 0x8a6b3f);
        spoke.rotation.z = (s / 4) * Math.PI;
        wheel.add(spoke);
      }
      wheel.add(cyl(0.14, 0.14, 0.26, 0xd8b13a, 0, 0, 0, 8).rotateX(Math.PI / 2));
      wheel.position.set(1.4, 0.78, wz);
      spin.push(wheel);
      g.add(wheel);
    }
    g.add(box(2.4, 0.12, 0.12, 0x6b4a2e, -0.35, 1.05, 0)); // yoke pole
    for (const hz of [-0.55, 0.55]) {
      const horse = horseBody(hz < 0 ? 0x3a2c1e : 0x59422c);
      horse.scale.setScalar(0.9);
      horse.position.set(-2.3, 0, hz);
      g.add(horse);
    }
    const driver = soldierBody(0x8a4a9c, 0x5a3a66, 0x6a4a76, { plume: 0xd8b13a });
    driver.scale.setScalar(0.85);
    driver.position.set(1.25, 1.1, 0);
    g.add(driver);
    return { group: g, spin, bob: 0.12, rock: 0.04 };
  },
  warlord() {
    const g = new THREE.Group();
    const horse = horseBody(0x1e1a16, { mane: 0x0e0b08, tack: 0xd8b13a });
    horse.scale.setScalar(1.2);
    g.add(horse);
    // horse face armor
    g.add(box(0.7, 0.5, 0.6, 0xd8b13a, -2.45, 3.3, 0));
    const rider = soldierBody(0xd8b13a, 0x8a6a20, 0xd8b13a, { plume: 0xa03c3c });
    rider.position.set(0.1, 2.8, 0);
    g.add(rider);
    // great banner
    const banner = new THREE.Group();
    banner.add(cyl(0.07, 0.07, 3.0, 0x5a4632, 0, 0, 0, 6));
    banner.add(box(1.25, 0.95, 0.07, 0xa03c3c, 0.68, 1.05, 0));
    banner.add(box(0.5, 0.4, 0.09, 0xd8b13a, 0.55, 1.05, 0)); // emblem
    banner.add(cone(0.12, 0.35, 0xd8b13a, 0, 1.68, 0, 6));
    banner.position.set(0.95, 3.6, 0);
    g.add(banner);
    return { group: g, bob: 0.18, rock: 0.05 };
  },

  // --- galleon ------------------------------------------------------------
  sloop() {
    const g = new THREE.Group();
    g.add(shipHull(2.4, 1.5, 8, 0x7a5230, 0x5c3d22));
    g.add(cyl(0.1, 0.16, 6.5, 0x5c3d22, 0, 4.4, -0.5, 7));
    g.add(sail(2.7, 3.5, 0xe8e0cc, 0, 5.3, -0.5));
    g.add(cyl(0.06, 0.06, 3.0, 0x5c3d22, 0, 7.1, -0.5, 5).rotateZ(Math.PI / 2)); // yard
    g.add(box(0.8, 0.5, 0.08, 0xa03c3c, 0.45, 7.6, -0.5)); // pennant
    g.add(box(0.8, 0.6, 1.2, 0x5c3d22, 0, 1.9, 2.6));      // cabin
    return { group: g, bob: 0, rock: 0.06, ship: true };
  },
  brig() {
    const g = new THREE.Group();
    g.add(shipHull(3.6, 2.2, 12.5, 0x6e4a2d, 0x543722));
    gunports(g, 3.6, 12.5, 4, 1.35);
    g.add(box(3.3, 1.7, 3.2, 0x8a623c, 0, 3.1, 4.6));      // stern castle
    g.add(box(2.6, 0.55, 0.14, 0xe8cf7a, 0, 3.0, 6.2));    // stern windows
    for (const [mz, mh] of [[-3, 10], [2.5, 11]]) {
      g.add(cyl(0.14, 0.2, mh, 0x543722, 0, mh / 2 + 2, mz, 7));
      g.add(sail(3.8, 3.0, 0xdcd2b8, 0, mh * 0.52 + 2, mz));
      g.add(sail(3.0, 2.2, 0xdcd2b8, 0, mh * 0.85 + 2, mz));
      g.add(cyl(0.05, 0.05, 4.2, 0x543722, 0, mh * 0.68 + 2, mz, 5).rotateZ(Math.PI / 2));
    }
    // rigging lines
    for (const s of [-1, 1]) {
      g.add(cyl(0.02, 0.02, 7.5, 0x2c2117, s * 1.6, 7.2, 0.6, 3).rotateZ(s * 0.42));
    }
    g.add(box(1.2, 0.7, 0.1, 0x1a1a1e, 0.7, 13.6, -3));    // black flag
    return { group: g, bob: 0, rock: 0.05, ship: true };
  },
  galleon() {
    const g = new THREE.Group();
    g.add(shipHull(5.2, 3.0, 18, 0x5f3f26, 0x46301c));
    g.add(box(5.4, 0.35, 18.2, 0xd8b13a, 0, 2.5, 0));      // gold band
    gunports(g, 5.2, 18, 6, 1.7);
    g.add(box(4.8, 2.6, 4.8, 0x7d5535, 0, 4.9, 6.6));      // stern castle (2 tiers)
    g.add(box(4.0, 1.8, 3.0, 0x8a623c, 0, 6.9, 7.4));
    g.add(box(3.4, 0.6, 0.14, 0xe8cf7a, 0, 5.0, 9.1));     // stern windows
    g.add(box(3.6, 1.6, 3.2, 0x7d5535, 0, 4.3, -6.4));     // forecastle
    for (const [mz, mh] of [[-5, 13], [0.5, 15], [5.5, 12]]) {
      g.add(cyl(0.18, 0.26, mh, 0x46301c, 0, mh / 2 + 3.4, mz, 7));
      g.add(sail(5.2, 3.6, 0xd8ceb2, 0, mh * 0.5 + 3.4, mz));
      g.add(sail(4.0, 2.6, 0xd8ceb2, 0, mh * 0.82 + 3.4, mz));
      g.add(cyl(0.06, 0.06, 5.6, 0x46301c, 0, mh * 0.66 + 3.4, mz, 5).rotateZ(Math.PI / 2));
    }
    // crow's nest on the main mast
    g.add(cyl(0.5, 0.4, 0.5, 0x46301c, 0, 16.6, 0.5, 8));
    g.add(box(1.6, 0.9, 0.1, 0xa03c3c, 0.9, 19.6, 0.5));   // flag
    return { group: g, bob: 0, rock: 0.04, ship: true };
  },
  ghostship() {
    const g = new THREE.Group();
    const ghost = (c, op = 0.6) => M(c, { transparent: true, opacity: op });
    const mk = (geo, c, op, x, y, z) => {
      const m = new THREE.Mesh(geo, ghost(c, op));
      m.position.set(x, y, z);
      return m;
    };
    g.add(mk(new THREE.BoxGeometry(4, 2.6, 14.5), 0x9fd8c8, 0.55, 0, 1.7, 0));
    g.add(mk(new THREE.BoxGeometry(3.4, 1.1, 15.2), 0x7bbfae, 0.5, 0, 0.4, 0));
    g.add(mk(new THREE.BoxGeometry(3.2, 1.5, 2.8), 0x9fd8c8, 0.5, 0, 3.5, 5.6)); // stern
    for (const mz of [-4, 2.5]) {
      g.add(mk(new THREE.CylinderGeometry(0.14, 0.2, 11, 6), 0x7bbfae, 0.55, 0, 7.1, mz));
      g.add(mk(new THREE.BoxGeometry(4.2, 3.4, 0.14), 0xcfeee6, 0.5, 0, 7.4, mz));
      g.add(mk(new THREE.BoxGeometry(3.2, 2.2, 0.14), 0xcfeee6, 0.45, 0, 10.6, mz));
    }
    // tattered flag + eerie lantern glow
    g.add(mk(new THREE.BoxGeometry(1.3, 0.8, 0.1), 0x0e1f1c, 0.8, 0.7, 13.4, -4));
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x9fffe0, transparent: true, opacity: 0.9 })
    );
    lantern.position.set(0, 4.6, -7.2);
    g.add(lantern);
    return { group: g, bob: 0.3, rock: 0.07, ship: true, yOff: 0.6 };
  },

  // --- burm ---------------------------------------------------------------
  infantry() {
    const g = new THREE.Group();
    const s = soldierBody(0x5c6647, 0x49523a, 0x5c6647, { skin: 0xc9a37f });
    g.add(s);
    g.add(box(0.9, 0.6, 0.7, 0x49523a, 0, 1.75, 0.1));     // flak vest
    const rifle = new THREE.Group();
    rifle.add(box(0.1, 0.1, 1.1, 0x2e2b26, 0, 0, -0.3));
    rifle.add(box(0.09, 0.09, 0.5, 0x2e2b26, 0, -0.02, -1.0)); // barrel
    rifle.add(box(0.1, 0.22, 0.3, 0x4a3f2e, 0, -0.12, 0.35));  // stock
    rifle.add(box(0.08, 0.2, 0.1, 0x2e2b26, 0, -0.16, -0.1));  // mag
    rifle.position.set(0.68, 1.9, -0.35);
    rifle.rotation.x = 0.22;
    g.add(rifle);
    g.add(box(0.75, 0.85, 0.4, 0x4c5340, 0, 1.6, 0.55));   // pack
    g.add(box(0.3, 0.24, 0.14, 0x3f4634, -0.35, 1.0, 0.42)); // pouches
    g.add(box(0.3, 0.24, 0.14, 0x3f4634, 0.35, 1.0, 0.42));
    return { group: g, bob: 0.13, rock: 0.05 };
  },
  jeep() {
    const g = new THREE.Group();
    g.add(box(2.2, 0.85, 4.4, 0x6d7050, 0, 1.15, 0));      // tub
    g.add(box(2.2, 0.5, 1.3, 0x5c6045, 0, 1.75, -1.5));    // hood
    g.add(box(0.4, 0.18, 0.5, 0x5c6045, -0.75, 2.02, -1.5)); // hood vents
    g.add(box(2.0, 0.65, 1.6, 0x5c6045, 0, 1.85, 0.7));    // cab sides
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.08),
      M(0x9fc4d8, { transparent: true, opacity: 0.65 }));
    glass.position.set(0, 2.35, -0.85);
    glass.rotation.x = -0.18;
    g.add(glass);
    // roll cage
    for (const cx of [-0.95, 0.95]) {
      g.add(cyl(0.05, 0.05, 1.1, 0x3f4238, cx, 2.45, 0.9, 6));
    }
    g.add(cyl(0.05, 0.05, 2.0, 0x3f4238, 0, 3.0, 0.9, 6).rotateZ(Math.PI / 2));
    // mounted gun
    const gun = new THREE.Group();
    gun.add(cyl(0.07, 0.09, 1.5, 0x2e2b26, 0, 0, -0.5, 6).rotateX(Math.PI / 2 - 0.12));
    gun.add(box(0.22, 0.22, 0.5, 0x2e2b26, 0, 0, 0.3));
    gun.position.set(0, 3.0, 0.7);
    g.add(gun);
    g.add(box(0.34, 0.2, 0.14, 0xe8e08a, -0.75, 1.55, -2.24)); // headlights
    g.add(box(0.34, 0.2, 0.14, 0xe8e08a, 0.75, 1.55, -2.24));
    g.add(box(2.3, 0.18, 0.3, 0x4c4f40, 0, 0.95, -2.3));   // bumper
    const spare = cyl(0.5, 0.5, 0.3, 0x22211e, 0, 1.7, 2.35, 10);
    spare.rotation.x = Math.PI / 2;
    g.add(spare);
    const spin = [];
    for (const wx of [-1.08, 1.08]) {
      for (const wz of [-1.4, 1.4]) {
        const wheel = new THREE.Group();
        wheel.add(cyl(0.58, 0.58, 0.4, 0x22211e, 0, 0, 0, 12).rotateZ(Math.PI / 2));
        wheel.add(cyl(0.3, 0.3, 0.42, 0x8a8d70, 0, 0, 0, 8).rotateZ(Math.PI / 2));
        wheel.position.set(wx, 0.58, wz);
        wheel.userData.spinAxis = 'x'; // axle runs along local x
        spin.push(wheel);
        g.add(wheel);
      }
    }
    return { group: g, spin, bob: 0.05, rock: 0.03 };
  },
  tank() {
    const g = new THREE.Group();
    g.add(box(3.4, 1.0, 6.4, 0x54584a, 0, 1.4, 0));        // hull
    g.add(box(3.4, 0.4, 1.4, 0x54584a, 0, 1.85, -2.6));    // glacis
    g.children[1].rotation.x = 0.35;
    // tracks with road wheels
    for (const tx of [-1.55, 1.55]) {
      g.add(box(0.85, 0.95, 6.8, 0x3f4238, tx, 0.75, 0));
      for (let i = 0; i < 5; i++) {
        const w = cyl(0.34, 0.34, 0.9, 0x2e312a, tx, 0.5, -2.2 + i * 1.1, 10);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
      g.add(box(0.9, 0.18, 6.9, 0x62665a, tx, 1.35, 0));   // track guard
    }
    // turret
    const turret = new THREE.Group();
    turret.add(cyl(1.15, 1.35, 0.9, 0x626652, 0, 0, 0, 10));
    turret.add(box(1.4, 0.55, 1.6, 0x626652, 0, 0.15, 0.5));
    const barrel = new THREE.Group();
    barrel.add(cyl(0.14, 0.17, 3.8, 0x3f4238, 0, 0, -2.4, 8).rotateX(Math.PI / 2));
    barrel.add(cyl(0.2, 0.2, 0.5, 0x33362f, 0, 0, -4.1, 8).rotateX(Math.PI / 2)); // muzzle brake
    turret.add(barrel);
    turret.add(box(0.5, 0.28, 0.5, 0x3f4238, 0.65, 0.6, 0.4)); // hatch
    turret.add(cyl(0.03, 0.03, 1.3, 0x33362f, -0.8, 0.9, 0.6, 4)); // antenna
    turret.position.set(0, 2.35, 0.3);
    g.add(turret);
    return { group: g, bob: 0.03, rock: 0.02 };
  },
  artillery() {
    const g = new THREE.Group();
    g.add(box(3.2, 1.1, 5.6, 0x6a6d52, 0, 1.35, 0));       // chassis
    for (const tx of [-1.45, 1.45]) {
      g.add(box(0.8, 0.85, 5.9, 0x4c4f40, tx, 0.7, 0));    // tracks
      for (let i = 0; i < 4; i++) {
        const w = cyl(0.32, 0.32, 0.85, 0x373a30, tx, 0.48, -1.8 + i * 1.2, 10);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    }
    // gun mount + elevated tube
    const mount = new THREE.Group();
    mount.add(box(2.2, 1.0, 2.4, 0x5c5f48, 0, 0.3, 0));
    mount.add(cyl(0.5, 0.6, 0.8, 0x4c4f40, 0, 0.9, 0, 10));
    const tube = new THREE.Group();
    tube.add(cyl(0.2, 0.28, 4.8, 0x44473a, 0, 0, -2.2, 8).rotateX(Math.PI / 2));
    tube.add(cyl(0.3, 0.3, 0.9, 0x33362f, 0, 0, -0.4, 8).rotateX(Math.PI / 2)); // breech
    tube.position.y = 1.2;
    tube.rotation.x = -0.55;
    mount.add(tube);
    mount.position.set(0, 1.9, 0.8);
    g.add(mount);
    g.add(box(0.9, 0.5, 0.9, 0x7d7a5c, -1.0, 2.1, -1.9));  // shell crate
    g.add(box(0.9, 0.5, 0.9, 0x7d7a5c, 1.0, 2.1, -1.9));
    return { group: g, bob: 0.03, rock: 0.02 };
  },

  // --- temple -------------------------------------------------------------
  legion() {
    // a marching formation counts as one target.
    // Legions are common, so each soldier is a lite build (~1/3 the meshes of
    // the full soldierBody) to keep draw calls in check on mobile.
    const lite = () => {
      const s = new THREE.Group();
      const torso = capsule(0.45, 0.66, 0xb0b6bd, 0, 1.6, 0);
      torso.scale.z = 0.72;
      s.add(torso);
      s.add(sph(0.34, 0xd9b38c, 0, 2.5, 0));
      const helm = sph(0.37, 0x9aa0a8, 0, 2.6, 0);
      helm.scale.y = 0.8;
      s.add(helm);
      const crest = cone(0.14, 0.55, 0xa03c3c, 0, 3.15, 0, 8);
      crest.scale.z = 0.55;
      s.add(crest);
      s.add(capsule(0.15, 0.5, 0x8a2f2a, -0.27, 0.55, 0));
      s.add(capsule(0.15, 0.5, 0x8a2f2a, 0.27, 0.55, 0));
      s.add(capsule(0.12, 0.55, 0xb0b6bd, 0.64, 1.6, 0));
      return s;
    };
    const g = new THREE.Group();
    for (const [sx, sz] of [[-0.95, -0.8], [0.95, -0.8], [0, 0.9]]) {
      const s = lite();
      s.position.set(sx, 0, sz);
      g.add(s);
      // scutum — big tower shield held at the front
      g.add(box(1.0, 1.5, 0.14, 0x9c2f28, sx, 1.5, sz - 0.55));
      g.add(box(0.16, 1.5, 0.16, 0xd8b13a, sx, 1.5, sz - 0.6));     // spine
      // pilum
      g.add(cyl(0.04, 0.05, 2.6, 0x8a6b3f, sx + 0.55, 2.2, sz, 5));
      g.add(cone(0.07, 0.4, 0xb9bec4, sx + 0.55, 3.6, sz, 5));
    }
    return { group: g, bob: 0.12, rock: 0.03 };
  },
  romanchariot() {
    const g = new THREE.Group();
    const cab = new THREE.Group();
    cab.add(box(1.6, 1.0, 1.5, 0xd9cfb8, 0, 1.35, 0));             // white-gold cab
    cab.add(box(1.65, 0.2, 1.55, 0xd8b13a, 0, 1.92, 0));
    cab.add(box(0.18, 0.65, 1.55, 0xd8b13a, 0.8, 1.5, 0));
    cab.add(box(1.65, 0.45, 0.14, 0x9c2f28, 0, 1.2, 0.8));
    cab.add(box(1.65, 0.45, 0.14, 0x9c2f28, 0, 1.2, -0.8));
    cab.position.x = 1.2;
    g.add(cab);
    const spin = [];
    for (const wz of [-0.95, 0.95]) {
      const wheel = new THREE.Group();
      wheel.add(cyl(0.75, 0.75, 0.14, 0x6b4a2e, 0, 0, 0, 12).rotateX(Math.PI / 2));
      for (let s = 0; s < 4; s++) {
        const spoke = box(0.09, 1.4, 0.07, 0xd8b13a);
        spoke.rotation.z = (s / 4) * Math.PI;
        wheel.add(spoke);
      }
      // scythe blade on the hub
      const blade = box(0.7, 0.1, 0.16, 0xb9bec4, 0, 0, wz > 0 ? 0.25 : -0.25);
      wheel.add(blade);
      wheel.position.set(1.35, 0.75, wz);
      spin.push(wheel);
      g.add(wheel);
    }
    g.add(box(2.3, 0.12, 0.12, 0x8a6b3f, -0.35, 1.0, 0));
    for (const hz of [-0.5, 0.5]) {
      const horse = horseBody(0xe8e2d4, { mane: 0xc9bfa8 });
      horse.scale.setScalar(0.92);
      horse.position.set(-2.3, 0, hz);
      g.add(horse);
    }
    const driver = soldierBody(0x9c2f28, 0x6e211c, 0xb9bec4, { plume: 0xd8b13a });
    driver.scale.setScalar(0.85);
    driver.position.set(1.25, 1.05, 0);
    g.add(driver);
    return { group: g, spin, bob: 0.12, rock: 0.04 };
  },
  elephant() {
    const g = new THREE.Group();
    const hide = 0x8a8078, hideDark = 0x736a60;
    const body = capsule(1.5, 2.0, hide, 0, 2.7, 0.4);             // rounded body
    body.rotation.x = Math.PI / 2;
    body.scale.x = 0.95;
    g.add(body);
    const head = sph(1.05, hide, 0, 3.3, -2.5);
    head.scale.z = 0.9;
    g.add(head);
    g.add(sph(0.5, hide, 0, 4.0, -2.2));                           // brow dome
    // big floppy ears
    for (const s of [-1, 1]) {
      const ear = sph(0.95, hideDark, s * 1.15, 3.4, -2.2);
      ear.scale.set(0.18, 1, 0.75);
      ear.rotation.y = s * 0.55;
      g.add(ear);
    }
    // trunk — curved from tapering segments (animated sway)
    const trunk = new THREE.Group();
    let ty = -0.3, tz = -0.5;
    for (let i = 0; i < 4; i++) {
      const seg = capsule(0.26 - i * 0.04, 0.55, hide, 0, ty, tz);
      seg.rotation.x = 0.35 + i * 0.14;
      trunk.add(seg);
      ty -= 0.62;
      tz -= 0.2 - i * 0.08;
    }
    trunk.position.set(0, 3.1, -3.2);
    g.add(trunk);
    // tusks
    for (const s of [-1, 1]) {
      const tusk = capsule(0.09, 1.1, 0xf0e8d8, s * 0.55, 2.5, -3.15);
      tusk.rotation.x = 0.85;
      tusk.rotation.z = -s * 0.15;
      g.add(tusk);
    }
    // legs
    for (const [lx, lz] of [[-1.05, -1.2], [1.05, -1.2], [-1.05, 1.7], [1.05, 1.7]]) {
      g.add(cyl(0.42, 0.5, 1.5, hide, lx, 0.75, lz, 9));
      g.add(cyl(0.52, 0.52, 0.25, 0xd9cfb8, lx, 0.12, lz, 9));     // toenail band
    }
    g.add(box(0.16, 1.0, 0.16, hideDark, 0, 2.2, 2.6));            // tail
    // howdah war-tower on its back
    const howdah = new THREE.Group();
    howdah.add(box(2.2, 0.3, 2.6, 0x9c2f28, 0, 0, 0));             // red cloth base
    howdah.add(box(1.8, 1.0, 2.0, 0x8a6b3f, 0, 0.6, 0));
    howdah.add(box(2.0, 0.25, 2.2, 0xd8b13a, 0, 1.2, 0));
    const archer = soldierBody(0x9c2f28, 0x6e211c, 0xb9bec4, { plume: 0xd8b13a });
    archer.scale.setScalar(0.7);
    archer.position.y = 1.3;
    howdah.add(archer);
    howdah.position.set(0, 4.1, 0.4);
    g.add(howdah);
    return { group: g, bob: 0.1, rock: 0.045, anim: (t) => { trunk.rotation.x = Math.sin(t * 1.3) * 0.14; } };
  },
  siegetower() {
    const g = new THREE.Group();
    const wood = 0x6e5136, woodDark = 0x54402a, hide = 0x7d4a3a;
    // three tiers, slightly tapered
    g.add(box(3.4, 3.0, 3.4, wood, 0, 2.3, 0));
    g.add(box(3.0, 3.0, 3.0, wood, 0, 5.3, 0));
    g.add(box(2.7, 2.6, 2.7, wood, 0, 8.1, 0));
    // hide armor patches
    for (const [hy, hs] of [[2.3, 3.5], [5.3, 3.1], [8.0, 2.8]]) {
      g.add(box(hs, 1.7, 0.12, hide, 0, hy, -hs / 2 - 0.02));
    }
    // corner posts
    for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      g.add(box(0.35, 9.6, 0.35, woodDark, px, 4.8, pz));
    }
    // crenellated top + defender
    for (let i = -1; i <= 1; i++) {
      g.add(box(0.7, 0.6, 0.25, woodDark, i * 1.0, 9.7, -1.3));
      g.add(box(0.7, 0.6, 0.25, woodDark, i * 1.0, 9.7, 1.3));
    }
    const lookout = soldierBody(0xb0b6bd, 0x8a2f2a, 0x9aa0a8, { plume: 0xa03c3c });
    lookout.scale.setScalar(0.7);
    lookout.position.y = 9.4;
    g.add(lookout);
    // drawbridge ramp (raised) on the front
    const bridge = box(2.2, 2.6, 0.2, woodDark, 0, 8.2, -1.55);
    bridge.rotation.x = 0.12;
    g.add(bridge);
    // wheels
    for (const [wx, wz] of [[-1.5, -1.3], [1.5, -1.3], [-1.5, 1.3], [1.5, 1.3]]) {
      const w = cyl(0.65, 0.65, 0.5, 0x3d2e1c, wx, 0.65, wz, 12);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    return { group: g, bob: 0.02, rock: 0.015 };
  },
  batteringram() {
    const g = new THREE.Group();
    const wood = 0x6e5136, woodDark = 0x54402a;
    // gabled shed roof
    for (const s of [-1, 1]) {
      const panel = box(1.9, 0.16, 5.4, 0x7d4a3a, s * 0.8, 3.1, 0);
      panel.rotation.z = -s * 0.6;
      g.add(panel);
    }
    g.add(box(0.3, 0.3, 5.6, woodDark, 0, 3.6, 0));                // ridge beam
    // posts
    for (const [px, pz] of [[-1.3, -2.2], [1.3, -2.2], [-1.3, 2.2], [1.3, 2.2]]) {
      g.add(box(0.3, 2.6, 0.3, wood, px, 1.6, pz));
    }
    // swinging ram log with iron head
    const ram = new THREE.Group();
    const log = cyl(0.32, 0.36, 5.2, 0x8a6b3f, 0, 0, 0, 10);
    log.rotation.x = Math.PI / 2;
    ram.add(log);
    const ramHead = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.8, 8), M(0x4a4a50));
    ramHead.rotation.x = Math.PI / 2;
    ramHead.position.z = -2.8;
    ram.add(ramHead);
    ram.position.set(0, 2.4, 0);
    g.add(ram);
    // wheels
    const spin = [];
    for (const [wx, wz] of [[-1.4, -1.9], [1.4, -1.9], [-1.4, 1.9], [1.4, 1.9]]) {
      const w = cyl(0.55, 0.55, 0.4, 0x3d2e1c, wx, 0.55, wz, 12);
      w.rotation.z = Math.PI / 2;
      w.userData.spinAxis = 'x';
      spin.push(w);
      g.add(w);
    }
    // crew pushing at the back
    const crew = soldierBody(0xb0b6bd, 0x8a2f2a, 0x9aa0a8, { plume: 0xa03c3c });
    crew.scale.setScalar(0.85);
    crew.position.set(0, 0, 3.1);
    g.add(crew);
    return {
      group: g, spin, bob: 0.03, rock: 0.02,
      anim: (t) => { ram.position.z = Math.sin(t * 2.2) * 0.55; },
    };
  },
};

// ---------------------------------------------------------------------------
// manager
// ---------------------------------------------------------------------------
const blobGeo = new THREE.CircleGeometry(1, 14);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });

export class EnemyManager {
  constructor(scene, map, defs) {
    this.scene = scene;
    this.map = map;
    this.defs = defs;
    this.enemies = [];
    this.nextSpawn = 0.5;
    this.paceScale = 1;    // spawn-interval multiplier (rounds spawn faster)
    this.speedScale = 1;   // movement multiplier (suppression pushes enemies in)
    this.decorate = null;  // (enemy) => void — round role assignment
    this.onWall = null;    // (enemy) => void — enemy reached the wall
  }

  spawn() {
    const def = pickWeighted(this.defs);
    const made = FACTORIES[def.id]();
    const g = made.group;
    const x = rand(SPAWNING.xRange[0], SPAWNING.xRange[1]);
    const z = SPAWNING.spawnZ * rand(0.82, 1);
    g.position.set(x, this.map.groundHeight(x, z, 0) + (made.yOff || 0), z);
    if (!this.map.isWater) {
      // soft cartoon blob shadow keeps land units grounded
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.setScalar(def.radius * 1.05);
      blob.position.y = 0.07;
      g.add(blob);
    }
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
    if (this.decorate) this.decorate(e);
  }

  update(dt, t, waterTime) {
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0 && this.enemies.length < SPAWNING.maxEnemies) {
      this.spawn();
      this.nextSpawn = rand(SPAWNING.interval[0], SPAWNING.interval[1]) * this.paceScale;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const g = e.group;
      g.position.z += e.speed * this.speedScale * dt;
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
      if (m.spin) {
        for (const w of m.spin) w.rotation[w.userData.spinAxis || 'z'] -= e.speed * dt * 0.9;
      }
      if (m.anim) m.anim(t + e.phase);

      if (g.position.z > SPAWNING.despawnZ) {
        if (this.onWall) this.onWall(e);
        this.remove(e, i);
      }
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
  legion: Math.PI,        // scuta face local -z
  romanchariot: Math.PI / 2,
  elephant: Math.PI,      // trunk at local -z
  siegetower: Math.PI,    // drawbridge at local -z
  batteringram: Math.PI,  // ram head at local -z
};
