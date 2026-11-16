// actors.js — combatants: creation, low-poly character meshes (built
// from boxes, team-coloured), fixed-step movement with acceleration and
// map collision, and the damage model (kevlar halves bullet damage;
// the frag/shrapnel path ignores the head bonus).

import * as THREE from 'three';
import { state, emit, TEAM } from './state.js';
import { moveCollide } from './map.js';
import { makeWeapon } from './weapons.js';

export const BOT_NAMES = [
  ['Vex', 'Marlin', 'Otter', 'Sable'], // Sluice Runners (beside the player)
  ['Heron', 'Basalt', 'Corin', 'Talus', 'Moss'], // Dam Wardens
];
export const PLAYER_NAME = 'You';

const TEAM_COLORS = [
  { suit: 0x146b7d, trim: 0x39d5e8, skin: 0xc9a189 },
  { suit: 0x8a5a20, trim: 0xffb02e, skin: 0xb98a68 },
];

let nextId = 1;

export function createActor(team, isPlayer, name, x, z, yaw) {
  const a = {
    id: nextId++, team, bot: !isPlayer, name,
    pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(),
    yaw, pitch: 0, hp: 100, alive: true,
    armorPool: 0, hasArmor: false,
    money: 0, kills: 0, deaths: 0,
    crouch: false, grounded: true, heightCur: 1.7,
    wishX: 0, wishZ: 0, wishSpeed: 0, wishJump: false,
    inv: { primary: null, sidearm: makeWeapon('p9'), frag: 0, smoke: 0 },
    cur: 'sidearm', kit: false,
    bloom: 0, recoil: 0, lastShotT: -99, nextThrow: 0,
    walkPhase: 0, stepAcc: 0, deathT: 0, hitFlash: 0,
    // Bot brain scratch space (bots.js owns the meaning).
    brain: null, mesh: null, parts: null,
  };
  if (!isPlayer) {
    const built = buildActorMesh(team);
    a.mesh = built.group;
    a.parts = built.parts;
  }
  return a;
}

// A readable soldier from boxes: legs that swing, a torso in team
// colours, a helmet with a glowing visor slit, and the held weapon as a
// dark block. The visor faces -Z, the direction the mesh looks.
//
// Each body part is one row: [key, w, h, d, material, x, y, z].
// Legs get their geometry pivoted at the hip afterwards so the swing
// rotates around the top of the leg.
function buildActorMesh(team) {
  const c = TEAM_COLORS[team];
  const suit = new THREE.MeshStandardMaterial({ color: c.suit, roughness: 0.85 });
  const trim = new THREE.MeshStandardMaterial({
    color: c.trim, roughness: 0.5, emissive: c.trim, emissiveIntensity: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.8 });
  const mats = { suit, trim, dark, skin };
  const PARTS = [
    ['legL', 0.17, 0.78, 0.2, 'dark', -0.13, 0.39, 0],
    ['legR', 0.17, 0.78, 0.2, 'dark', 0.13, 0.39, 0],
    ['torso', 0.52, 0.62, 0.3, 'suit', 0, 1.09, 0],
    ['chestStrip', 0.54, 0.1, 0.32, 'trim', 0, 1.32, 0],
    ['armL', 0.13, 0.55, 0.15, 'suit', -0.34, 1.12, -0.05],
    ['armR', 0.13, 0.55, 0.15, 'suit', 0.34, 1.12, -0.05],
    ['head', 0.3, 0.3, 0.3, 'skin', 0, 1.56, 0],
    ['helmet', 0.34, 0.14, 0.34, 'dark', 0, 1.7, 0],
    ['visor', 0.26, 0.05, 0.02, 'trim', 0, 1.58, -0.16],
    ['gun', 0.09, 0.16, 0.78, 'dark', 0.22, 1.18, -0.42],
  ];
  const g = new THREE.Group();
  const parts = { suit, trim };
  for (const [key, w, h, d, mat, x, y, z] of PARTS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    parts[key] = m;
  }
  // Pivot the legs at the hip: drop the geometry, raise the mesh.
  for (const leg of [parts.legL, parts.legR]) {
    leg.geometry.translate(0, -0.3, 0);
    leg.position.y = 0.69;
  }
  return { group: g, parts };
}

export function resetActorForRound(a, x, z, yaw) {
  a.pos.set(x, 0, z);
  a.vel.set(0, 0, 0);
  a.yaw = yaw;
  a.pitch = 0;
  a.hp = 100;
  a.alive = true;
  a.deathT = 0;
  a.hitFlash = 0;
  a.crouch = false;
  a.bloom = 0;
  a.recoil = 0;
  a.wishX = 0;
  a.wishZ = 0;
  a.wishSpeed = 0;
  if (a.mesh) {
    a.mesh.visible = true;
    a.mesh.rotation.set(0, 0, 0);
    a.mesh.position.set(x, 0, z);
  }
}

// Damage: kevlar (armour + helm) halves gun damage while its pool lasts.
// Returns true when the hit killed.
export function applyDamage(target, dmg, head, attacker, weaponKey) {
  if (!target.alive || state.phase === 'over' || state.phase === 'match') return false;
  let final = dmg;
  if (target.hasArmor && weaponKey !== 'frag') {
    const absorbed = Math.min(target.armorPool, dmg * 0.5);
    target.armorPool -= absorbed;
    final = dmg - absorbed;
    if (target.armorPool <= 0) target.hasArmor = false;
  }
  target.hp -= final;
  target.hitFlash = 1;
  target.lastAttacker = attacker;
  target.lastHurtT = state.time;
  emit('hit', { byPlayer: attacker && !attacker.bot, head, x: target.pos.x, z: target.pos.z });
  emit('hurt', { isPlayer: !target.bot, x: target.pos.x, z: target.pos.z });
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deathT = 0;
  target.deaths++;
  if (attacker && attacker !== target) {
    attacker.kills++;
    emit('kill', {
      killer: attacker, victim: target, head, weaponKey,
      byPlayer: !attacker.bot, victimIsPlayer: !target.bot,
    });
  }
  return true;
}

const GRAV = 22, ACCEL = 42, FRICTION = 9;
const JUMP_VEL = 7.6, MAX_AIR_SPEED = 7.5;

// Accelerate toward the wish velocity on the ground; weaker air control.
// Ground friction drags the body to a stop when there is no wish.
function integrateHorizontal(a, dt) {
  const maxSpeed = a.wishSpeed * (a.crouch ? 0.45 : 1);
  const k = a.grounded ? ACCEL : ACCEL * 0.18;
  a.vel.x += a.wishX * k * dt;
  a.vel.z += a.wishZ * k * dt;
  const sp = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded) {
    const drag = Math.max(0, 1 - FRICTION * dt * (a.wishSpeed > 0 ? 0.35 : 1));
    a.vel.x *= drag;
    a.vel.z *= drag;
    const sp2 = Math.hypot(a.vel.x, a.vel.z);
    if (sp2 > maxSpeed && maxSpeed > 0) {
      a.vel.x *= maxSpeed / sp2;
      a.vel.z *= maxSpeed / sp2;
    }
  } else if (sp > MAX_AIR_SPEED) {
    a.vel.x *= MAX_AIR_SPEED / sp;
    a.vel.z *= MAX_AIR_SPEED / sp;
  }
}

function integrateVertical(a, dt) {
  if (a.wishJump && a.grounded) { a.vel.y = JUMP_VEL; a.grounded = false; }
  a.wishJump = false;
  a.vel.y -= GRAV * dt;
  a.pos.x += a.vel.x * dt;
  a.pos.z += a.vel.z * dt;
  a.pos.y += a.vel.y * dt;
  if (a.pos.y <= 0) { a.pos.y = 0; a.vel.y = 0; a.grounded = true; }
  moveCollide(a.pos, 0.36);
}

// Footsteps: distance-based, so sprinting is loud and crouch-walking quiet.
function tickFootsteps(a, dt) {
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded && hs > 0.6) {
    a.stepAcc += hs * dt;
    const stride = a.crouch ? 3.4 : 2.1;
    if (a.stepAcc > stride) {
      a.stepAcc = 0;
      if (!a.crouch) emit('step', { x: a.pos.x, z: a.pos.z, isPlayer: !a.bot, team: a.team });
    }
  }
  a.walkPhase += hs * dt * 2.4;
  const targetH = a.crouch ? 1.08 : 1.7;
  a.heightCur += (targetH - a.heightCur) * Math.min(1, dt * 10);
  a.hitFlash = Math.max(0, a.hitFlash - dt * 5);
  if (!a.alive) a.deathT += dt;
}

// One fixed step of body movement: the wish direction + speed come from
// the player controller or a bot brain; this integrates, collides and
// animates.
export function stepMovement(a, dt) {
  integrateHorizontal(a, dt);
  integrateVertical(a, dt);
  tickFootsteps(a, dt);
}

// Pose the mesh from the simulation state (render-side, after steps).
export function animateActor(a) {
  if (!a.mesh) return;
  const m = a.mesh, p = a.parts;
  m.position.copy(a.pos);
  if (!a.alive) {
    // Fall backwards and settle; corpses stop colliding (alive=false).
    const t = Math.min(1, a.deathT * 2.6);
    m.rotation.set(-t * Math.PI / 2, a.yaw, 0);
    m.position.y = a.pos.y + t * 0.12;
    return;
  }
  m.rotation.set(0, a.yaw, 0);
  const hs = Math.hypot(a.vel.x, a.vel.z);
  const swing = Math.sin(a.walkPhase) * Math.min(0.6, hs * 0.14);
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.7;
  p.armR.rotation.x = -a.pitch * 0.9 + swing * 0.3;
  p.gun.rotation.x = -a.pitch;
  const crouchDip = (1.7 - a.heightCur) * 0.55;
  p.torso.position.y = 1.09 - crouchDip;
  p.head.position.y = 1.56 - crouchDip;
  m.scale.y = 1 - (1.7 - a.heightCur) * 0.18;
  const flash = a.hitFlash * 0.55;
  p.suit.emissive.setRGB(flash, flash * 0.25, flash * 0.2);
}
