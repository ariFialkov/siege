// SIEGE — main game orchestration.
import * as THREE from 'three';
import { BETTING, ENEMIES, WEAPONS, AIMING, EFFECTS, ROUND, MAP_INFO, drawPayout } from './config.js';
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
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Solve a launch from `muzzle` to land at `target` for the given weapon.
//  style 'direct': fixed speed, aim straight with gravity-drop compensation
//  style 'arc':    fixed elevation, bisect the speed that lands there
// ---------------------------------------------------------------------------
function solveLaunch(W, muzzle, target) {
  const tx = target.x - muzzle.x, tz = target.z - muzzle.z;
  const D = Math.max(0.1, Math.hypot(tx, tz));
  const yaw = Math.atan2(-tx, -tz);
  if (W.style === 'direct') {
    const t = D / W.speed;
    const aimY = target.y + 0.5 * W.gravity * t * t - muzzle.y;
    const dir = new THREE.Vector3(tx, aimY, tz).normalize();
    return { yaw, pitch: Math.asin(dir.y), speed: W.speed, dir };
  }
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
  const dir = new THREE.Vector3(tx / D * cosP, sinP, tz / D * cosP);
  return { yaw, pitch: W.pitch, speed, dir };
}

// ---------------------------------------------------------------------------
// Bot comrade: a flanking launcher that engages enemies on its own. Its
// accuracy and fire rate are the round controller's steering handles.
// ---------------------------------------------------------------------------
class Bot {
  constructor(game, mount) {
    this.game = game;
    this.weapon = makeWeapon(game.weaponKind, mount);
    game.scene.add(this.weapon.root);
    this.cd = rand(1.5, 3.5);
    this.burst = 0;
    this.burstTarget = null;
  }

  interval() {
    const g = this.game;
    return (g.round ? g.botInterval : 4.5) * rand(0.8, 1.3);
  }

  update(dt) {
    this.weapon.update(dt);
    const g = this.game;
    if (g.state !== 'play') return;
    this.cd -= dt;
    if (this.cd > 0) return;

    if (this.burst > 0) {
      this.burst--;
      this.fireAt(this.burstTarget, this.burstAcc);
      this.cd = this.burst > 0 ? 0.13 : this.interval();
      return;
    }

    const acc = g.round ? g.botAccuracy : 0.55;
    const target = this.pickTarget(acc);
    if (!target) { this.cd = 0.8; return; }
    if (g.weaponDef.auto) {
      this.burst = 5;
      this.burstTarget = target;
      this.burstAcc = acc;
      this.cd = 0;
    } else {
      this.fireAt(target, acc);
      this.cd = this.interval();
    }
  }

  pickTarget(acc) {
    const g = this.game;
    const es = g.enemyMgr.enemies.filter((e) => {
      const z = e.group.position.z;
      return e.alive && z < -45 && z > -360;
    });
    if (!es.length) return null;
    if (acc > 0.8 && g.round) {
      // hunting mode: prefer the biggest (rarest) targets on the field
      es.sort((a, b) => b.radius - a.radius);
      return es[Math.floor(Math.random() * Math.min(3, es.length))];
    }
    return es[Math.floor(Math.random() * es.length)];
  }

  fireAt(e, acc) {
    const g = this.game;
    const W = g.weaponDef;
    const muzzle = this.weapon.muzzleWorld(this.weapon.muzzleLocal).clone();
    const aimPoint = e.group.position.clone();
    aimPoint.y += e.radius * 0.5;
    // lead the target
    let ft = W.style === 'direct' ? muzzle.distanceTo(aimPoint) / W.speed : 2.1;
    aimPoint.z += e.speed * g.enemyMgr.speedScale * ft;
    // deliberate error — how the controller makes comrades "miss more";
    // at zero accuracy shots land well wide of anything
    const err = (1 - acc) * 42;
    aimPoint.x += (Math.random() - 0.5) * err;
    aimPoint.z += (Math.random() - 0.5) * err;
    const sol = solveLaunch(W, muzzle, aimPoint);
    this.weapon.aim(sol.yaw, 0.6);
    if (this.weapon.setPitch) this.weapon.setPitch(sol.pitch);
    this.weapon.fire();
    g.projectiles.spawn(W.projectile, W, muzzle, sol.dir.multiplyScalar(sol.speed));
  }

  dispose() {
    this.game.scene.remove(this.weapon.root);
  }
}

// ---------------------------------------------------------------------------
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
    this.state = 'menu';           // 'menu' | 'transition' | 'play'
    this.round = null;             // active invasion round, or null (idle)
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
      onStartRound: () => this.startRound(),
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
    this.stats = { rounds: 0, wagered: 0, returned: 0 };
    this.botAccuracy = ROUND.control.botAccuracyNeutral;
    this.botInterval = ROUND.control.botIntervalNeutral;
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
    if (this.round) this.abortRound();
    if (this.map) {
      this.effects.clearTransient();
      this.enemyMgr.clear();
      this.projectiles.clear();
      for (const b of this.bots) b.dispose();
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
    const fill = new THREE.DirectionalLight(0xbcd4e8, 0.35);
    fill.position.set(-spos[0], spos[1] * 0.6, -spos[2]);
    this.scene.add(fill);

    this.weaponDef = WEAPONS[MAP_INFO[name].weapon];
    this.weaponKind = MAP_INFO[name].weapon;
    this.weapon = makeWeapon(this.weaponKind, this.map.weaponPos);
    this.scene.add(this.weapon.root);
    this.slingshot.autoMode = !!this.weaponDef.auto;

    this.enemyMgr = new EnemyManager(this.scene, this.map, ENEMIES[name]);
    this.enemyMgr.decorate = (e) => this.decorateEnemy(e);
    this.enemyMgr.onWall = (e) => this.handleWall(e);
    this.projectiles = new ProjectileManager(this.scene, this.map);
    this.effects = new Effects(this.scene, this.camera, document.getElementById('labels'));
    this.bots = this.map.botMounts.map((m) => new Bot(this, m));
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
  startPlay(withRound = true) {
    sfx.click();
    unlockAudio();
    this.state = 'transition';
    this.transT = 0;
    this.transFrom = this.camera.position.clone();
    this.transLook = this.map.menuOrbit.center.clone();
    this.pendingRound = withRound; // fly in, then the round starts itself
    this.ui.showHud();
  }

  toMenu() {
    // No leaving mid-round: the live display correlates with the drawn
    // target, so a refundable abort would let players dodge bad draws.
    if (this.round) {
      this.ui.toast('Hold the wall — the round has to finish');
      return;
    }
    sfx.click();
    this.state = 'menu';
    this.slingshot.enabled = false;
    this.slingshot.cancel();
    this.ui.showMenu();
  }

  // ----------------------------------------------------------------- rounds
  startRound() {
    if (this.state !== 'play' || this.round) return;
    const bet = this.ui.betAmount;
    if (this.balance < bet) { this.ui.toast('Not enough balance for that bet'); return; }
    unlockAudio();
    this.balance -= bet;
    this.persistBalance();
    this.ui.setBalance(this.balance);
    this.stats.rounds++;
    this.stats.wagered += bet;

    this.round = {
      bet,
      target: bet * drawPayout(ROUND.targets), // steered outcome for this round
      cash: bet,
      mult: 1.0,
      tLeft: ROUND.duration,
      ctrlT: 0,
    };
    this.enemyMgr.paceScale = ROUND.spawnScale;
    this.enemyMgr.speedScale = 1;
    // arm the whole field: every enemy already marching gets a value
    for (const e of this.enemyMgr.enemies) this.decorateEnemy(e);
    this.ui.roundStart(this.round);
    sfx.roundStart();
  }

  // The settlement guarantee: the payout is the drawn target, to the dollar.
  // The 30 seconds of play are choreography that converges the display onto
  // it — skill changes the show, never the result.
  endRound() {
    const r = this.round;
    const payout = Math.max(0, Math.round(r.target));
    this.balance += payout;
    this.stats.returned += payout;
    this.persistBalance();
    this.ui.setBalance(this.balance);
    this.ui.roundEnd(payout, r.bet);
    if (payout >= r.bet) sfx.win(payout >= r.bet * 3); else sfx.lose();
    this.finishRoundCommon();
    if (this.balance < BETTING.stakes[0]) {
      this.balance = BETTING.startBalance;
      this.persistBalance();
      this.ui.setBalance(this.balance);
      this.ui.toast('Balance refilled — on the house');
    }
  }

  abortRound() {
    // leaving mid-round (menu/map switch) refunds the stake
    this.balance += this.round.bet;
    this.stats.wagered -= this.round.bet;
    this.stats.rounds--;
    this.persistBalance();
    this.ui.setBalance(this.balance);
    this.ui.roundAbort();
    this.finishRoundCommon();
  }

  finishRoundCommon() {
    this.round = null;
    this.enemyMgr.paceScale = 1;
    this.enemyMgr.speedScale = 1;
    this.botAccuracy = ROUND.control.botAccuracyNeutral;
    this.botInterval = ROUND.control.botIntervalNeutral;
    for (const e of this.enemyMgr.enemies) this.clearRole(e);
  }

  // steering: nudge the live total toward this round's drawn target
  steer() {
    const C = ROUND.control, r = this.round;
    const p = 1 - r.tLeft / ROUND.duration;
    const desired = r.bet + (r.target - r.bet) * p;
    const total = r.cash * r.mult;
    const scale = Math.max(r.bet, r.target, 1);
    const norm = (total - desired) / scale;
    if (norm < -C.deadband) {
      // behind target → comrades rain hell
      this.botAccuracy = C.botAccuracyHigh;
      this.botInterval = C.botIntervalFast;
      this.enemyMgr.paceScale = ROUND.spawnScale;
      this.enemyMgr.speedScale = 1;
    } else if (norm > C.deadband) {
      // ahead of target → comrades go cold, invasion floods the wall
      this.botAccuracy = C.botAccuracyLow;
      this.botInterval = C.botIntervalSlow;
      this.enemyMgr.paceScale = ROUND.spawnScale * C.inflowBoost;
      this.enemyMgr.speedScale = C.speedBoost;
    } else {
      this.botAccuracy = C.botAccuracyNeutral;
      this.botInterval = C.botIntervalNeutral;
      this.enemyMgr.paceScale = ROUND.spawnScale;
      this.enemyMgr.speedScale = 1;
    }

    // endgame reckoning: force decisive events so the display converges on
    // the target before the horn. Lifts start early — arc shots need flight
    // time to land; breach sprints are fast so they start later.
    if (norm < -0.04 && r.tLeft < 9) {
      // need a lift: comrades snap off immediate, dead-accurate volleys
      this.botAccuracy = 1;
      this.botInterval = 0.6;
      for (const b of this.bots) b.cd = Math.min(b.cd, 0.1);
    } else if (norm > 0.04 && r.tLeft < 3.5) {
      // need a drop: the flagged enemy nearest the wall breaks into a sprint
      let runner = null;
      for (const e of this.enemyMgr.enemies) {
        if (!e.role || e.sprinting) continue;
        if (!runner || e.group.position.z > runner.group.position.z) runner = e;
      }
      if (runner) {
        runner.sprinting = true;
        runner.speed = Math.max(runner.speed * 3, 30);
      }
    }
  }

  // ---------------------------------------------------- settlement values
  // desired position of the total along the bet→target trajectory
  desiredTotal(secondsAhead = 0) {
    const r = this.round;
    const p = Math.min(1, (ROUND.duration - r.tLeft + secondsAhead) / ROUND.duration);
    return r.bet + (r.target - r.bet) * p;
  }

  // 0 → 1 as the horn approaches: events close more of the gap, value caps
  // relax, and the endgame mechanics kick in so the display lands on target
  get urgency() {
    return Math.min(1, Math.max(0, (5 - this.round.tLeft) / 5));
  }

  // size a hit's reward from the gap that still needs closing
  hitValue(e) {
    const r = this.round, S = ROUND.settle, u = this.urgency;
    const caps = ROUND.values[e.def.tier];
    const gap = this.desiredTotal(S.lookahead * (1 - u)) - r.cash * r.mult;
    const token = Math.max(1, r.bet * S.token);
    const share = rand(S.hitShare[0], S.hitShare[1]) * (1 - u) + u; // → 1 at the horn
    let dollars = gap > 0 ? gap * share : token;
    if (e.role === 'cash') {
      return Math.max(1, Math.round(Math.min(dollars, caps.cashCap * r.bet * (1 + u * 2))));
    }
    const dm = dollars / Math.max(r.cash, 1);
    return +Math.min(Math.max(0.02, dm), caps.multCap * (1 + u)).toFixed(2);
  }

  // size a wall breach's penalty the same way, in the other direction
  wallValue(e) {
    const r = this.round, S = ROUND.settle, u = this.urgency;
    const caps = ROUND.values[e.def.tier];
    const gap = this.desiredTotal(S.lookahead * (1 - u)) - r.cash * r.mult;
    const token = Math.max(1, r.bet * S.token);
    const share = rand(S.wallShare[0], S.wallShare[1]) * (1 - u) + u;
    let dollars = gap < 0 ? -gap * share : token;
    if (e.role === 'cash') {
      return Math.max(1, Math.round(Math.min(dollars, caps.cashCap * r.bet * (1 + u * 2))));
    }
    const dm = dollars / Math.max(r.cash, 1);
    return +Math.min(Math.max(0.02, dm), caps.multCap * (1 + u)).toFixed(2);
  }

  // ------------------------------------------------------- enemy round roles
  decorateEnemy(e) {
    if (!this.round || e.role) return;
    e.role = Math.random() < ROUND.roleSplit ? 'cash' : 'mult';
    // colour coding: glowing base ring + a pennant flag
    const mat = roleMats[e.role];
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(e.radius * 1.2);
    ring.position.y = e.made.ship ? 0.5 : 0.15;
    e.group.add(ring);
    const banner = new THREE.Group();
    const poleH = e.made.ship ? e.radius * 2.6 + 3 : e.radius * 1.6 + 3;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.scale.y = poleH;
    pole.position.y = poleH / 2;
    banner.add(pole);
    const flag = new THREE.Mesh(flagGeo, mat);
    flag.position.set(0.62, poleH - 0.4, 0);
    banner.add(flag);
    banner.position.set(e.radius * 0.35, 0, 0);
    e.group.add(banner);
    e.roleMeshes = [ring, banner];
  }

  clearRole(e) {
    if (e.roleMeshes) for (const m of e.roleMeshes) e.group.remove(m);
    e.roleMeshes = null;
    e.role = null;
  }

  // ------------------------------------------------------------------- aim
  computeAim(pull) {
    const max = this.slingshot.maxPull;
    const dyFrac = Math.min(1, Math.max(0, pull.dy) / max);
    const R = AIMING.rangeMin + Math.pow(dyFrac, AIMING.rangeCurve) * (AIMING.rangeMax - AIMING.rangeMin);
    const X = -(pull.dx / max) * AIMING.lateralMax; // pull left → aim right
    const muzzle = this.weapon.muzzleWorld(this.weapon.muzzleLocal);
    const target = _v1.set(X, this.map.groundHeight(X, -R, this.time) + 1.2, -R);
    return solveLaunch(this.weaponDef, muzzle, target);
  }

  updateTrajectoryPreview(aim, show) {
    const dots = this.trajGroup.children;
    if (!show) {
      for (const d of dots) d.visible = false;
      return;
    }
    const pos = _v2.copy(this.weapon.muzzleWorld(this.weapon.muzzleLocal));
    const vel = aim.dir.clone().multiplyScalar(aim.speed);
    const step = this.weaponDef.style === 'direct' ? 0.05 : 0.09;
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
  fireBallistic(pull) {
    if (this.state !== 'play' || this.cooldown > 0) return;
    const aim = this.computeAim(pull);
    this.launch(aim);
    this.cooldown = this.weaponDef.cooldown;
  }

  fireAuto() {
    const aim = this.computeAim(this.slingshot.pull);
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

  // --------------------------------------------------------------- scoring
  resolveImpact(point, projectile, hitEnemies) {
    if (hitEnemies.length === 0) {
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
      const epos = enemy.group.position.clone().setY(enemy.group.position.y + enemy.radius);
      let spectacle = 0.35;

      if (this.round && enemy.role) {
        const r = this.round;
        const v = this.hitValue(enemy);
        if (enemy.role === 'cash') {
          r.cash += v;
          spectacle = 0.35 + Math.min(1.6, v / Math.max(1, r.bet));
          this.effects.floatText(epos, `+$${v.toLocaleString()}`, v >= r.bet * 1.5 ? 'label-jackpot' : 'label-win');
          sfx.coin();
        } else {
          r.mult = +(r.mult + v).toFixed(2);
          spectacle = 0.35 + Math.min(1.6, v * 2);
          this.effects.floatText(epos, `+${v.toFixed(2)}×`, 'label-mult');
          sfx.chime();
        }
        this.ui.roundTick(r);
        if (spectacle > 1.2) this.effects.vibrate(EFFECTS.vibrateBigWin);
      }

      this.effects.explosion(epos, spectacle, projectile.kind);
      this.effects.shatter(enemy.group, point, 0.7 + spectacle * 0.5);
      this.enemyMgr.remove(enemy);
      sfx.explosion(spectacle);
    }
  }

  handleWall(e) {
    const pos = e.group.position.clone();
    pos.y += e.radius * 1.2;
    if (this.round && e.role) {
      const r = this.round;
      const v = this.wallValue(e);
      if (e.role === 'cash') {
        r.cash = Math.max(0, Math.round(r.cash - v));
        this.effects.floatText(pos, `−$${v.toLocaleString()}`, 'label-lose');
      } else {
        // never zero the multiplier unless the round is heading for a bust
        const floor = r.target > 0 ? ROUND.settle.multFloor : 0;
        r.mult = Math.max(floor, +(r.mult - v).toFixed(2));
        this.effects.floatText(pos, `−${v.toFixed(2)}×`, 'label-lose');
      }
      this.ui.roundTick(r);
      // the wall takes the blow — rumble
      this.effects.addShake(1.5);
      this.effects.vibrate(EFFECTS.vibrateBigWin);
      this.ui.resultFlash(false);
      sfx.rumble();
    } else if (this.state === 'play') {
      this.effects.addShake(0.3);
      sfx.thud();
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
    for (const b of this.bots) b.update(dt);
    this.effects.update(dt, this.renderer);
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.round && this.state === 'play') {
      const r = this.round;
      r.tLeft -= dt;
      r.ctrlT -= dt;
      if (r.ctrlT <= 0) {
        r.ctrlT = ROUND.control.interval;
        this.steer();
      }
      // final tally: in the last moment the counter slides onto the exact
      // result, so the display always agrees with the banner
      if (r.tLeft < 1.2) {
        const wanted = Math.max(0, r.target) / Math.max(r.mult, 0.01);
        r.cash += (wanted - r.cash) * Math.min(1, 6 * dt);
        if (r.tLeft < 0.15) r.cash = wanted;
      }
      this.ui.roundTick(r);
      if (r.tLeft <= 0) this.endRound();
    }

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
        if (this.pendingRound) {
          this.pendingRound = false;
          this.startRound();
        }
      }
    } else {
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

// shared role-marker resources
const ringGeo = new THREE.RingGeometry(0.85, 1.08, 24);
const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 1, 6);
const poleMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3e });
const flagGeo = new THREE.BoxGeometry(1.15, 0.65, 0.08);
const roleMats = {
  cash: new THREE.MeshBasicMaterial({ color: ROUND.colors.cash, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  mult: new THREE.MeshBasicMaterial({ color: ROUND.colors.mult, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
};

window.SIEGE = new Game();
