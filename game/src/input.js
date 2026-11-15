// input.js — raw keyboard/mouse capture and pointer lock. Consumers read
// `keys` (held), `pressed` (went down this frame) and the accumulated
// mouse delta; player.js turns them into movement intent.

export const keys = new Set();
export const pressed = new Set();
export const mouse = { dx: 0, dy: 0, down: false, rdown: false };
export const intent = { use: false, fire: false, aim: false };
let locked = false;

export function isLocked() { return locked; }

export function initInput(canvas, onLockChange) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; mouse.rdown = false; });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  });
  canvas.addEventListener('click', () => {
    if (!locked) canvas.requestPointerLock();
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rdown = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rdown = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function consumeMouse() {
  const d = { dx: mouse.dx, dy: mouse.dy };
  mouse.dx = 0; mouse.dy = 0;
  return d;
}

export function endFrame() { pressed.clear(); }
