// Slingshot aiming: pull back anywhere on screen, release to fire.
// Works with touch and mouse via pointer events. Draws the elastic band +
// power ring on a 2D canvas overlay.
import { AIMING } from './config.js';

export class Slingshot {
  /**
   * @param {HTMLCanvasElement} canvas  2D overlay canvas (full screen)
   * @param {object} cb  { onRelease(pull), onMaxPull(), onCancel() }
   *   pull = { dx, dy, frac, angle } — dx/dy in px from grab point (down = +dy)
   */
  constructor(canvas, cb) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = cb;
    this.active = false;
    this.enabled = false;
    this.autoMode = false;      // machine-gun style: hold at max to fire
    this.pull = { dx: 0, dy: 0, frac: 0, angle: 0 };
    this.armed = false;     // auto mode: set at first max pull, held until release
    this._maxNotified = false;
    this._pointerId = null;
    this._jitter = 0;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e, true));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // scale max pull to screen so small phones can reach it
    this.maxPull = Math.min(AIMING.maxPullPx, window.innerHeight * 0.34);
  }

  get maxed() { return this.pull.frac >= AIMING.armThreshold; }

  _down(e) {
    if (!this.enabled || this.active) return;
    this.active = true;
    this._pointerId = e.pointerId;
    this._maxNotified = false;
    this.armed = false;
    this.origin = { x: e.clientX, y: e.clientY };
    this._update(e);
    this.canvas.setPointerCapture(e.pointerId);
  }

  _move(e) {
    if (!this.active || e.pointerId !== this._pointerId) return;
    this._update(e);
  }

  _update(e) {
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.maxPull) {
      dx *= this.maxPull / len;
      dy *= this.maxPull / len;
      if (!this._maxNotified) {
        this._maxNotified = true;
        this._jitter = 1;
        this.armed = true; // auto weapons stay armed until release
        this.cb.onMaxPull && this.cb.onMaxPull();
      }
    } else if (len < this.maxPull * 0.92) {
      this._maxNotified = false;
    }
    this.pull.dx = dx;
    this.pull.dy = dy;
    this.pull.frac = Math.min(1, len / this.maxPull);
    this.pull.angle = Math.atan2(dy, dx);
  }

  _up(e, cancelled = false) {
    if (!this.active || e.pointerId !== this._pointerId) return;
    this.active = false;
    this._pointerId = null;
    this.armed = false;
    const p = { ...this.pull };
    this.pull.frac = 0;
    this.pull.dx = this.pull.dy = 0;
    this._clear();
    if (cancelled) {
      this.cb.onCancel && this.cb.onCancel();
      return;
    }
    // in auto (MG) mode releasing never fires — firing happens while held at max
    if (!this.autoMode && p.frac >= AIMING.fireThreshold) {
      this.cb.onRelease && this.cb.onRelease(p);
    } else {
      this.cb.onCancel && this.cb.onCancel();
    }
  }

  cancel() {
    this.active = false;
    this._pointerId = null;
    this.armed = false;
    this.pull.frac = 0;
    this.pull.dx = this.pull.dy = 0;
    this._clear();
  }

  _clear() {
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  // called every frame
  draw(dt) {
    this._jitter = Math.max(0, this._jitter - dt * 5);
    const ctx = this.ctx;
    this._clear();
    if (!this.active || this.pull.frac <= 0.01) return;

    const { x: ox, y: oy } = this.origin;
    // jitter shivers the hand point when max pull is reached
    const jx = (Math.random() - 0.5) * 6 * this._jitter;
    const jy = (Math.random() - 0.5) * 6 * this._jitter;
    const hx = ox + this.pull.dx + jx;
    const hy = oy + this.pull.dy + jy;
    const frac = this.pull.frac;
    const maxed = this.autoMode ? this.armed : this.maxed; // armed MG stays hot

    // fork anchors perpendicular to pull direction
    const a = this.pull.angle + Math.PI / 2;
    const forkR = 26;
    const ax1 = ox + Math.cos(a) * forkR, ay1 = oy + Math.sin(a) * forkR;
    const ax2 = ox - Math.cos(a) * forkR, ay2 = oy - Math.sin(a) * forkR;

    // elastic band
    ctx.lineCap = 'round';
    ctx.strokeStyle = maxed ? 'rgba(255,120,80,0.95)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, 6 - frac * 3.5);
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(hx, hy);
    ctx.lineTo(ax2, ay2);
    ctx.stroke();

    // anchor dots
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y] of [[ax1, ay1], [ax2, ay2]]) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // pouch / grab point with power ring
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fillStyle = maxed ? 'rgba(255,120,80,0.9)' : 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 22, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = maxed ? '#ff7850' : '#ffd24a';
    ctx.lineWidth = 4;
    ctx.stroke();

    // direction hint arrow (opposite the pull = launch direction)
    const lx = ox - this.pull.dx * 0.45, ly = oy - this.pull.dy * 0.45;
    ctx.strokeStyle = 'rgba(255,210,74,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
