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
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 7) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(color));
  m.position.set(x, y, z);
  return m;
}
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 6) {
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
  wall.add(box(6, 8, 1, 0x4a3826, 0, 4, -1.2)); // gate door
  root.add(wall);

  scatter(root, 46, () => {
    const g = new THREE.Group();
    const h = 4 + Math.random() * 4;
    g.add(cyl(0.5, 0.7, h, 0x6b4a2f, 0, h / 2, 0, 5));
    g.add(cone(2.2 + Math.random() * 1.6, 4.5 + Math.random() * 3, 0x3f7d3a, 0, h + 2, 0, 6));
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
    menuOrbit: { center: new THREE.Vector3(0, 10, -14), radius: 72, height: 30 },
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
    isl.add(cone(22 * s, 16 * s, 0xc9b47c, 0, 4, 0, 7));
    isl.add(cone(10 * s, 14 * s, 0x4c8a45, 3 * s, 12 * s, -2, 6));
    isl.add(cyl(0.5, 0.7, 9, 0x7a5b36, -6 * s, 9, 4, 5));
    isl.add(cone(4, 3.4, 0x3f7d3a, -6 * s, 14.5, 4, 6));
    isl.position.set(ix, 0, iz);
    root.add(isl);
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
  // radio mast + crates
  bunker.add(cyl(0.14, 0.2, 14, 0x4c4a44, 11, 20, 12, 5));
  bunker.add(box(2.2, 2.2, 2.2, 0x6d6a4f, -12, 16.2, 10));
  bunker.add(box(1.8, 1.8, 1.8, 0x7d7a5c, -12.5, 18.2, 9.4));
  root.add(bunker);

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
