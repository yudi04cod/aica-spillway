# SPILLWAY — play-test dossier

Deterministic headless play-test of the rebuilt entry, run 2026-11-17
(17 Nov, WIB) in this session. Every number below comes from a real
browser run; nothing is estimated or invented.

## How to reproduce

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open the game in desktop Chrome. The test hooks are query parameters:

- `?test&seed=N` — soak mode: the player is driven by a bot brain and
  the simulation runs at 12x speed; `window.__stats` holds counters and
  `window.__game` holds the live state and a 5 s event log.
- `?shot=start|play|fight|end&seed=1` — staged compositions for the
  screenshots (see `shots.json`).

The VM used for these runs blocks loopback HTTP in its browser
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`), so the browser runs
below loaded the game from `file://` instead; the game makes no network
requests, so the load is equivalent. Browser: the VM's Chromium 157
under Xvfb, SwiftShader, WebGL 2.0 (`WebGL 2.0 (OpenGL ES 3.0
Chromium)`). Driver: puppeteer-core driving the browser over CDP.
Screenshots: 1280x720 JPEG, quality 82.

## Scenarios and results

Console errors, page errors and failed requests were **0 in every
scenario** (probe, all three soaks, forced defuse, forced detonate,
all four screenshots).

### Soak, seed 1 — 75 s wall, 180 simulated seconds

- Round 1: attackers plant at site A (Marlin, planter) and the charge
  detonates — attackers win the round. Score after round 1: 1–0.
- Round 2 live at end of run; carrier Marlin en route to site A.
- Totals: 8 kills (3 headshots), 61 hits, 373 shots fired, 1 plant.
- Player (bot-driven): alive, 83 HP, $4,800. Money check: 800 start +
  2,400 win + 800 plant team pay + 300 kill + 500 detonate bonus = 4,800.

### Soak, seed 7 — 75 s wall, 190 simulated seconds

- Round 1: defenders win on time (no plant, round clock expired).
  Score after round 1: 0–1 — defenders take a round.
- Round 2: charge planted at site A (Vex, planter) at the end of the run.
- Totals: 10 kills (5 headshots), 81 hits, 1,018 shots fired, 1 plant.
- Player (bot-driven): dead in round 2, $3,400 (800 + 1,800 loss pay +
  800 plant team pay).

### Soak, seed 42 — 45 s wall, 128 simulated seconds

- Round 1: attackers plant at site B (Sable, planter) and the charge
  detonates — attackers win. Score after round 1: 1–0.
- Round 2 live at end of run.
- Totals: 7 kills (5 headshots), 42 hits, 285 shots fired, 1 plant.
- Player (bot-driven): alive, 100 HP, $4,800.

### Forced defuse, seed 3

Setup: charge planted at site A by hand, a kitted defender parked on
it, all other actors moved away.

- Result: **1 defuse**, round ended `defuse`, defenders won the round
  (score 0–1). The 3 s defuse channel with a kit completed before the
  40 s fuse ran out. 0 kills in the run.

### Forced detonate, seed 5

Setup: charge planted at site B by hand with a 5 s fuse, nobody near it.

- Result: **1 detonate**, round ended `detonate`, attackers won the
  round (score 1–0). The fuse expired with no defuser in range.

### Two-way fight

Both directions verified in the same session: attackers won rounds by
detonation (seeds 1, 42, and the forced detonate), defenders won rounds
by time expiry (seed 7) and by defuse (forced defuse). Bot movement is
visible in the carrier trails, e.g. seed 1: Sable −40,−6 → −26,−23 →
10,−23 in round 1; Marlin −36,−12 → −32,−23 → 4,−23.

### Buy phase

Buy phases ran at the start of every round (12 s). Bot shopping is
visible in the economy: bots buy rifles/SMGs and armour when their
wallet allows, and the player's money changes only through the
documented payouts (win/loss/kill/plant/detonate), as checked above.

## Screenshots

Retaken from the rebuilt code with `?shot=…&seed=1`, 1280x720:

| file | bytes | shows |
| --- | --- | --- |
| 1-start.jpg | 54,346 | spawn, crest road, teammate bot, HUD |
| 2-play.jpg | 61,360 | VK-47 (28/120 after firing), channel crossing, defender in sight |
| 3-fight.jpg | 53,902 | site B gantry, two defenders, site ring |
| 4-end.jpg | 70,878 | scoreboard, score 6–4, round 11 |

All four are ≤ 256 KiB, long side 1280, short side 720.

## Entry program

`MAKEFUN_OUTPUT_DIR=out node main.ts` exits 0 and writes
`dossier.json` (452,613 bytes; schema `makefun/dossier/v1`, 4 images,
source text 127,808 bytes of the 163,840 cap, all 14 source files
included whole). Two consecutive runs produce byte-identical
`dossier.json` (verified with `cmp`).
