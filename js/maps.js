// Map builders: environment geometry, ground-height functions, camera anchors.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// shared low-poly helpers
// ---------------------------------------------------------------------------
const matCache = new Map();
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
  m.position.set(x, y, z);
  return m;
}
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(color));
  m.position.set(x, y, z);
  return m;
}
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), M(color));
  m.position.set(x, y, z);
  return m;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// cheap deterministic noise
function n2(x, z) {
  return Math.sin(x * 0.052 + 1.7) * Math.cos(z * 0.047) * 1.6
       + Math.sin(x * 0.013 + z * 0.019) * 2.6
       + Math.sin(x * 0.11 + z * 0.07) * 0.5;
}

function makeTerrain(groundHeight, color, size = 720, seg = 72) {
  const geo = new THREE.PlaneGeometry(size, size + 160, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 200; // shift coverage toward the battlefield
    pos.setZ(i, z);
    pos.setY(i, groundHeight(x, z, 0));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, M(color));
  mesh.receiveShadow = true;
  return mesh;
}

const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: true });

function makeClouds(root, count, y0 = 70) {
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const parts = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < parts; j++) {
      // unlit so clouds read as soft white blobs, not shaded slabs
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(10 + Math.random() * 14, 3 + Math.random() * 2, 6 + Math.random() * 6)
      );
      b.material = cloudMat;
      b.position.set((j - parts / 2) * 8, Math.random() * 2, Math.random() * 4);
      g.add(b);
    }
    g.position.set(-260 + Math.random() * 520, y0 + Math.random() * 30, -420 + Math.random() * 380);
    g.userData.speed = 1 + Math.random() * 2;
    root.add(g);
    clouds.push(g);
  }
  return (dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 300) c.position.x = -300;
    }
  };
}

function scatter(root, count, maker, xr, zr, corridorHalf, groundHeight) {
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 8; tries++) {
      const x = xr[0] + Math.random() * (xr[1] - xr[0]);
      const z = zr[0] + Math.random() * (zr[1] - zr[0]);
      if (Math.abs(x) < corridorHalf && z < -20) continue; // keep battle lane clear
      const obj = maker();
      obj.position.set(x, groundHeight(x, z, 0), z);
      obj.rotation.y = Math.random() * Math.PI * 2;
      root.add(obj);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// FORTRESS — medieval castle, green fields
// ---------------------------------------------------------------------------
function buildFortress() {
  const root = new THREE.Group();
  const groundHeight = (x, z) => {
    const damp = smoothstep(52, 130, Math.abs(x)) + smoothstep(-380, -520, z);
    const mound = 3.5 * Math.exp(-(x * x + (z - 14) * (z - 14)) / 1400);
    return n2(x, z) * Math.min(1, damp) * 2.2 + mound;
  };
  root.add(makeTerrain(groundHeight, 0x5ea753));

  // castle wall across the near field
  const stone = 0x9b9b93, stoneDark = 0x82827b;
  const wall = new THREE.Group();
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const seg = box(16, 10, 5, stone, i * 16, 5, 0);
    seg.castShadow = true;
    wall.add(seg);
    for (let b = -1; b <= 1; b++) wall.add(box(3, 2, 5.4, stoneDark, i * 16 + b * 5.5, 11, 0));
  }
  // gate towers + flanking towers (kept wide so they don't crowd the play view)
  for (const tx of [-24, 24, -56, 56]) {
    const t = cyl(5, 5.6, 20, stoneDark, tx, 10, 0, 8);
    t.castShadow = true;
    wall.add(t);
    wall.add(cone(6.4, 6, 0x8d3b3b, tx, 23, 0, 8));
    const flag = box(3.4, 2, 0.15, 0xd8b13a, tx + 1.8, 27.5, 0);
    flag.userData.flag = true;
    wall.add(flag);
    wall.add(cyl(0.16, 0.16, 5, 0x5a4632, tx, 26.5, 0, 5));
  }
  // central keep platform (the player's post)
  const keep = box(14, 16, 12, stone, 0, 8, 5);
  keep.castShadow = true;
  wall.add(keep);
  for (let b = -2; b <= 2; b++) wall.add(box(2.2, 1.8, 12.4, stoneDark, b * 2.9, 17, 5));
  // arrow-slit windows + banners on the keep face
  for (const [wx, wy] of [[-4, 10], [4, 10], [-4, 5.5], [4, 5.5]]) {
    wall.add(box(0.5, 1.6, 0.3, 0x241c14, wx, wy, -1.15));
  }
  for (const bx of [-6.2, 6.2]) {
    const b = box(1.6, 4.5, 0.14, 0xa03c3c, bx, 9, -1.2);
    b.userData.flag = true;
    wall.add(b);
    wall.add(box(0.9, 0.9, 0.2, 0xd8b13a, bx, 10.4, -1.28));
  }
  const arch = cyl(3.2, 3.2, 1.1, stoneDark, 0, 8, -1.2, 12);
  arch.rotation.x = Math.PI / 2;
  wall.add(arch);
  wall.add(box(6, 8, 1, 0x4a3826, 0, 4, -1.2)); // gate door
  wall.add(box(0.5, 8, 1.06, 0x2e2216, -1.5, 4, -1.22)); // door planks
  wall.add(box(0.5, 8, 1.06, 0x2e2216, 1.5, 4, -1.22));
  root.add(wall);

  // dirt road running down the battle lane
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 420, 1, 24), M(0x8a6f4d));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.12, -212);
  root.add(road);
  // hay bales + crates near the walls
  for (const [hx, hz] of [[-18, -18], [22, -24], [-30, -32]]) {
    const bale = cyl(1.3, 1.3, 1.8, 0xd0aa4e, hx, 1.3, hz, 12);
    bale.rotation.z = Math.PI / 2;
    root.add(bale);
  }
  root.add(box(2, 2, 2, 0x8a6b3f, 30, 1 + groundHeight(30, -20), -20));
  root.add(box(1.5, 1.5, 1.5, 0x9a7a4a, 32.2, 0.75 + groundHeight(32, -21), -21));

  scatter(root, 46, () => {
    const g = new THREE.Group();
    if (Math.random() < 0.75) {
      // two-tier pine
      const h = 4 + Math.random() * 4;
      const r = 2.2 + Math.random() * 1.6;
      g.add(cyl(0.5, 0.7, h, 0x6b4a2f, 0, h / 2, 0, 7));
      g.add(cone(r, 4.2 + Math.random() * 2, 0x3f7d3a, 0, h + 1.6, 0));
      g.add(cone(r * 0.7, 3.2 + Math.random() * 2, 0x4c8a45, 0, h + 4.4, 0));
    } else {
      // round bush cluster
      const r = 1 + Math.random() * 1.4;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), M(0x4c8a45));
      bush.position.y = r * 0.7;
      g.add(bush);
      const b2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.7, 0), M(0x3f7d3a));
      b2.position.set(r * 0.8, r * 0.5, 0.3);
      g.add(b2);
    }
    return g;
  }, [-330, 330], [-560, 40], 58, groundHeight);

  // distant mountains
  for (let i = 0; i < 9; i++) {
    const x = -300 + i * 75 + Math.random() * 30;
    root.add(cone(45 + Math.random() * 25, 55 + Math.random() * 45, 0x7d8f9b, x, 12, -600, 5));
  }
  const cloudTick = makeClouds(root, 8);

  const flags = [];
  root.traverse((o) => { if (o.userData.flag) flags.push(o); });

  return {
    name: 'fortress',
    root,
    groundHeight,
    isWater: false,
    sky: 0x9fc7e8, fog: [0xb9d4e4, 220, 640],
    hemi: [0xcfe5ff, 0x4a7040, 0.9], sun: [0xfff2d0, 1.25, [60, 90, 40]],
    weaponPos: new THREE.Vector3(0, 17.2, 5),
    cameraPos: new THREE.Vector3(0, 23.5, 16),
    lookTarget: new THREE.Vector3(0, 4, -120),
    menuOrbit: { center: new THREE.Vector3(0, 10, -14), radius: 88, height: 36 },
    update(t, dt) {
      cloudTick(dt);
      for (const f of flags) f.rotation.y = Math.sin(t * 3 + f.position.x) * 0.25;
    },
  };
}

// ---------------------------------------------------------------------------
// GALLEON — pirate ship on open water
// ---------------------------------------------------------------------------
function wave(x, z, t) {
  return Math.sin(x * 0.06 + t * 1.1) * 0.55
       + Math.cos(z * 0.05 + t * 0.8) * 0.65
       + Math.sin((x + z) * 0.021 + t * 0.5) * 0.5;
}

function buildPlayerShip() {
  const g = new THREE.Group();
  const wood = 0x6e4a2d, woodDark = 0x543722, sail = 0xe8e0cc;
  // hull
  const hull = box(16, 5, 40, wood, 0, 3.5, 6);
  hull.castShadow = true;
  g.add(hull);
  g.add(box(13, 2.2, 44, woodDark, 0, 1.2, 6));
  g.add(box(16.6, 1.2, 41, 0x3d2a18, 0, 6.2, 6)); // rail line
  // bow wedge + stern castle
  const bow = new THREE.Mesh(new THREE.ConeGeometry(6.5, 12, 4), M(wood));
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 3.5, -19);
  g.add(bow);
  const stern = box(14, 6, 9, woodDark, 0, 8.5, 22);
  stern.castShadow = true;
  g.add(stern);
  g.add(box(12, 1, 8, 0x8a623c, 0, 12.2, 22));
  // masts + sails — kept midship/aft so the bow gun position has a clear view
  for (const [mz, mh, sw] of [[3, 34, 14], [16, 40, 17]]) {
    g.add(cyl(0.5, 0.7, mh, woodDark, 0, mh / 2 + 6, mz, 6));
    const s = box(sw, mh * 0.42, 0.3, sail, 0, mh * 0.62 + 6, mz);
    s.userData.sail = true;
    g.add(s);
    g.add(cyl(0.22, 0.22, sw + 2, woodDark, 0, mh * 0.84 + 6, mz, 5).rotateZ(Math.PI / 2));
  }
  // black flag
  const flag = box(4, 2.4, 0.15, 0x1a1a1e, 2.2, 48.5, 16);
  flag.userData.flag = true;
  g.add(flag);
  // deck details: plank stripes, barrels, crates, ship's wheel, lantern
  for (let i = -3; i <= 3; i++) {
    g.add(box(1.7, 0.06, 41, i % 2 ? 0x654226 : 0x5d3c22, i * 1.85, 6.24, 6));
  }
  for (const [bx, bz] of [[-5.5, 14], [-5.5, 12.2], [-4.6, 13.1]]) {
    const barrel = cyl(0.65, 0.55, 1.5, 0x5a3d24, bx, 7, bz, 10);
    g.add(barrel);
    g.add(cyl(0.67, 0.67, 0.1, 0x3a3e44, bx, 7.3, bz, 10));
  }
  g.add(box(1.6, 1.6, 1.6, 0x6a4a2c, 5.5, 7.1, 13));
  g.add(box(1.2, 1.2, 1.2, 0x7a5a36, 5.2, 8.5, 12.6));
  const wheel = new THREE.Group();
  wheel.add(cyl(1.0, 1.0, 0.14, 0x4a3220, 0, 0, 0, 12).rotateX(Math.PI / 2));
  for (let s = 0; s < 4; s++) {
    const spoke = box(0.12, 2.6, 0.1, 0x6a4a2c);
    spoke.rotation.z = (s / 4) * Math.PI;
    wheel.add(spoke);
  }
  wheel.position.set(0, 14.2, 19.5);
  g.add(wheel);
  g.add(cyl(0.12, 0.16, 1.6, 0x4a3220, 0, 13, 19.8, 8));
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd76a }));
  lantern.position.set(0, 13.6, 25.8);
  g.add(lantern);
  // bow rails
  for (const s of [-1, 1]) {
    g.add(box(0.2, 1.0, 12, 0x3d2a18, s * 8.1, 7, -12));
  }
  return g;
}

function buildGalleon() {
  const root = new THREE.Group();
  const groundHeight = (x, z, t = 0) => wave(x, z, t);

  const sea = makeTerrain((x, z) => wave(x, z, 0), 0x2a6d8f);
  sea.material = M(0x2a6d8f, { transparent: true, opacity: 0.96 });
  root.add(sea);
  const seaPos = sea.geometry.attributes.position;

  const ship = buildPlayerShip();
  root.add(ship);

  // islands off to the sides
  for (const [ix, iz, s] of [[-150, -260, 1.4], [180, -340, 1.9], [-230, -430, 2.4], [140, -120, 0.9]]) {
    const isl = new THREE.Group();
    isl.add(cone(22 * s, 16 * s, 0xc9b47c, 0, 4, 0, 9));
    isl.add(cone(16 * s, 8 * s, 0xe0cf9a, 0, 3, 0, 9));       // beach skirt
    isl.add(cone(10 * s, 14 * s, 0x4c8a45, 3 * s, 12 * s, -2, 8));
    // palm cluster
    for (const [px, pz] of [[-6 * s, 4], [-4 * s, 6]]) {
      const trunk = cyl(0.4, 0.6, 9, 0x7a5b36, px, 9, pz, 7);
      trunk.rotation.z = 0.15;
      isl.add(trunk);
      for (let f = 0; f < 4; f++) {
        const frond = box(3.2, 0.14, 0.8, 0x3f7d3a, px + Math.cos(f * 1.57) * 1.5, 13.6, pz + Math.sin(f * 1.57) * 1.5);
        frond.rotation.y = f * 1.57;
        frond.rotation.z = 0.35;
        isl.add(frond);
      }
    }
    // foam ring at the waterline
    const foam = new THREE.Mesh(new THREE.RingGeometry(20 * s, 23 * s, 22),
      M(0xdff2f8, { transparent: true, opacity: 0.55 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 1.1;
    isl.add(foam);
    isl.position.set(ix, 0, iz);
    root.add(isl);
  }
  // seagulls circling the ship
  const gulls = [];
  for (let i = 0; i < 4; i++) {
    const gull = new THREE.Group();
    const lw = box(1.1, 0.08, 0.3, 0xf4f6f8, -0.5, 0, 0);
    lw.rotation.z = 0.35;
    const rw = box(1.1, 0.08, 0.3, 0xf4f6f8, 0.5, 0, 0);
    rw.rotation.z = -0.35;
    gull.add(lw, rw, box(0.35, 0.12, 0.6, 0xe8e8e8, 0, 0, 0));
    gull.userData = { r: 26 + i * 9, h: 26 + i * 4, ph: i * 1.7, sp: 0.25 + i * 0.05, lw, rw };
    root.add(gull);
    gulls.push(gull);
  }
  const cloudTick = makeClouds(root, 10, 62);

  const flags = [], sails = [];
  root.traverse((o) => {
    if (o.userData.flag) flags.push(o);
    if (o.userData.sail) sails.push(o);
  });

  return {
    name: 'galleon',
    root,
    groundHeight,
    isWater: true,
    sky: 0x7ec4e8, fog: [0x9fd0e6, 200, 620],
    hemi: [0xd8ecff, 0x1e4a60, 0.95], sun: [0xfff4d8, 1.3, [-50, 80, 30]],
    weaponPos: new THREE.Vector3(0, 7.4, -13),
    cameraPos: new THREE.Vector3(0, 13, -1),
    lookTarget: new THREE.Vector3(0, 0, -120),
    menuOrbit: { center: new THREE.Vector3(0, 9, 0), radius: 78, height: 26 },
    update(t, dt) {
      cloudTick(dt);
      // animate sea vertices (skip most frames' full recompute of normals for perf)
      for (let i = 0; i < seaPos.count; i++) {
        seaPos.setY(i, wave(seaPos.getX(i), seaPos.getZ(i), t));
      }
      seaPos.needsUpdate = true;
      ship.position.y = wave(0, 0, t) * 0.5;
      ship.rotation.z = Math.sin(t * 0.7) * 0.02;
      ship.rotation.x = Math.cos(t * 0.55) * 0.015;
      for (const f of flags) f.rotation.y = Math.sin(t * 3.2) * 0.3;
      for (const s of sails) s.scale.z = 1 + Math.sin(t * 1.4) * 0.5;
      for (const gull of gulls) {
        const u = gull.userData;
        const a = t * u.sp + u.ph;
        gull.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 1.3 + u.ph) * 2, -20 + Math.sin(a) * u.r);
        gull.rotation.y = -a - Math.PI / 2;
        const flap = Math.sin(t * 7 + u.ph) * 0.5;
        u.lw.rotation.z = 0.2 + flap;
        u.rw.rotation.z = -0.2 - flap;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// BURM — modern hillside bunker, desert
// ---------------------------------------------------------------------------
function buildBurm() {
  const root = new THREE.Group();
  const groundHeight = (x, z) => {
    const damp = smoothstep(48, 140, Math.abs(x)) + smoothstep(-360, -520, z);
    const hill = 13 * Math.exp(-(x * x * 0.6 + (z - 26) * (z - 26)) / 3200);
    return n2(x * 1.3, z) * Math.min(1, damp) * 2.6 + hill;
  };
  root.add(makeTerrain(groundHeight, 0xc9b083));

  // bunker: concrete slab + sandbag arc + camo posts
  const bunker = new THREE.Group();
  const slab = box(18, 3, 12, 0x8f8d84, 0, 13.6, 8);
  slab.castShadow = true;
  bunker.add(slab);
  bunker.add(box(20, 1, 14, 0x7c7a72, 0, 12, 8));
  const bag = () => {
    const b = box(2.4, 1.1, 1.3, 0xa89468);
    b.rotation.y = (Math.random() - 0.5) * 0.4;
    return b;
  };
  for (let i = -4; i <= 4; i++) {
    for (let row = 0; row < 2; row++) { // low enough to shoot over
      const a = (i / 4) * 1.15;
      const b = bag();
      b.position.set(Math.sin(a) * 11, 15.7 + row * 1.05, 8 - Math.cos(a) * 7.5);
      b.rotation.y = -a + (Math.random() - 0.5) * 0.3;
      bunker.add(b);
    }
  }
  // radio mast + crates + oil barrels
  bunker.add(cyl(0.14, 0.2, 14, 0x4c4a44, 11, 20, 12, 6));
  bunker.add(box(1.0, 0.14, 0.14, 0x4c4a44, 11, 25, 12));
  bunker.add(box(2.2, 2.2, 2.2, 0x6d6a4f, -12, 16.2, 10));
  bunker.add(box(1.8, 1.8, 1.8, 0x7d7a5c, -12.5, 18.2, 9.4));
  for (const [ox, oz, c] of [[13, 8, 0x8a4a3a], [13.9, 9.2, 0x6d6a4f], [13.4, 10.4, 0x8a4a3a]]) {
    bunker.add(cyl(0.6, 0.6, 1.6, c, ox, 15.4, oz, 10));
    bunker.add(cyl(0.62, 0.62, 0.08, 0x3a3833, ox, 16.2, oz, 10));
  }
  root.add(bunker);

  // watchtower off to the side of the hill
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    const leg = cyl(0.14, 0.18, 11, 0x5c5648, lx, 5.5, lz, 7);
    leg.rotation.x = lz * 0.05;
    leg.rotation.z = -lx * 0.05;
    tower.add(leg);
  }
  tower.add(box(4.4, 0.4, 4.4, 0x6d6a4f, 0, 11, 0));
  tower.add(box(4.6, 1.2, 4.6, 0xa89468, 0, 11.9, 0));  // sandbag parapet
  tower.add(box(4.8, 0.3, 4.8, 0x6a6d52, 0, 14.4, 0));  // roof
  for (const [px, pz] of [[-2, -2], [2, 2]]) tower.add(cyl(0.1, 0.1, 2.4, 0x5c5648, px, 13.2, pz, 6));
  tower.position.set(24, groundHeight(24, 2), 2);
  root.add(tower);

  // barbed wire lines flanking the approach
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const px = side * (16 + i * 4), pz = -34 - i * 9;
      const post = cyl(0.09, 0.12, 2.2, 0x4c4a44, px, groundHeight(px, pz) + 1.1, pz, 6);
      post.rotation.z = (Math.random() - 0.5) * 0.2;
      root.add(post);
      if (i > 0) {
        const qx = side * (16 + (i - 1) * 4), qz = -34 - (i - 1) * 9;
        const mx = (px + qx) / 2, mz = (pz + qz) / 2;
        const len = Math.hypot(px - qx, pz - qz);
        for (const wy of [0.7, 1.5]) {
          const wire = cyl(0.025, 0.025, len, 0x3a3833, mx, groundHeight(mx, mz) + wy, mz, 4);
          wire.rotation.z = Math.PI / 2;
          wire.rotation.y = -Math.atan2(pz - qz, px - qx);
          root.add(wire);
        }
      }
    }
  }
  // canvas tent behind the lines
  const tent = new THREE.Group();
  const canvas = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 2.6, 3.4, 4), M(0x8a8266));
  canvas.rotation.y = Math.PI / 4;
  canvas.position.y = 1.7;
  tent.add(canvas);
  tent.add(box(0.6, 1.4, 0.1, 0x3a3327, 0, 0.7, 1.9));
  tent.position.set(-22, groundHeight(-22, 14), 14);
  root.add(tent);

  // rocks and dead shrubs
  scatter(root, 40, () => {
    const g = new THREE.Group();
    if (Math.random() < 0.55) {
      const r = 1 + Math.random() * 3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), M(0x9a8f7a));
      rock.position.y = r * 0.5;
      rock.castShadow = true;
      g.add(rock);
    } else {
      const h = 2 + Math.random() * 2;
      g.add(cyl(0.15, 0.3, h, 0x6e5b40, 0, h / 2, 0, 5));
      g.add(cyl(0.1, 0.14, h * 0.7, 0x6e5b40, 0.5, h * 0.55, 0, 4).rotateZ(0.7));
    }
    return g;
  }, [-330, 330], [-540, 30], 54, groundHeight);

  // distant dunes / ridge
  for (let i = 0; i < 8; i++) {
    const x = -300 + i * 85 + Math.random() * 40;
    root.add(cone(55 + Math.random() * 30, 34 + Math.random() * 26, 0xb69a6c, x, 6, -590, 5));
  }
  // burnt-out wreck for flavor
  const wreck = new THREE.Group();
  wreck.add(box(4.5, 1.6, 7, 0x4a4642, 0, 1.2, 0));
  wreck.add(box(3.4, 1.2, 3.6, 0x3d3a37, 0, 2.5, 0.6));
  wreck.position.set(-30, groundHeight(-30, -70), -70);
  wreck.rotation.y = 0.7;
  wreck.rotation.z = 0.12;
  root.add(wreck);

  const cloudTick = makeClouds(root, 5, 80);

  return {
    name: 'burm',
    root,
    groundHeight,
    isWater: false,
    sky: 0xe8c98f, fog: [0xe3c393, 210, 620],
    hemi: [0xffe8c0, 0x8a6b40, 0.85], sun: [0xffd9a0, 1.35, [-70, 60, -20]],
    weaponPos: new THREE.Vector3(0, 16.6, 6),
    cameraPos: new THREE.Vector3(0, 21.5, 15),
    lookTarget: new THREE.Vector3(0, 2, -120),
    menuOrbit: { center: new THREE.Vector3(0, 12, -4), radius: 66, height: 26 },
    update(t, dt) { cloudTick(dt); },
  };
}

export function buildMap(name) {
  if (name === 'galleon') return buildGalleon();
  if (name === 'burm') return buildBurm();
  return buildFortress();
}

export function disposeMap(map) {
  map.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
