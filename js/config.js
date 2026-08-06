// ============================================================================
// SIEGE — central tuning file.
// Everything gameplay-related that you might want to tweak lives here:
// betting odds, payout tables, spawn rates, physics, weapon feel.
// ============================================================================

export const BETTING = {
  startBalance: 1000,

  // Selectable base stakes ("ammo value") and multiplier chips.
  stakes: [1, 5, 10, 25, 50, 100],
  defaultStakeIndex: 2,
  multipliers: [1, 2, 5, 10],
};

// Payout tables: when an enemy is hit, one outcome is drawn from its table,
// weighted by `w`. The bet returns stake * multiplier * `x`.
// `x: 0` is a loss. Tweak weights/multipliers freely — they are pure data.
// (EV of each table is roughly 0.90–0.96 by default.)
const PAYOUTS = {
  common: [
    { x: 0, w: 52 },
    { x: 0.5, w: 14 },
    { x: 1, w: 12 },
    { x: 2, w: 14 },
    { x: 5, w: 7 },
    { x: 10, w: 1 },
  ],
  uncommon: [
    { x: 0, w: 50 },
    { x: 1, w: 16 },
    { x: 2, w: 16 },
    { x: 4, w: 12 },
    { x: 8, w: 5 },
    { x: 20, w: 1 },
  ],
  rare: [
    { x: 0, w: 48 },
    { x: 1, w: 14 },
    { x: 3, w: 20 },
    { x: 6, w: 12 },
    { x: 15, w: 5 },
    { x: 50, w: 1 },
  ],
  jackpot: [
    { x: 0, w: 46 },
    { x: 2, w: 22 },
    { x: 5, w: 18 },
    { x: 10, w: 9 },
    { x: 25, w: 4 },
    { x: 100, w: 1 },
  ],
};

// Draw an outcome multiplier from a payout table.
export function drawPayout(table) {
  let total = 0;
  for (const o of table) total += o.w;
  let r = Math.random() * total;
  for (const o of table) {
    r -= o.w;
    if (r <= 0) return o.x;
  }
  return table[table.length - 1].x;
}

// ============================================================================
// Enemy rosters per map.
//  weight  — relative spawn chance
//  speed   — units/sec range [min, max]
//  radius  — hit radius
//  payouts — payout table used when this enemy is hit
// ============================================================================
export const ENEMIES = {
  fortress: [
    { id: 'knight',   label: 'Knight',    weight: 46, speed: [5, 8],   radius: 1.6, payouts: PAYOUTS.common },
    { id: 'horseman', label: 'Horseman',  weight: 34, speed: [14, 20], radius: 2.0, payouts: PAYOUTS.uncommon },
    { id: 'chariot',  label: 'Chariot',   weight: 16, speed: [10, 14], radius: 2.6, payouts: PAYOUTS.rare },
    { id: 'warlord',  label: 'Warlord',   weight: 4,  speed: [7, 9],   radius: 2.4, payouts: PAYOUTS.jackpot },
  ],
  galleon: [
    { id: 'sloop',    label: 'Sloop',     weight: 46, speed: [8, 12],  radius: 3.4, payouts: PAYOUTS.common },
    { id: 'brig',     label: 'Brigantine',weight: 34, speed: [6, 9],   radius: 4.6, payouts: PAYOUTS.uncommon },
    { id: 'galleon',  label: 'Galleon',   weight: 16, speed: [4, 6],   radius: 6.0, payouts: PAYOUTS.rare },
    { id: 'ghostship',label: 'Ghost Ship',weight: 4,  speed: [10, 13], radius: 5.0, payouts: PAYOUTS.jackpot },
  ],
  burm: [
    { id: 'infantry', label: 'Infantry',  weight: 46, speed: [5, 8],   radius: 1.5, payouts: PAYOUTS.common },
    { id: 'jeep',     label: 'Jeep',      weight: 30, speed: [16, 24], radius: 2.4, payouts: PAYOUTS.uncommon },
    { id: 'tank',     label: 'Tank',      weight: 18, speed: [7, 10],  radius: 3.2, payouts: PAYOUTS.rare },
    { id: 'artillery',label: 'Artillery', weight: 6,  speed: [5, 7],   radius: 3.0, payouts: PAYOUTS.jackpot },
  ],
};

export const SPAWNING = {
  interval: [0.9, 2.1],   // seconds between spawns [min, max]
  maxEnemies: 26,
  spawnZ: -420,           // enemies appear here (horizon)
  despawnZ: -34,          // ...and leave the player's elevated view here
  xRange: [-75, 75],      // lateral spawn band
  laneDriftAmp: [2, 9],   // sinusoidal lateral weave amplitude
  laneDriftFreq: [0.1, 0.35],
};

// ============================================================================
// Weapons — one per map.
// ============================================================================
export const WEAPONS = {
  catapult: {
    projectile: 'boulder',
    minSpeed: 36, maxSpeed: 95,   // full pull reaches the spawn horizon (~z -400)
    pitch: 0.78,            // launch elevation (rad)
    gravity: 22,
    projectileRadius: 1.1,
    splash: 11,             // area damage radius on impact
    auto: false,
    shakeOnFire: 0.5,
    cooldown: 0.55,
  },
  cannon: {
    projectile: 'cannonball',
    minSpeed: 45, maxSpeed: 108,
    pitch: 0.5,
    gravity: 24,
    projectileRadius: 0.7,
    splash: 9,
    auto: false,
    shakeOnFire: 0.65,
    cooldown: 0.5,
  },
  machinegun: {
    projectile: 'bullet',
    speed: 300,
    pitchMin: -0.24,        // aim range mapped from pull direction (diagonal = close)
    pitchMax: -0.01,        // straight-down pull ≈ the far edge of the field;
                            // the turret sits high, so depression angles are
                            // what actually hit targets
    gravity: 14,
    projectileRadius: 1.0,  // generous — direct-fire weapon
    splash: 0,
    auto: true,             // fires while pull is held at max
    fireRate: 8,            // rounds per second
    spread: 0.012,
    shakeOnFire: 0.12,
    cooldown: 0,
  },
};

export const AIMING = {
  maxPullPx: 190,         // max slingshot pull distance (CSS px, scaled on small screens)
  maxYaw: 0.6,            // rad, at full lateral pull
  fireThreshold: 0.08,    // minimum pull fraction that counts as a shot
  autoFireThreshold: 0.96,// MG fires while pull ≥ this fraction of max
};

export const EFFECTS = {
  shakeDecay: 4.5,
  maxShake: 1.6,
  vibrateMaxPullMs: 35,
  vibrateFireMs: 12,
  vibrateBigWin: [40, 60, 90],
};

export const MAPS = ['fortress', 'galleon', 'burm'];

export const MAP_INFO = {
  fortress: { label: 'Fortress', blurb: 'Medieval castle · Catapult', weapon: 'catapult' },
  galleon:  { label: 'Galleon',  blurb: 'Pirate ship · Cannon',       weapon: 'cannon' },
  burm:     { label: 'Burm',     blurb: 'Hillside bunker · MG turret', weapon: 'machinegun' },
};
