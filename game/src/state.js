// state.js — the single source of truth for the SPILLWAY match.
//
// Everything the simulation knows lives on this one object. Modules read
// it, mutate it, and never keep a private copy of round, score or charge
// data. The loop in main.js advances it in fixed TICK steps; rendering
// only reads what a step leaves behind.

export const TICK = 1 / 60;

export const TEAM = { ATK: 0, DEF: 1 };
export const TEAM_NAMES = ['Sluice Runners', 'Dam Wardens'];
export const TEAM_SHORT = ['RUN', 'WRD'];

// Phase machine: buy (frozen, shop open) -> live -> planted (fuse runs)
// -> over (banner + payout) -> next round, or match when a side hits 7.
export const PHASE = {
  BUY: 'buy',
  LIVE: 'live',
  PLANTED: 'planted',
  OVER: 'over',
  MATCH: 'match',
};

export const RULES = {
  roundsToWin: 7,
  buySeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3.5,
  defuseSeconds: 6, // a defuse kit cuts this to 3
  defuseKitSeconds: 3,
  bombSeconds: 40,
  overSeconds: 6,
  matchSeconds: 10,
  startMoney: 800,
  maxMoney: 16000,
  winPay: 2400, // elimination or objective win
  lossPay: 1800,
  plantTeamPay: 800, // every attacker once the charge is down
  detonateBonus: 500, // attackers, on top of winPay, when it blows
  plantBonus: 300, // the planter personally
  killPay: 300,
};

export const state = {
  time: 0, // simulated seconds since boot
  tick: 0,
  phase: PHASE.BUY,
  phaseT: 0, // seconds left in the current phase
  roundClock: 0, // seconds the live round has run
  round: 1,
  score: [0, 0],
  actors: [], // every combatant; the player is actors[0]
  player: null,
  bomb: {
    carrier: null, // the Runner holding the charge
    planted: false,
    site: null, // 'A' | 'B'
    x: 0,
    z: 0,
    timer: 0,
    planter: null,
    defuser: null, // the Warden currently defusing
    defuseT: 0,
    defuseNeed: 0,
    plantT: 0, // plant channel progress
    plantingBy: null,
  },
  lastRoundWinner: -1,
  lastRoundWhy: '',
  matchWinner: -1,
  freeze: true, // bodies hold still during the buy phase
  slowmo: 1, // time scale; soak tests crank it up
};

// Tiny synchronous event bus. Audio, HUD and fx subscribe; the sim emits.
// Events: shot, reload, hit, kill, plant, planted, defuse, explode, round,
// roundstart, roundwin, roundend, matchwin, buy, denied, step, empty,
// throw, smokepop, hurt, planttick, bombtick, chargedrop.
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
  b.carrier = null;
  b.planted = false;
  b.site = null;
  b.timer = 0;
  b.planter = null;
  b.defuser = null;
  b.defuseT = 0;
  b.defuseNeed = 0;
  b.plantT = 0;
  b.plantingBy = null;
}
