# SPILLWAY — Tactical Breach at Meridian Dam

[![make.fun bounty](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/c/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/{owner}/{repo}/rank.svg)](https://make.fun/c/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/{owner}/{repo}/reward.svg)](https://make.fun/c/threejs-fps-01)

An original round-based tactical FPS for the browser, built on three.js 0.187.0.
Two five-bot squads fight over a hydroelectric dam at dusk: the **Sluice Runners**
attack, the **Dam Wardens** defend. Plant the breach charge at site **A — the
Turbine Hall** — or site **B — the Gantry Crane** — or win the round the loud way.
First side to 7 rounds takes the dam.

Play it on [make.fun](https://make.fun/c/threejs-fps-01) — or run it locally below.

## The game

- **Counter-Strike-shaped rounds**: 12 s buy phase, 100 s rounds, a 40 s charge
  timer, defuse (twice as fast with a kit), win/loss/kill/plant economy.
- **Six guns with distinct handling** — P9 Gull sidearm, Kestrel .50, Riptide-9
  SMG, Breaker-8 shotgun, VK-47 Longshore rifle, scoped Harpoon DMR — plus frag
  and smoke grenades. Spread blooms when you move or spray; stopping and
  crouching tighten it. Headshots multiply damage; kevlar halves it.
- **Nine bot teammates and opponents** with perception (sight, smoke, gunfire),
  waypoint routing across three lanes, burst fire discipline, escorts, a
  designated planter, site holders, a roaming flex, and post-plant retakes
  with defuse attempts.
- **One original map**: the Meridian Dam — crest road, control building,
  spillway channel with three crossings, west works yard, east apron and the
  turbine hall, lit by a low dusk sun and sodium lamps over reservoir water.
- **Full HUD**: health and armour, ammo and money, round clock and score,
  alive pips, killfeed, radar, buy menu, scoreboard, plant progress.
- **All sound is synthesized** with WebAudio (per-weapon gunshots, the charge's
  quickening beeps, explosions, footsteps). No assets, no network requests:
  the whole game is static files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Aim (pointer lock) |
| Left click | Fire |
| Right click | DMR scope |
| R | Reload |
| Ctrl / C | Crouch |
| Space | Jump |
| 1 / 2 | Primary / sidearm |
| 3 / 4 | Frag / smoke grenade |
| E (hold) | Plant the charge |
| B | Buy menu (buy phase) |
| Tab | Scoreboard |

## Run it

```sh
node serve.ts          # then open http://localhost:8080
```

Any static file server pointed at `game/` works the same.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the kit's vendored
`buildDossier` library.

## Layout

- `game/index.html` — page, HUD DOM and styling
- `game/src/` — one module per job: `state` (the match state), `map` (the dam:
  data, collision, sight lines, waypoint graph), `weapons` (armoury + grenades),
  `actors` (bodies, movement, damage), `bots` (perception, tactics, objective
  play), `rounds` (phases, charge, economy), `player` (controls + viewmodel),
  `hud`, `audio` (synth), `fx` (pooled tracers, particles, smoke), `textures`
  (procedural surfaces), `main` (fixed-step loop)
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte
- `screenshots/` — renders of the game, taken in a browser

## License

MIT — see `LICENSE`.

<sub>Entered in the [threejs-fps-01 bounty](https://make.fun/c/threejs-fps-01) on make.fun · referral: MAKEFUN_REFERRAL_CODE</sub>
