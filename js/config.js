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

// Draw an outcome multiplier from a weighted table [{x, w}, ...].
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
//  weight — relative spawn chance
//  speed  — units/sec range [min, max]
//  radius — hit radius
//  tier   — value tier during invasion rounds (see ROUND.values)
// ============================================================================
export const ENEMIES = {
  fortress: [
    { id: 'knight',   label: 'Knight',    weight: 46, speed: [5, 8],   radius: 1.6, tier: 'common' },
    { id: 'horseman', label: 'Horseman',  weight: 34, speed: [14, 20], radius: 2.0, tier: 'uncommon' },
    { id: 'chariot',  label: 'Chariot',   weight: 16, speed: [10, 14], radius: 2.6, tier: 'rare' },
    { id: 'warlord',  label: 'Warlord',   weight: 4,  speed: [7, 9],   radius: 2.4, tier: 'jackpot' },
  ],
  galleon: [
    { id: 'sloop',    label: 'Sloop',     weight: 46, speed: [8, 12],  radius: 3.4, tier: 'common' },
    { id: 'brig',     label: 'Brigantine',weight: 34, speed: [6, 9],   radius: 4.6, tier: 'uncommon' },
    { id: 'galleon',  label: 'Galleon',   weight: 16, speed: [4, 6],   radius: 6.0, tier: 'rare' },
    { id: 'ghostship',label: 'Ghost Ship',weight: 4,  speed: [10, 13], radius: 5.0, tier: 'jackpot' },
  ],
  burm: [
    { id: 'infantry', label: 'Infantry',  weight: 46, speed: [5, 8],   radius: 1.5, tier: 'common' },
    { id: 'jeep',     label: 'Jeep',      weight: 30, speed: [16, 24], radius: 2.4, tier: 'uncommon' },
    { id: 'tank',     label: 'Tank',      weight: 18, speed: [7, 10],  radius: 3.2, tier: 'rare' },
    { id: 'artillery',label: 'Artillery', weight: 6,  speed: [5, 7],   radius: 3.0, tier: 'jackpot' },
  ],
  temple: [
    { id: 'legion',      label: 'Legion',       weight: 38, speed: [5, 7],   radius: 2.6, tier: 'common' },
    { id: 'romanchariot',label: 'Chariot',      weight: 22, speed: [13, 18], radius: 2.6, tier: 'uncommon' },
    { id: 'batteringram',label: 'Battering Ram',weight: 18, speed: [5, 7],   radius: 2.9, tier: 'uncommon' },
    { id: 'elephant',    label: 'War Elephant', weight: 15, speed: [4, 6],   radius: 3.6, tier: 'rare' },
    { id: 'siegetower',  label: 'Siege Tower',  weight: 7,  speed: [3, 4.5], radius: 3.4, tier: 'jackpot' },
  ],
};

// ============================================================================
// Invasion rounds — the betting structure.
// A round stakes the bet, runs a 30s invasion, and pays out cash × mult at
// the end. Enemies carry either a cash sum or a multiplier bump (colour +
// flag coded); hits add value, wall breaches subtract it.
// The round's OUTCOME is steered toward a target drawn from `targets`
// (EV ≈ 0.92): the two flanking bot comrades shoot better/faster when the
// total is behind target, and enemy inflow rises (plus bots go cold) when
// it's ahead — values themselves never change mid-round.
// ============================================================================
export const ROUND = {
  duration: 30,
  targets: [
    { x: 0, w: 28 },
    { x: 0.2, w: 20 },
    { x: 0.5, w: 16 },
    { x: 1, w: 14 },
    { x: 1.5, w: 9 },
    { x: 2.5, w: 7 },
    { x: 4, w: 4 },
    { x: 8, w: 1.6 },
    { x: 15, w: 0.4 },
  ],
  roleSplit: 0.6,           // fraction of enemies carrying cash (rest carry mult)
  // per-tier values: cash/wallCash are fractions of the round bet;
  // mult/wallMult are absolute multiplier deltas
  values: {
    common:   { cash: [0.15, 0.35], mult: [0.05, 0.12], wallCash: [0.2, 0.45],  wallMult: [0.08, 0.15] },
    uncommon: { cash: [0.4, 0.8],   mult: [0.12, 0.22], wallCash: [0.45, 0.9],  wallMult: [0.12, 0.22] },
    rare:     { cash: [0.8, 1.6],   mult: [0.22, 0.4],  wallCash: [0.9, 1.6],   wallMult: [0.2, 0.35] },
    jackpot:  { cash: [2, 4],       mult: [0.5, 1.0],   wallCash: [1.6, 2.8],   wallMult: [0.35, 0.6] },
  },
  spawnScale: 0.55,         // spawn interval multiplier during a round (faster waves)
  control: {
    interval: 0.5,          // controller cadence (s)
    deadband: 0.15,         // no steering while |total − desired| < deadband × scale
    botAccuracyHigh: 0.94,
    botAccuracyLow: 0.12,
    botAccuracyNeutral: 0.6,
    botIntervalFast: 1.0,   // seconds between bot shots when boosting
    botIntervalSlow: 2.8,
    botIntervalNeutral: 1.8,
    inflowBoost: 0.5,       // extra spawn-interval scale when suppressing (lower = more)
    speedBoost: 1.55,       // enemy speed multiplier when suppressing
  },
  colors: { cash: 0xffc23d, mult: 0xb45cff },
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
// All weapons use target-point aiming: vertical pull picks a distance on the
// field, horizontal pull picks the lateral position, and the launch solution
// is solved to land there.
//  style 'arc'    — fixed launch elevation, speed solved per shot (catapult)
//  style 'direct' — fixed high speed, aimed straight at the target with a
//                   small gravity-drop compensation (cannon, machine gun)
// ============================================================================
export const WEAPONS = {
  catapult: {
    style: 'arc',
    projectile: 'boulder',
    pitch: 0.78,            // launch elevation (rad)
    gravity: 22,
    maxSolveSpeed: 115,     // clamp for the per-shot speed solution
    projectileRadius: 1.1,
    splash: 11,             // area damage radius on impact
    auto: false,
    shakeOnFire: 0.5,
    cooldown: 0.55,
  },
  cannon: {
    style: 'direct',
    projectile: 'cannonball',
    speed: 190,             // near-flat, line-of-sight shot
    gravity: 10,
    projectileRadius: 0.8,
    splash: 9,
    auto: false,
    shakeOnFire: 0.65,
    cooldown: 0.5,
  },
  ballista: {
    style: 'direct',
    projectile: 'bolt',
    speed: 150,             // heavy dart — flat but visibly slower than a cannonball
    gravity: 16,
    projectileRadius: 1.0,
    splash: 5,
    auto: false,
    shakeOnFire: 0.55,
    cooldown: 0.7,
  },
  machinegun: {
    style: 'direct',
    projectile: 'bullet',
    speed: 300,
    gravity: 12,
    projectileRadius: 1.0,  // generous — direct-fire weapon
    splash: 0,
    auto: true,             // pull to max ARMS it; fires while held after that
    fireRate: 9,            // rounds per second
    spread: 0.012,
    shakeOnFire: 0.12,
    cooldown: 0,
  },
};

export const AIMING = {
  maxPullPx: 190,         // max slingshot pull distance (CSS px, scaled on small screens)
  rangeMin: 40,           // shortest aimable distance (small pull)
  rangeMax: 430,          // full-pull distance (~the spawn horizon)
  rangeCurve: 1.5,        // >1 gives finer control at close range
  lateralMax: 92,         // full sideways pull aims this far off-center
  fireThreshold: 0.08,    // minimum pull fraction that counts as a shot
  armThreshold: 0.96,     // MG arms when pull first reaches this fraction
};

export const EFFECTS = {
  shakeDecay: 4.5,
  maxShake: 1.6,
  vibrateMaxPullMs: 35,
  vibrateFireMs: 12,
  vibrateBigWin: [40, 60, 90],
};

export const MAPS = ['fortress', 'galleon', 'burm', 'temple'];

export const MAP_INFO = {
  fortress: { label: 'Fortress', blurb: 'Medieval castle · Catapult', weapon: 'catapult' },
  galleon:  { label: 'Galleon',  blurb: 'Pirate ship · Cannon',       weapon: 'cannon' },
  burm:     { label: 'Burm',     blurb: 'Hillside bunker · MG turret', weapon: 'machinegun' },
  temple:   { label: 'Temple',   blurb: 'Roman pantheon · Ballista',  weapon: 'ballista' },
};
