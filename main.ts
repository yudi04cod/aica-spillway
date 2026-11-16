// SPILLWAY — entry program for make.fun's threejs-fps-01 bounty.
//
// The game itself is plain static files in game/ (ES modules, vendored
// three.js 0.187.0, no build step). This program is the courier: it
// delivers game/ and screenshots/ into the output directory and writes
// the dossier the judge reads, using the kit's own dossier library so
// the bytes match the gate's rebuild exactly.
//
//   node main.ts                          -> writes /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts   -> writes ./out (local check)
//
// The grader runs this twice in a fresh container with no network; both
// runs must produce identical bytes, so the copy is a plain recursive
// copy and nothing here depends on clocks or randomness.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored so an oversized entry fails here with a clear
// message instead of at the scorer: at most 4 screenshots of 256 KiB,
// game/ within 993 entries and 48 MiB, dossier text capped at 160 KiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function countEntries(dir) {
  let n = 0;
  for (const name of readdirSync(dir).sort()) {
    n++;
    if (statSync(join(dir, name)).isDirectory()) n += countEntries(join(dir, name));
  }
  return n;
}

function deliver(fromRel, toRel) {
  const from = join(root, fromRel);
  if (!existsSync(from)) return 0;
  const to = join(outDir, toRel);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  return countEntries(to);
}

mkdirSync(outDir, { recursive: true });
const gameEntries = deliver('game', 'game');
const shotEntries = deliver('screenshots', 'screenshots');

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Sanity-check the artefact we just wrote: it must parse, carry the
// dossier schema, name 3-4 screenshots and hold a non-empty source text
// (a truncated or empty dossier would fail the gate silently later).
const parsed = JSON.parse(Buffer.from(dossier).toString('utf8'));
if (parsed.schema !== 'makefun/dossier/v1') throw new Error('spillway: unexpected dossier schema');
if (!Array.isArray(parsed.images) || parsed.images.length < 3 || parsed.images.length > 4) {
  throw new Error('spillway: dossier holds the wrong number of screenshots');
}
if (typeof parsed.text !== 'string' || !parsed.text.includes('game/index.html')) {
  throw new Error('spillway: dossier text is missing the game source');
}

console.log(`spillway: delivered game/ (${gameEntries} entries) + screenshots/ (${shotEntries} files)`);
console.log(`spillway: dossier.json ${Buffer.byteLength(dossier)} bytes -> ${outDir}`);
