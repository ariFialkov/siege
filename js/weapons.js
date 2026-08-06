// Player weapons: low-poly models, aim articulation, fire animation.
import * as THREE from 'three';
import { box, cyl, cone, M } from './maps.js';

class WeaponBase {
  constructor(mountPos) {
    this.root = new THREE.Group();
    this.root.position.copy(mountPos);
    this.yawGroup = new THREE.Group();   // rotates left/right
    this.pitchGroup = new THREE.Group(); // tilts with aim/power
    this.yawGroup.add(this.pitchGroup);
    this.root.add(this.yawGroup);
    this.animT = 1;                      // fire animation progress (1 = idle)
    this._muzzle = new THREE.Vector3();
  }
  aim(yaw, pitchFrac) {
    this.yawGroup.rotation.y = yaw;
    this._pitchFrac = pitchFrac;
  }
  muzzleWorld(localOffset) {
    this._muzzle.copy(localOffset);
    this.pitchGroup.localToWorld(this._muzzle);
    return this._muzzle;
  }
  fire() { this.animT = 0; }
  update(dt) { this.animT = Math.min(1, this.animT + dt * 3); }
}

// --------------------------------------------------------------------------
export class Catapult extends WeaponBase {
  constructor(mountPos) {
    super(mountPos);
    const wood = 0x7a5a36, woodDark = 0x5a4126, iron = 0x4a4a50, rope = 0xb09a6a;
    const base = new THREE.Group();
    base.add(box(3.6, 0.5, 4.6, woodDark, 0, 0.25, 0));
    base.add(box(3.7, 0.16, 0.6, iron, 0, 0.55, -1.9));      // iron strapping
    base.add(box(3.7, 0.16, 0.6, iron, 0, 0.55, 1.9));
    for (const sx of [-1.5, 1.5]) {
      const frame = box(0.45, 2.6, 0.45, wood, sx, 1.5, 0.4);
      frame.rotation.x = 0.35;
      base.add(frame);
      const brace = box(0.35, 2.0, 0.35, wood, sx, 1.2, -1.1);
      brace.rotation.x = -0.55;
      base.add(brace);
      base.add(box(0.45, 0.45, 3.8, wood, sx, 0.3, 0));
      base.add(box(0.55, 0.3, 0.55, iron, sx, 2.65, -0.35)); // joint caps
    }
    base.add(box(3.4, 0.4, 0.5, woodDark, 0, 2.6, -0.4));    // crossbar
    base.add(cyl(0.22, 0.22, 3.2, rope, 0, 0.62, 1.35, 8).rotateZ(Math.PI / 2)); // torsion bundle
    for (const [wx, wz] of [[-1.8, 1.6], [1.8, 1.6], [-1.8, -1.6], [1.8, -1.6]]) {
      const wheel = new THREE.Group();
      wheel.add(cyl(0.58, 0.58, 0.32, 0x3d2e1c, 0, 0, 0, 12).rotateZ(Math.PI / 2));
      wheel.add(cyl(0.2, 0.2, 0.36, iron, 0, 0, 0, 8).rotateZ(Math.PI / 2));
      wheel.position.set(wx, 0.58, wz);
      base.add(wheel);
    }
    // spare boulder pile
    for (const [bx, bz, s] of [[1.5, 2.9, 0.5], [2.1, 2.6, 0.42], [1.8, 2.4, 0.38]]) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M(0x8d8578));
      b.position.set(bx, s * 0.8, bz);
      base.add(b);
    }
    this.yawGroup.add(base);

    // throwing arm pivots inside pitchGroup
    this.pitchGroup.position.set(0, 0.7, 1.6);
    this.arm = new THREE.Group();
    this.arm.add(box(0.4, 0.4, 4.4, wood, 0, 0, -1.8));
    this.arm.add(box(0.5, 0.14, 4.5, iron, 0, 0.25, -1.8));  // reinforcing strap
    const bucket = new THREE.Group();
    bucket.add(cyl(0.8, 0.55, 0.65, woodDark, 0, 0, 0, 10));
    bucket.add(cyl(0.82, 0.82, 0.12, iron, 0, 0.3, 0, 10));  // rim
    bucket.position.set(0, 0.2, -3.9);
    this.arm.add(bucket);
    const weight = new THREE.Group();
    weight.add(box(1.0, 1.0, 1.0, iron));
    weight.add(box(1.1, 0.2, 1.1, 0x3a3a40, 0, -0.45, 0));
    weight.position.set(0, -0.1, 0.6);
    this.arm.add(weight);
    this.pitchGroup.add(this.arm);
    this.muzzleLocal = new THREE.Vector3(0, 0.6, -3.9);
  }
  update(dt) {
    super.update(dt);
    // cocked back while idle; snaps forward on fire
    const cocked = -0.95, thrown = 0.85;
    const k = this.animT < 0.25 ? this.animT / 0.25 : Math.max(0, 1 - (this.animT - 0.25) / 0.6);
    this.arm.rotation.x = cocked + (thrown - cocked) * k;
  }
}

// --------------------------------------------------------------------------
export class Cannon extends WeaponBase {
  constructor(mountPos) {
    super(mountPos);
    const wood = 0x6e4a2d, woodDark = 0x543722, iron = 0x3a3e44;
    const base = new THREE.Group();
    base.add(box(2.6, 0.5, 3.4, wood, 0, 0.25, 0));
    base.add(box(2.7, 0.14, 0.5, iron, 0, 0.54, 1.2));       // iron strap
    for (const wx of [-1.2, 1.2]) {
      const wheel = new THREE.Group();
      wheel.add(cyl(0.72, 0.72, 0.3, 0x3d2e1c, 0, 0, 0, 12).rotateZ(Math.PI / 2));
      wheel.add(cyl(0.24, 0.24, 0.36, iron, 0, 0, 0, 8).rotateZ(Math.PI / 2));
      wheel.position.set(wx, 0.72, 0.6);
      base.add(wheel);
      // stepped carriage cheeks
      base.add(box(0.4, 1.4, 2.6, wood, wx, 0.9, -0.2));
      base.add(box(0.4, 0.9, 1.6, woodDark, wx, 1.7, 0.3));
    }
    // rope coil + cannonball pyramid
    base.add(cyl(0.35, 0.35, 0.22, 0xb09a6a, -1.0, 0.6, 1.4, 10));
    for (const [bx, by, bz] of [[1.0, 0.75, 1.3], [0.7, 0.75, 1.45], [0.85, 1.02, 1.37]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), M(0x2b2f34));
      b.position.set(bx, by, bz);
      base.add(b);
    }
    this.yawGroup.add(base);

    this.pitchGroup.position.set(0, 1.7, 0);
    this.barrel = new THREE.Group();
    const tube = cyl(0.42, 0.58, 3.5, 0x2e3238, 0, 0, 0, 12);
    tube.rotation.x = Math.PI / 2;
    this.barrel.add(tube);
    this.barrel.add(cyl(0.52, 0.52, 0.32, 0x22262b, 0, 0, -1.62, 12).rotateX(Math.PI / 2)); // muzzle ring
    this.barrel.add(cyl(0.62, 0.62, 0.34, 0x22262b, 0, 0, 0.6, 12).rotateX(Math.PI / 2));   // reinforce ring
    this.barrel.add(cyl(0.64, 0.64, 0.55, 0x22262b, 0, 0, 1.2, 12).rotateX(Math.PI / 2));   // breech
    const cascabel = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M(0x22262b));
    cascabel.position.set(0, 0, 1.75);
    this.barrel.add(cascabel);
    for (const tx of [-0.55, 0.55]) {
      this.barrel.add(cyl(0.16, 0.16, 0.4, iron, tx, 0, 0.2, 8).rotateZ(Math.PI / 2)); // trunnions
    }
    this.pitchGroup.add(this.barrel);
    this.muzzleLocal = new THREE.Vector3(0, 0, -2.0);
  }
  setPitch(rad) {
    this._aimPitch = rad;
  }
  update(dt) {
    super.update(dt);
    // follow the direct-fire aim pitch (slight rest angle when idle)
    const wanted = this._aimPitch === undefined ? 0.06 : this._aimPitch;
    this.pitchGroup.rotation.x = -wanted;
    // recoil kick
    const r = this.animT < 0.15 ? this.animT / 0.15 : Math.max(0, 1 - (this.animT - 0.15) / 0.5);
    this.barrel.position.z = r * 0.9;
  }
}

// --------------------------------------------------------------------------
export class MachineGun extends WeaponBase {
  constructor(mountPos) {
    super(mountPos);
    const metal = 0x4a4f45, dark = 0x33362f;
    const base = new THREE.Group();
    // tripod
    for (const a of [0, 2.1, -2.1]) {
      const leg = cyl(0.08, 0.11, 1.6, dark, Math.sin(a) * 0.7, 0.45, Math.cos(a) * 0.7, 7);
      leg.rotation.x = Math.cos(a) * 0.55;
      leg.rotation.z = -Math.sin(a) * 0.55;
      base.add(leg);
    }
    base.add(cyl(0.32, 0.4, 0.6, dark, 0, 0.95, 0, 10));
    base.add(box(2.6, 0.2, 2.6, metal, 0, 0.02, 0));
    // ammo box with a visible belt
    const ammo = box(0.65, 0.5, 0.95, 0x5c6045, 0.85, 1.0, 0.35);
    base.add(ammo);
    for (let i = 0; i < 5; i++) {
      base.add(box(0.1, 0.2, 0.08, 0xc9a227, 0.6, 1.28, 0.05 + i * 0.14));
    }
    this.yawGroup.add(base);

    this.pitchGroup.position.set(0, 1.3, 0);
    const body = box(0.55, 0.55, 1.7, metal, 0, 0, 0.2);
    this.pitchGroup.add(body);
    this.pitchGroup.add(box(0.4, 0.2, 0.9, dark, 0, 0.38, 0.1));       // top cover
    this.pitchGroup.add(box(0.08, 0.22, 0.08, dark, 0, 0.5, -0.55));   // front sight
    this.barrelMesh = cyl(0.09, 0.12, 1.9, dark, 0, 0.05, -1.4, 8);
    this.barrelMesh.rotation.x = Math.PI / 2;
    this.pitchGroup.add(this.barrelMesh);
    // cooling ribs
    for (let i = 0; i < 3; i++) {
      this.pitchGroup.add(cyl(0.15, 0.15, 0.1, metal, 0, 0.05, -0.75 - i * 0.35, 10).rotateX(Math.PI / 2));
    }
    this.pitchGroup.add(box(0.12, 0.4, 0.5, dark, 0, -0.42, 0.95));    // grip
    this.pitchGroup.add(box(0.3, 0.3, 0.45, 0x3f4238, 0, 0.05, 1.15)); // stock
    this.pitchGroup.add(box(0.5, 0.35, 0.25, 0x5c6045, 0.42, 0.1, 0.3)); // feed tray
    // muzzle flash (toggled while firing)
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95 })
    );
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.position.set(0, 0.05, -2.6);
    this.flash.visible = false;
    this.pitchGroup.add(this.flash);
    this.muzzleLocal = new THREE.Vector3(0, 0.05, -2.4);
    this._flashTime = 0;
  }
  setPitch(rad) { this.pitchGroup.rotation.x = -rad; }
  fire() {
    super.fire();
    this._flashTime = 0.06;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
  }
  update(dt) {
    super.update(dt);
    this._flashTime -= dt;
    this.flash.visible = this._flashTime > 0;
    // recoil jitter while firing
    const r = this.animT < 0.1 ? 1 : 0;
    this.pitchGroup.position.z = r * 0.08;
  }
}

export function makeWeapon(kind, mountPos) {
  if (kind === 'cannon') return new Cannon(mountPos);
  if (kind === 'machinegun') return new MachineGun(mountPos);
  return new Catapult(mountPos);
}
