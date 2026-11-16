// map.js — SPILLWAY: the Meridian Dam at dusk.
//
// One table of boxes is both the collision world and the building list,
// so the geometry you see is exactly the geometry bullets and bodies
// collide with. Three lanes run west -> east across the dam: the crest
// road (north), the spillway channel and its aprons (mid), and the
// service road into the turbine hall (south).
//
// Sites: A = Turbine Hall (south-east interior), B = Gantry Crane (crest).

import * as THREE from 'three';
import { state } from './state.js';

// Footprint x0,z0 -> x1,z1, height h, texture key. The playfield is
// x -48..48, z -28..28, ringed by 5 m perimeter concrete.
const BOXES = [
  // Perimeter walls.
  [-48, -28.6, 48, -28, 5, 'conc'], [-48, 28, 48, 28.6, 5, 'conc'],
  [-48.6, -28, -48, 28, 5, 'conc'], [48, -28, 48.6, 28, 5, 'conc'],

  // Crest road south railing (low cover); gaps at the pier stairs,
  // control-building doors and the NE stairs down to the control yard.
  [-47, -19, -36, -18.4, 1.15, 'hazard'], [-32, -19, 8, -18.4, 1.15, 'hazard'],
  [30, -19, 47, -18.4, 1.15, 'hazard'],

  // Control building (h 3.6): north wall two doors, south wall one door.
  [8, -19.6, 11, -19, 3.6, 'dark'], [13.5, -19.6, 18.5, -19, 3.6, 'dark'],
  [21, -19.6, 24, -19, 3.6, 'dark'],
  [8, -10.6, 14, -10, 3.6, 'dark'], [18, -10.6, 24, -10, 3.6, 'dark'],
  [8, -19, 8.6, -10, 3.6, 'dark'], [23.4, -19, 24, -10, 3.6, 'dark'],
  [11, -15.2, 14, -14.2, 1.15, 'plate'], [18, -15.2, 21, -14.2, 1.15, 'plate'],

  // Spillway channel edge barriers (low), open at the three crossings.
  [-6.6, -19, -6, -16, 1.15, 'hazard'], [-6.6, -12, -6, 10, 1.15, 'hazard'],
  [-6.6, 14, -6, 20, 1.15, 'hazard'], [-6.6, 24, -6, 28, 1.15, 'hazard'],
  [4, -19, 4.6, -16, 1.15, 'hazard'], [4, -12, 4.6, 10, 1.15, 'hazard'],
  [4, 14, 4.6, 20, 1.15, 'hazard'], [4, 24, 4.6, 28, 1.15, 'hazard'],

  // Turbine hall (h 6): north door x22..27, west door z14..19.
  [10, 7.4, 22, 8, 6, 'conc'], [27, 7.4, 44, 8, 6, 'conc'],
  [10, 26.4, 44, 27, 6, 'conc'],
  [10, 8, 10.6, 14, 6, 'conc'], [10, 19, 10.6, 26.4, 6, 'conc'],
  [43.4, 8, 44, 26.4, 6, 'conc'],
  // The three turbines (square colliders under round shells).
  [15, 15, 21, 21, 3.2, 'plate'], [25, 15, 31, 21, 3.2, 'plate'],
  [35, 15, 41, 21, 3.2, 'plate'],
  // Hall cover: crate stack, pipe run, sandbags by site A.
  [12.4, 22, 14.4, 24, 2.4, 'timber'], [30, 8.6, 36, 9.2, 1.15, 'hazard'],
  [39, 10.4, 42, 11, 1.15, 'hazard'], [16, 10, 17, 13, 1.15, 'rust'],

  // West works yard cover.
  [-28, -2, -24, 0, 1.15, 'plate'], [-18, 8, -14, 10, 2.2, 'rust'],
  [-30, 12, -28, 14, 1.2, 'timber'], [-14, -12, -12, -10, 1.2, 'timber'],
  [-45, -6, -40, -4, 1.15, 'plate'], [-40, 6, -38, 8, 1.2, 'timber'],

  // East apron + defender yard cover.
  [16, 4, 21, 6.4, 2.6, 'rust'], [27, -1, 30, 1, 1.3, 'timber'],
  [20, 6.2, 24, 6.8, 1.15, 'hazard'], [36, -4, 38, -2, 2.4, 'timber'],
  [42, 2, 45, 4, 1.2, 'timber'], [34, 6.2, 38, 6.8, 1.15, 'hazard'],

  // Crest dressing: crates, the site B approach barrier, gantry legs.
  [-20, -25, -18, -23, 1.2, 'timber'], [12, -26, 14, -24, 1.2, 'timber'],
  [26, -22, 29, -21.4, 1.15, 'hazard'],
  [33, -26.4, 34.6, -24.8, 7, 'rust'], [33, -17.2, 34.6, -15.6, 7, 'rust'],

  // Service road dressing.
  [-8, 25, -5, 25.6, 1.15, 'hazard'], [0, 18, 2, 20, 1.2, 'timber'],
  [-36, 20, -33, 22, 1.2, 'timber'], [6, 24, 9, 26, 1.15, 'plate'],
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
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

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

export const colliders = BOXES.map(([x0, z0, x1, z1, h, mat]) => ({ x0, z0, x1, z1, h, mat }));

// ---- collision + sight queries --------------------------------------------

// Push a circle (actor footprint) out of every box it overlaps, in XZ.
export function moveCollide(pos, radius) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 < 1e-9) {
      // Centre inside the box: leave through the nearest face.
      const l = pos.x - c.x0, r = c.x1 - pos.x, t = pos.z - c.z0, b = c.z1 - pos.z;
      const m = Math.min(l, r, t, b);
      if (m === l) pos.x = c.x0 - radius;
      else if (m === r) pos.x = c.x1 + radius;
      else if (m === t) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
      continue;
    }
    const d = Math.sqrt(d2), push = (radius - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
  }
  pos.x = Math.max(-47.4, Math.min(47.4, pos.x));
  pos.z = Math.max(-27.4, Math.min(27.4, pos.z));
}

// Slab test of a ray against one box (y from 0 to h). Returns t or -1.
function rayBox(c, ox, oy, oz, dx, dy, dz, maxT) {
  let t0 = 0, t1 = maxT;
  // X slab
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return -1; }
  else {
    let ta = (c.x0 - ox) / dx, tb = (c.x1 - ox) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  // Y slab (0..h)
  if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > c.h) return -1; }
  else {
    let ta = (0 - oy) / dy, tb = (c.h - oy) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  // Z slab
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return -1; }
  else {
    let ta = (c.z0 - oz) / dz, tb = (c.z1 - oz) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}

// Nearest world hit along a ray; fills `out` {t, x, y, z} and returns
// t or -1. Also stops at the ground plane (y=0).
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(colliders[i], ox, oy, oz, dx, dy, dz, best);
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
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(colliders[i], ax, ay, az, dx * s, dy * s, dz * s, len);
    if (t >= 0 && t < len - 0.05) return true;
  }
  return false;
}

// 2D version for steering: does the straight walk a->b cross any box
// tall enough to block a body? Boxes grow by the actor radius so a
// "clear" answer is really walkable.
export function segmentBlocked2D(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    // Only full-height cover and long low walls (channel barriers,
    // railings) count: short cover is slid around by the body solver.
    const longWall = Math.max(c.x1 - c.x0, c.z1 - c.z0) > 5;
    if (!(c.h > 1.35 || (c.h > 0.9 && longWall))) continue;
    const x0 = c.x0 - 0.3, x1 = c.x1 + 0.3, z0 = c.z0 - 0.3, z1 = c.z1 + 0.3;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < x0 || ax > x1) continue; }
    else {
      let ta = (x0 - ax) / dx, tb = (x1 - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (az < z0 || az > z1) continue; }
    else {
      let ta = (z0 - az) / dz, tb = (z1 - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return true;
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
export function findPath(a, b) {
  if (a === b) return [a];
  _open.length = 0;
  _came.clear(); _gs.clear(); _fs.clear();
  _open.push(a);
  _gs.set(a, 0);
  const h = (i) => Math.hypot(NODES[i][0] - NODES[b][0], NODES[i][1] - NODES[b][1]);
  _fs.set(a, h(a));
  while (_open.length) {
    let bi = 0;
    for (let i = 1; i < _open.length; i++) {
      if (_fs.get(_open[i]) < _fs.get(_open[bi])) bi = i;
    }
    const cur = _open.splice(bi, 1)[0];
    if (cur === b) {
      const path = [cur];
      let n = cur;
      while (_came.has(n)) { n = _came.get(n); path.push(n); }
      return path.reverse();
    }
    for (const nb of ADJ[cur]) {
      const g = _gs.get(cur) +
        Math.hypot(NODES[nb][0] - NODES[cur][0], NODES[nb][1] - NODES[cur][1]);
      if (g < (_gs.get(nb) ?? Infinity)) {
        _came.set(nb, cur);
        _gs.set(nb, g);
        _fs.set(nb, g + h(nb));
        if (!_open.includes(nb)) _open.push(nb);
      }
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

export function buildWorld(scene, tex) {
  const mats = {};
  for (const key of ['concrete', 'concreteDark', 'plate', 'plateRust', 'hazard', 'timber', 'asphalt']) {
    mats[key] = new THREE.MeshStandardMaterial({ map: tex[key], roughness: 0.92, metalness: 0.05 });
  }
  mats.plate.metalness = 0.45;
  mats.plateRust.metalness = 0.3;

  const world = new THREE.Group();
  scene.add(world);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const addBox = (x0, z0, x1, z1, h, mat, y0 = 0) => {
    const m = new THREE.Mesh(unitBox, mats[mat]);
    m.scale.set(x1 - x0, h, z1 - z0);
    m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    m.castShadow = h > 1.3;
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  for (const c of colliders) addBox(c.x0, c.z0, c.x1, c.z1, c.h, MAT_FOR[c.mat]);

  // Ground: crest concrete with an asphalt service strip, the spillway
  // chute in dark concrete, and painted site aprons. The ground gets its
  // own finely-tiled copy of the concrete so the pour reads at distance.
  const groundTex = tex.concrete.clone();
  groundTex.repeat.set(14, 8);
  groundTex.needsUpdate = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(97.2, 57.2),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);
  const chute = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 47),
    new THREE.MeshStandardMaterial({ map: tex.concreteDark, roughness: 0.9 }));
  chute.rotation.x = -Math.PI / 2;
  chute.position.set(-1, 0.02, 4.5);
  chute.receiveShadow = true;
  world.add(chute);
  const roadTex = tex.asphalt.clone();
  roadTex.repeat.set(18, 2);
  roadTex.needsUpdate = true;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(97, 9),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.97 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, -23.5);
  road.receiveShadow = true;
  world.add(road);

  // Water: the spillway runnel, the reservoir (north) and the tailrace
  // far below the dam's south face.
  const waterMat = new THREE.MeshStandardMaterial({
    map: tex.water, roughness: 0.25, metalness: 0.1,
    color: 0x9fd8e8, transparent: true, opacity: 0.92,
  });
  const runnel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 47), waterMat);
  runnel.rotation.x = -Math.PI / 2;
  runnel.position.set(-1, 0.05, 4.5);
  world.add(runnel);
  const reservoir = new THREE.Mesh(new THREE.PlaneGeometry(300, 90), waterMat);
  reservoir.rotation.x = -Math.PI / 2;
  reservoir.position.set(0, -0.4, -75);
  world.add(reservoir);
  const tailrace = new THREE.Mesh(new THREE.PlaneGeometry(300, 110), waterMat);
  tailrace.rotation.x = -Math.PI / 2;
  tailrace.position.set(0, -14, 86);
  world.add(tailrace);
  // The dam's south face dropping to the tailrace.
  const face = new THREE.Mesh(new THREE.BoxGeometry(97.2, 14, 1.6),
    new THREE.MeshStandardMaterial({ map: tex.concreteDark, roughness: 0.95 }));
  face.position.set(0, -7, 28.8);
  world.add(face);
  // Foam strip where the spillway meets the river.
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(10, 3),
    new THREE.MeshBasicMaterial({ color: 0xcfeef5, transparent: true, opacity: 0.5 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(-1, -13.8, 33);
  world.add(foam);

  // Turbines: round shells over their square colliders, hazard crowns.
  const turbineGeo = new THREE.CylinderGeometry(3, 3.2, 3.2, 20);
  const crownGeo = new THREE.CylinderGeometry(3.25, 3.25, 0.35, 20);
  for (const tx of [18, 28, 38]) {
    const t = new THREE.Mesh(turbineGeo, mats.plate);
    t.position.set(tx, 1.6, 18);
    t.castShadow = true;
    t.receiveShadow = true;
    world.add(t);
    const crown = new THREE.Mesh(crownGeo, mats.hazard);
    crown.position.set(tx, 3.35, 18);
    world.add(crown);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 10), mats.plateRust);
    shaft.position.set(tx, 4.4, 18);
    world.add(shaft);
  }

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

  // Intake pipes on the pier and a pipe run along the south wall.
  const pipeGeo = new THREE.CylinderGeometry(0.55, 0.55, 9, 12);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(pipeGeo, mats.plate);
    p.rotation.z = Math.PI / 2;
    p.position.set(-43, 0.55 + (i === 1 ? 1.1 : 0), -12 + i * 1.3);
    p.castShadow = true;
    world.add(p);
  }
  const southPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 10), mats.plateRust);
  southPipe.rotation.z = Math.PI / 2;
  southPipe.position.set(27, 0.4, 25.4);
  world.add(southPipe);

  // Site rings and signs.
  const ringMat = (color) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  for (const [key, color] of [['A', 0xffb02e], ['B', 0x39d5e8]]) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 40), ringMat(color));
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

  // Lamps: emissive heads on poles; four real point lights do the work.
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const lampAt = (x, z, withLight) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 6), mats.dark);
    pole.position.set(x, 2.3, z);
    world.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), lampHead);
    head.position.set(x, 4.65, z);
    world.add(head);
    if (withLight) {
      const l = new THREE.PointLight(0xffc98a, 60, 26, 1.8);
      l.position.set(x, 4.4, z);
      world.add(l);
    }
  };
  lampAt(-20, -24, true); lampAt(20, -24, false); lampAt(18, 12, true);
  lampAt(38, 24, false); lampAt(-22, 6, true); lampAt(24, 4, false);
  lampAt(40, -12, true);

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

  return {
    update(dt) {
      tex.water.offset.y -= dt * 0.05;
      tex.water.offset.x = Math.sin(state.time * 0.1) * 0.02;
    },
  };
}
