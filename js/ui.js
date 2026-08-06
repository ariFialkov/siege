// DOM UI: menu screen, HUD, betting controls, result flashes.
import { BETTING, MAPS, MAP_INFO } from './config.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  /**
   * cb: { onPlay(), onMenu(), onMapChange(name), onStakeChange(), }
   */
  constructor(cb) {
    this.cb = cb;
    this.mapIndex = Math.max(0, MAPS.indexOf(localStorage.getItem('siege.map') || 'fortress'));
    this.stakeIndex = BETTING.defaultStakeIndex;
    this.multIndex = 0;

    this.menuEl = $('#menu');
    this.hudEl = $('#hud');
    this.balanceEls = [$('#menu-balance'), $('#balance')];

    $('#map-prev').addEventListener('click', () => this.cycleMap(-1));
    $('#map-next').addEventListener('click', () => this.cycleMap(1));
    $('#play-btn').addEventListener('click', () => cb.onPlay());
    $('#menu-btn').addEventListener('click', () => cb.onMenu());
    $('#stake-minus').addEventListener('click', () => this.bumpStake(-1));
    $('#stake-plus').addEventListener('click', () => this.bumpStake(1));

    const multBox = $('#multipliers');
    BETTING.multipliers.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = `${m}×`;
      b.addEventListener('click', () => {
        this.multIndex = i;
        this.refreshBet();
        cb.onStakeChange && cb.onStakeChange();
      });
      multBox.appendChild(b);
    });

    this.refreshMap();
    this.refreshBet();
  }

  get mapName() { return MAPS[this.mapIndex]; }
  get stake() { return BETTING.stakes[this.stakeIndex]; }
  get multiplier() { return BETTING.multipliers[this.multIndex]; }
  get betAmount() { return this.stake * this.multiplier; }

  cycleMap(dir) {
    this.mapIndex = (this.mapIndex + dir + MAPS.length) % MAPS.length;
    localStorage.setItem('siege.map', this.mapName);
    this.refreshMap();
    this.cb.onMapChange(this.mapName);
  }

  bumpStake(dir) {
    this.stakeIndex = Math.min(BETTING.stakes.length - 1, Math.max(0, this.stakeIndex + dir));
    this.refreshBet();
    this.cb.onStakeChange && this.cb.onStakeChange();
  }

  refreshMap() {
    const info = MAP_INFO[this.mapName];
    $('#map-name').textContent = info.label;
    $('#map-blurb').textContent = info.blurb;
    $('#hint').textContent = info.weapon === 'machinegun'
      ? 'pull back to aim · hold at full pull to fire'
      : 'pull back anywhere · release to fire';
  }

  refreshBet() {
    $('#stake-value').textContent = this.stake;
    $('#bet-total').textContent = `bet ${this.betAmount}`;
    [...document.querySelectorAll('#multipliers .chip')].forEach((el, i) => {
      el.classList.toggle('active', i === this.multIndex);
    });
  }

  setBalance(v) {
    for (const el of this.balanceEls) if (el) el.textContent = Math.floor(v).toLocaleString();
  }

  showMenu() {
    this.menuEl.classList.remove('hidden');
    this.hudEl.classList.add('hidden');
  }

  showHud() {
    this.menuEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
  }

  // green/red edge flash on bet result
  resultFlash(win) {
    const el = $('#vignette');
    el.className = win ? 'flash-win' : 'flash-lose';
    // retrigger animation
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this._vt);
    this._vt = setTimeout(() => { el.className = ''; }, 500);
  }

  toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => el.classList.remove('on'), 1400);
  }
}
