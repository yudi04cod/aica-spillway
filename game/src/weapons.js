// weapons.js — the armoury: definitions, hitscan firing with spread,
// recoil bloom, range falloff and armour, plus thrown grenades (frag and
// smoke) simulated as bouncing projectiles. Accuracy is the economy of
// the game: moving and spraying bloom the cone; stopping and crouching
// tighten it.

import * as THREE from 'three';
import { state, emit } from './state.js';
import { rayWorld, losBlocked } from './map.js';
import { tracer, burst, muzzle, explosionFx, spawnSmoke } from './fx.js';

// dmg is per bullet/pellet at point blank; headMult multiplies head hits;
// falloffStart/falloffEnd bracket the range where damage slides to
// falloffMin of its start value. rof in rounds per minute.
export const WEAPONS = {
  p9: { name: 'P9 Gull', kind: 'pistol', price: 0, dmg: 27, headMult: 4, rof: 340, mag: 12, reserve: 48, reload: 1.5, spread: 0.009, bloom: 0.006, pellets: 1, auto: false, falloffStart: 18, falloffEnd: 46, falloffMin: 0.55 },
  kestrel: { name: 'Kestrel .50', kind: 'pistol', price: 600, dmg: 41, headMult: 4, rof: 240, mag: 7, reserve: 35, reload: 1.8, spread: 0.009, bloom: 0.009, pellets: 1, auto: false, falloffStart: 22, falloffEnd: 52, falloffMin: 0.6 },
  riptide: { name: 'Riptide-9 SMG', kind: 'smg', price: 1250, dmg: 21, headMult: 3.4, rof: 780, mag: 32, reserve: 128, reload: 2.2, spread: 0.02, bloom: 0.007, pellets: 1, auto: true, falloffStart: 12, falloffEnd: 34, falloffMin: 0.45 },
  breaker: { name: 'Breaker-8', kind: 'shotgun', price: 1100, dmg: 11, headMult: 2.2, rof: 68, mag: 6, reserve: 24, reload: 3.1, spread: 0.055, bloom: 0.01, pellets: 8, auto: false, falloffStart: 7, falloffEnd: 22, falloffMin: 0.3 },
  vk47: { name: 'VK-47 Longshore', kind: 'rifle', price: 2700, dmg: 34, headMult: 4, rof: 600, mag: 30, reserve: 120, reload: 2.4, spread: 0.0075, bloom: 0.008, pellets: 1, auto: true, falloffStart: 26, falloffEnd: 64, falloffMin: 0.72 },
  harpoon: { name: 'Harpoon DMR', kind: 'dmr', price: 4300, dmg: 79, headMult: 3.2, rof: 105, mag: 8, reserve: 32, reload: 2.8, spread: 0.0018, bloom: 0.012, pellets: 1, auto: false, zoom: true, falloffStart: 40, falloffEnd: 110, falloffMin: 0.85 },
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

// Ray vs one actor: head sphere + body capsule. Returns {t, head} or null.
const _seg = new THREE.Vector3(), _pt = new THREE.Vector3();
function rayActor(a, o, d, maxT) {
  const px = a.pos.x, pz = a.pos.z;
  let best = null;
  // Head sphere.
  const hy = a.crouch ? 1.24 : 1.52;
  const hx = px - o.x, hyv = hy - o.y, hz = pz - o.z;
  const th = hx * d.x + hyv * d.y + hz * d.z;
  if (th > 0 && th < maxT) {
    const cx = o.x + d.x * th - px, cy = o.y + d.y * th - hy, cz = o.z + d.z * th - pz;
    if (cx * cx + cy * cy + cz * cz < 0.21 * 0.21) best = { t: th, head: true };
  }
  // Body capsule: vertical segment y 0.3..(crouch 1.1 / stand 1.36), r .36.
  const top = a.crouch ? 1.1 : 1.36;
  _seg.set(0, top - 0.3, 0);
  _pt.copy(o).setY(o.y - 0.3);
  // Solve closest approach between the ray and the segment in closed form
  // (both parameterised, clamped) — cheap and allocation-free.
  const rx = _pt.x - px, ry = _pt.y - a.pos.y, rz = _pt.z - pz;
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
  if (t > 0 && t < maxT && (!best || t < best.t)) {
    const qx = _pt.x + d.x * t - px, qy = (_pt.y + d.y * t) - (a.pos.y + _seg.y * s), qz = _pt.z + d.z * t - pz;
    if (qx * qx + qy * qy + qz * qz < 0.36 * 0.36) best = { t, head: false };
  }
  return best;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = { x: 0, y: 0, z: 0, t: 0 };

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
  const speed = Math.hypot(a.vel.x, a.vel.z);
  let spread = def.spread + (a.bloom || 0);
  spread *= 1 + speed * 0.38;                    // moving blooms the cone
  if (a.crouch) spread *= 0.68;
  if (!a.grounded) spread *= 2.1;
  const teamColor = a.team === 0 ? [0.25, 0.9, 1] : [1, 0.62, 0.2];

  for (let p = 0; p < def.pellets; p++) {
    _d.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
    // Pitch around the camera-right axis, then a random cone offset.
    const cp = Math.cos(a.pitch + (a.recoil || 0)), sp = Math.sin(a.pitch + (a.recoil || 0));
    _d.y = sp;
    _d.x *= cp; _d.z *= cp;
    _d.x += (Math.random() - 0.5) * 2 * spread;
    _d.y += (Math.random() - 0.5) * 2 * spread;
    _d.z += (Math.random() - 0.5) * 2 * spread;
    _d.normalize();

    const wallT = rayWorld(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 220, _hit);
    const maxT = wallT >= 0 ? wallT : 220;
    let victim = null, vHit = null;
    for (const other of state.actors) {
      if (other === a || !other.alive || other.team === a.team) continue;
      const h = rayActor(other, _o, _d, maxT);
      if (h && (!vHit || h.t < vHit.t)) { victim = other; vHit = h; }
    }
    const endT = vHit ? vHit.t : maxT;
    const ex = _o.x + _d.x * endT, ey = _o.y + _d.y * endT, ez = _o.z + _d.z * endT;
    tracer(_o.x + _d.x * 0.7, _o.y - 0.06 + _d.y * 0.7, _o.z + _d.z * 0.7, ex, ey, ez, ...teamColor);
    if (p === 0) muzzle(_o.x + _d.x * 0.8, _o.y - 0.05, _o.z + _d.z * 0.8, a.yaw, a.pitch);
    if (victim) {
      let dmg = def.dmg;
      const dist = vHit.t;
      if (dist > def.falloffStart) {
        const f = Math.min(1, (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart));
        dmg *= 1 - f * (1 - def.falloffMin);
      }
      if (vHit.head) dmg *= def.headMult;
      applyDamage(victim, dmg, vHit.head, a, def.key);
      burst(ex, ey, ez, 3, 0.85, 0.3, 0.2, 2.2, 0.3);
    } else if (wallT >= 0) {
      burst(ex, ey, ez, 2, 0.75, 0.7, 0.6, 1.8, 0.35);
    }
  }
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
    w.ammo += take; w.reserve -= take; w.reloadEnd = 0;
  }
  a.bloom = Math.max(0, (a.bloom || 0) - 0.028 * (1 / 60));
  a.recoil = Math.max(0, (a.recoil || 0) - 0.05 * (1 / 60));
}

// ---- grenades --------------------------------------------------------------

const grenades = []; // {kind, pos, vel, fuse, mesh}
const nadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const nadeMats = {
  frag: new THREE.MeshStandardMaterial({ color: 0x3d4a42, roughness: 0.6 }),
  smoke: new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.6 }),
};
let nadeScene = null;
export function initGrenades(scene) { nadeScene = scene; }

export function throwGrenade(a, kind) {
  if (kind === 'frag' && a.inv.frag <= 0) return false;
  if (kind === 'smoke' && a.inv.smoke <= 0) return false;
  if (state.time < (a.nextThrow || 0)) return false;
  a.nextThrow = state.time + 0.55;
  if (kind === 'frag') a.inv.frag--; else a.inv.smoke--;
  const dir = new THREE.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  const pitch = a.pitch + 0.32;
  dir.y = Math.sin(pitch); dir.x *= Math.cos(pitch); dir.z *= Math.cos(pitch);
  const mesh = new THREE.Mesh(nadeGeo, nadeMats[kind]);
  const pos = new THREE.Vector3(a.pos.x, eyeHeight(a) - 0.1, a.pos.z);
  mesh.position.copy(pos);
  nadeScene.add(mesh);
  grenades.push({
    kind, pos, mesh, fuse: kind === 'frag' ? 1.5 : 1.1,
    vel: dir.multiplyScalar(15.5).add(new THREE.Vector3(a.vel.x * 0.5, 0, a.vel.z * 0.5)),
    owner: a,
  });
  emit('throw', { x: a.pos.x, z: a.pos.z });
  return true;
}

const _segHit = { x: 0, y: 0, z: 0, t: 0 };
export function updateGrenades(dt, applyDamage) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 21 * dt;
    // Move in substeps, bouncing off walls (segment test) and the floor.
    const steps = 3, sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
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
        g.vel.x *= 0.72; g.vel.z *= 0.72;
        if (Math.abs(g.vel.y) < 0.7) g.vel.y = 0;
      }
    }
    g.mesh.position.copy(g.pos);
    if (g.fuse > 0) continue;
    nadeScene.remove(g.mesh);
    grenades.splice(i, 1);
    if (g.kind === 'smoke') {
      spawnSmoke(g.pos.x, g.pos.z);
      emit('smokepop', { x: g.pos.x, z: g.pos.z });
    } else {
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
  }
}

export function clearGrenades() {
  for (const g of grenades) nadeScene.remove(g.mesh);
  grenades.length = 0;
}
