// DOM UI: menu screen, HUD, betting controls, invasion-round displays.
import { BETTING, MAPS, MAP_INFO, ROUND, money } from './config.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  /**
   * cb: { onPlay(), onMenu(), onMapChange(name), onStakeChange(), onStartRound() }
   */
  constructor(cb) {
    this.cb = cb;
    this.mapIndex = Math.max(0, MAPS.indexOf(localStorage.getItem('siege.map') || 'fortress'));
    this.stakeIndex = BETTING.defaultStakeIndex;
    this.multIndex = 0;
    this.locked = false;

    this.menuEl = $('#menu');
    this.hudEl = $('#hud');
    this.balanceEls = [$('#menu-balance'), $('#balance')];

    $('#map-prev').addEventListener('click', () => this.cycleMap(-1));
    $('#map-next').addEventListener('click', () => this.cycleMap(1));
    $('#play-btn').addEventListener('click', () => cb.onPlay());
    $('#menu-btn').addEventListener('click', () => cb.onMenu());
    $('#stake-minus').addEventListener('click', () => this.bumpStake(-1));
    $('#stake-plus').addEventListener('click', () => this.bumpStake(1));
    $('#menu-stake-minus').addEventListener('click', () => this.bumpStake(-1));
    $('#menu-stake-plus').addEventListener('click', () => this.bumpStake(1));
    $('#defend-btn').addEventListener('click', () => cb.onStartRound());

    const multBox = $('#multipliers');
    BETTING.multipliers.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = `${m}×`;
      b.addEventListener('click', () => {
        if (this.locked) return;
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
    if (this.locked) return;
    this.stakeIndex = Math.min(BETTING.stakes.length - 1, Math.max(0, this.stakeIndex + dir));
    this.refreshBet();
    this.cb.onStakeChange && this.cb.onStakeChange();
  }

  refreshMap() {
    const info = MAP_INFO[this.mapName];
    $('#map-name').textContent = info.label;
    $('#map-blurb').textContent = info.blurb;
    $('#hint').textContent = info.weapon === 'machinegun'
      ? 'pull to max to arm · keep holding to fire & sweep'
      : 'pull back anywhere · release to fire';
  }

  refreshBet() {
    $('#stake-value').textContent = this.stake;
    $('#defend-bet').textContent = this.betAmount.toLocaleString();
    $('#menu-bet').textContent = this.betAmount.toLocaleString();
    [...document.querySelectorAll('#multipliers .chip')].forEach((el, i) => {
      el.classList.toggle('active', i === this.multIndex);
    });
  }

  setBalance(v) {
    for (const el of this.balanceEls) if (el) el.textContent = money(v);
  }

  showMenu() {
    this.menuEl.classList.remove('hidden');
    this.hudEl.classList.add('hidden');
  }

  showHud() {
    this.menuEl.classList.add('hidden');
    this.hudEl.classList.remove('hidden');
  }

  // ------------------------------------------------------------- round HUD
  setLocked(locked) {
    this.locked = locked;
    $('#bet-panel').classList.toggle('locked', locked);
    $('#defend-btn').classList.toggle('hidden', locked);
  }

  roundStart(round) {
    this.setLocked(true);
    $('#round-hud').classList.remove('hidden');
    $('#round-result').classList.add('hidden');
    this.roundTick(round);
  }

  roundTick(round) {
    const frac = Math.max(0, round.tLeft / ROUND.duration);
    const fill = $('#round-timer-fill');
    fill.style.width = `${frac * 100}%`;
    fill.classList.toggle('urgent', round.tLeft < 6);
    $('#round-secs').textContent = `${Math.max(0, Math.ceil(round.tLeft))}s`;
    $('#rt-cash').textContent = `$${money(round.cash)}`;
    $('#rt-mult').textContent = `${round.mult.toFixed(2)}×`;
    $('#rt-total').textContent = `$${money(Math.max(0, round.cash * round.mult))}`;
  }

  roundEnd(payout, bet) {
    this.setLocked(false);
    $('#round-hud').classList.add('hidden');
    const el = $('#round-result');
    const title = $('#rr-title'), amount = $('#rr-amount');
    if (payout >= bet * 2) {
      title.textContent = 'INVASION CRUSHED!';
      el.className = 'rr-big';
    } else if (payout >= bet) {
      title.textContent = 'WALL DEFENDED';
      el.className = 'rr-win';
    } else if (payout >= bet * 0.15) {
      title.textContent = 'COSTLY DEFENSE';
      el.className = 'rr-part';
    } else {
      title.textContent = 'THE WALL FELL';
      el.className = 'rr-lose';
    }
    amount.textContent = `+$${money(payout)}`;
    void el.offsetWidth; // retrigger animation
    el.classList.add('on');
    clearTimeout(this._rt);
    this._rt = setTimeout(() => el.classList.add('hidden'), 3200);
    el.classList.remove('hidden');
  }

  roundAbort() {
    this.setLocked(false);
    $('#round-hud').classList.add('hidden');
    $('#round-result').classList.add('hidden');
    this.toast('Round cancelled — stake refunded');
  }

  // green/red edge flash
  resultFlash(win) {
    const el = $('#vignette');
    el.className = win ? 'flash-win' : 'flash-lose';
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
