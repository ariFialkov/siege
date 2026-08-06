// SIEGE — main game orchestration.
import * as THREE from 'three';
import { BETTING, ENEMIES, WEAPONS, AIMING, EFFECTS, MAP_INFO, drawPayout } from './config.js';
import { buildMap, disposeMap } from './maps.js';
import { EnemyManager } from './enemies.js';
import { makeWeapon } from './weapons.js';
import { ProjectileManager } from './projectiles.js';
import { Effects } from './effects.js';
import { Slingshot } from './slingshot.js';
import { UI } from './ui.js';
import { sfx, unlock as unlockAudio } from './audio.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
    this.state = 'menu';           // 'menu' | 'transition' | 'play'
    this.time = 0;
    this.orbitAngle = 0;
    const stored = localStorage.getItem('siege.balance');
    this.balance = stored === null ? BETTING.startBalance : Number(stored);
    if (!Number.isFinite(this.balance)) this.balance = BETTING.startBalance;

    this.ui = new UI({
      onPlay: () => this.startPlay(),
      onMenu: () => this.toMenu(),
      onMapChange: (name) => { sfx.click(); this.loadMap(name); },
      onStakeChange: () => sfx.click(),
    });

    this.slingshot = new Slingshot(document.getElementById('sling'), {
      onRelease: (pull) => this.fireBallistic(pull),
      onMaxPull: () => {
        this.effects.vibrate(EFFECTS.vibrateMaxPullMs);
        sfx.maxPull();
      },
      onCancel: () => {},
    });

    this.mgAccum = 0;
    this.stats = { bets: 0, wins: 0, losses: 0, wagered: 0, returned: 0 };
    this.loadMap(this.ui.mapName);
    this.ui.setBalance(this.balance);
    this.ui.showMenu();

    window.addEventListener('resize', () => this.resize());
    this.resize();

    document.body.addEventListener('pointerdown', unlockAudio, { once: true });

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ------------------------------------------------------------------ scene
  loadMap(name) {
    if (this.map) {
      this.effects.clearTransient();
      this.enemyMgr.clear();
      this.projectiles.clear();
      disposeMap(this.map);
    }
    this.scene = new THREE.Scene();
    this.map = buildMap(name);
    this.scene.add(this.map.root);
    this.scene.background = new THREE.Color(this.map.sky);
    this.scene.fog = new THREE.Fog(this.map.fog[0], this.map.fog[1], this.map.fog[2]);

    const [hc, hg, hi] = this.map.hemi;
    this.scene.add(new THREE.HemisphereLight(hc, hg, hi));
    const [sc, si, spos] = this.map.sun;
    const sun = new THREE.DirectionalLight(sc, si);
    sun.position.set(...spos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 90;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 400 });
    this.scene.add(sun);
    // soft cool fill from the opposite side rounds out the flat shading
    const fill = new THREE.DirectionalLight(0xbcd4e8, 0.35);
    fill.position.set(-spos[0], spos[1] * 0.6, -spos[2]);
    this.scene.add(fill);

    this.weaponDef = WEAPONS[MAP_INFO[name].weapon];
    this.weaponKind = MAP_INFO[name].weapon;
    this.weapon = makeWeapon(this.weaponKind, this.map.weaponPos);
    this.scene.add(this.weapon.root);
    this.slingshot.autoMode = !!this.weaponDef.auto;

    this.enemyMgr = new EnemyManager(this.scene, this.map, ENEMIES[name]);
    this.projectiles = new ProjectileManager(this.scene, this.map);
    this.effects = new Effects(this.scene, this.camera, document.getElementById('labels'));
    this.cooldown = 0;

    // trajectory preview dots
    this.trajGroup = new THREE.Group();
    const dotGeo = new THREE.SphereGeometry(0.28, 6, 5);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.65, depthWrite: false });
    for (let i = 0; i < 36; i++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.visible = false;
      this.trajGroup.add(d);
    }
    this.scene.add(this.trajGroup);

    // pre-warm a few enemies so the menu cinematic isn't empty
    for (let i = 0; i < 8; i++) {
      this.enemyMgr.spawn();
      const e = this.enemyMgr.enemies[i];
      e.group.position.z *= Math.random() * 0.75 + 0.2;
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ state
  startPlay() {
    sfx.click();
    unlockAudio();
    this.state = 'transition';
    this.transT = 0;
    this.transFrom = this.camera.position.clone();
    this.transLook = this.map.menuOrbit.center.clone();
    this.ui.showHud();
  }

  toMenu() {
    sfx.click();
    this.state = 'menu';
    this.slingshot.enabled = false;
    this.slingshot.cancel();
    this.ui.showMenu();
  }

  // ------------------------------------------------------------------- aim
  // Target-point aiming: vertical pull picks a distance down the field,
  // horizontal pull picks the lateral offset; the launch is solved to land
  // exactly there.
  computeAim(pull) {
    const W = this.weaponDef;
    const max = this.slingshot.maxPull;
    const dyFrac = Math.min(1, Math.max(0, pull.dy) / max);
    const R = AIMING.rangeMin + Math.pow(dyFrac, AIMING.rangeCurve) * (AIMING.rangeMax - AIMING.rangeMin);
    const X = -(pull.dx / max) * AIMING.lateralMax; // pull left → aim right
    const muzzle = this.weapon.muzzleWorld(this.weapon.muzzleLocal);
    const target = _v1.set(X, this.map.groundHeight(X, -R, this.time) + 1.2, -R);
    const tx = target.x - muzzle.x, tz = target.z - muzzle.z;
    const D = Math.hypot(tx, tz);
    const yaw = Math.atan2(-tx, -tz);

    if (W.style === 'direct') {
      // aim straight at the target, nudged up to compensate gravity drop
      const t = D / W.speed;
      const aimY = target.y + 0.5 * W.gravity * t * t - muzzle.y;
      const dir = _v2.set(tx, aimY, tz).normalize().clone();
      return { yaw, pitch: Math.asin(dir.y), speed: W.speed, dir };
    }

    // arc: fixed elevation, solve launch speed so the shot lands at distance D.
    // Landing distance for speed v from height h: monotonic in v → bisect.
    const h = Math.max(0.1, muzzle.y - target.y);
    const cosP = Math.cos(W.pitch), sinP = Math.sin(W.pitch);
    const dist = (v) => {
      const vy = v * sinP;
      const t = (vy + Math.sqrt(vy * vy + 2 * W.gravity * h)) / W.gravity;
      return v * cosP * t;
    };
    let lo = 5, hi = W.maxSolveSpeed;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (dist(mid) < D) lo = mid; else hi = mid;
    }
    const speed = (lo + hi) / 2;
    const dir = _v2.set(tx / D * cosP, sinP, tz / D * cosP).clone();
    return { yaw, pitch: W.pitch, speed, dir };
  }

  updateTrajectoryPreview(aim, show) {
    const dots = this.trajGroup.children;
    if (!show) {
      for (const d of dots) d.visible = false;
      return;
    }
    const pos = _v2.copy(this.weapon.muzzleWorld(this.weapon.muzzleLocal));
    const vel = aim.dir.clone().multiplyScalar(aim.speed);
    const step = this.weaponDef.auto ? 0.05 : 0.09;
    let i = 0;
    for (let n = 0; n < 90 && i < dots.length; n++) {
      vel.y -= this.weaponDef.gravity * step;
      pos.addScaledVector(vel, step);
      if (n % 2 === 0) {
        dots[i].position.copy(pos);
        dots[i].scale.setScalar(1 + n * 0.14); // stay visible at distance
        dots[i].visible = true;
        i++;
      }
      if (pos.y < this.map.groundHeight(pos.x, pos.z, this.time)) break;
    }
    for (; i < dots.length; i++) dots[i].visible = false;
  }

  // ------------------------------------------------------------------ fire
  canAffordBet() {
    return this.balance >= this.ui.betAmount;
  }

  fireBallistic(pull) {
    if (this.state !== 'play' || this.cooldown > 0) return;
    if (!this.canAffordBet()) { this.ui.toast('Not enough balance for that bet'); return; }
    const aim = this.computeAim(pull);
    this.launch(aim);
    this.cooldown = this.weaponDef.cooldown;
  }

  fireAuto() {
    if (!this.canAffordBet()) { this.ui.toast('Not enough balance for that bet'); return; }
    const aim = this.computeAim(this.slingshot.pull);
    // slight spread per round
    aim.dir.applyAxisAngle(UP, (Math.random() - 0.5) * this.weaponDef.spread * 2);
    aim.dir.y += (Math.random() - 0.5) * this.weaponDef.spread;
    this.launch(aim);
  }

  launch(aim) {
    const muzzle = this.weapon.muzzleWorld(this.weapon.muzzleLocal);
    const vel = aim.dir.clone().multiplyScalar(aim.speed);
    this.projectiles.spawn(this.weaponDef.projectile, this.weaponDef, muzzle, vel);
    this.weapon.fire();
    this.effects.addShake(this.weaponDef.shakeOnFire);
    this.effects.vibrate(EFFECTS.vibrateFireMs);
    sfx.fire(this.weaponDef.projectile);
  }

  // --------------------------------------------------------------- betting
  resolveImpact(point, projectile, hitEnemies) {
    if (hitEnemies.length === 0) {
      // scenery hit
      if (this.map.isWater) {
        this.effects.splash(point);
        if (projectile.kind !== 'bullet') sfx.splash();
      } else {
        this.effects.dust(point);
        if (projectile.kind !== 'bullet') {
          this.effects.explosion(point, 0.15, projectile.kind);
          sfx.thud();
        }
      }
      return;
    }

    for (const enemy of hitEnemies) {
      if (!enemy.alive) continue;
      const bet = this.ui.betAmount;
      if (this.balance < bet) break; // out of funds mid-splash

      // ---- the bet: stake placed on hit, resolved instantly ----
      this.balance -= bet;
      const x = drawPayout(enemy.def.payouts);
      const win = Math.round(bet * x);
      this.balance += win;
      this.stats.bets++;
      this.stats.wagered += bet;
      this.stats.returned += win;
      if (win > 0) this.stats.wins++; else this.stats.losses++;
      this.persistBalance();
      this.ui.setBalance(this.balance);

      const epos = enemy.group.position.clone().setY(enemy.group.position.y + enemy.radius);
      const spectacle = Math.min(2, 0.25 + (x / 8) + (projectile.kind === 'boulder' ? 0.2 : projectile.kind === 'cannonball' ? 0.15 : 0));
      this.effects.explosion(epos, spectacle, projectile.kind);
      this.effects.shatter(enemy.group, point, 0.7 + spectacle * 0.5);
      this.enemyMgr.remove(enemy);
      sfx.explosion(spectacle);

      if (win > 0) {
        const big = x >= 10;
        this.effects.floatText(epos, `+${win.toLocaleString()}`, big ? 'label-jackpot' : 'label-win');
        this.ui.resultFlash(true);
        sfx.win(big);
        if (big) this.effects.vibrate(EFFECTS.vibrateBigWin);
      } else {
        this.effects.floatText(epos, `−${bet.toLocaleString()}`, 'label-lose');
        this.ui.resultFlash(false);
        sfx.lose();
      }
    }

    if (this.balance < BETTING.stakes[0]) {
      this.balance = BETTING.startBalance;
      this.persistBalance();
      this.ui.setBalance(this.balance);
      this.ui.toast('Balance refilled — on the house');
    }
  }

  persistBalance() {
    localStorage.setItem('siege.balance', String(this.balance));
  }

  // ------------------------------------------------------------------ loop
  tick() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.time += dt;
    const t = this.time;

    this.map.update(t, dt);
    this.enemyMgr.update(dt, t, t);
    this.weapon.update(dt);
    this.effects.update(dt, this.renderer);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.state === 'menu') {
      this.orbitAngle += dt * 0.14;
      const o = this.map.menuOrbit;
      this.camera.position.set(
        o.center.x + Math.cos(this.orbitAngle) * o.radius,
        o.height + Math.sin(this.orbitAngle * 0.6) * 4,
        o.center.z + Math.sin(this.orbitAngle) * o.radius
      );
      this.camera.lookAt(o.center);
    } else if (this.state === 'transition') {
      // wall-clock time (lightly capped) so slow frames can't stall the fly-in
      this.transT = Math.min(1, this.transT + Math.min(0.12, rawDt) / 1.1);
      const k = this.transT * this.transT * (3 - 2 * this.transT);
      this.camera.position.lerpVectors(this.transFrom, this.map.cameraPos, k);
      _v1.lerpVectors(this.transLook, this.map.lookTarget, k);
      this.camera.lookAt(_v1);
      if (this.transT >= 1) {
        this.state = 'play';
        this.slingshot.enabled = true;
      }
    } else {
      // play: aim, preview, auto-fire, projectiles
      const pulling = this.slingshot.active && this.slingshot.pull.frac > 0.02;
      let aim = null;
      if (pulling) {
        aim = this.computeAim(this.slingshot.pull);
        this.weapon.aim(aim.yaw, this.slingshot.pull.frac);
        if (this.weapon.setPitch) this.weapon.setPitch(aim.pitch);
      }
      this.updateTrajectoryPreview(aim, pulling);

      if (this.weaponDef.auto && this.slingshot.active && this.slingshot.armed) {
        this.mgAccum += dt;
        const period = 1 / this.weaponDef.fireRate;
        while (this.mgAccum >= period) {
          this.mgAccum -= period;
          this.fireAuto();
        }
      } else {
        this.mgAccum = 1 / (this.weaponDef.fireRate || 1); // first round fires instantly
      }

      // camera: base position + slight aim sway + shake
      const sway = pulling ? aim.yaw * 0.18 : 0;
      _v1.copy(this.map.cameraPos);
      const sh = this.effects.shake;
      if (sh > 0.001) {
        _v1.x += (Math.random() - 0.5) * sh * 0.9;
        _v1.y += (Math.random() - 0.5) * sh * 0.7;
        _v1.z += (Math.random() - 0.5) * sh * 0.5;
      }
      this.camera.position.copy(_v1);
      _v2.copy(this.map.lookTarget);
      _v2.x += Math.sin(sway) * 60;
      this.camera.lookAt(_v2);
      if (sh > 0.001) this.camera.rotation.z += (Math.random() - 0.5) * sh * 0.02;
    }

    this.projectiles.update(dt, t, this.enemyMgr, (pt, p, hits) => this.resolveImpact(pt, p, hits));
    this.slingshot.draw(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

window.SIEGE = new Game();
