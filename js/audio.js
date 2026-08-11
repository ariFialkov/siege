// Tiny procedural sound effects via WebAudio — no audio assets needed.
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// call once from a user gesture to unlock audio on mobile
export function unlock() {
  try { ac(); } catch (_) { /* audio unavailable */ }
}

function env(gainNode, t0, peak, decay) {
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function noiseBuffer(a) {
  const len = a.sampleRate * 1.2;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
let _noise = null;

function playNoise(peak, decay, freq, q = 1) {
  try {
    const a = ac();
    if (!_noise) _noise = noiseBuffer(a);
    const src = a.createBufferSource();
    src.buffer = _noise;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = a.createGain();
    src.connect(filter).connect(g).connect(a.destination);
    env(g, a.currentTime, peak, decay);
    src.start();
    src.stop(a.currentTime + decay + 0.1);
  } catch (_) { /* no-op */ }
}

function playTone(type, f0, f1, peak, decay) {
  try {
    const a = ac();
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), a.currentTime + decay);
    const g = a.createGain();
    o.connect(g).connect(a.destination);
    env(g, a.currentTime, peak, decay);
    o.start();
    o.stop(a.currentTime + decay + 0.1);
  } catch (_) { /* no-op */ }
}

export const sfx = {
  fire(kind) {
    if (kind === 'bullet') {
      playNoise(0.16, 0.09, 2600, 0.6);
      playTone('square', 220, 60, 0.08, 0.07);
    } else if (kind === 'bolt') {
      // ballista twang: sharp string snap + wooden thunk
      playTone('square', 340, 70, 0.16, 0.11);
      playNoise(0.22, 0.16, 1500, 0.8);
      playTone('sine', 110, 55, 0.18, 0.18);
    } else if (kind === 'cannonball') {
      playNoise(0.5, 0.5, 500);
      playTone('sine', 120, 34, 0.4, 0.4);
    } else {
      playNoise(0.25, 0.3, 900);
      playTone('sine', 90, 40, 0.25, 0.28);
    }
  },
  explosion(spectacle = 0.4) {
    const s = Math.min(1.6, 0.4 + spectacle);
    playNoise(0.45 * s, 0.55 + s * 0.3, 380 + s * 200);
    playTone('sine', 90, 26, 0.35 * s, 0.5 + s * 0.2);
  },
  splash() {
    playNoise(0.3, 0.4, 1400, 0.8);
  },
  thud() {
    playNoise(0.2, 0.2, 500);
  },
  win(big = false) {
    const t = big ? [523, 659, 784, 1047] : [523, 784];
    t.forEach((f, i) => setTimeout(() => playTone('triangle', f, f, 0.22, 0.28), i * 90));
  },
  lose() {
    playTone('triangle', 300, 180, 0.14, 0.3);
  },
  maxPull() {
    playTone('square', 900, 900, 0.05, 0.05);
  },
  click() {
    playTone('triangle', 700, 500, 0.08, 0.07);
  },
  coin() {
    // cash pickup: bright double blip
    playTone('square', 880, 880, 0.08, 0.06);
    setTimeout(() => playTone('square', 1320, 1320, 0.08, 0.09), 55);
  },
  chime() {
    // multiplier pickup: rising shimmer
    playTone('triangle', 620, 1240, 0.12, 0.18);
  },
  rumble() {
    // enemy hit the wall: deep ground-shaking boom
    playNoise(0.5, 0.9, 190);
    playTone('sine', 55, 30, 0.4, 0.7);
  },
  roundStart() {
    [330, 440, 660].forEach((f, i) => setTimeout(() => playTone('triangle', f, f, 0.16, 0.16), i * 110));
  },
};
