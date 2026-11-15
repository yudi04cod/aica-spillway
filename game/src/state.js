// state.js — the one place match state lives. Every other module reads or
// mutates this object; nothing keeps a private copy of round/score data.
// The simulation advances in fixed steps of TICK seconds from main.js.

export const TICK = 1 / 60;

export const TEAM = { ATK: 0, DEF: 1 };
export const TEAM_NAMES = ['Sluice Runners', 'Dam Wardens'];
export const TEAM_SHORT = ['RUN', 'WRD'];

// Round phases: buy (freeze + shop) -> live -> planted (charge ticking)
// -> over (banner, payout) -> next round, or matchover when a side hits 7.
export const PHASE = { BUY: 'buy', LIVE: 'live', PLANTED: 'planted', OVER: 'over', MATCH: 'match' };

export const RULES = {
  roundsToWin: 7,
  buySeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3.5,
  defuseSeconds: 6,       // halved by a defuse kit
  defuseKitSeconds: 3,
  bombSeconds: 40,
  overSeconds: 6,
  matchSeconds: 10,
  startMoney: 800,
  maxMoney: 16000,
  winPay: 2400,           // elimination or objective win
  lossPay: 1800,
  plantTeamPay: 800,      // attackers, when the charge is planted
  detonateBonus: 500,     // attackers, on top of winPay, when it blows
  plantBonus: 300,        // the planter personally
  killPay: 300,
};

export const state = {
  time: 0,               // simulated seconds since boot
  tick: 0,
  phase: PHASE.BUY,
  phaseT: 0,             // seconds left in the current phase
  round: 1,
  score: [0, 0],
  actors: [],            // every combatant, player first
  player: null,
  bomb: {
    carrier: null,       // actor holding the charge (attackers)
    planted: false,
    site: null,          // 'A' | 'B'
    x: 0, z: 0,
    timer: 0,
    planter: null,
    defuser: null,       // actor currently defusing
    defuseT: 0,
    plantT: 0,           // plant channel progress
    plantingBy: null,
  },
  lastRoundWinner: -1,
  lastRoundWhy: '',
  matchWinner: -1,
  freeze: true,          // actors hold still during the buy phase
  slowmo: 1,             // time scale (shot staging can slow a moment down)
};

// A tiny synchronous event bus: audio, hud and fx subscribe; the sim emits.
// Events: shot, reload, hit, kill, plant, planted, defuse, explode, round,
// buy, step, empty, throw, smoke, hurt.
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
}
export function emit(event, data) {
  const fns = listeners.get(event);
  if (!fns) return;
  for (let i = 0; i < fns.length; i++) fns[i](data);
}

export function aliveCount(team) {
  let n = 0;
  for (const a of state.actors) if (a.alive && a.team === team) n++;
  return n;
}

export function resetBomb() {
  const b = state.bomb;
  b.carrier = null; b.planted = false; b.site = null; b.timer = 0;
  b.planter = null; b.defuser = null; b.defuseT = 0; b.plantT = 0; b.plantingBy = null;
}
