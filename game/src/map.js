// map.js — the Meridian Dam at dusk, as data plus queries.
//
// SPILLWAY's whole world is one table of axis-aligned boxes. The table
// is the collision world and also the building list, so what you see is
// exactly what bullets and bodies collide with. Three lanes run west to
// east: the crest road (north), the spillway channel with its aprons
// (middle), and the service road into the turbine hall (south).
//
// Sites: A = Turbine Hall (south-east interior), B = Gantry Crane (crest).
// The playfield is x -48..48, z -28..28, ringed by 5 m perimeter concrete.

import * as THREE from 'three';
import { state } from './state.js';

// One box: footprint x0,z0 -> x1,z1, height h, texture key. Sections are
// kept separate so a lane can be read (and edited) on its own; BOXES is
// the concatenation the collision code walks.
const b = (x0, z0, x1, z1, h, mat) => ({ x0, z0, x1, z1, h, mat });

const PERIMETER = [
  b(-48, -28.6, 48, -28, 5, 'conc'), b(-48, 28, 48, 28.6, 5, 'conc'),
  b(-48.6, -28, -48, 28, 5, 'conc'), b(48, -28, 48.6, 28, 5, 'conc'),
];

// Crest road south railing (low cover). Gaps at the pier stairs, the
// control-building doors and the NE stairs down to the control yard.
const CREST_RAIL = [
  b(-47, -19, -36, -18.4, 1.15, 'hazard'), b(-32, -19, 8, -18.4, 1.15, 'hazard'),
  b(30, -19, 47, -18.4, 1.15, 'hazard'),
];

// Control building (h 3.6): north wall two doors, south wall one door.
const CONTROL_BUILDING = [
  b(8, -19.6, 11, -19, 3.6, 'dark'), b(13.5, -19.6, 18.5, -19, 3.6, 'dark'),
  b(21, -19.6, 24, -19, 3.6, 'dark'),
  b(8, -10.6, 14, -10, 3.6, 'dark'), b(18, -10.6, 24, -10, 3.6, 'dark'),
  b(8, -19, 8.6, -10, 3.6, 'dark'), b(23.4, -19, 24, -10, 3.6, 'dark'),
  b(11, -15.2, 14, -14.2, 1.15, 'plate'), b(18, -15.2, 21, -14.2, 1.15, 'plate'),
];

// Spillway channel edge barriers (low), open at the three crossings.
const CHANNEL = [
  b(-6.6, -19, -6, -16, 1.15, 'hazard'), b(-6.6, -12, -6, 10, 1.15, 'hazard'),
  b(-6.6, 14, -6, 20, 1.15, 'hazard'), b(-6.6, 24, -6, 28, 1.15, 'hazard'),
  b(4, -19, 4.6, -16, 1.15, 'hazard'), b(4, -12, 4.6, 10, 1.15, 'hazard'),
  b(4, 14, 4.6, 20, 1.15, 'hazard'), b(4, 24, 4.6, 28, 1.15, 'hazard'),
];

// Turbine hall (h 6): north door x22..27, west door z14..19.
// The three turbines use square colliders under round shells.
const TURBINE_HALL = [
  b(10, 7.4, 22, 8, 6, 'conc'), b(27, 7.4, 44, 8, 6, 'conc'),
  b(10, 26.4, 44, 27, 6, 'conc'),
  b(10, 8, 10.6, 14, 6, 'conc'), b(10, 19, 10.6, 26.4, 6, 'conc'),
  b(43.4, 8, 44, 26.4, 6, 'conc'),
  b(15, 15, 21, 21, 3.2, 'plate'), b(25, 15, 31, 21, 3.2, 'plate'),
  b(35, 15, 41, 21, 3.2, 'plate'),
  // Hall cover: crate stack, pipe run, sandbags by site A.
  b(12.4, 22, 14.4, 24, 2.4, 'timber'), b(30, 8.6, 36, 9.2, 1.15, 'hazard'),
  b(39, 10.4, 42, 11, 1.15, 'hazard'), b(16, 10, 17, 13, 1.15, 'rust'),
];

// West works yard cover.
const WEST_YARD = [
  b(-28, -2, -24, 0, 1.15, 'plate'), b(-18, 8, -14, 10, 2.2, 'rust'),
  b(-30, 12, -28, 14, 1.2, 'timber'), b(-14, -12, -12, -10, 1.2, 'timber'),
  b(-45, -6, -40, -4, 1.15, 'plate'), b(-40, 6, -38, 8, 1.2, 'timber'),
];

// East apron + defender yard cover.
const EAST_APRON = [
  b(16, 4, 21, 6.4, 2.6, 'rust'), b(27, -1, 30, 1, 1.3, 'timber'),
  b(20, 6.2, 24, 6.8, 1.15, 'hazard'), b(36, -4, 38, -2, 2.4, 'timber'),
  b(42, 2, 45, 4, 1.2, 'timber'), b(34, 6.2, 38, 6.8, 1.15, 'hazard'),
];

// Crest dressing: crates, the site B approach barrier, gantry legs.
const CREST_DRESSING = [
  b(-20, -25, -18, -23, 1.2, 'timber'), b(12, -26, 14, -24, 1.2, 'timber'),
  b(26, -22, 29, -21.4, 1.15, 'hazard'),
  b(33, -26.4, 34.6, -24.8, 7, 'rust'), b(33, -17.2, 34.6, -15.6, 7, 'rust'),
];

// Service road dressing.
const SERVICE_ROAD = [
  b(-8, 25, -5, 25.6, 1.15, 'hazard'), b(0, 18, 2, 20, 1.2, 'timber'),
  b(-36, 20, -33, 22, 1.2, 'timber'), b(6, 24, 9, 26, 1.15, 'plate'),
];

const BOXES = [
  ...PERIMETER, ...CREST_RAIL, ...CONTROL_BUILDING, ...CHANNEL,
  ...TURBINE_HALL, ...WEST_YARD, ...EAST_APRON, ...CREST_DRESSING,
  ...SERVICE_ROAD,
];

export const SITES = {
  A: { x: 37, z: 13, r: 5.5, label: 'Turbine Hall' },
  B: { x: 38, z: -21, r: 6, label: 'Gantry Crane' },
};

export const SPAWNS = {
  atk: [[-43, 4], [-41, 0], [-43, -3], [-39, 6], [-40, -6]],
  def: [[42, 1], [44, -3], [40, 4], [43, 6], [38, -2]],
};

// Waypoint graph. Bots path node to node; the graph covers every lane,
// door and site approach. Edges are index pairs into NODES.
export const NODES = [
  [-42, 1], [-38, -10], [-38, 14], [-34, -23], [-10, -23], [16, -23],
  [28, -23], [38, -23], [43, -8], [16, -14], [-22, -8], [-22, 4],
  [-22, 16], [-9, -14], [-1, -14], [7, -14], [-9, 12], [-1, 12],
  [8, 12], [-24, 22], [-14, 23], [-1, 22], [8, 20], [14, 3],
  [24, 2], [40, 0], [40, 5], [13, 16], [18, 23], [27, 12],
  [24, 10], [36, 13], [40, 23], [16, -5], [22, 12],
];
const EDGES = [
  [0, 1], [0, 2], [0, 11], [1, 3], [1, 10], [2, 12], [2, 19], [3, 4],
  [4, 5], [5, 6], [6, 7], [7, 8], [8, 25], [5, 9], [9, 33], [33, 23],
  [33, 15], [10, 11], [11, 12], [10, 13], [13, 14], [14, 15], [15, 33],
  [11, 16], [16, 17], [17, 18], [12, 19], [19, 20], [20, 21], [21, 22],
  [21, 17], [22, 27], [18, 23], [23, 24], [24, 25], [25, 26], [24, 30],
  [30, 29], [29, 31], [29, 27], [27, 28], [28, 32], [31, 32], [26, 24],
  [4, 13], [15, 18], [23, 33], [27, 34], [34, 29], [34, 30],
];
export const ADJ = NODES.map(() => []);
for (const [a, bIdx] of EDGES) { ADJ[a].push(bIdx); ADJ[bIdx].push(a); }

// Where defenders (and post-plant attackers) like to stand: position,
// facing yaw, and the site the spot watches.
export const HOLD_SPOTS = [
  { x: 30, z: 10.5, yaw: Math.PI, site: 'A' },
  { x: 40.5, z: 17, yaw: -Math.PI / 2, site: 'A' },
  { x: 19, z: 23.5, yaw: 0.6, site: 'A' },
  { x: 24.5, z: 12, yaw: Math.PI / 2, site: 'A' },
  { x: 31, z: -24.5, yaw: Math.PI, site: 'B' },
  { x: 42, z: -16.5, yaw: 2.6, site: 'B' },
  { x: 24, z: -20, yaw: Math.PI, site: 'B' },
  { x: 37, z: -13, yaw: -0.5, site: 'B' },
];

export const colliders = BOXES;

// Playfield clamps for a body centre (walls sit 0.6 m outside these).
const BOUND_X = 47.4, BOUND_Z = 27.4;

// ---- collision + sight queries --------------------------------------------

// Push a circle (actor footprint) out of one box it overlaps, in XZ.
function resolveBox(pos, radius, c) {
  const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
  const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
  const dx = pos.x - nx, dz = pos.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  if (d2 < 1e-9) {
    // Centre inside the box: leave through the nearest face.
    const gaps = [
      [pos.x - c.x0, () => { pos.x = c.x0 - radius; }],
      [c.x1 - pos.x, () => { pos.x = c.x1 + radius; }],
      [pos.z - c.z0, () => { pos.z = c.z0 - radius; }],
      [c.z1 - pos.z, () => { pos.z = c.z1 + radius; }],
    ];
    let smallest = Infinity, escape = null;
    for (const [gap, fn] of gaps) {
      if (gap < smallest) { smallest = gap; escape = fn; }
    }
    escape();
    return;
  }
  const d = Math.sqrt(d2), push = (radius - d) / d;
  pos.x += dx * push;
  pos.z += dz * push;
}

// Push a circle (actor footprint) out of every box it overlaps, in XZ.
export function moveCollide(pos, radius) {
  for (const c of colliders) resolveBox(pos, radius, c);
  pos.x = Math.max(-BOUND_X, Math.min(BOUND_X, pos.x));
  pos.z = Math.max(-BOUND_Z, Math.min(BOUND_Z, pos.z));
}

// Clip the [t0, t1] interval against one slab [lo, hi] along one axis.
// Returns the narrowed interval, or null when the ray misses the slab.
function clipSlab(origin, dir, lo, hi, t0, t1) {
  if (Math.abs(dir) < 1e-9) {
    return (origin < lo || origin > hi) ? null : [t0, t1];
  }
  let ta = (lo - origin) / dir, tb = (hi - origin) / dir;
  if (ta > tb) { const swap = ta; ta = tb; tb = swap; }
  const next0 = Math.max(t0, ta), next1 = Math.min(t1, tb);
  return next0 > next1 ? null : [next0, next1];
}

// Slab test of a ray against one box (y from 0 to h). Returns t or -1.
function rayBox(c, ox, oy, oz, dx, dy, dz, maxT) {
  let span = [0, maxT];
  span = clipSlab(ox, dx, c.x0, c.x1, span[0], span[1]);
  if (!span) return -1;
  span = clipSlab(oy, dy, 0, c.h, span[0], span[1]);
  if (!span) return -1;
  span = clipSlab(oz, dz, c.z0, c.z1, span[0], span[1]);
  if (!span) return -1;
  return span[0];
}

// Nearest world hit along a ray; fills `out` {t, x, y, z} and returns
// t or -1. Also stops at the ground plane (y=0).
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  for (const c of colliders) {
    const t = rayBox(c, ox, oy, oz, dx, dy, dz, best);
    if (t >= 0 && t < best) best = t;
  }
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t >= 0 && t < best) best = t;
  }
  if (best >= maxDist) return -1;
  if (out) {
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
    out.t = best;
  }
  return best;
}

// True when the straight segment a->b touches no box (eye lines; smoke
// adds its own check on top).
export function losBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return false;
  const s = 1 / len;
  for (const c of colliders) {
    const t = rayBox(c, ax, ay, az, dx * s, dy * s, dz * s, len);
    if (t >= 0 && t < len - 0.05) return true;
  }
  return false;
}

// Does a box block a walking body? Full-height cover always does; a long
// low wall (channel barrier, railing) does too. Short cover is slid
// around by the body solver.
function blocksWalk(c) {
  const longWall = Math.max(c.x1 - c.x0, c.z1 - c.z0) > 5;
  return c.h > 1.35 || (c.h > 0.9 && longWall);
}

// 2D version for steering: does the straight walk a->b cross any box
// tall enough to block a body? Boxes grow by the actor radius so a
// "clear" answer is really walkable.
export function segmentBlocked2D(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const pad = 0.3;
  for (const c of colliders) {
    if (!blocksWalk(c)) continue;
    const x0 = c.x0 - pad, x1 = c.x1 + pad, z0 = c.z0 - pad, z1 = c.z1 + pad;
    let span = [0, 1];
    span = clipSlab(ax, dx, x0, x1, span[0], span[1]);
    if (!span) continue;
    span = clipSlab(az, dz, z0, z1, span[0], span[1]);
    if (span) return true;
  }
  return false;
}

export function nearestNode(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i][0] - x, dz = NODES[i][1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// A* over the waypoint graph. Returns node indices from a to b inclusive.
// The open list is a plain array (35 nodes); the maps are reused across
// calls so no per-call allocation shows up in the hot loop.
const _open = [], _came = new Map(), _gs = new Map(), _fs = new Map();

function edgeLen(i, j) {
  return Math.hypot(NODES[j][0] - NODES[i][0], NODES[j][1] - NODES[i][1]);
}

function popCheapest(open, fs) {
  let bi = 0;
  for (let i = 1; i < open.length; i++) {
    if (fs.get(open[i]) < fs.get(open[bi])) bi = i;
  }
  return open.splice(bi, 1)[0];
}

function rebuildPath(came, goal) {
  const path = [goal];
  let n = goal;
  while (came.has(n)) { n = came.get(n); path.push(n); }
  return path.reverse();
}

export function findPath(a, b) {
  if (a === b) return [a];
  _open.length = 0;
  _came.clear(); _gs.clear(); _fs.clear();
  const heuristic = (i) => Math.hypot(NODES[i][0] - NODES[b][0], NODES[i][1] - NODES[b][1]);
  _open.push(a);
  _gs.set(a, 0);
  _fs.set(a, heuristic(a));
  while (_open.length) {
    const cur = popCheapest(_open, _fs);
    if (cur === b) return rebuildPath(_came, cur);
    for (const nb of ADJ[cur]) {
      const g = _gs.get(cur) + edgeLen(cur, nb);
      if (g >= (_gs.get(nb) ?? Infinity)) continue;
      _came.set(nb, cur);
      _gs.set(nb, g);
      _fs.set(nb, g + heuristic(nb));
      if (!_open.includes(nb)) _open.push(nb);
    }
  }
  return [a];
}

export function inSite(x, z, site) {
  const s = SITES[site];
  return Math.hypot(x - s.x, z - s.z) <= s.r;
}

// ---- scene construction ---------------------------------------------------

const MAT_FOR = {
  conc: 'concrete',
  dark: 'concreteDark',
  plate: 'plate',
  rust: 'plateRust',
  hazard: 'hazard',
  timber: 'timber',
};

const MATERIAL_KEYS = ['concrete', 'concreteDark', 'plate', 'plateRust', 'hazard', 'timber', 'asphalt'];

function makeMaterials(tex) {
  const mats = {};
  for (const key of MATERIAL_KEYS) {
    mats[key] = new THREE.MeshStandardMaterial({ map: tex[key], roughness: 0.92, metalness: 0.05 });
  }
  mats.plate.metalness = 0.45;
  mats.plateRust.metalness = 0.3;
  return mats;
}

// A unit cube, scaled to the box. Tall boxes cast shadows.
function boxMesh(unitBox, mats, c) {
  const m = new THREE.Mesh(unitBox, mats[MAT_FOR[c.mat]]);
  m.scale.set(c.x1 - c.x0, c.h, c.z1 - c.z0);
  m.position.set((c.x0 + c.x1) / 2, c.h / 2, (c.z0 + c.z1) / 2);
  m.castShadow = c.h > 1.3;
  m.receiveShadow = true;
  return m;
}

function flatPlane(w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function addGround(world, tex) {
  // Ground: crest concrete with an asphalt service strip, the spillway
  // chute in dark concrete, and painted site aprons. The ground gets its
  // own finely-tiled copy of the concrete so the pour reads at distance.
  const groundTex = tex.concrete.clone();
  groundTex.repeat.set(14, 8);
  groundTex.needsUpdate = true;
  const ground = flatPlane(97.2, 57.2,
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }), 0, 0, 0);
  ground.receiveShadow = true;
  world.add(ground);
  const chute = flatPlane(10.6, 47,
    new THREE.MeshStandardMaterial({ map: tex.concreteDark, roughness: 0.9 }), -1, 0.02, 4.5);
  chute.receiveShadow = true;
  world.add(chute);
  const roadTex = tex.asphalt.clone();
  roadTex.repeat.set(18, 2);
  roadTex.needsUpdate = true;
  const road = flatPlane(97, 9,
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.97 }), 0, 0.015, -23.5);
  road.receiveShadow = true;
  world.add(road);
}

function addWater(world, tex) {
  // Water: the spillway runnel, the reservoir (north) and the tailrace
  // far below the dam's south face.
  const waterMat = new THREE.MeshStandardMaterial({
    map: tex.water, roughness: 0.25, metalness: 0.1,
    color: 0x9fd8e8, transparent: true, opacity: 0.92,
  });
  world.add(flatPlane(3.4, 47, waterMat, -1, 0.05, 4.5));
  world.add(flatPlane(300, 90, waterMat, 0, -0.4, -75));
  world.add(flatPlane(300, 110, waterMat, 0, -14, 86));
  // The dam's south face dropping to the tailrace.
  const face = new THREE.Mesh(new THREE.BoxGeometry(97.2, 14, 1.6),
    new THREE.MeshStandardMaterial({ map: tex.concreteDark, roughness: 0.95 }));
  face.position.set(0, -7, 28.8);
  world.add(face);
  // Foam strip where the spillway meets the river.
  const foam = flatPlane(10, 3,
    new THREE.MeshBasicMaterial({ color: 0xcfeef5, transparent: true, opacity: 0.5 }),
    -1, -13.8, 33);
  world.add(foam);
}

function addTurbines(world, mats) {
  // Round shells over their square colliders, hazard crowns.
  const shellGeo = new THREE.CylinderGeometry(3, 3.2, 3.2, 20);
  const crownGeo = new THREE.CylinderGeometry(3.25, 3.25, 0.35, 20);
  const shaftGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.4, 10);
  for (const tx of [18, 28, 38]) {
    const shell = new THREE.Mesh(shellGeo, mats.plate);
    shell.position.set(tx, 1.6, 18);
    shell.castShadow = true;
    shell.receiveShadow = true;
    world.add(shell);
    const crown = new THREE.Mesh(crownGeo, mats.hazard);
    crown.position.set(tx, 3.35, 18);
    world.add(crown);
    const shaft = new THREE.Mesh(shaftGeo, mats.plateRust);
    shaft.position.set(tx, 4.4, 18);
    world.add(shaft);
  }
}

function addCrane(world, mats) {
  // Gantry crane over site B: beam, trolley and a hanging hook block.
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 12.4), mats.plateRust);
  beam.position.set(33.8, 7.4, -21);
  beam.castShadow = true;
  world.add(beam);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), mats.hazard);
  trolley.position.set(33.8, 6.6, -21);
  world.add(trolley);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cable.position.set(33.8, 4.4, -21);
  world.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mats.hazard);
  hook.position.set(33.8, 2.5, -21);
  hook.castShadow = true;
  world.add(hook);
}

function addPipes(world, mats) {
  // Intake pipes on the pier and a pipe run along the south wall.
  const pipeGeo = new THREE.CylinderGeometry(0.55, 0.55, 9, 12);
  const heights = [0.55, 1.65, 0.55];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(pipeGeo, mats.plate);
    p.rotation.z = Math.PI / 2;
    p.position.set(-43, heights[i], -12 + i * 1.3);
    p.castShadow = true;
    world.add(p);
  }
  const southPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 10), mats.plateRust);
  southPipe.rotation.z = Math.PI / 2;
  southPipe.position.set(27, 0.4, 25.4);
  world.add(southPipe);
}

function addSiteMarkers(world, tex) {
  // Site rings and signs.
  const ringColors = { A: 0xffb02e, B: 0x39d5e8 };
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({
        color: ringColors[key], transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.06, s.z);
    world.add(ring);
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: key === 'A' ? tex.signA : tex.signB }));
    if (key === 'A') {
      signMesh.position.set(37, 4.4, 26.3);
      signMesh.rotation.y = Math.PI;
    } else {
      signMesh.position.set(33.8, 5.2, -21);
    }
    world.add(signMesh);
  }
  // Spawn banners so both teams read their side at a glance.
  const bannerAtk = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
    new THREE.MeshBasicMaterial({ map: tex.panelAtk, side: THREE.DoubleSide }));
  bannerAtk.position.set(-47.2, 3.4, 1);
  bannerAtk.rotation.y = Math.PI / 2;
  world.add(bannerAtk);
  const bannerDef = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
    new THREE.MeshBasicMaterial({ map: tex.panelDef, side: THREE.DoubleSide }));
  bannerDef.position.set(47.2, 3.4, 1);
  bannerDef.rotation.y = -Math.PI / 2;
  world.add(bannerDef);
}

// Lamp placements: [x, z, has a real point light].
const LAMP_SPOTS = [
  [-20, -24, true], [20, -24, false], [18, 12, true], [38, 24, false],
  [-22, 6, true], [24, 4, false], [40, -12, true],
];

function addLamps(world, mats) {
  // Lamps: emissive heads on poles; four real point lights do the work.
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 4.6, 6);
  const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.4);
  for (const [x, z, withLight] of LAMP_SPOTS) {
    const pole = new THREE.Mesh(poleGeo, mats.dark);
    pole.position.set(x, 2.3, z);
    world.add(pole);
    const head = new THREE.Mesh(headGeo, lampHeadMat);
    head.position.set(x, 4.65, z);
    world.add(head);
    if (withLight) {
      const l = new THREE.PointLight(0xffc98a, 60, 26, 1.8);
      l.position.set(x, 4.4, z);
      world.add(l);
    }
  }
}

function addSkyLights(scene, world) {
  // Dusk sky, sun and air.
  scene.background = new THREE.Color(0x2b3f4a);
  scene.fog = new THREE.Fog(0x2b3f4a, 55, 190);
  const hemi = new THREE.HemisphereLight(0x8fb6c9, 0x2a241d, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(-60, 38, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const hallGlow = new THREE.PointLight(0xbfd9e2, 50, 30, 1.6);
  hallGlow.position.set(27, 5, 17);
  world.add(hallGlow);
}

export function buildWorld(scene, tex) {
  const mats = makeMaterials(tex);
  const world = new THREE.Group();
  scene.add(world);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (const c of colliders) world.add(boxMesh(unitBox, mats, c));
  addGround(world, tex);
  addWater(world, tex);
  addTurbines(world, mats);
  addCrane(world, mats);
  addPipes(world, mats);
  addSiteMarkers(world, tex);
  addLamps(world, mats);
  addSkyLights(scene, world);

  return {
    update(dt) {
      tex.water.offset.y -= dt * 0.05;
      tex.water.offset.x = Math.sin(state.time * 0.1) * 0.02;
    },
  };
}
