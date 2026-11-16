// bots.js — the nine bot brains. Each bot perceives on a staggered
// clock (line of sight + smoke + hearing gunfire), paths over the
// waypoint graph, fights in bursts with human-ish aim error, and plays
// the objective: escorts and a planter for the Runners; holders, a flex
// and retakes for the Wardens.

import { state, TEAM, PHASE } from './state.js';
import {
  NODES, HOLD_SPOTS, SITES, nearestNode, findPath, losBlocked, inSite, segmentBlocked2D,
} from './map.js';
import { smokeBlocks } from './fx.js';
import { fireWeapon, throwGrenade, currentWeapon, WEAPONS } from './weapons.js';
import { applyDamage } from './actors.js';

const RUN = 4.35, WALK = 3.1;

export function newBrain() {
  return {
    role: 'escort', site: 'A', path: [], pathI: 0, mode: 'advance',
    enemy: null, seenT: -99, seenPos: { x: 0, z: 0 }, hearT: -99,
    thinkT: Math.random() * 0.12, reactT: 0, burst: 0, pauseT: 0,
    strafeDir: 1, strafeT: 0, holdYaw: 0, holdSpot: null,
    scanPhase: Math.random() * 6, repathT: 0, stuckT: 0, stuckWin: 0,
    lastX: 0, lastZ: 0, threwSmoke: false, patrolFlip: false,
    liteYaw: undefined, legT: 0,
  };
}

// Round plan, called once per round by rounds.js: pick the hit site,
// assign roles, defenders take their spots.
export function planRound() {
  const atk = state.actors.filter((a) => a.team === TEAM.ATK);
  const def = state.actors.filter((a) => a.team === TEAM.DEF);
  const site = Math.random() < 0.52 ? 'A' : 'B';
  let escorts = 0;
  for (const a of atk) {
    if (!a.bot) continue;
    const b = a.brain;
    b.site = site;
    b.mode = 'advance';
    b.threwSmoke = false;
    if (state.bomb.carrier === a) b.role = 'planter';
    else if (escorts < 2) { b.role = 'escort'; escorts++; }
    else { b.role = 'flank'; b.site = site === 'A' ? 'B' : 'A'; }
    setPathTo(a, siteNode(b.site, a));
  }
  const spotsA = HOLD_SPOTS.filter((s) => s.site === 'A');
  const spotsB = HOLD_SPOTS.filter((s) => s.site === 'B');
  def.forEach((a, i) => {
    const b = a.brain;
    b.mode = 'advance';
    if (i === def.length - 1 && def.length > 4) {
      b.role = 'flex';
      b.site = 'A';
      setPathTo(a, 9);
    } else if (i % 2 === 0) {
      b.role = 'hold';
      b.site = 'A';
      b.holdSpot = spotsA[(i / 2) % spotsA.length];
      setPathTo(a, nearestNode(b.holdSpot.x, b.holdSpot.z));
    } else {
      b.role = 'hold';
      b.site = 'B';
      b.holdSpot = spotsB[((i - 1) / 2) % spotsB.length];
      setPathTo(a, nearestNode(b.holdSpot.x, b.holdSpot.z));
    }
  });
  return site;
}

function siteNode(site, a) {
  const s = SITES[site];
  return nearestNode(s.x, s.z);
}

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

// Simple bot shopping at round start: armour, then the best gun the
// wallet reaches, then utility. Defenders add a defuse kit.
export function botBuy(a) {
  const buy = (key) => {
    const def = WEAPONS[key];
    if (a.money < def.price) return false;
    a.money -= def.price;
    const w = { key, def, ammo: def.mag, reserve: def.reserve, nextOk: 0, reloadEnd: 0 };
    if (def.kind === 'pistol') a.inv.sidearm = w; else a.inv.primary = w;
    return true;
  };
  if (!a.hasArmor && a.money >= 650 && Math.random() < 0.85) {
    a.money -= 650;
    a.hasArmor = true;
    a.armorPool = 100;
  }
  if (!a.inv.primary) {
    if (a.money >= 2700) buy(Math.random() < 0.8 ? 'vk47' : 'harpoon');
    else if (a.money >= 1100) buy(Math.random() < 0.5 ? 'riptide' : 'breaker');
    else if (a.money >= 600) buy('kestrel');
  } else if ((a.inv.primary.key === 'riptide' || a.inv.primary.key === 'breaker') &&
      a.money >= 3400 && Math.random() < 0.75) {
    buy('vk47'); // trade the cheap gun up when the wallet allows
  }
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
  a.cur = a.inv.primary ? 'primary' : 'sidearm';
}

// ---- perception -------------------------------------------------------------

function canSee(a, e) {
  const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 58) return false;
  if (dist > 4.5) {
    // Field of view: 160 degrees around facing.
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    if ((dx * fx + dz * fz) / dist < -0.34) return false;
  }
  const ay = a.crouch ? 1.06 : 1.58;
  const ey = e.crouch ? 1.0 : 1.25;
  if (losBlocked(a.pos.x, ay, a.pos.z, e.pos.x, ey, e.pos.z)) return false;
  if (smokeBlocks(a.pos.x, ay, a.pos.z, e.pos.x, ey, e.pos.z)) return false;
  return true;
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
    // Hearing: recent gunfire nearby, or loud movement very close.
    if (state.time - e.lastShotT < 0.5 && d < 27) {
      if (d < bestD) { bestD = d; bestE = e; b.hearT = state.time; }
    } else if (d < 6.5 && Math.hypot(e.vel.x, e.vel.z) > 2.6 && !e.crouch) {
      if (d < bestD) { bestD = d; bestE = e; b.hearT = state.time; }
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

function faceToward(a, x, z, dt, rate = 7) {
  const want = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
  let diff = want - a.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  a.yaw += step;
  return Math.abs(diff);
}

function moveToward(a, x, z, speed) {
  const dx = x - a.pos.x, dz = z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { a.wishX = 0; a.wishZ = 0; a.wishSpeed = 0; return d; }
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

function engage(a, dt) {
  const b = a.brain, e = b.enemy;
  if (!e || !e.alive) { b.mode = 'advance'; return; }
  const fresh = state.time - b.seenT < 0.3;
  const tx = fresh ? e.pos.x : b.seenPos.x;
  const tz = fresh ? e.pos.z : b.seenPos.z;
  const dist = Math.hypot(tx - a.pos.x, tz - a.pos.z);
  const aimY = e.crouch ? 1.05 : (Math.random() < 0.22 ? 1.5 : 1.15);
  const yawErr = faceToward(a, tx, tz, dt, 8);
  const wantPitch = Math.atan2(aimY - (a.crouch ? 1.06 : 1.58), Math.max(1, dist));
  a.pitch += (wantPitch - a.pitch) * Math.min(1, dt * 10);
  b.reactT += dt;

  // Movement: strafe in bursts, close or back off to a comfort band.
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
  // Attackers close the distance while trading; defenders hold ground.
  if (a.team === TEAM.ATK && dist > 15) { mx = fx; mz = fz; }
  const ml = Math.hypot(mx, mz) || 1;
  a.wishX = mx / ml;
  a.wishZ = mz / ml;
  // Stop to shoot, strafe while breathing: accuracy is the whole game.
  a.wishSpeed = b.pauseT > 0 ? 3.2 : (a.team === TEAM.ATK && dist > 15 ? 2.7 : 0.4);

  // Fire discipline: settle, then burst, then breathe.
  if (!fresh) {
    if (state.time - b.seenT > 1.4) { b.mode = 'hunt'; setPathTo(a, nearestNode(tx, tz)); }
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

// ---- objective play ---------------------------------------------------------

function planterPlay(a, dt) {
  const b = a.brain, bomb = state.bomb;
  if (bomb.planted) { postPlant(a, dt); return; }
  const s = SITES[b.site];
  if (!inSite(a.pos.x, a.pos.z, b.site)) {
    if (followPath(a, RUN)) setPathTo(a, siteNode(b.site, a));
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
  const spot = HOLD_SPOTS.filter((s) => s.site === state.bomb.site)[a.id % 2];
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
  let diff = scan - a.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  a.yaw += diff * Math.min(1, dt * 3);
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

function retake(a, dt) {
  const bomb = state.bomb;
  const d = Math.hypot(bomb.x - a.pos.x, bomb.z - a.pos.z);
  const anyFoe = state.actors.some((e) => e.team !== a.team && e.alive &&
    Math.hypot(e.pos.x - bomb.x, e.pos.z - bomb.z) < 13 &&
    state.time - (a.brain.seenT) < 1 && a.brain.enemy === e);
  if (d > 1.7) {
    const b = a.brain;
    if (!b.path.length || b.pathI >= b.path.length) setPathTo(a, nearestNode(bomb.x, bomb.z));
    followPath(a, RUN);
    return;
  }
  stop(a);
  faceToward(a, bomb.x + 4, bomb.z + 2, dt, 4);
  if (!anyFoe) bomb.defuser = a; // rounds.js advances the channel
}

function escortPlay(a, dt) {
  const b = a.brain;
  if (state.bomb.planted) { postPlant(a, dt); return; }
  if (b.role === 'flank') {
    // Show at the wrong site, then rotate once the plant is on or late.
    if (state.phase === PHASE.PLANTED || (state.roundClock || 0) > 55) {
      b.role = 'escort';
      b.site = state.bomb.site || b.site;
      setPathTo(a, siteNode(b.site, a));
    }
    if (followPath(a, RUN)) holdPositionLite(a, dt);
    return;
  }
  const carrier = state.bomb.carrier;
  if (carrier && carrier !== a) {
    const dx = a.pos.x - carrier.pos.x, dz = a.pos.z - carrier.pos.z;
    const d = Math.hypot(dx, dz);
    // Far behind the carrier: run your own route to the site and converge
    // there, instead of queueing up behind the first firefight.
    if (d > 12) { followPath(a, RUN); return; }
    // Near the carrier: trail a few metres back, watching the flanks.
    if (d > 5) moveToward(a, carrier.pos.x - dx * 0.2, carrier.pos.z - dz * 0.2, RUN);
    else if (d < 2.2) stop(a);
    else moveToward(a, carrier.pos.x, carrier.pos.z, WALK);
    // Screen the entry before the push arrives: smoke the site mouth
    // when the carrier closes within 15 m of it.
    if (!b.threwSmoke && a.inv.smoke > 0) {
      const s = SITES[b.site];
      const cd = Math.hypot(carrier.pos.x - s.x, carrier.pos.z - s.z);
      if (cd < 15) {
        b.threwSmoke = true;
        const prev = a.cur;
        a.cur = 'smoke';
        faceToward(a, s.x, s.z, dt, 9);
        a.pitch = 0.1;
        throwGrenade(a, 'smoke');
        a.cur = prev;
      }
    }
  } else if (followPath(a, RUN)) holdPositionLite(a, dt);
}

function holdPositionLite(a, dt) {
  stop(a);
  const b = a.brain;
  if (b.liteYaw === undefined) b.liteYaw = a.yaw;
  a.yaw = b.liteYaw + Math.sin(state.time * 0.4 + b.scanPhase) * 0.5;
}

// ---- main per-bot update ------------------------------------------------------

export function updateBot(a, dt) {
  const b = a.brain;
  if (!b || !a.alive) { stop(a); return; }
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.12; perceive(a); }

  // Stuck? Measure displacement over a 0.8 s window (a single tick only
  // ever moves ~0.07 m), then repath from a walkable node.
  b.stuckWin = (b.stuckWin || 0) + dt;
  if (b.stuckWin >= 0.8) {
    const moved = Math.hypot(a.pos.x - b.lastX, a.pos.z - b.lastZ);
    if (a.wishSpeed > 0 && moved < 0.3) b.stuckT += 0.8; else b.stuckT = 0;
    b.lastX = a.pos.x;
    b.lastZ = a.pos.z;
    b.stuckWin = 0;
    if (b.stuckT >= 1.6) {
      b.stuckT = 0;
      const target = b.path.length ? b.path[b.path.length - 1] : siteNode(b.site, a);
      setPathTo(a, target);
    }
  }

  const seesNow = b.enemy && b.enemy.alive && state.time - b.seenT < 0.3;
  // The planter does not stop for a distant duel: only a close enemy
  // interrupts the push to the site.
  if (b.role === 'planter' && seesNow &&
      Math.hypot(b.enemy.pos.x - a.pos.x, b.enemy.pos.z - a.pos.z) > 16 &&
      !inSite(a.pos.x, a.pos.z, b.site)) {
    planterPlay(a, dt);
    return;
  }
  // The planter's job beats a standoff: inside the site with nobody
  // visible close, get the charge down instead of trading shots.
  const planterUrgent = b.role === 'planter' && state.bomb.carrier === a && !state.bomb.planted &&
    (inSite(a.pos.x, a.pos.z, 'A') || inSite(a.pos.x, a.pos.z, 'B')) &&
    !(seesNow && Math.hypot(b.enemy.pos.x - a.pos.x, b.enemy.pos.z - a.pos.z) < 12);
  if (planterUrgent) { planterPlay(a, dt); return; }
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

  // A frag for a remembered enemy hiding behind cover.
  if (b.enemy && state.time - b.seenT < 2 && a.inv.frag > 0 && Math.random() < 0.006) {
    const d = Math.hypot(b.seenPos.x - a.pos.x, b.seenPos.z - a.pos.z);
    if (d > 7 && d < 19) {
      faceToward(a, b.seenPos.x, b.seenPos.z, dt, 10);
      a.pitch = d > 13 ? -0.12 : 0.08;
      const prev = a.cur;
      a.cur = 'frag';
      throwGrenade(a, 'frag');
      a.cur = prev;
    }
  }

  if (a.team === TEAM.ATK) {
    if (b.role === 'planter') planterPlay(a, dt);
    else escortPlay(a, dt);
  } else defenderPlay(a, dt);
}
