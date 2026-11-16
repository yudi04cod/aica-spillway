// bots.js — the nine bot brains, as an explicit little state machine.
//
// Each bot perceives on a staggered clock (line of sight + smoke +
// hearing gunfire), paths over the waypoint graph, fights in bursts with
// human-ish aim error, and plays the objective: escorts and a planter
// for the Runners; holders, a flex and retakes for the Wardens.
//
// Modes: 'advance' (follow the round plan), 'engage' (a visible enemy),
// 'hunt' (push a last-seen position after losing sight).

import { state, TEAM, PHASE } from './state.js';
import {
  NODES, HOLD_SPOTS, SITES, nearestNode, findPath, losBlocked, inSite, segmentBlocked2D,
} from './map.js';
import { smokeBlocks } from './fx.js';
import { fireWeapon, throwGrenade, currentWeapon, WEAPONS } from './weapons.js';
import { applyDamage } from './actors.js';

const RUN = 4.35, WALK = 3.1;
const PERCEIVE_EVERY = 0.12; // seconds between perception ticks
const STUCK_WINDOW = 0.8, STUCK_LIMIT = 1.6, STUCK_SLIDE = 0.3;

export function newBrain() {
  return {
    role: 'escort', site: 'A', path: [], pathI: 0, mode: 'advance',
    enemy: null, seenT: -99, seenPos: { x: 0, z: 0 }, hearT: -99,
    thinkT: Math.random() * PERCEIVE_EVERY, reactT: 0, burst: 0, pauseT: 0,
    strafeDir: 1, strafeT: 0, holdYaw: 0, holdSpot: null,
    scanPhase: Math.random() * 6, repathT: 0, stuckT: 0, stuckWin: 0,
    lastX: 0, lastZ: 0, threwSmoke: false, patrolFlip: false,
    liteYaw: undefined, legT: 0,
  };
}

// ---- round plan -------------------------------------------------------------

function siteNode(site) {
  const s = SITES[site];
  return nearestNode(s.x, s.z);
}

function assignAttackPlan(atk, site) {
  let escorts = 0;
  for (const a of atk) {
    if (!a.bot) continue;
    const b = a.brain;
    b.site = site;
    b.mode = 'advance';
    b.threwSmoke = false;
    if (state.bomb.carrier === a) {
      b.role = 'planter';
    } else if (escorts < 2) {
      b.role = 'escort';
      escorts++;
    } else {
      // The rest show at the wrong site, then rotate once the plant is on.
      b.role = 'flank';
      b.site = site === 'A' ? 'B' : 'A';
    }
    setPathTo(a, siteNode(b.site));
  }
}

function assignDefensePlan(def) {
  const spotsA = HOLD_SPOTS.filter((s) => s.site === 'A');
  const spotsB = HOLD_SPOTS.filter((s) => s.site === 'B');
  def.forEach((a, i) => {
    const b = a.brain;
    b.mode = 'advance';
    if (i === def.length - 1 && def.length > 4) {
      b.role = 'flex';
      b.site = 'A';
      setPathTo(a, 9);
      return;
    }
    const isA = i % 2 === 0;
    const spots = isA ? spotsA : spotsB;
    const spotIndex = isA ? (i / 2) % spotsA.length : ((i - 1) / 2) % spotsB.length;
    b.role = 'hold';
    b.site = isA ? 'A' : 'B';
    b.holdSpot = spots[spotIndex];
    setPathTo(a, nearestNode(b.holdSpot.x, b.holdSpot.z));
  });
}

// Round plan, called once per round by rounds.js: pick the hit site,
// assign roles, defenders take their spots.
export function planRound() {
  const atk = state.actors.filter((a) => a.team === TEAM.ATK);
  const def = state.actors.filter((a) => a.team === TEAM.DEF);
  const site = Math.random() < 0.52 ? 'A' : 'B';
  assignAttackPlan(atk, site);
  assignDefensePlan(def);
  return site;
}

// ---- pathing ---------------------------------------------------------------

// The nearest waypoint a bot can actually walk to in a straight line —
// plain nearest can sit across a barrier and pin the bot against it.
export function nearestClearNode(x, z) {
  const order = NODES.map((n, i) => [Math.hypot(n[0] - x, n[1] - z), i])
    .sort((p, q) => p[0] - q[0]);
  for (const [, i] of order) {
    if (!segmentBlocked2D(x, z, NODES[i][0], NODES[i][1])) return i;
  }
  return order[0][1];
}

export function setPathTo(a, nodeIdx) {
  const b = a.brain;
  const from = nearestClearNode(a.pos.x, a.pos.z);
  b.path = findPath(from, nodeIdx);
  // Walk to the clear node first unless we are already standing on it.
  const d0 = Math.hypot(NODES[from][0] - a.pos.x, NODES[from][1] - a.pos.z);
  b.pathI = b.path.length > 1 && d0 < 1.2 ? 1 : 0;
  b.liteYaw = undefined;
  b.legT = 0;
}

// ---- shopping ---------------------------------------------------------------

// Simple bot shopping at round start: armour, then the best gun the
// wallet reaches, then utility. Defenders add a defuse kit.
function tryBuyWeapon(a, key) {
  const def = WEAPONS[key];
  if (a.money < def.price) return false;
  a.money -= def.price;
  const w = { key, def, ammo: def.mag, reserve: def.reserve, nextOk: 0, reloadEnd: 0 };
  if (def.kind === 'pistol') a.inv.sidearm = w; else a.inv.primary = w;
  return true;
}

function tryBuyArmor(a) {
  if (a.hasArmor || a.money < 650 || Math.random() >= 0.85) return;
  a.money -= 650;
  a.hasArmor = true;
  a.armorPool = 100;
}

function tryBuyUtility(a) {
  if (a.team === TEAM.DEF && !a.kit && a.money >= 400) {
    a.money -= 400;
    a.kit = true;
  }
  if (a.inv.frag === 0 && a.money >= 900 && Math.random() < 0.5) {
    a.money -= 300;
    a.inv.frag = 1;
  }
  if (a.inv.smoke === 0 && a.money >= 900 && Math.random() < 0.4) {
    a.money -= 300;
    a.inv.smoke = 1;
  }
}

export function botBuy(a) {
  tryBuyArmor(a);
  if (!a.inv.primary) {
    if (a.money >= 2700) tryBuyWeapon(a, Math.random() < 0.8 ? 'vk47' : 'harpoon');
    else if (a.money >= 1100) tryBuyWeapon(a, Math.random() < 0.5 ? 'riptide' : 'breaker');
    else if (a.money >= 600) tryBuyWeapon(a, 'kestrel');
  } else if ((a.inv.primary.key === 'riptide' || a.inv.primary.key === 'breaker') &&
      a.money >= 3400 && Math.random() < 0.75) {
    tryBuyWeapon(a, 'vk47'); // trade the cheap gun up when the wallet allows
  }
  tryBuyUtility(a);
  a.cur = a.inv.primary ? 'primary' : 'sidearm';
}

// ---- perception -------------------------------------------------------------

function inSightCone(a, dx, dz, dist) {
  if (dist <= 4.5) return true; // point blank: no cone check
  // Field of view: 160 degrees around facing.
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  return (dx * fx + dz * fz) / dist >= -0.34;
}

function eyeLevel(a) { return a.crouch ? 1.06 : 1.58; }
function targetHeight(e) { return e.crouch ? 1.0 : 1.25; }

function canSee(a, e) {
  const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 58) return false;
  if (!inSightCone(a, dx, dz, dist)) return false;
  const ay = eyeLevel(a), ey = targetHeight(e);
  if (losBlocked(a.pos.x, ay, a.pos.z, e.pos.x, ey, e.pos.z)) return false;
  if (smokeBlocks(a.pos.x, ay, a.pos.z, e.pos.x, ey, e.pos.z)) return false;
  return true;
}

// Hearing: recent gunfire nearby, or loud movement very close.
function heard(a, e, d) {
  if (state.time - e.lastShotT < 0.5 && d < 27) return true;
  return d < 6.5 && Math.hypot(e.vel.x, e.vel.z) > 2.6 && !e.crouch;
}

function perceive(a) {
  const b = a.brain;
  let bestE = null, bestD = Infinity;
  for (const e of state.actors) {
    if (e.team === a.team || !e.alive) continue;
    const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
    if (canSee(a, e)) {
      if (d < bestD) { bestD = d; bestE = e; }
      continue;
    }
    if (heard(a, e, d) && d < bestD) {
      bestD = d;
      bestE = e;
      b.hearT = state.time;
    }
  }
  if (bestE) {
    if (b.enemy !== bestE) b.reactT = 0;
    b.enemy = bestE;
    b.seenT = state.time;
    b.seenPos.x = bestE.pos.x;
    b.seenPos.z = bestE.pos.z;
  }
}

// ---- steering ---------------------------------------------------------------

function angleDiff(want, have) {
  let diff = want - have;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function faceToward(a, x, z, dt, rate = 7) {
  const want = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
  const diff = angleDiff(want, a.yaw);
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  a.yaw += step;
  return Math.abs(diff);
}

function moveToward(a, x, z, speed) {
  const dx = x - a.pos.x, dz = z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { stop(a); return d; }
  a.wishX = dx / d;
  a.wishZ = dz / d;
  a.wishSpeed = speed;
  return d;
}

function stop(a) { a.wishX = 0; a.wishZ = 0; a.wishSpeed = 0; }

// Follow the waypoint path; returns true on arrival at the final node.
function followPath(a, speed) {
  const b = a.brain;
  if (b.pathI >= b.path.length) { stop(a); return true; }
  const [nx, nz] = NODES[b.path[b.pathI]];
  // Convex corners are slid around by the body solver; long walls are
  // handled by the stuck detector repathing via a walkable node.
  const d = moveToward(a, nx, nz, speed);
  faceToward(a, nx, nz, 1 / 60, 5);
  if (d < 1.25) {
    b.pathI++;
    if (b.pathI >= b.path.length) { stop(a); return true; }
  }
  return false;
}

// ---- combat -----------------------------------------------------------------

// Aim the body and the pitch at the target (live position while the
// sighting is fresh, last-seen position once it goes stale). Returns
// the yaw error and the distance, for the fire discipline below.
function trackTarget(a, dt) {
  const b = a.brain, e = b.enemy;
  const fresh = state.time - b.seenT < 0.3;
  const tx = fresh ? e.pos.x : b.seenPos.x;
  const tz = fresh ? e.pos.z : b.seenPos.z;
  const dist = Math.hypot(tx - a.pos.x, tz - a.pos.z);
  const aimY = e.crouch ? 1.05 : (Math.random() < 0.22 ? 1.5 : 1.15);
  const yawErr = faceToward(a, tx, tz, dt, 8);
  const wantPitch = Math.atan2(aimY - eyeLevel(a), Math.max(1, dist));
  a.pitch += (wantPitch - a.pitch) * Math.min(1, dt * 10);
  return { yawErr, dist, fresh, tx, tz };
}

// Movement during a fight: strafe in bursts, close or back off to a
// comfort band. Attackers close the distance while trading; defenders
// hold ground. Returns the speed to move at.
function strafeMove(a, dt, dist) {
  const b = a.brain;
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = 0.6 + Math.random() * 0.9;
    b.strafeDir = Math.random() < 0.5 ? -1 : 1;
    a.crouch = dist > 15 && Math.random() < 0.35; // settle behind range fights
  }
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  let mx = -fz * b.strafeDir, mz = fx * b.strafeDir;
  if (dist > 26) { mx += fx * 0.8; mz += fz * 0.8; }
  else if (dist < 7) { mx -= fx * 0.7; mz -= fz * 0.7; }
  if (a.team === TEAM.ATK && dist > 15) { mx = fx; mz = fz; }
  const ml = Math.hypot(mx, mz) || 1;
  a.wishX = mx / ml;
  a.wishZ = mz / ml;
  // Stop to shoot, strafe while breathing: accuracy is the whole game.
  return b.pauseT > 0 ? 3.2 : (a.team === TEAM.ATK && dist > 15 ? 2.7 : 0.4);
}

// Fire discipline: settle, then burst, then breathe.
function fireDiscipline(a, dt, yawErr, fresh) {
  const b = a.brain;
  if (!fresh) {
    if (state.time - b.seenT > 1.4) {
      b.mode = 'hunt';
      setPathTo(a, nearestNode(b.seenPos.x, b.seenPos.z));
    }
    return;
  }
  if (b.reactT < 0.24 + (a.id % 4) * 0.05) return;
  if (b.pauseT > 0) { b.pauseT -= dt; return; }
  if (yawErr > 0.09) return;
  const w = currentWeapon(a);
  if (!w) return;
  if (w.ammo === 0) return; // reload handled in the main loop
  if (fireWeapon(a, applyDamage)) {
    b.burst++;
    const burstLen = w.def.auto ? 3 + (a.id % 3) : 1;
    if (b.burst >= burstLen) {
      b.burst = 0;
      b.pauseT = 0.22 + Math.random() * 0.3;
    }
  }
}

function engage(a, dt) {
  const b = a.brain, e = b.enemy;
  if (!e || !e.alive) { b.mode = 'advance'; return; }
  const { yawErr, dist, fresh } = trackTarget(a, dt);
  a.wishSpeed = strafeMove(a, dt, dist);
  b.reactT += dt;
  fireDiscipline(a, dt, yawErr, fresh);
}

// ---- objective play ---------------------------------------------------------

function postPlantSpot(a) {
  const spots = HOLD_SPOTS.filter((s) => s.site === state.bomb.site);
  return spots[a.id % 2];
}

function planterPlay(a, dt) {
  const b = a.brain, bomb = state.bomb;
  if (bomb.planted) { postPlant(a, dt); return; }
  const s = SITES[b.site];
  if (!inSite(a.pos.x, a.pos.z, b.site)) {
    if (followPath(a, RUN)) setPathTo(a, siteNode(b.site));
    return;
  }
  // In the site: walk to a covered plant spot near the site centre.
  const d = moveToward(a, s.x - 1.5, s.z + 1, WALK);
  if (d > 0.7) return;
  stop(a);
  faceToward(a, s.x + 6, s.z, dt, 4);
  bomb.plantingBy = a; // rounds.js advances the channel
}

function postPlant(a, dt) {
  const b = a.brain;
  const spot = postPlantSpot(a);
  if (!b.holdSpot || b.holdSpot !== spot) {
    b.holdSpot = spot;
    setPathTo(a, nearestNode(spot.x, spot.z));
  }
  if (followPath(a, RUN)) holdPosition(a, dt);
}

function holdPosition(a, dt) {
  const b = a.brain, spot = b.holdSpot;
  if (!spot) { stop(a); return; }
  const d = Math.hypot(spot.x - a.pos.x, spot.z - a.pos.z);
  if (d > 0.8) { moveToward(a, spot.x, spot.z, WALK); return; }
  stop(a);
  const scan = spot.yaw + Math.sin(state.time * 0.45 + b.scanPhase) * 0.55;
  a.yaw += angleDiff(scan, a.yaw) * Math.min(1, dt * 3);
  a.crouch = spot.site === 'A';
}

function defenderPlay(a, dt) {
  const b = a.brain, bomb = state.bomb;
  if (bomb.planted) {
    if (bomb.site === b.site || b.role !== 'hold') { retake(a, dt); return; }
    holdPosition(a, dt);
    return;
  }
  if (b.role === 'flex') {
    // Patrol control room <-> apron; flip at each end.
    const target = b.patrolFlip ? 23 : 9;
    if (followPath(a, WALK)) {
      b.patrolFlip = !b.patrolFlip;
      setPathTo(a, b.patrolFlip ? 23 : 9);
    }
    return;
  }
  if (followPath(a, RUN) || !b.path.length) holdPosition(a, dt);
}

function foeNearBomb(a) {
  const bomb = state.bomb, b = a.brain;
  return state.actors.some((e) => e.team !== a.team && e.alive &&
    Math.hypot(e.pos.x - bomb.x, e.pos.z - bomb.z) < 13 &&
    state.time - b.seenT < 1 && b.enemy === e);
}

function retake(a, dt) {
  const bomb = state.bomb;
  const d = Math.hypot(bomb.x - a.pos.x, bomb.z - a.pos.z);
  if (d > 1.7) {
    const b = a.brain;
    if (!b.path.length || b.pathI >= b.path.length) setPathTo(a, nearestNode(bomb.x, bomb.z));
    followPath(a, RUN);
    return;
  }
  stop(a);
  faceToward(a, bomb.x + 4, bomb.z + 2, dt, 4);
  if (!foeNearBomb(a)) bomb.defuser = a; // rounds.js advances the channel
}

function throwSmokeAtSite(a, dt) {
  const b = a.brain;
  const carrier = state.bomb.carrier;
  if (b.threwSmoke || a.inv.smoke <= 0 || !carrier) return;
  const s = SITES[b.site];
  const cd = Math.hypot(carrier.pos.x - s.x, carrier.pos.z - s.z);
  if (cd >= 15) return; // screen the entry before the push arrives
  b.threwSmoke = true;
  const prev = a.cur;
  a.cur = 'smoke';
  faceToward(a, s.x, s.z, dt, 9);
  a.pitch = 0.1;
  throwGrenade(a, 'smoke');
  a.cur = prev;
}

function escortPlay(a, dt) {
  const b = a.brain;
  if (state.bomb.planted) { postPlant(a, dt); return; }
  if (b.role === 'flank') {
    // Show at the wrong site, then rotate once the plant is on or late.
    if (state.phase === PHASE.PLANTED || (state.roundClock || 0) > 55) {
      b.role = 'escort';
      b.site = state.bomb.site || b.site;
      setPathTo(a, siteNode(b.site));
    }
    if (followPath(a, RUN)) holdPositionLite(a, dt);
    return;
  }
  const carrier = state.bomb.carrier;
  if (carrier && carrier !== a) {
    const dx = a.pos.x - carrier.pos.x, dz = a.pos.z - carrier.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 12) {
      // Far behind the carrier: run your own route to the site and
      // converge there, instead of queueing up behind the first fight.
      followPath(a, RUN);
    } else if (d > 5) {
      // Near the carrier: trail a few metres back, watching the flanks.
      moveToward(a, carrier.pos.x - dx * 0.2, carrier.pos.z - dz * 0.2, RUN);
    } else if (d < 2.2) {
      stop(a);
    } else {
      moveToward(a, carrier.pos.x, carrier.pos.z, WALK);
    }
    throwSmokeAtSite(a, dt);
  } else if (followPath(a, RUN)) {
    holdPositionLite(a, dt);
  }
}

function holdPositionLite(a, dt) {
  stop(a);
  const b = a.brain;
  if (b.liteYaw === undefined) b.liteYaw = a.yaw;
  a.yaw = b.liteYaw + Math.sin(state.time * 0.4 + b.scanPhase) * 0.5;
}

// ---- main per-bot update ------------------------------------------------------

function tickStuckDetector(a, dt) {
  const b = a.brain;
  b.stuckWin = (b.stuckWin || 0) + dt;
  if (b.stuckWin < STUCK_WINDOW) return;
  // Measure displacement over a 0.8 s window (a single tick only ever
  // moves ~0.07 m), then repath from a walkable node.
  const moved = Math.hypot(a.pos.x - b.lastX, a.pos.z - b.lastZ);
  if (a.wishSpeed > 0 && moved < STUCK_SLIDE) b.stuckT += STUCK_WINDOW; else b.stuckT = 0;
  b.lastX = a.pos.x;
  b.lastZ = a.pos.z;
  b.stuckWin = 0;
  if (b.stuckT >= STUCK_LIMIT) {
    b.stuckT = 0;
    const target = b.path.length ? b.path[b.path.length - 1] : siteNode(b.site);
    setPathTo(a, target);
  }
}

function distTo(a, e) {
  return Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
}

function planterShouldPush(a) {
  const b = a.brain;
  if (b.role !== 'planter' || state.bomb.carrier !== a || state.bomb.planted) return false;
  const inAnySite = inSite(a.pos.x, a.pos.z, 'A') || inSite(a.pos.x, a.pos.z, 'B');
  if (!inAnySite) return false;
  const seesClose = b.enemy && b.enemy.alive && state.time - b.seenT < 0.3 &&
    distTo(a, b.enemy) < 12;
  return !seesClose;
}

function tryTossFrag(a, dt) {
  const b = a.brain;
  if (!b.enemy || state.time - b.seenT >= 2 || a.inv.frag <= 0) return;
  if (Math.random() >= 0.006) return; // a frag for a remembered enemy hiding behind cover
  const d = Math.hypot(b.seenPos.x - a.pos.x, b.seenPos.z - a.pos.z);
  if (d <= 7 || d >= 19) return;
  faceToward(a, b.seenPos.x, b.seenPos.z, dt, 10);
  a.pitch = d > 13 ? -0.12 : 0.08;
  const prev = a.cur;
  a.cur = 'frag';
  throwGrenade(a, 'frag');
  a.cur = prev;
}

export function updateBot(a, dt) {
  const b = a.brain;
  if (!b || !a.alive) { stop(a); return; }
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = PERCEIVE_EVERY; perceive(a); }
  tickStuckDetector(a, dt);

  const seesNow = b.enemy && b.enemy.alive && state.time - b.seenT < 0.3;
  // The planter does not stop for a distant duel: only a close enemy
  // interrupts the push to the site.
  if (b.role === 'planter' && seesNow && distTo(a, b.enemy) > 16 &&
      !inSite(a.pos.x, a.pos.z, b.site)) {
    planterPlay(a, dt);
    return;
  }
  // The planter's job beats a standoff: inside the site with nobody
  // visible close, get the charge down instead of trading shots.
  if (planterShouldPush(a)) { planterPlay(a, dt); return; }
  if (seesNow || (b.enemy && b.enemy.alive && state.time - b.seenT < 1.4 && b.mode === 'engage')) {
    b.mode = 'engage';
    engage(a, dt);
    return;
  }
  if (b.mode === 'hunt') {
    if (followPath(a, RUN)) b.mode = 'advance';
    return;
  }
  b.mode = 'advance';
  a.crouch = false;
  tryTossFrag(a, dt);

  if (a.team === TEAM.ATK) {
    if (b.role === 'planter') planterPlay(a, dt);
    else escortPlay(a, dt);
  } else defenderPlay(a, dt);
}
