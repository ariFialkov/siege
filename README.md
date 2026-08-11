# Siege

A low-poly 3D siege defense **betting** game that runs as a PWA on both mobile
and desktop. Defend your post, fire at incoming enemies, and every hit places a
bet that resolves instantly — the scene never stops.

## Maps · Enemies · Weapons

| Map | Setting | Enemies | Weapon |
|---|---|---|---|
| **Fortress** | Medieval castle | Knights, horsemen, chariots, warlords | Catapult |
| **Galleon** | Pirate ship at sea | Sloops, brigantines, galleons, ghost ships | Cannon |
| **Burm** | Modern hillside bunker | Infantry, jeeps, tanks, mobile artillery | Machine-gun turret |

## How it plays

- The menu shows a rotating cinematic of the selected map; toggle maps with the arrows.
- **Invasion rounds**: press *Defend* to stake your bet on a 30-second
  invasion. Your pot starts at the bet (cash) with a 1.00× multiplier.
- Enemies carry either **cash** (gold flag & ring) or a **multiplier bump**
  (violet flag & ring). Destroy them to collect; every enemy that reaches
  your wall subtracts its penalty — with a screen-shaking rumble.
- Two **bot comrades** man flanking launchers and fight alongside you.
- At the horn, the round pays out `cash × multiplier`. Rarer enemies carry
  bigger values; explosion size scales with the value collected.
- Between rounds the invasion keeps streaming — free target practice.

### Controls

- **Mobile** — touch anywhere, pull back to aim (slingshot style), release to fire.
- **Desktop** — click and pull back with the mouse/trackpad, release to fire.
- **Machine-gun turret** (Burm) — pull back to aim; hold at **max pull** to
  rapid-fire at a steady rate. Straight-down pull aims far, diagonal aims near.
- Max pull triggers a haptic buzz (on supporting devices); firing adds a subtle
  screen shake.

## Play online

The game deploys automatically to GitHub Pages on every push:

**https://arifialkov.github.io/siege/**

Open it on your phone or desktop; use "Add to Home Screen" / install to get
the fullscreen PWA experience.

## Running

Any static file server works — no build step:

```bash
npm start          # python3 http.server on :8080
```

Then open `http://localhost:8080`. Served over HTTPS (or localhost) the game
registers a service worker and becomes installable/playable offline.

Three.js loads from `lib/` when present, otherwise from the jsDelivr CDN.
Run `npm install` once to vendor it into `lib/` for a fully self-contained,
offline-first deployment (the service worker caches the CDN copy after first
load either way).

## Building an uploadable folder

To produce a clean, self-contained build (for uploading to any static host
or platform that takes a root folder with `index.html`):

```bash
npm install        # once — also vendors three.js into lib/
npm run build      # assembles everything into dist/
```

`dist/` is the complete game — `index.html` at the root, no external
dependencies — ready to zip, upload, or serve as-is.

## Tuning the odds

All gameplay numbers live in **`js/config.js`**:

- `ROUND.targets` — the weighted table a round's steered outcome is drawn
  from (`{ x: payout multiplier, w: weight }`); its EV is the game's RTP.
- `ROUND.values` — per-tier cash/multiplier pickups and wall penalties;
  `ROUND.control` — how hard the bot comrades and enemy inflow steer the
  round toward its target.
- `ENEMIES` — spawn weight, speed, hit radius, and value tier per enemy.
- `BETTING` — starting balance, stake options, multiplier chips.
- `WEAPONS` — projectile speeds, gravity, splash radius, fire rate.
- `SPAWNING` / `AIMING` / `EFFECTS` — pacing, slingshot feel, shake/haptics.

## Tech

- [Three.js](https://threejs.org) loaded via import map — no bundler.
  Procedural low-poly models and WebAudio sound effects, custom lightweight
  ballistics/collision, pointer-events input unified across touch and mouse.
- PWA: `manifest.webmanifest` (icons embedded as data URIs) + cache-first
  `sw.js`. `npm run icons` regenerates the icon PNGs from scratch.
