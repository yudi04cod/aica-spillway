// hud.js — everything drawn over the canvas: health/armour/ammo/money,
// the round clock and score, killfeed, banners, the buy menu, the
// scoreboard, a radar, and the plant progress bar. DOM is cached at init
// and only rewritten when a value changes.

import { state, on, emit, TEAM, PHASE, RULES, TEAM_NAMES } from './state.js';
import { SHOP, WEAPONS, currentWeapon } from './weapons.js';
import { keys, pressed, intent } from './input.js';
import { SITES } from './map.js';

const el = {};
let buyOpen = false;
const lastHud = {};
const feedTimers = [];

export function initHud() {
  for (const id of ['health', 'armorbar', 'ammo', 'reserve', 'weaponname', 'money', 'timer',
    'scorea', 'scoreb', 'roundno', 'killfeed', 'banner', 'subbanner', 'buymenu', 'buylist',
    'scoreboard', 'scoretable', 'radar', 'actionbar', 'actionfill', 'actionlabel',
    'damageflash', 'hitmarker', 'carriertag', 'locktip', 'scope', 'alivea', 'aliveb',
    'plantedtag', 'finalbanner']) {
    el[id] = document.getElementById(id);
  }
  buildBuyMenu();
  on('kill', (e) => addFeed(e));
  on('roundstart', (e) => {
    showBanner(`ROUND ${e.round}`, state.player.team === TEAM.ATK
      ? `Plant the breach charge — your squad is hitting site ${e.site}`
      : 'Hold the sites');
  });
  on('roundwin', (e) => {
    const why = {
      elimination: 'by elimination',
      detonate: 'charge detonated',
      defuse: 'charge defused',
      time: 'time expired',
    }[e.why] || '';
    showBanner(e.won ? 'ROUND WON' : 'ROUND LOST', `${TEAM_NAMES[e.winner]} take it ${why}`);
    el.banner.classList.toggle('lost', !e.won);
  });
  on('matchwin', (e) => {
    el.finalbanner.textContent = e.winner === state.player.team
      ? 'MATCH WON — THE DAM IS YOURS'
      : 'MATCH LOST';
    el.finalbanner.style.display = 'block';
  });
  on('planted', (e) => showBanner('CHARGE PLANTED', `Site ${e.site} — ${RULES.bombSeconds} seconds`));
  on('chargedrop', (e) => addNote(`Charge recovered by ${e.name}`));
  on('hit', (e) => {
    if (!e.byPlayer) return;
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('head', !!e.head);
    clearTimeout(el.hitmarker._t);
    el.hitmarker._t = setTimeout(() => el.hitmarker.classList.remove('on'), 110);
  });
  on('hurt', (e) => {
    if (!e.isPlayer) return;
    el.damageflash.style.opacity = '0.55';
    clearTimeout(el.damageflash._t);
    el.damageflash._t = setTimeout(() => { el.damageflash.style.opacity = '0'; }, 130);
  });
}

function showBanner(main, sub) {
  el.banner.textContent = main;
  el.subbanner.textContent = sub || '';
  el.banner.style.opacity = '1';
  el.subbanner.style.opacity = '1';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    el.banner.style.opacity = '0';
    el.subbanner.style.opacity = '0';
  }, 2600);
}

function addFeed(e) {
  const row = document.createElement('div');
  row.className = 'feedrow';
  const wname = e.weaponKey === 'frag' ? 'Frag Charge' : (WEAPONS[e.weaponKey]?.name || '—');
  row.innerHTML = `<b class="${e.killer.team === 0 ? 'atk' : 'def'}">${e.killer.name}</b> ▸ ` +
    `<b class="${e.victim.team === 0 ? 'atk' : 'def'}">${e.victim.name}</b> <i>${wname}${e.head ? ' ⌖' : ''}</i>`;
  el.killfeed.prepend(row);
  while (el.killfeed.children.length > 6) el.killfeed.lastChild.remove();
  const t = setTimeout(() => {
    row.style.opacity = '0';
    setTimeout(() => row.remove(), 400);
  }, 4600);
  feedTimers.push(t);
}

function addNote(text) {
  const row = document.createElement('div');
  row.className = 'feedrow note';
  row.textContent = text;
  el.killfeed.prepend(row);
  setTimeout(() => {
    row.style.opacity = '0';
    setTimeout(() => row.remove(), 400);
  }, 3600);
}

// ---- buy menu ---------------------------------------------------------------

function buildBuyMenu() {
  el.buylist.innerHTML = '';
  SHOP.forEach((item, i) => {
    const row = document.createElement('button');
    row.className = 'buyitem';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="bkey">${i + 1}</span><span class="bname">${item.label}</span>` +
      `<span class="bhint">${item.hint}</span><span class="bprice">$${item.price}</span>`;
    row.addEventListener('click', () => buyItem(item));
    el.buylist.appendChild(row);
  });
}

export function buyItem(item) {
  const p = state.player;
  if (state.phase !== PHASE.BUY || !p.alive) return;
  if (item.defOnly && p.team !== TEAM.DEF) return deny();
  if (p.money < item.price) return deny();
  if (item.id === 'armor') {
    if (p.hasArmor && p.armorPool >= 100) return deny();
    p.hasArmor = true;
    p.armorPool = 100;
  } else if (item.id === 'kit') {
    if (p.kit) return deny();
    p.kit = true;
  } else if (item.id === 'frag') {
    if (p.inv.frag >= 2) return deny();
    p.inv.frag++;
  } else if (item.id === 'smoke') {
    if (p.inv.smoke >= 1) return deny();
    p.inv.smoke++;
  } else {
    const def = WEAPONS[item.id];
    const inst = { key: item.id, def, ammo: def.mag, reserve: def.reserve, nextOk: 0, reloadEnd: 0 };
    if (def.kind === 'pistol') p.inv.sidearm = inst;
    else { p.inv.primary = inst; p.cur = 'primary'; }
  }
  p.money -= item.price;
  emit('buy', {});
}

function deny() { emit('denied', {}); }

// ---- per-frame refresh --------------------------------------------------------

function setText(node, key, text) {
  if (lastHud[key] !== text) {
    lastHud[key] = text;
    node.textContent = text;
  }
}

export function updateHud() {
  const p = state.player;
  if (!p) return;
  // Buy menu opens with B during the buy phase only.
  if (pressed.has('KeyB') && state.phase === PHASE.BUY) buyOpen = !buyOpen;
  if (state.phase !== PHASE.BUY) buyOpen = false;
  el.buymenu.style.display = buyOpen ? 'block' : 'none';
  if (buyOpen) {
    const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
    digits.forEach((d, i) => { if (pressed.has(d) && SHOP[i]) buyItem(SHOP[i]); });
    for (const row of el.buylist.children) {
      const item = SHOP.find((s) => s.id === row.dataset.id);
      row.classList.toggle('cant', !item || p.money < item.price || (item.defOnly && p.team !== TEAM.DEF));
    }
  }

  const w = currentWeapon(p);
  setText(el.health, 'hp', p.alive ? `${Math.ceil(p.hp)}` : '—');
  el.armorbar.style.width = `${p.hasArmor ? p.armorPool : 0}%`;
  if (p.cur === 'frag') setText(el.ammo, 'am', `${p.inv.frag}`);
  else if (p.cur === 'smoke') setText(el.ammo, 'am', `${p.inv.smoke}`);
  else if (w) setText(el.ammo, 'am', w.reloadEnd > state.time ? '——' : `${w.ammo}`);
  else setText(el.ammo, 'am', '—');
  setText(el.reserve, 'res', w ? `/ ${w.reserve}` : '');
  setText(el.weaponname, 'wn', p.cur === 'frag' ? 'Frag Charge'
    : p.cur === 'smoke' ? 'Smoke Pot' : (w ? w.def.name : ''));
  setText(el.money, 'mo', `$${p.money}`);

  const t = state.phase === PHASE.PLANTED ? state.bomb.timer : state.phaseT;
  const mm = Math.max(0, Math.floor(t / 60)), ss = Math.max(0, Math.floor(t % 60));
  setText(el.timer, 'ti', state.phase === PHASE.BUY ? `BUY ${ss}` : `${mm}:${ss.toString().padStart(2, '0')}`);
  el.timer.classList.toggle('urgent', state.phase === PHASE.PLANTED && t < 10);
  setText(el.scorea, 'sa', `${state.score[0]}`);
  setText(el.scoreb, 'sb', `${state.score[1]}`);
  setText(el.roundno, 'rn', `ROUND ${state.round} · FIRST TO ${RULES.roundsToWin}`);
  const aliveA = state.actors.filter((a) => a.alive && a.team === 0).length;
  const aliveB = state.actors.filter((a) => a.alive && a.team === 1).length;
  setText(el.alivea, 'aa', '●'.repeat(aliveA) + '○'.repeat(5 - aliveA));
  setText(el.aliveb, 'ab', '●'.repeat(aliveB) + '○'.repeat(5 - aliveB));

  el.carriertag.style.display = state.bomb.carrier === p && !state.bomb.planted && p.alive ? 'block' : 'none';
  el.plantedtag.style.display = state.phase === PHASE.PLANTED ? 'block' : 'none';
  if (state.phase === PHASE.MATCH) el.finalbanner.style.display = 'block';
  else if (state.phase === PHASE.BUY && state.round === 1) el.finalbanner.style.display = 'none';

  // Plant progress (the player is the carrier holding E in a site).
  const planting = state.bomb.carrier === p && state.bomb.plantT > 0;
  el.actionbar.style.display = planting ? 'block' : 'none';
  if (planting) {
    el.actionlabel.textContent = 'PLANTING THE CHARGE';
    el.actionfill.style.width = `${(state.bomb.plantT / RULES.plantSeconds) * 100}%`;
  }

  // Scoreboard while Tab is held (or forced by a staged screenshot).
  // It sits centre-screen, so the centre banner gets out of its way.
  const showScore = keys.has('Tab') || window.__forceScore === true;
  el.scoreboard.style.display = showScore ? 'block' : 'none';
  if (showScore) {
    el.banner.style.opacity = '0';
    el.subbanner.style.opacity = '0';
    renderScoreboard();
  }

  drawRadar();
  // DMR scope overlay while aiming.
  el.scope.style.display = (w && w.def.zoom && intent.aim && p.alive) ? 'block' : 'none';
}

function renderScoreboard() {
  const rows = [...state.actors].sort((a, b) => a.team - b.team || b.kills - a.kills);
  el.scoretable.innerHTML = rows.map((a) =>
    `<tr class="${a.team === 0 ? 'atk' : 'def'}${a === state.player ? ' me' : ''}">` +
    `<td>${a.name}${a.alive ? '' : ' ✝'}</td><td>${TEAM_NAMES[a.team]}</td>` +
    `<td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td></tr>`).join('');
}

const RAD_W = 168, RAD_H = 98;
function drawRadar() {
  const cv = el.radar;
  if (!cv || cv.width !== RAD_W) { cv.width = RAD_W; cv.height = RAD_H; }
  const x2 = cv.getContext('2d');
  x2.fillStyle = 'rgba(8,16,20,0.72)';
  x2.fillRect(0, 0, RAD_W, RAD_H);
  const px = (x) => ((x + 48) / 96) * RAD_W;
  const pz = (z) => ((z + 28) / 56) * RAD_H;
  // Site rings.
  for (const [key, col] of [['A', '#ffb02e'], ['B', '#39d5e8']]) {
    const s = SITES[key];
    x2.strokeStyle = col;
    x2.beginPath();
    x2.arc(px(s.x), pz(s.z), 5, 0, 7);
    x2.stroke();
    x2.fillStyle = col;
    x2.fillText(key, px(s.x) - 3, pz(s.z) + 3);
  }
  if (state.bomb.planted) {
    x2.fillStyle = '#ff5340';
    x2.beginPath();
    x2.arc(px(state.bomb.x), pz(state.bomb.z), 3.4, 0, 7);
    x2.fill();
  }
  const p = state.player;
  for (const a of state.actors) {
    if (!a.alive || a === p) continue;
    if (a.team !== p.team) continue; // radar shows friendlies only
    x2.fillStyle = a.team === 0 ? '#39d5e8' : '#ffb02e';
    x2.beginPath();
    x2.arc(px(a.pos.x), pz(a.pos.z), 2.4, 0, 7);
    x2.fill();
  }
  // Player arrow.
  x2.save();
  x2.translate(px(p.pos.x), pz(p.pos.z));
  x2.rotate(-p.yaw);
  x2.fillStyle = '#ffffff';
  x2.beginPath();
  x2.moveTo(0, -5);
  x2.lineTo(3.4, 4);
  x2.lineTo(-3.4, 4);
  x2.closePath();
  x2.fill();
  x2.restore();
}
