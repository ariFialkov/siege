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
    const wood = 0x7a5a36, woodDark = 0x5a4126;
    const base = new THREE.Group();
    base.add(box(3.6, 0.5, 4.6, woodDark, 0, 0.25, 0));
    for (const sx of [-1.5, 1.5]) {
      const frame = box(0.45, 2.6, 0.45, wood, sx, 1.5, 0.4);
      frame.rotation.x = 0.35;
      base.add(frame);
      base.add(box(0.45, 0.45, 3.8, wood, sx, 0.3, 0));
    }
    base.add(box(3.4, 0.4, 0.5, woodDark, 0, 2.6, -0.4)); // crossbar
    for (const [wx, wz] of [[-1.8, 1.6], [1.8, 1.6], [-1.8, -1.6], [1.8, -1.6]]) {
      const w = cyl(0.55, 0.55, 0.3, 0x3d2e1c, wx, 0.55, wz, 8);
      w.rotation.z = Math.PI / 2;
      base.add(w);
    }
    this.yawGroup.add(base);

    // throwing arm pivots inside pitchGroup
    this.pitchGroup.position.set(0, 0.7, 1.6);
    this.arm = new THREE.Group();
    this.arm.add(box(0.4, 0.4, 4.4, wood, 0, 0, -1.8));
    const bucket = cyl(0.75, 0.55, 0.6, woodDark, 0, 0.2, -3.9, 7);
    this.arm.add(bucket);
    this.arm.add(box(0.9, 0.9, 0.9, 0x4d4d4d, 0, 0, 0.4)); // counterweight
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
    const wood = 0x6e4a2d;
    const base = new THREE.Group();
    base.add(box(2.6, 0.5, 3.4, wood, 0, 0.25, 0));
    for (const wx of [-1.2, 1.2]) {
      const w = cyl(0.7, 0.7, 0.35, 0x3d2e1c, wx, 0.7, 0.6, 9);
      w.rotation.z = Math.PI / 2;
      base.add(w);
      base.add(box(0.4, 1.4, 2.6, wood, wx, 0.9, -0.2));
    }
    this.yawGroup.add(base);

    this.pitchGroup.position.set(0, 1.6, 0);
    this.barrel = new THREE.Group();
    const tube = cyl(0.42, 0.55, 3.4, 0x2e3238, 0, 0, 0, 10);
    tube.rotation.x = Math.PI / 2;
    this.barrel.add(tube);
    const muzzleRing = cyl(0.5, 0.5, 0.3, 0x22262b, 0, 0, -1.6, 10);
    muzzleRing.rotation.x = Math.PI / 2;
    this.barrel.add(muzzleRing);
    this.barrel.add(cyl(0.6, 0.6, 0.5, 0x22262b, 0, 0, 0.9, 10).rotateX(Math.PI / 2));
    this.pitchGroup.add(this.barrel);
    this.muzzleLocal = new THREE.Vector3(0, 0, -2.0);
  }
  update(dt) {
    super.update(dt);
    this.pitchGroup.rotation.x = -(0.2 + (this._pitchFrac || 0) * 0.35);
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
    base.add(cyl(0.9, 1.2, 0.8, dark, 0, 0.4, 0, 8));
    base.add(box(2.6, 0.25, 2.6, metal, 0, 0.05, 0));
    this.yawGroup.add(base);

    this.pitchGroup.position.set(0, 1.15, 0);
    const body = box(0.55, 0.6, 1.6, metal, 0, 0, 0.2);
    this.pitchGroup.add(body);
    this.barrelMesh = cyl(0.09, 0.12, 1.9, dark, 0, 0.05, -1.4, 7);
    this.barrelMesh.rotation.x = Math.PI / 2;
    this.pitchGroup.add(this.barrelMesh);
    this.pitchGroup.add(box(0.12, 0.35, 0.5, dark, 0, -0.42, 0.9)); // grip
    this.pitchGroup.add(box(0.5, 0.35, 0.25, 0x5c6045, 0.4, 0.15, 0.3)); // mag
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
