// Visual juice: explosions, debris, water splashes, floating bet results,
// screen shake and haptics.
import * as THREE from 'three';
import { EFFECTS } from './config.js';

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene, camera, overlayEl) {
    this.scene = scene;
    this.camera = camera;
    this.overlay = overlayEl;   // DOM layer for floating text
    this.bursts = [];
    this.debris = [];
    this.labels = [];
    this.shake = 0;
    this.flashPool = [];
  }

  // ---- screen shake / haptics --------------------------------------------
  addShake(amount) {
    this.shake = Math.min(EFFECTS.maxShake, this.shake + amount);
  }
  vibrate(pattern) {
    try { navigator.vibrate && navigator.vibrate(pattern); } catch (_) { /* no-op */ }
  }

  // ---- particle burst ----------------------------------------------------
  burst(pos, { count = 30, color = 0xff8844, size = 0.9, speed = 14, up = 8, life = 0.9, gravity = 18 }) {
    const positions = new Float32Array(count * 3);
    const vels = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      vels[i * 3] = Math.cos(a) * r;
      vels[i * 3 + 1] = Math.random() * up + up * 0.3;
      vels[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.bursts.push({ pts, vels, life, maxLife: life, gravity });
  }

  // ---- explosion, scaled by "spectacle" (0..1+) --------------------------
  explosion(pos, spectacle = 0.4, kind = 'boulder') {
    const s = Math.min(2.2, 0.35 + spectacle);
    const fire = kind === 'bullet' ? 0xffcf6a : 0xff7a33;
    this.burst(pos, { count: Math.floor(26 + s * 44), color: fire, size: 0.8 + s * 0.7, speed: 8 + s * 12, up: 7 + s * 9, life: 0.7 + s * 0.35 });
    this.burst(pos, { count: Math.floor(14 + s * 22), color: 0xffe08a, size: 0.5 + s * 0.4, speed: 5 + s * 16, up: 5 + s * 12, life: 0.5 + s * 0.3 });
    // smoke
    this.burst(pos, { count: Math.floor(10 + s * 14), color: 0x555555, size: 1.4 + s, speed: 3 + s * 4, up: 4 + s * 4, life: 1.1 + s * 0.5, gravity: -2 });
    if (s > 1.1) {
      // big win: extra ring of sparks
      this.burst(pos, { count: 60, color: 0xffd24a, size: 0.7, speed: 26, up: 3, life: 1.0 });
    }
    // point-light flash
    const light = new THREE.PointLight(fire, 60 + spectacle * 220, 40 + spectacle * 50, 2);
    light.position.copy(pos).y += 2;
    this.scene.add(light);
    this.flashPool.push({ light, life: 0.22 + spectacle * 0.12, maxLife: 0.22 + spectacle * 0.12 });
  }

  splash(pos) {
    this.burst(pos, { count: 34, color: 0xbfe4f2, size: 0.9, speed: 7, up: 12, life: 0.8, gravity: 26 });
    this.burst(pos, { count: 14, color: 0xe8f6fb, size: 1.3, speed: 3, up: 6, life: 0.9, gravity: 20 });
  }

  dust(pos, color = 0xcbb896) {
    this.burst(pos, { count: 22, color, size: 1.1, speed: 6, up: 5, life: 0.7, gravity: 10 });
  }

  // ---- enemy break-apart debris ------------------------------------------
  shatter(enemyGroup, impactPos, power = 1) {
    const pieces = [];
    enemyGroup.updateMatrixWorld(true);
    enemyGroup.traverse((o) => { if (o.isMesh) pieces.push(o); });
    for (const mesh of pieces) {
      const world = mesh.getWorldPosition(new THREE.Vector3());
      const quat = mesh.getWorldQuaternion(new THREE.Quaternion());
      const scale = mesh.getWorldScale(new THREE.Vector3());
      const clone = new THREE.Mesh(mesh.geometry, mesh.material);
      clone.position.copy(world);
      clone.quaternion.copy(quat);
      clone.scale.copy(scale);
      this.scene.add(clone);
      const dir = _v.copy(world).sub(impactPos).normalize();
      this.debris.push({
        mesh: clone,
        vel: new THREE.Vector3(
          dir.x * (6 + Math.random() * 8) * power,
          6 + Math.random() * 9 * power,
          dir.z * (6 + Math.random() * 8) * power
        ),
        spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        life: 1.4,
      });
    }
  }

  // ---- floating bet-result text ------------------------------------------
  floatText(pos3, text, cls) {
    const el = document.createElement('div');
    el.className = `float-label ${cls}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.labels.push({ el, pos: pos3.clone(), life: 1.6, maxLife: 1.6 });
  }

  // ---- frame update ------------------------------------------------------
  update(dt, renderer) {
    // particle bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.pts.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        b.vels[j * 3 + 1] -= b.gravity * dt;
        pos.array[j * 3] += b.vels[j * 3] * dt;
        pos.array[j * 3 + 1] += b.vels[j * 3 + 1] * dt;
        pos.array[j * 3 + 2] += b.vels[j * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life / (b.maxLife * 0.55));
    }
    // light flashes
    for (let i = this.flashPool.length - 1; i >= 0; i--) {
      const f = this.flashPool[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.light);
        this.flashPool.splice(i, 1);
      } else {
        f.light.intensity *= f.life / f.maxLife;
      }
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.y -= 26 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const s = Math.min(1, d.life / 0.4);
      d.mesh.scale.setScalar(Math.max(0.01, s));
    }
    // floating labels — project world position to screen
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.life -= dt;
      if (l.life <= 0) {
        l.el.remove();
        this.labels.splice(i, 1);
        continue;
      }
      l.pos.y += dt * 4;
      _v.copy(l.pos).project(this.camera);
      const k = 1 - l.life / l.maxLife;
      l.el.style.left = `${(_v.x * 0.5 + 0.5) * w}px`;
      l.el.style.top = `${(-_v.y * 0.5 + 0.5) * h}px`;
      l.el.style.opacity = l.life < 0.5 ? l.life / 0.5 : 1;
      l.el.style.transform = `translate(-50%,-50%) scale(${1 + k * 0.25})`;
      if (_v.z > 1) l.el.style.opacity = 0;
    }
    // shake decay
    this.shake = Math.max(0, this.shake - EFFECTS.shakeDecay * dt * (0.3 + this.shake));
  }

  clearTransient() {
    for (const b of this.bursts) { this.scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); }
    this.bursts.length = 0;
    for (const f of this.flashPool) this.scene.remove(f.light);
    this.flashPool.length = 0;
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris.length = 0;
    for (const l of this.labels) l.el.remove();
    this.labels.length = 0;
  }
}
