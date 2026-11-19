# STREET LEGACY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/iqbalcokk8-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/iqbalcokk8-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**An original open-world crime game in Velmora City — built for make.fun bounty `gta6-01` ($1,666 USDC).**

Kai Mercer returns to Velmora after five years — and the city is no longer his.
The Voss family controls the harbour, the police are bought, and an old debt is
being collected. Steal cars, outrun the law, finish three story missions, and
take the streets back.

Everything in this game is original: the city, characters, vehicles, names,
story, art and sound. No Rockstar Games name, logo, character, map or asset
is used. All 3D art is procedural (Three.js geometry + canvas textures);
all sound is synthesized with WebAudio. The game runs fully offline from
static files — no network request while playing.

## Play it

```bash
node serve.ts            # serves game/ on http://localhost:8080
```

Then open http://localhost:8080 in a desktop browser (Chrome/Edge, keyboard +
mouse). No build step, no install.

Or open `game/index.html` directly from any static file server.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move (on foot) / drive (in car) |
| Mouse (drag) | Orbit camera |
| Shift | Sprint |
| Space | Jump |
| E | Enter / exit car · advance dialogue · use mission marker |
| Click (left) | Shoot pistol |
| F | Punch |
| R | Reload |
| P | Pause |
| N | Day / night |
| M | Mute |
| H | Help |

## The game

**Velmora City — one dense district.** Downtown towers, a market street with
signed shops (Tacos 24H, Auto Fix, Velmora Bar, Burger Shot…), a residential
area, a park, and the Harbour Row docks with containers, a warehouse and a
crane. Procedural buildings with lit windows, billboards, street lamps, trees,
parked cars and road markings. Day/night cycle with fog and a golden-hour
dusk; lamps glow at night.

**Systems**

- **Third-person controller** — run, sprint, jump, walk-cycle animation,
  chase camera with trauma-based shake.
- **Driving** — arcade physics (acceleration, braking/reverse, speed-scaled
  steering, collisions). Steal any parked or traffic car with E.
- **Traffic & pedestrians** — 8 traffic cars following the road grid, 14
  pedestrians walking the sidewalks who flee from gunfire and crashes.
- **Wanted system (0–5 stars)** — stealing, punching, shooting and running
  people over raise your wanted level. Police cars chase and ram you; foot
  cops chase and shoot on foot. Lay low and the heat cools off.
- **Pay 'n Spray** — drive into the Auto Fix garage with $50 to wipe your
  wanted level.
- **Combat** — pistol with tracer fire, 12-round magazine + reload, melee
  punch with knockback, hit-stop on kills, particle bursts, damage flash.
- **Health / money / reputation** — HP regen, health + cash pickups, mission
  rewards, fines when busted or wasted.
- **HUD + minimap** — wanted stars, health bar, cash, ammo, clock, speed,
  live minimap (roads, buildings, player, objective, police, rivals).
- **Save** — progress (money, rep, mission) is saved to localStorage;
  CONTINUE appears on the title screen.

## Story — 3 missions

1. **COMING HOME ($250)** — Meet Marco at Velmora Bar, pick up a package at
   the east docks, deliver it to Auto Fix.
2. **HOT WHEELS ($400)** — Steal the red sports car from the showroom and
   deliver it to Auto Fix while the police hunt you (wanted 2).
3. **DOCK WAR ($700)** — Clear 5 Voss enforcers from the docks, then escape
   to the safehouse. Finish all three to become a **STREET LEGEND**.

Fail a mission by getting wasted or busted and you can retry it from its
start marker. After the story, free roam continues.

## Tech

- Three.js (vendored under `game/vendor/three/`, no CDN), ES modules.
- Single-file game logic in `game/src/main.js` (~1,050 lines) + `game/index.html`
  (HUD, menus, minimap).
- Deterministic screenshot mode: `?shot=start|play|end&seed=N` stages a
  fixed scene and sets `window.__shotReady` for captures (see `shots.json`).
- `window.__game` exposes state for automated play-testing.
- Performance: ~15k–42k triangles per frame depending on view, capped pixel ratio, one 2048px
  shadow map, simple circle-vs-AABB collision. SwiftShader headless runs at
  ~1 fps (software rendering); on real GPU hardware it targets 60 fps.

## Files

```
main.ts            # entry program (Node 22): copies game/ + screenshots/ to /output, writes dossier.json
serve.ts           # local static server for game/
shots.json         # the 4 dossier screenshots and their ?shot= URLs
game/
  index.html       # page, HUD, menus, import map
  src/main.js      # the whole game
  vendor/three/    # vendored Three.js (three.module.min.js + three.core.min.js, MIT)
screenshots/       # 1-start, 2-play, 3-chase, 4-end — real renders of this game
```

## Play-test results (headless Chromium, 18 Nov 2026)

Verified in a real browser session (see `STATUS.md` for the full log):

- Game boots with zero console/page errors and zero failed requests.
- Walking, camera orbit, entering/exiting cars, driving, shooting, punching —
  all work.
- Stealing a car raises wanted to 1 star; police cars spawn and chase.
- Mission 1 completes ($120 → $370). Mission 2 completes (steal + deliver,
  $500 → $850 after a $50 Pay 'n Spray). Mission 3 completes (5 rivals
  killed, safehouse delivery, $820, STREET LEGEND end screen).
- WASTED → end screen → retry respawns with full health and cleared wanted.
- Night toggle works. No critical errors in any run.

## License

OSI-approved license — see `LICENSE`. Original work, 2026.
