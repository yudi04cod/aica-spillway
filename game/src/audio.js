// audio.js — all sound is synthesized with WebAudio at runtime: gunshots
// shaped per weapon, the charge's beeps, water-side ambience. No audio
// files, no network. Sounds are placed by distance and bearing from the
// listener (the player) with a gain + stereo pan approximation.

import { on } from './state.js';

let ctx = null, master = null, noiseBuf = null;
const listener = { x: 0, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  subscribe();
}

export function unlockAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setListener(x, z, yaw) { listener.x = x; listener.z = z; listener.yaw = yaw; }

// Gain/pan for a world position; near = the player's own sounds.
function place(x, z, base) {
  if (!ctx) return null;
  const dx = x - listener.x, dz = z - listener.z;
  const dist = Math.hypot(dx, dz);
  const vol = base / (1 + dist * 0.14);
  if (vol < 0.004) return null;
  const g = ctx.createGain(); g.gain.value = vol;
  let node = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    const fwdX = -Math.sin(listener.yaw), fwdZ = -Math.cos(listener.yaw);
    const rightX = -fwdZ, rightZ = fwdX;
    const s = dist > 0.01 ? (dx * rightX + dz * rightZ) / dist : 0;
    p.pan.value = Math.max(-0.85, Math.min(0.85, s));
    g.connect(p); p.connect(master);
    node = g;
  } else g.connect(master);
  return { out: g, dist };
}

function noise(t0, dur, filterType, f0, f1, out) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const flt = ctx.createBiquadFilter(); flt.type = filterType;
  flt.frequency.setValueAtTime(f0, t0);
  flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(1, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(flt); flt.connect(g); g.connect(out);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

function tone(t0, dur, type, f0, f1, out, vol = 1) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

const SHOT_PARAMS = {
  pistol: { n: 0.16, f: 2600, body: 190, dur: 0.13, vol: 0.5 },
  smg: { n: 0.11, f: 3000, body: 230, dur: 0.1, vol: 0.42 },
  rifle: { n: 0.2, f: 2100, body: 150, dur: 0.16, vol: 0.62 },
  dmr: { n: 0.3, f: 1500, body: 110, dur: 0.28, vol: 0.8 },
  shotgun: { n: 0.3, f: 1300, body: 95, dur: 0.3, vol: 0.85 },
};

function shotSound(kind, x, z) {
  const p = SHOT_PARAMS[kind] || SHOT_PARAMS.rifle;
  const placed = place(x, z, p.vol);
  if (!placed) return;
  const t = ctx.currentTime;
  noise(t, p.n, 'lowpass', p.f, 300, placed.out);
  tone(t, p.dur, 'triangle', p.body, p.body * 0.4, placed.out, 0.7);
}

function explosionSound(x, z, big) {
  const placed = place(x, z, big ? 1.2 : 0.8);
  if (!placed) return;
  const t = ctx.currentTime;
  noise(t, big ? 1.4 : 0.6, 'lowpass', 900, 40, placed.out);
  tone(t, big ? 1.1 : 0.5, 'sine', 120, 28, placed.out, 1.4);
}

function beep(x, z, freq, vol = 0.3) {
  const placed = place(x, z, vol);
  if (!placed) return;
  tone(ctx.currentTime, 0.09, 'square', freq, freq, placed.out, 0.5);
}

function subscribe() {
  on('shot', (e) => shotSound(e.kind, e.x, e.z));
  on('empty', (e) => { const p = place(e.x, e.z, 0.25); if (p) tone(ctx.currentTime, 0.05, 'square', 1200, 900, p.out, 0.4); });
  on('reload', (e) => {
    const p = place(e.x, e.z, 0.3); if (!p) return;
    const t = ctx.currentTime;
    tone(t, 0.05, 'square', 500, 300, p.out, 0.5);
    tone(t + 0.22, 0.05, 'square', 700, 420, p.out, 0.5);
  });
  on('hit', (e) => { if (e.byPlayer && ctx) tone(ctx.currentTime, 0.06, 'square', 1900, 1500, master, 0.25); });
  on('kill', (e) => {
    if (!ctx) return;
    if (e.byPlayer) { tone(ctx.currentTime, 0.1, 'square', 880, 880, master, 0.3); tone(ctx.currentTime + 0.09, 0.16, 'square', 1320, 1320, master, 0.3); }
    else if (e.victimIsPlayer) tone(ctx.currentTime, 0.4, 'sawtooth', 160, 60, master, 0.4);
  });
  on('hurt', (e) => { if (e.isPlayer && ctx) noise(ctx.currentTime, 0.12, 'lowpass', 700, 200, master); });
  on('explode', (e) => explosionSound(e.x, e.z, e.big));
  on('smokepop', (e) => { const p = place(e.x, e.z, 0.4); if (p) noise(ctx.currentTime, 0.5, 'bandpass', 900, 500, p.out); });
  on('throw', (e) => { const p = place(e.x, e.z, 0.2); if (p) tone(ctx.currentTime, 0.12, 'sine', 500, 800, p.out, 0.4); });
  on('planttick', (e) => beep(e.x, e.z, 1250, 0.35));
  on('bombtick', (e) => beep(e.x, e.z, e.fast ? 1560 : 1180, 0.32));
  on('planted', (e) => { beep(e.x, e.z, 1560, 0.4); if (ctx) tone(ctx.currentTime + 0.05, 0.3, 'square', 780, 780, master, 0.15); });
  on('buy', () => { if (ctx) tone(ctx.currentTime, 0.07, 'square', 990, 990, master, 0.25); });
  on('denied', () => { if (ctx) tone(ctx.currentTime, 0.12, 'square', 220, 180, master, 0.25); });
  on('roundwin', (e) => {
    if (!ctx) return;
    const base = e.won ? [523, 659, 784] : [392, 330, 262];
    base.forEach((f, i) => tone(ctx.currentTime + i * 0.13, 0.22, 'triangle', f, f, master, 0.3));
  });
  on('step', (e) => {
    const p = place(e.x, e.z, e.isPlayer ? 0.10 : 0.16);
    if (p) noise(ctx.currentTime, 0.06, 'lowpass', 500, 200, p.out);
  });
}
