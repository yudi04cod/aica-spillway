// weapons.js — the armoury: definitions, hitscan firing with spread,
// recoil bloom, range falloff and armour, plus thrown grenades (frag and
// smoke) simulated as bouncing projectiles. Accuracy is the economy of
// the game: moving and spraying bloom the cone; stopping and crouching
// tighten it.

import * as THREE from 'three';
import { state, emit } from './state.js';
import { rayWorld, losBlocked } from './map.js';
import { tracer, burst, muzzle, explosionFx, spawnSmoke } from './fx.js';

// One row per weapon: name, kind, price, damage per bullet/pellet at
// point blank, head multiplier, rate of fire (rpm), magazine, reserve,
// reload seconds, base spread, bloom per shot, pellets per shot, auto
// fire, falloff start/end (damage slides to falloffMin across them),
// and whether it zooms. dmg is per bullet/pellet at point blank;
// headMult multiplies head hits.
function w(name, kind, price, dmg, headMult, rof, mag, reserve, reload,
  spread, bloom, pellets, auto, falloffStart, falloffEnd, falloffMin, zoom = false) {
  return {
    name, kind, price, dmg, headMult, rof, mag, reserve, reload,
    spread, bloom, pellets, auto, falloffStart, falloffEnd, falloffMin, zoom,
  };
}

export const WEAPONS = {
  p9: w('P9 Gull', 'pistol', 0, 27, 4, 340, 12, 48, 1.5, 0.009, 0.006, 1, false, 18, 46, 0.55),
  kestrel: w('Kestrel .50', 'pistol', 600, 41, 4, 240, 7, 35, 1.8, 0.009, 0.009, 1, false, 22, 52, 0.6),
  riptide: w('Riptide-9 SMG', 'smg', 1250, 21, 3.4, 780, 32, 128, 2.2, 0.02, 0.007, 1, true, 12, 34, 0.45),
  breaker: w('Breaker-8', 'shotgun', 1100, 11, 2.2, 68, 6, 24, 3.1, 0.055, 0.01, 8, false, 7, 22, 0.3),
  vk47: w('VK-47 Longshore', 'rifle', 2700, 34, 4, 600, 30, 120, 2.4, 0.0075, 0.008, 1, true, 26, 64, 0.72),
  harpoon: w('Harpoon DMR', 'dmr', 4300, 79, 3.2, 105, 8, 32, 2.8, 0.0018, 0.012, 1, false, 40, 110, 0.85, true),
};

export const SHOP = [
  { id: 'kestrel', label: 'Kestrel .50', price: 600, hint: 'Heavy sidearm' },
  { id: 'riptide', label: 'Riptide-9 SMG', price: 1250, hint: 'Fast, close range' },
  { id: 'breaker', label: 'Breaker-8', price: 1100, hint: 'Shotgun, 8 pellets' },
  { id: 'vk47', label: 'VK-47 Longshore', price: 2700, hint: 'Rifle, all ranges' },
  { id: 'harpoon', label: 'Harpoon DMR', price: 4300, hint: 'Scoped marksman' },
  { id: 'armor', label: 'Kevlar + Helm', price: 650, hint: 'Halves bullet damage' },
  { id: 'kit', label: 'Defuse Kit', price: 400, hint: 'Defenders: defuse 2x fast', defOnly: true },
  { id: 'frag', label: 'Frag Charge', price: 300, hint: 'Grenade, key 3' },
  { id: 'smoke', label: 'Smoke Pot', price: 300, hint: 'Grenade, key 4' },
];

export function makeWeapon(key) {
  const def = WEAPONS[key];
  return { key, def, ammo: def.mag, reserve: def.reserve, nextOk: 0, reloadEnd: 0 };
}

export function currentWeapon(a) {
  if (a.cur === 'primary') return a.inv.primary;
  if (a.cur === 'sidearm') return a.inv.sidearm;
  return null; // grenade slots are thrown, not fired
}

export function eyeHeight(a) { return a.crouch ? 1.06 : 1.58; }

// ---- ray vs actor ------------------------------------------------------------

// Ray vs a sphere centred on (cx, cy, cz): the closest approach of the
// ray to the centre, inside the radius, gives the hit distance.
function raySphere(o, d, cx, cy, cz, r, maxT) {
  const hx = cx - o.x, hy = cy - o.y, hz = cz - o.z;
  const t = hx * d.x + hy * d.y + hz * d.z;
  if (t <= 0 || t >= maxT) return -1;
  const qx = o.x + d.x * t - cx, qy = o.y + d.y * t - cy, qz = o.z + d.z * t - cz;
  return (qx * qx + qy * qy + qz * qz < r * r) ? t : -1;
}

// Ray vs a vertical capsule segment (x, z fixed, y from y0 to y1,
// measured from baseY): closest approach between ray and segment, in
// closed form (both parameterised, clamped) — cheap and allocation-free.
const _seg = new THREE.Vector3(), _pt = new THREE.Vector3();
function rayCapsule(o, d, px, pz, y0, y1, r, maxT, baseY) {
  const top = y1 - y0;
  _seg.set(0, top, 0);
  _pt.copy(o).setY(o.y - y0);
  const rx = _pt.x - px, ry = _pt.y - baseY, rz = _pt.z - pz;
  const a1 = d.dot(d), b1 = d.y * _seg.y, c1 = _seg.y * _seg.y;
  const d1 = d.x * rx + d.y * ry + d.z * rz, e1 = _seg.y * ry;
  const denom = a1 * c1 - b1 * b1;
  let t = 0, s = 0;
  if (denom > 1e-9) {
    t = (b1 * e1 - c1 * d1) / denom;
    s = (a1 * e1 - b1 * d1) / denom;
  }
  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, (b1 * s - d1) / a1);
  if (t <= 0 || t >= maxT) return -1;
  const qx = _pt.x + d.x * t - px;
  const qy = (_pt.y + d.y * t) - (baseY + _seg.y * s);
  const qz = _pt.z + d.z * t - pz;
  return (qx * qx + qy * qy + qz * qz < r * r) ? t : -1;
}

// Ray vs one actor: head sphere + body capsule. Returns {t, head} or null.
function rayActor(a, o, d, maxT) {
  const px = a.pos.x, pz = a.pos.z;
  const headY = a.crouch ? 1.24 : 1.52;
  const headT = raySphere(o, d, px, headY, pz, 0.21, maxT);
  let best = headT >= 0 ? { t: headT, head: true } : null;
  const bodyTop = a.crouch ? 1.1 : 1.36;
  const bodyT = rayCapsule(o, d, px, pz, 0.3, bodyTop, 0.36, maxT, a.pos.y);
  if (bodyT >= 0 && (!best || bodyT < best.t)) best = { t: bodyT, head: false };
  return best;
}

// ---- firing -----------------------------------------------------------------

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _hit = { x: 0, y: 0, z: 0, t: 0 };

function coneSpread(a, def) {
  const speed = Math.hypot(a.vel.x, a.vel.z);
  let spread = def.spread + (a.bloom || 0);
  spread *= 1 + speed * 0.38; // moving blooms the cone
  if (a.crouch) spread *= 0.68;
  if (!a.grounded) spread *= 2.1;
  return spread;
}

function pelletDir(a, spread) {
  _d.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  // Pitch around the camera-right axis, then a random cone offset.
  const cp = Math.cos(a.pitch + (a.recoil || 0)), sp = Math.sin(a.pitch + (a.recoil || 0));
  _d.y = sp;
  _d.x *= cp;
  _d.z *= cp;
  _d.x += (Math.random() - 0.5) * 2 * spread;
  _d.y += (Math.random() - 0.5) * 2 * spread;
  _d.z += (Math.random() - 0.5) * 2 * spread;
  _d.normalize();
  return _d;
}

function nearestVictim(a, o, d, maxT) {
  let victim = null, vHit = null;
  for (const other of state.actors) {
    if (other === a || !other.alive || other.team === a.team) continue;
    const h = rayActor(other, o, d, maxT);
    if (h && (!vHit || h.t < vHit.t)) { victim = other; vHit = h; }
  }
  return { victim, vHit };
}

function falloffDamage(def, dist, head) {
  let dmg = def.dmg;
  if (dist > def.falloffStart) {
    const f = Math.min(1, (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart));
    dmg *= 1 - f * (1 - def.falloffMin);
  }
  if (head) dmg *= def.headMult;
  return dmg;
}

function tracePellet(a, def, spread, pelletIndex, applyDamage) {
  const d = pelletDir(a, spread);
  const wallT = rayWorld(_o.x, _o.y, _o.z, d.x, d.y, d.z, 220, _hit);
  const maxT = wallT >= 0 ? wallT : 220;
  const { victim, vHit } = nearestVictim(a, _o, d, maxT);
  const endT = vHit ? vHit.t : maxT;
  const ex = _o.x + d.x * endT, ey = _o.y + d.y * endT, ez = _o.z + d.z * endT;
  const teamColor = a.team === 0 ? [0.25, 0.9, 1] : [1, 0.62, 0.2];
  tracer(_o.x + d.x * 0.7, _o.y - 0.06 + d.y * 0.7, _o.z + d.z * 0.7, ex, ey, ez, ...teamColor);
  if (pelletIndex === 0) muzzle(_o.x + d.x * 0.8, _o.y - 0.05, _o.z + d.z * 0.8, a.yaw, a.pitch);
  if (victim) {
    applyDamage(victim, falloffDamage(def, vHit.t, vHit.head), vHit.head, a, def.key);
    burst(ex, ey, ez, 3, 0.85, 0.3, 0.2, 2.2, 0.3);
  } else if (wallT >= 0) {
    burst(ex, ey, ez, 2, 0.75, 0.7, 0.6, 1.8, 0.35);
  }
}

// Fire one shot (all pellets) for actor `a`. Returns true if it fired.
export function fireWeapon(a, applyDamage) {
  const w = currentWeapon(a);
  if (!w || w.reloadEnd > state.time) return false;
  if (state.time < w.nextOk) return false;
  const def = w.def;
  if (w.ammo <= 0) {
    emit('empty', { x: a.pos.x, z: a.pos.z });
    w.nextOk = state.time + 0.3;
    startReload(a);
    return false;
  }
  w.ammo--;
  w.nextOk = state.time + 60 / def.rof;
  a.bloom = Math.min(0.05, (a.bloom || 0) + def.bloom);
  a.lastShotT = state.time;
  a.recoil = Math.min(0.03, (a.recoil || 0) + 0.006 + def.dmg * 0.00008);

  _o.set(a.pos.x, eyeHeight(a), a.pos.z);
  const spread = coneSpread(a, def);
  for (let p = 0; p < def.pellets; p++) tracePellet(a, def, spread, p, applyDamage);
  emit('shot', { kind: def.kind, x: a.pos.x, z: a.pos.z, byPlayer: !a.bot });
  return true;
}

export function startReload(a) {
  const w = currentWeapon(a);
  if (!w || w.reloadEnd > state.time || w.ammo >= w.def.mag || w.reserve <= 0) return;
  w.reloadEnd = state.time + w.def.reload;
  emit('reload', { x: a.pos.x, z: a.pos.z });
}

// Per-actor weapon housekeeping: finish reloads, decay bloom and recoil.
export function updateWeapon(a) {
  const w = currentWeapon(a);
  if (w && w.reloadEnd > 0 && state.time >= w.reloadEnd) {
    const take = Math.min(w.def.mag - w.ammo, w.reserve);
    w.ammo += take;
    w.reserve -= take;
    w.reloadEnd = 0;
  }
  a.bloom = Math.max(0, (a.bloom || 0) - 0.028 * (1 / 60));
  a.recoil = Math.max(0, (a.recoil || 0) - 0.05 * (1 / 60));
}

// ---- grenades ---------------------------------------------------------------

const grenades = []; // {kind, pos, vel, fuse, mesh, owner}
const nadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const nadeMats = {
  frag: new THREE.MeshStandardMaterial({ color: 0x3d4a42, roughness: 0.6 }),
  smoke: new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.6 }),
};
let nadeScene = null;
export function initGrenades(scene) { nadeScene = scene; }

const NADE_SPEED = 15.5, NADE_GRAVITY = 21, NADE_FUSE = { frag: 1.5, smoke: 1.1 };

export function throwGrenade(a, kind) {
  if (kind === 'frag' && a.inv.frag <= 0) return false;
  if (kind === 'smoke' && a.inv.smoke <= 0) return false;
  if (state.time < (a.nextThrow || 0)) return false;
  a.nextThrow = state.time + 0.55;
  if (kind === 'frag') a.inv.frag--; else a.inv.smoke--;
  const dir = new THREE.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  const pitch = a.pitch + 0.32;
  dir.y = Math.sin(pitch);
  dir.x *= Math.cos(pitch);
  dir.z *= Math.cos(pitch);
  const mesh = new THREE.Mesh(nadeGeo, nadeMats[kind]);
  const pos = new THREE.Vector3(a.pos.x, eyeHeight(a) - 0.1, a.pos.z);
  mesh.position.copy(pos);
  nadeScene.add(mesh);
  grenades.push({
    kind, pos, mesh, fuse: NADE_FUSE[kind],
    vel: dir.multiplyScalar(NADE_SPEED).add(new THREE.Vector3(a.vel.x * 0.5, 0, a.vel.z * 0.5)),
    owner: a,
  });
  emit('throw', { x: a.pos.x, z: a.pos.z });
  return true;
}

const _segHit = { x: 0, y: 0, z: 0, t: 0 };

// One substep of the bounce: move, reflect off a wall hit (dominant
// axis flips), or roll along the floor.
function stepGrenade(g, sdt) {
  const nx = g.pos.x + g.vel.x * sdt, ny = g.pos.y + g.vel.y * sdt, nz = g.pos.z + g.vel.z * sdt;
  const dx = nx - g.pos.x, dy = ny - g.pos.y, dz = nz - g.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const t = rayWorld(g.pos.x, g.pos.y, g.pos.z, dx / len, dy / len, dz / len, len + 0.11, _segHit);
  if (t >= 0) {
    g.pos.set(_segHit.x, _segHit.y, _segHit.z);
    // Reflect by flipping the dominant axis of travel.
    if (Math.abs(dx) > Math.abs(dz)) g.vel.x *= -0.42; else g.vel.z *= -0.42;
    g.vel.y *= 0.6;
  } else g.pos.set(nx, ny, nz);
  if (g.pos.y < 0.11) {
    g.pos.y = 0.11;
    g.vel.y = Math.abs(g.vel.y) * 0.42;
    g.vel.x *= 0.72;
    g.vel.z *= 0.72;
    if (Math.abs(g.vel.y) < 0.7) g.vel.y = 0;
  }
}

function detonateFrag(g, applyDamage) {
  explosionFx(g.pos.x, 0.4, g.pos.z, false);
  emit('explode', { x: g.pos.x, z: g.pos.z, big: false });
  for (const other of state.actors) {
    if (!other.alive) continue;
    const dx = other.pos.x - g.pos.x, dz = other.pos.z - g.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 6.5) continue;
    if (losBlocked(g.pos.x, 0.6, g.pos.z, other.pos.x, 1, other.pos.z)) continue;
    const dmg = 92 * (1 - dist / 7.2);
    if (dmg > 2) applyDamage(other, dmg, false, g.owner, 'frag');
  }
}

function detonateGrenade(g, applyDamage) {
  if (g.kind === 'smoke') {
    spawnSmoke(g.pos.x, g.pos.z);
    emit('smokepop', { x: g.pos.x, z: g.pos.z });
  } else {
    detonateFrag(g, applyDamage);
  }
}

export function updateGrenades(dt, applyDamage) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= NADE_GRAVITY * dt;
    // Move in substeps, bouncing off walls (segment test) and the floor.
    const steps = 3, sdt = dt / steps;
    for (let s = 0; s < steps; s++) stepGrenade(g, sdt);
    g.mesh.position.copy(g.pos);
    if (g.fuse > 0) continue;
    nadeScene.remove(g.mesh);
    grenades.splice(i, 1);
    detonateGrenade(g, applyDamage);
  }
}

export function clearGrenades() {
  for (const g of grenades) nadeScene.remove(g.mesh);
  grenades.length = 0;
}
