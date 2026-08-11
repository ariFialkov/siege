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

// ---------------------------------------------------------------------------
// Money helpers — every amount in the game is carried to the cent, so prizes
// land on genuine values like $19.62 rather than tidy multiples of the stake.
// ---------------------------------------------------------------------------
export const cents = (v) => Math.round(v * 100) / 100;
export const money = (v) => cents(v).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// Draw a continuous payout multiplier from weighted bands.
// A band is picked by weight, then a value is sampled anywhere inside it:
//   value = lo + (hi - lo) * u^skew,  u ∈ [0,1)
// `skew` > 1 biases toward the low end of the band (fat-tail bands pay their
// headline figure rarely). Band mean is lo + (hi - lo) / (skew + 1), so the
// table's exact RTP is Σ w·mean / Σ w — see ROUND.targets.
export function drawBanded(bands) {
  let total = 0;
  for (const b of bands) total += b.w;
  let r = Math.random() * total;
  let band = bands[bands.length - 1];
  for (const b of bands) {
    r -= b.w;
    if (r <= 0) { band = b; break; }
  }
  const u = Math.pow(Math.random(), band.skew || 1);
  return band.lo + (band.hi - band.lo) * u;
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
  // Continuous payout bands (multiples of the bet) — a round's target is
  // sampled anywhere inside its band, so prizes are genuine amounts like
  // $19.62 rather than tidy multiples of the stake.
  // RTP = Σ w·mean / Σ w = 0.9600 (mean = lo + (hi−lo)/(skew+1)).
  // To retune: change bands/weights, then re-solve the first band's weight
  //   w0 = (S − rtp·W) / (rtp − mean0)
  // where S and W are the Σ w·mean and Σ w of every *other* band.
  targets: [
    { lo: 0,    hi: 0.06, w: 26.07, skew: 1 },   // the wall falls — pennies at best
    { lo: 0.06, hi: 0.32, w: 20,    skew: 1 },
    { lo: 0.32, hi: 0.72, w: 17,    skew: 1 },
    { lo: 0.72, hi: 1.35, w: 14,    skew: 1 },   // around break-even
    { lo: 1.35, hi: 2.4,  w: 9,     skew: 1.2 },
    { lo: 2.4,  hi: 4.6,  w: 5,     skew: 1.4 },
    { lo: 4.6,  hi: 10,   w: 2.2,   skew: 1.8 },
    { lo: 10,   hi: 38,   w: 0.8,   skew: 2.2 }, // the big one
  ],
  roleSplit: 0.6,           // fraction of enemies carrying cash (rest carry mult)
  // per-tier CAPS for displayed values (fractions of the round bet for cash,
  // absolute deltas for mult). Actual values are computed live by the
  // settlement controller; these keep them looking tier-plausible.
  values: {
    common:   { cashCap: 0.6,  multCap: 0.15 },
    uncommon: { cashCap: 1.1,  multCap: 0.28 },
    rare:     { cashCap: 2.0,  multCap: 0.5 },
    jackpot:  { cashCap: 4.5,  multCap: 1.1 },
  },
  // deterministic settlement: every hit/wall value is sized from the gap
  // between the live total and the target trajectory. The payout ALWAYS
  // settles to the drawn target — player skill changes the show, not the
  // result, so RTP is exactly the EV of `targets`.
  settle: {
    lookahead: 3,           // seconds ahead on the trajectory values aim for
    hitShare: [0.4, 0.75],  // fraction of the (positive) gap a hit closes
    wallShare: [0.5, 0.85], // fraction of the (negative) gap a breach closes
    token: 0.02,            // value floor (fraction of bet) when no gap to close
    multFloor: 0.15,        // mult never drops below this while target > 0
  },
  spawnScale: 0.55,         // spawn interval multiplier during a round (faster waves)
  control: {
    interval: 0.4,          // controller cadence (s)
    deadband: 0.08,         // no steering while |total − desired| < deadband × scale
    botAccuracyHigh: 0.96,
    botAccuracyLow: 0.0,    // "miss all their shots"
    botAccuracyNeutral: 0.55,
    botIntervalFast: 0.85,  // seconds between bot shots when boosting
    botIntervalSlow: 3.2,
    botIntervalNeutral: 1.8,
    inflowBoost: 0.32,      // spawn-interval scale when suppressing (lower = more)
    speedBoost: 1.8,        // enemy speed multiplier when suppressing
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
