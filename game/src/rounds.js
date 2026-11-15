// rounds.js — the match: buy phase, live rounds, the breach charge
// (plant / defuse / detonate), elimination and time wins, and the money
// that flows between them. First side to 7 rounds takes the match.

import { state, emit, on, TEAM, PHASE, RULES, resetBomb, aliveCount } from './state.js';
import { SPAWNS, SITES, inSite } from './map.js';
import { createActor, resetActorForRound, BOT_NAMES, PLAYER_NAME } from './actors.js';
import { makeWeapon } from './weapons.js';
import { planRound, botBuy, newBrain } from './bots.js';
import { clearGrenades } from './weapons.js';
import { clearTransientFx } from './fx.js';
import { intent } from './input.js';

let beepAcc = 0;

export function initMatch(scene) {
  const atkYaw = -Math.PI / 2; // face east, into the dam
  const defYaw = Math.PI / 2;
  const player = createActor(TEAM.ATK, true, PLAYER_NAME, ...SPAWNS.atk[0], atkYaw);
  state.player = player;
  state.actors.push(player);
  BOT_NAMES[0].forEach((name, i) => {
    const a = createActor(TEAM.ATK, false, name, ...SPAWNS.atk[i + 1], atkYaw);
    a.brain = newBrain(); state.actors.push(a); scene.add(a.mesh);
  });
  BOT_NAMES[1].forEach((name, i) => {
    const a = createActor(TEAM.DEF, false, name, ...SPAWNS.def[i], defYaw);
    a.brain = newBrain(); state.actors.push(a); scene.add(a.mesh);
  });
  for (const a of state.actors) a.money = RULES.startMoney;
  on('kill', (e) => {
    if (e.killer && e.killer.team !== e.victim.team) {
      e.killer.money = Math.min(RULES.maxMoney, e.killer.money + RULES.killPay);
    }
    if (state.bomb.carrier === e.victim) transferCharge();
  });
  startRound();
}

function transferCharge() {
  const alive = state.actors.filter((a) => a.team === TEAM.ATK && a.alive);
  if (!alive.length) { state.bomb.carrier = null; return; }
  alive.sort((x, y) => x.bot === y.bot ? 0 : x.bot ? -1 : 1); // bots first: they plant reliably
  const next = alive[Math.floor(Math.random() * Math.min(2, alive.length))];
  state.bomb.carrier = next;
  if (next.bot) { next.brain.role = 'planter'; next.brain.site = next.brain.site || 'A'; }
  emit('chargedrop', { name: next.name });
}

function startRound() {
  clearGrenades();
  clearTransientFx();
  resetBomb();
  state.roundClock = 0;
  const atkYaw = -Math.PI / 2, defYaw = Math.PI / 2;
  state.actors.forEach((a, i) => {
    const spawn = a.team === TEAM.ATK ? SPAWNS.atk[i % 5] : SPAWNS.def[state.actors.filter((x) => x.team === TEAM.DEF).indexOf(a)];
    const wasDead = !a.alive;
    resetActorForRound(a, spawn[0], spawn[1], a.team === TEAM.ATK ? atkYaw : defYaw);
    if (wasDead) {
      // Death costs the loadout: back to a sidearm and no utility.
      a.inv.primary = null; a.inv.sidearm = makeWeapon('p9');
      a.inv.frag = 0; a.inv.smoke = 0; a.hasArmor = false; a.armorPool = 0; a.kit = false;
    }
    a.cur = a.inv.primary ? 'primary' : 'sidearm';
    if (a.bot) { a.brain = Object.assign(a.brain || newBrain(), newBrain()); botBuy(a); }
  });
  // The charge starts with a random Runner (bot preferred as planter).
  const atkBots = state.actors.filter((a) => a.team === TEAM.ATK && a.bot);
  state.bomb.carrier = atkBots[Math.floor(Math.random() * atkBots.length)];
  const site = planRound();
  if (state.bomb.carrier) state.bomb.carrier.brain.site = site;
  state.phase = PHASE.BUY;
  state.phaseT = RULES.buySeconds;
  state.freeze = true;
  emit('roundstart', { round: state.round, site });
}

function endRound(winner, why) {
  state.phase = PHASE.OVER;
  state.phaseT = RULES.overSeconds;
  state.score[winner]++;
  state.lastRoundWinner = winner;
  state.lastRoundWhy = why;
  for (const a of state.actors) {
    let pay = a.team === winner ? RULES.winPay : RULES.lossPay;
    if (why === 'detonate' && a.team === TEAM.ATK) pay += RULES.detonateBonus;
    a.money = Math.min(RULES.maxMoney, a.money + pay);
  }
  emit('roundwin', { won: winner === state.player.team, winner, why });
  emit('roundend', { winner, why });
}

function plantCharge(planter, site) {
  const b = state.bomb;
  b.planted = true; b.site = site; b.planter = planter;
  b.x = planter.pos.x; b.z = planter.pos.z;
  b.timer = RULES.bombSeconds; b.defuseT = 0; b.defuser = null;
  state.phase = PHASE.PLANTED;
  planter.money = Math.min(RULES.maxMoney, planter.money + RULES.plantBonus);
  for (const a of state.actors) if (a.team === TEAM.ATK) a.money = Math.min(RULES.maxMoney, a.money + RULES.plantTeamPay);
  emit('planted', { x: b.x, z: b.z, site });
}

export function updateRounds(dt) {
  const b = state.bomb;
  state.phaseT -= dt;
  if (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) state.roundClock += dt;

  if (state.phase === PHASE.BUY) {
    if (state.phaseT <= 0) { state.phase = PHASE.LIVE; state.phaseT = RULES.roundSeconds; state.freeze = false; }
    return;
  }

  if (state.phase === PHASE.LIVE) {
    // Plant channel: the carrier (bot via brain, player via E) holds still
    // inside a site.
    let planter = b.plantingBy;
    if (!planter && state.player.alive && b.carrier === state.player && intent.use) {
      if (inSite(state.player.pos.x, state.player.pos.z, 'A')) planter = state.player;
      else if (inSite(state.player.pos.x, state.player.pos.z, 'B')) planter = state.player;
    }
    if (planter && planter.alive && planter === b.carrier) {
      const site = inSite(planter.pos.x, planter.pos.z, 'A') ? 'A' : inSite(planter.pos.x, planter.pos.z, 'B') ? 'B' : null;
      if (site) {
        b.plantT += dt;
        if (Math.floor(b.plantT * 4) !== Math.floor((b.plantT - dt) * 4)) emit('planttick', { x: planter.pos.x, z: planter.pos.z });
        if (b.plantT >= RULES.plantSeconds) { plantCharge(planter, site); b.plantT = 0; }
      } else b.plantT = Math.max(0, b.plantT - dt * 2);
    } else b.plantT = Math.max(0, b.plantT - dt * 2);
    b.plantingBy = null;

    if (state.phase !== PHASE.LIVE) return; // just planted
    if (aliveCount(TEAM.ATK) === 0) return endRound(TEAM.DEF, 'elimination');
    if (aliveCount(TEAM.DEF) === 0) return endRound(TEAM.ATK, 'elimination');
    if (state.phaseT <= 0) return endRound(TEAM.DEF, 'time');
    return;
  }

  if (state.phase === PHASE.PLANTED) {
    b.timer -= dt;
    // The beep quickens as the fuse burns down.
    const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : 0.25;
    beepAcc += dt;
    if (beepAcc >= interval) { beepAcc = 0; emit('bombtick', { x: b.x, z: b.z, fast: b.timer <= 10 }); }
    // Defuse channel.
    const defuser = b.defuser;
    if (defuser && defuser.alive && Math.hypot(defuser.pos.x - b.x, defuser.pos.z - b.z) < 2.2) {
      if (!b.defuseNeed) b.defuseNeed = defuser.kit ? RULES.defuseKitSeconds : RULES.defuseSeconds;
      b.defuseT += dt;
      if (b.defuseT >= b.defuseNeed) {
        b.defuseNeed = 0;
        emit('defused', { x: b.x, z: b.z });
        return endRound(TEAM.DEF, 'defuse');
      }
    } else { b.defuseT = Math.max(0, b.defuseT - dt * 2); b.defuseNeed = 0; }
    b.defuser = null;
    if (aliveCount(TEAM.DEF) === 0) return endRound(TEAM.ATK, 'elimination');
    if (b.timer <= 0) {
      emit('explode', { x: b.x, z: b.z, big: true });
      return endRound(TEAM.ATK, 'detonate');
    }
    return;
  }

  if (state.phase === PHASE.OVER) {
    if (state.phaseT <= 0) {
      if (state.score[0] >= RULES.roundsToWin || state.score[1] >= RULES.roundsToWin) {
        state.matchWinner = state.score[0] > state.score[1] ? 0 : 1;
        state.phase = PHASE.MATCH;
        state.phaseT = RULES.matchSeconds;
        emit('matchwin', { winner: state.matchWinner });
      } else {
        state.round++;
        startRound();
      }
    }
    return;
  }

  if (state.phase === PHASE.MATCH) {
    if (state.phaseT <= 0) {
      state.score = [0, 0]; state.round = 1; state.matchWinner = -1;
      for (const a of state.actors) {
        a.money = RULES.startMoney; a.kills = 0; a.deaths = 0;
        a.inv.primary = null; a.inv.sidearm = makeWeapon('p9');
        a.inv.frag = 0; a.inv.smoke = 0; a.hasArmor = false; a.armorPool = 0; a.kit = false;
        a.alive = false; // force the loadout reset path in startRound
      }
      startRound();
    }
  }
}
