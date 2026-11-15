// main.js — boot and the frame loop. The simulation runs at a fixed
// 60 Hz step from an accumulator (rendering never changes the step), so
// the game plays identically at any display rate. Rendering, HUD and
// camera posing read the state the step leaves behind.

import * as THREE from 'three';
import { state, on, emit, TICK, PHASE, TEAM } from './state.js';
import { buildTextures } from './textures.js';
import { buildWorld, SITES } from './map.js';
import { initFx, updateFx } from './fx.js';
import { initAudio, unlockAudio, setListener } from './audio.js';
import { initInput, endFrame } from './input.js';
import { initMatch, updateRounds } from './rounds.js';
import { stepMovement, animateActor } from './actors.js';
import { updateBot, newBrain } from './bots.js';
import { updatePlayer, buildViewmodel, poseCamera, setTestScript } from './player.js';
import { updateWeapon, updateGrenades, initGrenades, startReload, currentWeapon, makeWeapon } from './weapons.js';
import { applyDamage } from './actors.js';
import { initHud, updateHud } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const TEST = params.has('test');

// A seeded RNG makes staged screenshots and soak tests reproducible.
if (params.has('seed')) {
  let s = (parseInt(params.get('seed'), 10) || 1) >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvasHost = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 400);
scene.add(camera);

const tex = buildTextures();
const world = buildWorld(scene, tex);
initFx(scene);
initGrenades(scene);
buildViewmodel(camera);
initMatch(scene);
initHud();
initInput(renderer.domElement, (locked) => {
  document.getElementById('locktip').style.display = locked || SHOT || TEST ? 'none' : 'flex';
  if (locked) unlockAudio();
});
if (SHOT || TEST) document.getElementById('locktip').style.display = 'none';
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- simulation step ---------------------------------------------------------

function step(dt) {
  state.time += dt;
  updatePlayer(dt);
  const active = !state.freeze && (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED);
  for (const a of state.actors) {
    if (a.bot && a.alive && active) updateBot(a, dt);
    else if (a.bot) { a.wishSpeed = 0; a.wishX = 0; a.wishZ = 0; }
  }
  if (TEST && state.player.brain) updateBot(state.player, dt);
  for (const a of state.actors) {
    if (a.alive) {
      stepMovement(a, dt);
      updateWeapon(a);
      const w = currentWeapon(a);
      if (w && w.ammo === 0 && w.reloadEnd === 0) startReload(a);
    }
  }
  updateGrenades(dt, applyDamage);
  updateRounds(dt);
}

// ---- test + staging hooks ------------------------------------------------------

const testlog = [];
let killCount = 0, plantCount = 0;
const stats = { kills: 0, headKills: 0, shots: 0, plants: 0, defuses: 0, roundsEnded: 0, lastWhy: '' };
if (TEST) {
  state.player.brain = newBrain();
  state.player.brain.role = 'escort';
  on('kill', (e) => { killCount++; stats.kills++; if (e.head) stats.headKills++; });
  on('hit', () => { stats.hits = (stats.hits || 0) + 1; });
  on('planted', () => { plantCount++; stats.plants++; });
  on('shot', () => stats.shots++);
  on('defused', () => stats.defuses++);
  on('roundend', (e) => { stats.roundsEnded++; stats.lastWhy = e.why; stats.whys = stats.whys || {}; stats.whys[e.why] = (stats.whys[e.why] || 0) + 1; });
  window.__stats = stats;
  let lastLog = 0, lastTrail = 0;
  stats.trail = [];
  setInterval(() => {
    stats.maxPlantT = Math.max(stats.maxPlantT || 0, state.bomb.plantT);
    const c = state.bomb.carrier;
    stats.carrier = c ? { name: c.name, role: c.brain && c.brain.role, site: c.brain && c.brain.site, x: Math.round(c.pos.x), z: Math.round(c.pos.z), alive: c.alive } : null;
    if (c && state.time - lastTrail >= 8 && stats.trail.length < 60) {
      lastTrail = state.time;
      stats.trail.push(`${Math.round(state.time)}:${c.name}@${Math.round(c.pos.x)},${Math.round(c.pos.z)}${c.alive ? '' : ' DEAD'} r${state.round} ${state.phase}`);
    }
    if (state.time - lastLog >= 5) {
      lastLog = state.time;
      testlog.push({
        t: Math.round(state.time), phase: state.phase, round: state.round,
        score: [...state.score], kills: killCount, plants: plantCount,
        money: state.player.money,
      });
    }
  }, 250);
  window.__game = { state, testlog, emit };
  window.__testReady = true;
}

function stageShot() {
  const p = state.player;
  state.phase = PHASE.LIVE; state.phaseT = 92; state.freeze = false;
  const give = (a, x, z, yaw) => { a.pos.set(x, 0, z); a.yaw = yaw; a.vel.set(0, 0, 0); };
  const def = state.actors.filter((a) => a.team === TEAM.DEF);
  const atk = state.actors.filter((a) => a.team === TEAM.ATK && a.bot);
  if (SHOT === 'start') {
    give(p, -42, 1, -Math.PI / 2);
    give(atk[0], -40, -2, -Math.PI / 2);
    give(atk[1], -39, 4, -Math.PI / 2);
  } else if (SHOT === 'play') {
    give(p, -10, -13, -Math.PI / 2);
    p.inv.primary = makeWeapon('vk47');
    p.cur = 'primary';
    give(def[0], 6, -12.5, Math.PI / 2);
    def[0].brain.enemy = p; def[0].brain.seenT = state.time;
    give(atk[0], -5, -9, -Math.PI / 2);
    setTestScript(() => ({ f: 0, s: 0, jump: false, fire: state.tick % 50 < 26 }));
  } else if (SHOT === 'fight') {
    give(p, 27, -23.5, -Math.PI / 2);
    give(def[1], 35, -19.5, Math.PI / 2);
    def[1].brain.enemy = p; def[1].brain.seenT = state.time;
    give(atk[1], 23, -20, -Math.PI / 2);
    give(def[2], 40, -24, Math.PI);
    setTestScript(() => ({ f: 0, s: 0, jump: false, fire: state.tick % 44 < 20 }));
  } else if (SHOT === 'end') {
    give(p, 28, -23, -Math.PI / 2);
    state.score = [6, 4]; state.round = 11;
    window.__forceScore = true;
    emit('roundwin', { won: true, winner: 0, why: 'elimination' });
  }
  window.__staged = true;
}
if (SHOT) setTimeout(stageShot, 350);

// ---- frame loop ------------------------------------------------------------------

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const scale = TEST ? 12 : (state.slowmo || 1);
  acc += dt * scale;
  let guard = 0;
  const maxSteps = TEST ? 400 : 40;
  while (acc >= TICK && guard < maxSteps) {
    step(TICK);
    state.tick++;
    acc -= TICK;
    guard++;
  }
  if (guard >= maxSteps) acc = 0;
  frameCount++;
  if (TEST && frameCount % 8 !== 0) { endFrame(); return; } // soak tests: render sparsely
  for (const a of state.actors) animateActor(a);
  if (state.player && !state.player.alive) poseSpectator();
  else poseCamera(camera, dt);
  world.update(dt);
  updateFx(dt);
  if (state.player) setListener(state.player.pos.x, state.player.pos.z, state.player.yaw);
  updateHud();
  endFrame();
  renderer.render(scene, camera);
}
let frameCount = 0;

// After death: watch from the first living teammate's shoulder.
function poseSpectator() {
  const mate = state.actors.find((a) => a.team === state.player.team && a.alive && a.bot);
  if (mate) {
    camera.position.set(mate.pos.x, mate.pos.y + 1.58, mate.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = mate.yaw; camera.rotation.x = mate.pitch;
  } else {
    camera.position.set(0, 42, 34);
    camera.lookAt(0, 0, 0);
  }
}

requestAnimationFrame(frame);
