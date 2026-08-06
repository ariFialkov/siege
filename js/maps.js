// Map builders: environment geometry, ground-height functions, camera anchors.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// shared low-poly helpers
// ---------------------------------------------------------------------------
// Stepped toon lighting: rounded shapes get soft cartoon banding instead of
// the faceted flat-shaded look.
const gradientMap = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([90, 150, 210, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const matCache = new Map();
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap, ...opts }));
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
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), M(color));
  m.position.set(x, y, z);
  return m;
}
export function capsule(r, len, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), M(color));
  m.position.set(x, y, z);
  return m;
}
export function sph(r, color, x = 0, y = 0, z = 0, w = 12, h = 9) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), M(color));
  m.position.set(x, y, z);
  return m;
}
// billowing sail: an open partial cylinder, belly facing +z
export function sailCurved(w, hgt, color, x = 0, y = 0, z = 0) {
  const geo = new THREE.CylinderGeometry(w * 0.62, w * 0.62, hgt, 12, 1, true, -0.85, 1.7);
  const m = new THREE.Mesh(geo, M(color, { side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.userData.sail = true;
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
  // torches flanking the gate (flames tracked for flicker)
  const torchFlames = [];
  for (const tx of [-4.2, 4.2]) {
    wall.add(cyl(0.12, 0.16, 2.2, 0x4a3826, tx, 6.2, -1.6, 7));
    wall.add(cyl(0.3, 0.22, 0.4, 0x2e2216, tx, 7.4, -1.6, 9));
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb347 })
    );
    flame.position.set(tx, 8.0, -1.6);
    wall.add(flame);
    torchFlames.push(flame);
  }
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
      for (const fl of torchFlames) {
        fl.scale.setScalar(0.85 + Math.sin(t * 11 + fl.position.x) * 0.18);
        fl.rotation.y = t * 2.5;
      }
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
    g.add(cyl(0.5, 0.7, mh, woodDark, 0, mh / 2 + 6, mz, 10));
    g.add(sailCurved(sw, mh * 0.42, sail, 0, mh * 0.62 + 6, mz));
    g.add(sailCurved(sw * 0.7, mh * 0.24, sail, 0, mh * 0.9 + 6, mz));
    g.add(cyl(0.22, 0.22, sw + 2, woodDark, 0, mh * 0.84 + 6, mz, 6).rotateZ(Math.PI / 2));
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
  // glossy cartoon water with sun glints
  sea.material = new THREE.MeshPhongMaterial({
    color: 0x2f7396, specular: 0xbfe4f2, shininess: 90, transparent: true, opacity: 0.95,
  });
  root.add(sea);
  const seaPos = sea.geometry.attributes.position;
  let seaNormalTick = 0;

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
      // refresh lighting normals a few times a second so the glints move
      if (++seaNormalTick % 4 === 0) sea.geometry.computeVertexNormals();
      ship.position.y = wave(0, 0, t) * 0.5;
      ship.rotation.z = Math.sin(t * 0.7) * 0.02;
      ship.rotation.x = Math.cos(t * 0.55) * 0.015;
      for (const f of flags) f.rotation.y = Math.sin(t * 3.2) * 0.3;
      for (const s of sails) s.scale.z = 1 + Math.sin(t * 1.4) * 0.18;
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

// ---------------------------------------------------------------------------
// TEMPLE — Roman pantheon on a rise above the plain
// ---------------------------------------------------------------------------
function buildTemple() {
  const root = new THREE.Group();
  const marble = 0xe3ded2, marbleShade = 0xc9c2b2, terracotta = 0x9c5a3c;
  const groundHeight = (x, z) => {
    const damp = smoothstep(50, 135, Math.abs(x)) + smoothstep(-370, -520, z);
    const mound = 7 * Math.exp(-(x * x * 0.8 + (z - 16) * (z - 16)) / 2600);
    return n2(x * 1.1, z * 0.9) * Math.min(1, damp) * 2.2 + mound;
  };
  root.add(makeTerrain(groundHeight, 0x9aa85c));

  // ---- the pantheon -------------------------------------------------------
  const temple = new THREE.Group();
  // podium + forward weapon terrace + front steps
  temple.add(box(30, 3, 30, marbleShade, 0, 8.5, 22));
  temple.add(box(18, 3, 14, marbleShade, 0, 8.5, -2));
  temple.add(box(18.5, 0.7, 14.5, marble, 0, 10.2, -2));
  for (let s = 0; s < 4; s++) {
    temple.add(box(15 - s * 1.2, 0.8, 3, marble, 0, 7.6 - s * 0.9, -10.5 - s * 1.5));
  }
  temple.add(box(26, 0.8, 26, marble, 0, 10.4, 22)); // temple floor
  // colonnade — front row + returns
  const colY = 10.8;
  const columns = [[-10.5, 12], [-6.3, 12], [-2.1, 12], [2.1, 12], [6.3, 12], [10.5, 12],
    [-10.5, 18], [10.5, 18], [-10.5, 24], [10.5, 24]];
  for (const [cx, cz] of columns) {
    temple.add(box(1.5, 0.5, 1.5, marble, cx, colY + 0.25, cz));            // base
    temple.add(cyl(0.62, 0.72, 7.6, marble, cx, colY + 4.3, cz, 12));       // shaft
    temple.add(box(1.6, 0.55, 1.6, marbleShade, cx, colY + 8.3, cz));       // capital
  }
  // architrave + frieze
  temple.add(box(24.5, 1.3, 4.4, marble, 0, 19.4, 12));
  temple.add(box(24.9, 0.6, 4.8, marbleShade, 0, 20.3, 12));
  // pediment (triangular prism, squashed)
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.5, 4.2, 3, 1), M(marble));
  ped.rotation.x = Math.PI / 2;
  ped.rotation.z = Math.PI / 2;
  ped.scale.y = 0.38;
  ped.position.set(0, 21.2, 12);
  temple.add(ped);
  // rotunda + dome behind the portico
  temple.add(cyl(10.5, 11, 11, marbleShade, 0, 16, 26, 20));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(terracotta));
  dome.position.set(0, 21.5, 26);
  temple.add(dome);
  temple.add(cyl(1.2, 1.6, 1.4, marble, 0, 32.2, 26, 12)); // oculus ring cap
  // bronze doors in the shadow of the portico
  temple.add(box(5, 7.5, 0.5, 0x6e5a2e, 0, 14.6, 19.8));
  temple.add(box(0.4, 7.5, 0.6, 0x54431f, 0, 14.6, 19.78));
  temple.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(temple);

  // weapon terrace flanked by statues on plinths
  for (const sx of [-8, 8]) {
    const statue = new THREE.Group();
    statue.add(box(2.2, 2.4, 2.2, marbleShade, 0, 1.2, 0));
    const figure = new THREE.Group();
    figure.add(box(0.95, 1.35, 0.62, marble, 0, 1.55, 0));
    figure.add(box(0.55, 0.55, 0.55, marble, 0, 2.5, 0));
    figure.add(box(0.3, 0.95, 0.32, marble, -0.3, 0.5, 0));
    figure.add(box(0.3, 0.95, 0.32, marble, 0.3, 0.5, 0));
    figure.add(box(0.26, 1.0, 0.3, marble, -0.68, 1.6, 0));
    figure.add(cyl(0.05, 0.05, 2.4, marble, 0.68, 1.9, 0, 6)); // spear
    figure.scale.setScalar(1.15);
    figure.position.y = 2.4;
    statue.add(figure);
    statue.position.set(sx * 1.5, 10.4, -8);
    statue.scale.setScalar(0.8);
    root.add(statue);
  }

  // via — stone road down the battle lane
  const via = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 420, 1, 24), M(0xb5ac96));
  via.rotation.x = -Math.PI / 2;
  via.position.set(0, 0.14, -212);
  root.add(via);
  for (let i = 0; i < 12; i++) {
    root.add(box(8.9, 0.1, 0.5, 0x8f8672, 0, 0.16, -40 - i * 34));
  }

  // cypress + olive trees, ruins
  scatter(root, 44, () => {
    const g = new THREE.Group();
    const r = Math.random();
    if (r < 0.45) {
      // cypress
      const h = 7 + Math.random() * 5;
      g.add(cyl(0.3, 0.4, 1.2, 0x6b4a2f, 0, 0.6, 0, 6));
      g.add(cone(1.1 + Math.random() * 0.5, h, 0x2e5236, 0, h / 2 + 1, 0, 8));
    } else if (r < 0.8) {
      // olive tree
      const h = 2 + Math.random() * 1.5;
      const trunk = cyl(0.35, 0.55, h, 0x7a6a4f, 0, h / 2, 0, 7);
      trunk.rotation.z = (Math.random() - 0.5) * 0.3;
      g.add(trunk);
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + Math.random(), 0), M(0x8fa06a));
      canopy.position.y = h + 1.1;
      canopy.scale.y = 0.75;
      g.add(canopy);
    } else {
      // ruined column
      const drums = 1 + Math.floor(Math.random() * 3);
      for (let d = 0; d < drums; d++) {
        g.add(cyl(0.6, 0.66, 1.1, 0xd6cfbf, 0, 0.55 + d * 1.1, 0, 10));
      }
      const fallen = cyl(0.55, 0.6, 2.6, 0xc9c2b2, 1.8, 0.55, 0.6, 10);
      fallen.rotation.z = Math.PI / 2;
      fallen.rotation.y = Math.random();
      g.add(fallen);
    }
    return g;
  }, [-330, 330], [-540, 30], 52, groundHeight);

  // distant aqueduct marching along the east side
  const aq = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const z = -90 - i * 36;
    aq.add(box(4, 16, 4, 0xcabfa4, 0, 8, z));
    aq.add(box(4.5, 3, 38, 0xd6ccb2, 0, 17.5, z - 18));
  }
  aq.position.set(150, 0, 0);
  aq.rotation.y = 0.06;
  root.add(aq);
  // faded twin on the west
  const aq2 = aq.clone();
  aq2.position.set(-210, 0, -60);
  root.add(aq2);

  // distant hills
  for (let i = 0; i < 8; i++) {
    const x = -300 + i * 85 + Math.random() * 40;
    root.add(cone(50 + Math.random() * 25, 30 + Math.random() * 22, 0x8a9a6a, x, 8, -585, 7));
  }
  const cloudTick = makeClouds(root, 7, 72);

  return {
    name: 'temple',
    root,
    groundHeight,
    isWater: false,
    sky: 0xa8cbe0, fog: [0xd8d0b8, 210, 630],
    hemi: [0xfff2d8, 0x6a7a48, 0.95], sun: [0xffe8c0, 1.3, [70, 85, 30]],
    weaponPos: new THREE.Vector3(0, 11.3, -4),
    cameraPos: new THREE.Vector3(0, 17.5, 8),
    lookTarget: new THREE.Vector3(0, 2, -120),
    menuOrbit: { center: new THREE.Vector3(0, 14, 14), radius: 92, height: 36 },
    update(t, dt) { cloudTick(dt); },
  };
}

export function buildMap(name) {
  if (name === 'galleon') return buildGalleon();
  if (name === 'burm') return buildBurm();
  if (name === 'temple') return buildTemple();
  return buildFortress();
}

export function disposeMap(map) {
  map.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
