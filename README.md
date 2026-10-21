# Kubo's Islands

A cozy first-person, cel-shaded voxel puzzle for desktop and mobile browsers.

A storm smashed the Great Figures of the Archipelago into loose blocks. Every block face that
carries a number belongs against the face with the same number on another block. Grab blocks, link
matching numbers onto the growing figure, and rebuild all 50 figures across 10 island worlds (5 each)
with Kubo, the last Keeper. The finale is the 330-block Keeper Colossus.

Live: https://dasseville.me/voxlink/ (every push to `main` deploys through GitHub Actions).

## Run

The game is plain static files (ES modules, no build step). Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows, Shift to run | Left thumb (floating stick, push fully to run) |
| Look | Mouse (pointer lock) | Drag with right thumb |
| Grab / link | Click (or E) | Tap a block / bubble |
| Jump / float | Space (hold inside the glowing ring to float up tall figures) | Jump button |
| Backpack slot | 1–4, mouse wheel, Tab | Tap a slot |
| Drop | Right-click / Q | Drop button |
| Hint | H | Bulb button |
| Photo mode | C | Camera button |
| Gamepad | Left stick move, right stick look, A jump, X/RT link, B/LT drop, Y hint, LB/RB slot, Start pause | |

Keys can be rebound in Settings.

Workshop editor:

| | Desktop | Mobile |
|---|---|---|
| Place / erase / paint | Click (tools: 1/B, 2/E, 3/P; M mirror; Ctrl+Z / Ctrl+Y) | Tap |
| Turn the view | Drag, or arrows / WASD (Shift+Left/Right turns 90°) | Drag with one finger |
| Zoom | Wheel (toward the cursor), PageUp/PageDown, +/- | Pinch |
| Move the view | Right-, middle- or Shift-drag | Two-finger drag (twist to turn) |
| Frame figure / top view | F (twice: reset angle), T, or the buttons on the right | Buttons on the right, double-tap empty space |
| Focus on a block | Middle-click, Alt+click, or hold | Hold |

## How it plays

- Floating **bubbles** on the figure show which numbers are open right now.
- Find a loose block with that number, grab it, then click the bubble (or the block it attaches to).
- You can carry 4 blocks at once. Bubbles you can fill right away turn green.
- Each figure has 3 stars: finish it, beat the par time, and use no hints.
- Big figures are split into parts: every part has its own flagged district on the island, and a
  compass points to where blocks fit right now. All blocks are out from the start.
- Tools on big figures: **Magnet** (R / magnet button) pulls nearby blocks that fit into your
  backpack; **Kubo Express** (F / paper plane) sends every fitting carried block to the figure from
  anywhere. Linking a block also pulls in carried blocks that belong on it (chain links).
- Tall figures get the Keeper's updraft (hold jump inside the glowing ring).
- Each world has its own look, music and twist: Meadow (none, the tutorial), Windmill Farm (hay
  trampolines), Frost (icy lakes), Frostwood (deep snowdrifts slow you, a slippery stream), Sunset Reef
  (wading), Shipwreck Cove (giant clams toss you up the rocks), Starfall (low gravity and jump pads),
  Moon Isle (very low gravity), Gale Cliffs and Eye of the Storm (wind gusts). Dropped blocks stack
  instead of overlapping.
- Design decisions and the simulator behind them: `docs/design-notes.md`, `tools/design-sim.mjs`.
- First launch skips the title screen and goes straight into the opening cutscene, then the Sprout with
  a step-by-step controls tutorial (look, walk, jump, grab, link, drop, hint). Each step only unlocks
  the control it teaches; anything else shakes the coach line. Its practice hint is free.
- The story opens with a cutscene (the Keeper Colossus loses the storm, the storm smashes the first
  figure, whose blocks land where you will find them) and closes with one after the Colossus is rebuilt
  (`js/features/cinema.js`; Skip or Esc fast-forwards).
- Extras: Kubo's Garden (walk among your finished
  figures), photo mode, the Workshop (build and share your own figures), and Puzzler mode
  (link blocks anywhere, solve sums).

## Languages

All 25 CrazyGames locales. The language comes from the player's choice in Settings, then `?lang=`,
then the CrazyGames SDK (`user.systemInfo.locale`), then the browser. English strings live in
`js/i18n/en/*.js`; each locale is `js/i18n/<code>.js`. Every new user-visible string needs a key
in all locales: `node tools/check-i18n.mjs` checks keys, placeholders and tags (CI runs it).

## Debug mode

Open with `?debug` for a panel to play any figure, quick-solve, solve a part, win instantly,
fly / no-clip, unlock everything, replay the prologue / finale cutscenes, and see FPS. Toggle it with the backtick key.

## Code map

- `js/levels.js`: figures (a small voxel modelling kit), chapters, story text, par times
- `js/voxels.js`: number atlas, per-face voxel geometry, spanning-tree puzzle generator
- `js/world.js`: themes, the shared island builder (pedestal, grass, clouds, particles, lights) and the
  world queries the game and player use (`floorAt`, `surfaceAt`, `clampPlayer`, `dropPoint`, ...)
- `js/world-layouts.js`: one generator per chapter world (meadow terraces and pond, frost archipelago,
  reef lagoon and piers, starfall floating islets and jump pads, storm ruins and wind gusts)
- `js/world-kit.js`, `js/world-sky.js`: merged static geometry, shape contours, skies (aurora, sunset,
  moon and ringed planet, storm vortex, cloud sea)
- `js/game.js`: level session (sockets, backpack, interaction, animations, celebration)
- `js/render.js`: toon materials and the ink-outline post pass (depth + normal edges)
- `js/player.js`, `js/input.js`: first-person controller, keyboard/mouse/touch input
- `js/main.js`: app flow, HUD, world map, dialogue, saves, and the `ctx` object for features
- `js/features/*.js`: optional features plugged in through `init(ctx)` (garden, photo,
  workshop, puzzler, accessibility, language picker, debug)
- `js/features/workshop-cam.js`: the Workshop editor's orbit camera (inertia, zoom to cursor,
  framing, spring arm)
- `js/i18n.js`, `js/i18n/`: translations and locale detection
- `js/audio.js`: synthesized sound effects and generative music
- `lib/three.module.min.js`: bundled three.js r186
