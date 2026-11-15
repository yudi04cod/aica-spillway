// textures.js — every surface in SPILLWAY is painted procedurally on a
// canvas at boot: weathered dam concrete, plate metal, hazard striping,
// crate timber, asphalt and the site signs. No image files, no network.

import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic speckle so two runs (and two dossiers) agree byte for byte.
function speckle(ctx, size, n, colors, seed) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    const r = 1 + rnd() * 3;
    ctx.fillRect(rnd() * size, rnd() * size, r, r);
  }
  ctx.globalAlpha = 1;
}

function concrete(base, streak, seed) {
  const [c, x] = canvas(256);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 2600, [streak, '#00000022', '#ffffff18'], seed);
  // Formwork seams and water staining running down the pour.
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.stroke();
  for (let i = 0; i < 7; i++) {
    const px = (seed * (i + 3) * 37) % 256;
    const g = x.createLinearGradient(px, 0, px + 14, 0);
    g.addColorStop(0, 'rgba(20,26,24,0)');
    g.addColorStop(0.5, 'rgba(20,26,24,0.28)');
    g.addColorStop(1, 'rgba(20,26,24,0)');
    x.fillStyle = g; x.fillRect(px, 0, 14, 256);
  }
  return c;
}

function plate(base, seed) {
  const [c, x] = canvas(256);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 900, ['#00000030', '#ffffff14'], seed);
  x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 3; x.strokeRect(2, 2, 252, 252);
  x.fillStyle = 'rgba(255,255,255,0.20)';
  for (const [px, py] of [[16, 16], [240, 16], [16, 240], [240, 240]]) {
    x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
  }
  return c;
}

function hazard() {
  const [c, x] = canvas(128);
  x.fillStyle = '#c8871a'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#191c1e';
  for (let i = -2; i < 6; i++) {
    x.save(); x.translate(i * 32, 0); x.rotate(Math.PI / 4);
    x.fillRect(0, -40, 16, 220); x.restore();
  }
  return c;
}

function timber() {
  const [c, x] = canvas(256);
  x.fillStyle = '#6d5136'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) {
    x.fillStyle = i % 2 ? '#75593c' : '#63482e';
    x.fillRect(0, i * 29, 256, 27);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, i * 29 + 27, 256, 2);
  }
  speckle(x, 256, 500, ['#00000026', '#ffe9c018'], 91);
  x.strokeStyle = 'rgba(30,20,10,0.8)'; x.lineWidth = 10; x.strokeRect(0, 0, 256, 256);
  return c;
}

function asphalt() {
  const [c, x] = canvas(256);
  x.fillStyle = '#33373b'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 3600, ['#ffffff10', '#00000030', '#9fb4bd14'], 47);
  return c;
}

function sign(letter, color) {
  const [c, x] = canvas(256);
  x.fillStyle = '#10181c'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(10, 10, 236, 236);
  x.fillStyle = color;
  x.font = 'bold 170px system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowPanel(text, color) {
  const [c, x] = canvas(256);
  x.fillStyle = '#0b1114'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = color;
  x.font = 'bold 44px ui-monospace, monospace';
  x.textAlign = 'center';
  x.fillText(text, 128, 110);
  x.font = '28px ui-monospace, monospace';
  x.fillStyle = '#9fb4bd';
  x.fillText('MERIDIAN DAM', 128, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTextures() {
  const waterC = (() => {
    const [c, x] = canvas(256);
    x.fillStyle = '#0d3038'; x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 1500, ['#2e7d8c33', '#7fd4e022', '#04161a40'], 7);
    x.strokeStyle = 'rgba(140,220,235,0.13)';
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      const y = (i * 53) % 256;
      x.moveTo(0, y);
      for (let px = 0; px <= 256; px += 16) x.lineTo(px, y + Math.sin(px * 0.11 + i) * 3);
      x.stroke();
    }
    return c;
  })();

  return {
    concrete: finish(concrete('#7d868c', '#5b656b', 11), 2),
    concreteDark: finish(concrete('#565e63', '#3f464b', 23), 2),
    plate: finish(plate('#4d6a72', 31), 1),
    plateRust: finish(plate('#6e5a44', 43), 1),
    hazard: finish(hazard(), 1),
    timber: finish(timber(), 1),
    asphalt: finish(asphalt(), 3),
    water: finish(waterC, 6),
    signA: sign('A', '#ffb02e'),
    signB: sign('B', '#39d5e8'),
    panelAtk: glowPanel('SLUICE', '#39d5e8'),
    panelDef: glowPanel('WARDEN', '#ffb02e'),
  };
}
