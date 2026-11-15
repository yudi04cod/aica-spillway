// fx.js — transient visuals, all pooled: tracer lines, impact particles,
// muzzle flashes, explosion fireballs and smoke clouds. Nothing here is
// allocated per frame; pools are sized once at init and recycled.

import * as THREE from 'three';

const MAX_TRACERS = 96;
const MAX_PARTICLES = 900;

let scene = null;
let tracerGeo, tracerPos, tracerCol, tracerLife; // Float32 arrays
let points, pPos, pVel, pLife, pMaxLife, pCol;
let flashes = [];
const smokes = []; // {mesh, t, dur, r, x, y, z}

export function initFx(s) {
  scene = s;
  // Tracers as one LineSegments with per-vertex colours.
  tracerPos = new Float32Array(MAX_TRACERS * 6);
  tracerCol = new Float32Array(MAX_TRACERS * 6);
  tracerLife = new Float32Array(MAX_TRACERS);
  tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const lines = new THREE.LineSegments(tracerGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  lines.frustumCulled = false;
  scene.add(lines);

  // Particles as one Points cloud.
  pPos = new Float32Array(MAX_PARTICLES * 3);
  pVel = new Float32Array(MAX_PARTICLES * 3);
  pLife = new Float32Array(MAX_PARTICLES);
  pMaxLife = new Float32Array(MAX_PARTICLES);
  pCol = new Float32Array(MAX_PARTICLES * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(pg, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -50;

  // Muzzle flash sprites (additive quads) — a small pool of meshes.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc46b, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat.clone());
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, t: 0 });
  }
}

let tracerCursor = 0;
export function tracer(x0, y0, z0, x1, y1, z1, r, g, b) {
  const i = tracerCursor; tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
  tracerPos.set([x0, y0, z0, x1, y1, z1], i * 6);
  tracerCol.set([r, g, b, r * 0.25, g * 0.25, b * 0.25], i * 6);
  tracerLife[i] = 0.07;
  tracerGeo.attributes.position.needsUpdate = true;
  tracerGeo.attributes.color.needsUpdate = true;
}

let pCursor = 0;
export function burst(x, y, z, n, r, g, b, speed, life, up = 1.6) {
  for (let k = 0; k < n; k++) {
    const i = pCursor; pCursor = (pCursor + 1) % MAX_PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = speed * (0.3 + Math.random() * 0.7);
    pVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    pVel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * up * 0.5 + Math.random() * up * 0.4;
    pVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    pLife[i] = pMaxLife[i] = life * (0.6 + Math.random() * 0.7);
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  }
  points.geometry.attributes.color.needsUpdate = true;
}

export function muzzle(x, y, z, yaw, pitch) {
  for (const f of flashes) {
    if (f.t > 0) continue;
    f.t = 0.045;
    f.mesh.visible = true;
    f.mesh.position.set(x, y, z);
    f.mesh.rotation.set(pitch, yaw, Math.random() * 3);
    f.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    return;
  }
}

export function explosionFx(x, y, z, big) {
  burst(x, y + 0.5, z, big ? 90 : 40, 1, 0.55, 0.15, big ? 13 : 8, 0.9);
  burst(x, y + 0.5, z, big ? 50 : 20, 0.5, 0.45, 0.4, 6, 1.4);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(big ? 3.4 : 1.8, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa63e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(x, y + 0.6, z);
  scene.add(flash);
  flashes.push({ mesh: flash, t: big ? 0.5 : 0.3, grow: big ? 14 : 8, temp: true });
}

const smokeGeo = new THREE.SphereGeometry(1, 14, 10);
const smokeMat = new THREE.MeshStandardMaterial({
  color: 0x9aa4a8, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
});
export function spawnSmoke(x, z) {
  const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
  mesh.position.set(x, 1.6, z);
  mesh.scale.setScalar(0.5);
  scene.add(mesh);
  smokes.push({ mesh, t: 0, dur: 15, r: 5.2, x, y: 1.6, z });
}

// Does any mature smoke cloud block the segment a->b? (Bot perception.)
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of smokes) {
    if (s.t < 0.8 || s.t > s.dur - 1.5) continue;
    // Segment-sphere: closest distance from the centre to the segment.
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r * 0.8) return true;
  }
  return false;
}

export function updateFx(dt) {
  let anyTracer = false;
  for (let i = 0; i < MAX_TRACERS; i++) {
    if (tracerLife[i] <= 0) continue;
    tracerLife[i] -= dt;
    if (tracerLife[i] <= 0) {
      tracerPos[i * 6 + 1] = -100; tracerPos[i * 6 + 4] = -100;
      tracerGeo.attributes.position.needsUpdate = true;
    } else anyTracer = true;
  }
  void anyTracer;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
    pVel[i * 3 + 1] -= 5.5 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; pVel[i * 3 + 1] *= -0.3; }
  }
  points.geometry.attributes.position.needsUpdate = true;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    if (f.t <= 0) continue;
    f.t -= dt;
    if (f.grow) f.mesh.scale.multiplyScalar(1 + f.grow * dt);
    if (f.temp) f.mesh.material.opacity = Math.max(0, f.t * 1.8);
    if (f.t <= 0) {
      f.mesh.visible = false;
      if (f.temp) { scene.remove(f.mesh); flashes.splice(i, 1); }
    }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.t += dt;
    const grow = Math.min(1, s.t / 1.4);
    s.mesh.scale.setScalar(0.5 + (s.r - 0.5) * grow);
    s.mesh.material.opacity = 0.52 * Math.min(1, (s.dur - s.t) / 2.5) * grow;
    s.mesh.position.y = 1.6 + Math.sin(s.t * 0.7) * 0.15;
    if (s.t >= s.dur) { scene.remove(s.mesh); smokes.splice(i, 1); }
  }
}

export function clearTransientFx() {
  tracerLife.fill(0);
  for (let i = 0; i < MAX_TRACERS; i++) { tracerPos[i * 6 + 1] = -100; tracerPos[i * 6 + 4] = -100; }
  pLife.fill(0);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -50;
  for (const s of smokes) scene.remove(s.mesh);
  smokes.length = 0;
}
