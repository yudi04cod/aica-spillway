// player.js — the local player's controller and first-person rig: mouse
// look with recoil recovery, WASD wish direction, crouch/jump, weapon
// switching, firing and reloading, the plant key, and the viewmodel
// (a low-poly gun + hands that bob, sway and kick).

import * as THREE from 'three';
import { state, PHASE } from './state.js';
import { keys, pressed, mouse, consumeMouse, intent } from './input.js';
import { fireWeapon, startReload, throwGrenade, currentWeapon } from './weapons.js';
import { applyDamage } from './actors.js';
import { eyeHeight } from './weapons.js';

const SENS = 0.0021;
let viewmodel = null, vmParts = null, bobT = 0, landDip = 0, wasGrounded = true;

export function buildViewmodel(camera) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.55, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x39d5e8, roughness: 0.4, emissive: 0x39d5e8, emissiveIntensity: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a189, roughness: 0.8 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); g.add(m); return m;
  };
  const body = box(0.08, 0.12, 0.46, dark, 0.22, -0.2, -0.5);
  box(0.04, 0.08, 0.26, dark, 0.22, -0.12, -0.54);       // top rail / sight post
  box(0.018, 0.045, 0.018, accent, 0.22, -0.09, -0.65);  // glowing front post
  box(0.06, 0.17, 0.08, dark, 0.22, -0.32, -0.36);       // grip
  box(0.05, 0.14, 0.06, dark, 0.22, -0.3, -0.55);        // magazine
  const handR = box(0.07, 0.07, 0.1, skin, 0.22, -0.29, -0.37);
  const handL = box(0.07, 0.07, 0.1, skin, 0.19, -0.24, -0.58);
  g.scale.setScalar(0.58);
  g.position.set(0.09, -0.07, -0.2);
  const muzzleRef = new THREE.Object3D();
  muzzleRef.position.set(0.24, -0.18, -0.75);
  g.add(muzzleRef);
  g.position.set(0, 0, 0);
  camera.add(g);
  viewmodel = g;
  vmParts = { body, handL, handR, muzzleRef };
  return g;
}

export function viewmodelMuzzle(out) {
  if (vmParts) return vmParts.muzzleRef.getWorldPosition(out);
  return out.set(state.player.pos.x, 1.4, state.player.pos.z);
}

export function updatePlayer(dt) {
  const p = state.player;
  if (!p) return;
  const testDrive = testScript;
  const m = testDrive ? (testScript.mouse || { dx: 0, dy: 0 }) : consumeMouse();
  if (p.alive && !state.freeze) {
    p.yaw -= m.dx * SENS;
    p.pitch -= m.dy * SENS;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  }
  // Recoil recovery pulls the view back down after shots.
  p.pitch += (p.recoil || 0) * 0.35;

  // Wish direction from keys, in yaw space.
  let f = 0, s = 0;
  if (testDrive) { const t = testDrive(p); f = t.f; s = t.s; }
  else {
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  }
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Forward is (-sin, -cos); right is (cos, -sin)... in three.js yaw space:
  const wx = -sin * f + cos * s;
  const wz = -cos * f - sin * s;
  const wl = Math.hypot(wx, wz) || 1;
  const speed = p.crouch ? 2.2 : 4.6;
  p.wishX = p.alive && !state.freeze ? (wx / wl) * (f || s ? 1 : 0) : 0;
  p.wishZ = p.alive && !state.freeze ? (wz / wl) * (f || s ? 1 : 0) : 0;
  p.wishSpeed = p.alive && !state.freeze && (f || s) ? speed : 0;
  p.crouch = !!(keys.has('ControlLeft') || keys.has('KeyC')) && p.alive;
  if ((pressed.has('Space') || (testDrive && testDrive(p).jump)) && p.alive && !state.freeze) p.wishJump = true;

  intent.use = !!keys.has('KeyE');
  intent.aim = testDrive ? false : mouse.rdown;
  const fireHeld = testDrive ? !!testDrive(p).fire : mouse.down;
  intent.fire = fireHeld;
  if (!fireHeld) p._semiReady = true;

  if (!p.alive || state.freeze) return;
  const canAct = state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED;

  // Weapon slots in CS order: 1 primary, 2 sidearm, 3 frag, 4 smoke.
  if (pressed.has('Digit1') && p.inv.primary) p.cur = 'primary';
  if (pressed.has('Digit2')) p.cur = 'sidearm';
  if (pressed.has('Digit3') && p.inv.frag > 0) p.cur = 'frag';
  if (pressed.has('Digit4') && p.inv.smoke > 0) p.cur = 'smoke';
  if (pressed.has('KeyR')) startReload(p);

  if (canAct && fireHeld) {
    if (p.cur === 'frag') { if (throwGrenade(p, 'frag')) p.cur = p.inv.primary ? 'primary' : 'sidearm'; }
    else if (p.cur === 'smoke') { if (throwGrenade(p, 'smoke')) p.cur = p.inv.primary ? 'primary' : 'sidearm'; }
    else {
      const w = currentWeapon(p);
      if (w && w.def.auto) fireWeapon(p, applyDamage);
      else if (w && p._semiReady) { if (fireWeapon(p, applyDamage)) p._semiReady = false; }
    }
  }
}

// Test hook: scripted inputs so the headless play-test can drive the
// player (advance, turn, fire) without pointer lock. The script is a
// function (player) => {f, s, jump, fire} with an optional .mouse {dx,dy}.
let testScript = null;
export function setTestScript(fn) { testScript = fn; }
function testDrive(p) { return testScript ? testScript(p) : { f: 0, s: 0, jump: false, fire: false }; }

// Pose the camera + viewmodel from the player state (render-side).
const _mv = new THREE.Vector3();
export function poseCamera(camera, dt) {
  const p = state.player;
  if (!p) return;
  const hs = Math.hypot(p.vel.x, p.vel.z);
  bobT += dt * (p.grounded ? hs * 1.6 : 0);
  if (!wasGrounded && p.grounded) landDip = 0.09;
  wasGrounded = p.grounded;
  landDip = Math.max(0, landDip - dt * 0.5);
  const bobY = Math.sin(bobT * 2) * 0.016 * Math.min(1, hs / 3);
  const eye = eyeHeight(p) - landDip;
  camera.position.set(p.pos.x, p.pos.y + eye + bobY, p.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  camera.rotation.z = Math.sin(bobT) * 0.0016 * Math.min(1, hs / 3);

  if (viewmodel) {
    const w = currentWeapon(p);
    const reloading = w && w.reloadEnd > state.time;
    const kick = (p.recoil || 0) * 1.4;
    viewmodel.position.set(
      0.09 + Math.cos(bobT) * 0.008 * Math.min(1, hs / 3),
      -0.07 + Math.sin(bobT * 2) * 0.01 * Math.min(1, hs / 3) - (reloading ? 0.09 : 0) - landDip * 0.4,
      -0.2 + kick,
    );
    viewmodel.rotation.set(reloading ? -0.7 : kick * 1.6, 0, reloading ? 0.25 : 0);
    // DMR zoom narrows the view and tucks the gun centred.
    const zooming = w && w.def.zoom && intent.aim && p.alive;
    viewmodel.position.x += zooming ? -0.24 : 0;
    viewmodel.position.y += zooming ? 0.045 : 0;
    camera.fov += ((zooming ? 34 : 74) - camera.fov) * Math.min(1, dt * 11);
    camera.updateProjectionMatrix();
    viewmodel.visible = p.alive;
  }
  void _mv;
}
