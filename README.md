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
| Look | Mouse (pointer lock), or J / L to turn and I / K to look up and down | Drag with right thumb |
| Grab / link | Click (or E) | Tap a block / bubble |
| Jump / float | Space (hold inside the glowing ring to float up tall figures) | Jump button |
| Backpack slot | 1–4, mouse wheel, Tab | Tap a slot |
| Drop | Right-click / Q | Drop button |
| Hint | H | Bulb button |
| Rebuild a finished figure for stars | R (on its island) | Rebuild button |
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

- Each world is an archipelago you walk around: a middle island with a portal, joined by plank bridges to
  one island per figure (two staggered rows; you zip along the bridges). Walk onto a figure's island to start it (its puzzle takes over; a half-built figure
  keeps its progress when you leave). Blocks can't leave their island. Islands of figures you haven't
  reached yet are closed off by a gate on their bridge. The portal travels between worlds (the world select).
- Floating **bubbles** on the figure show which numbers are open right now.
- Find a loose block with that number, grab it, then click the bubble (or the block it attaches to).
- You can carry 4 blocks at once. Bubbles you can fill right away turn green.
- Each figure has 3 stars: finish it, beat the par time, and use no hints. The goals sit under the
  progress bar while you build (time against par, hints used, each with its star); the first hint of a
  run asks for a second press, since it costs the no-hint star.
- Finishing a figure has no results screen: the camera circles the figure, then you're straight back in control
  with a results card in the HUD (labelled stars marked New, time against par, hints, the world's progress).
  When there's a way on (the next world, the epilogue, a friend's gift) the card offers it on **Enter** (a tap
  on phones, Y on a gamepad); otherwise it fades as you walk on. Workshop figures still end on a results panel
  (Share, back to the Workshop). Par is per block (the Storm figures' bigger head start is left out), a little longer on slow ground (snow, ice, the lagoon); times count in whole seconds, as shown.
- Finished islands stay built: walking onto one (or arriving in a finished world) just lets you roam;
  **Rebuild for stars** (R / button, press twice: it takes the figure apart) starts a fresh, timed run for the
  stars still missing; walking away from a rebuild drops it and the figure stands whole again. The clock only runs on the figure's own
  island, and not during the tutorial.
- Continue goes back to the figure you last played (or a half-built one); the title shows where. Half-built
  figures show a half-filled pip on the world select and a marker over their island. Kubo welcomes you
  back, and finishing a world shows a world card and takes you on to the next one.
- Star rewards: three-star figures get gold pedestals in Kubo's Garden and gold pips on the world select,
  a world with every star gets a crown (and a moment on the results), Kubo wears a hat from 25, 60, 100 and 150 stars
  (on the islands, in the Garden and on the map), the 150th star gets its own card, and the ending can be watched
  again from the world map
  (`js/features/hats.js`).
- Big figures are split into parts: every part has its own flagged district on the island, and a
  compass points to where blocks fit right now. All blocks are out from the start.
- Tools on big figures: **Magnet** (R / magnet button) pulls nearby blocks that fit into your
  backpack; **Kubo Express** (F / paper plane) sends every fitting carried block to the figure from
  anywhere. A ring around each tool fills towards its next charge, and a tool glows green while using it would
  help (a block that fits within the magnet's reach; carried blocks that fit while you're away from the figure).
- Linking a block brings along every other carried block that fits, one after another (chain links), so one
  click empties the backpack of everything the figure can take. Puzzler mode only chains the blocks that belong
  right on the one you linked, since it never gives away what fits.
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
- Kubo floats beside you and does the talking (`js/features/companion.js`): lines queue so each gets a
  read (tap the bubble to keep it up), and his bubble docks above the backpack when he's out of view.
- Extras: Kubo's Garden (walk among your finished
  figures), the Workshop (build and share your own figures; your own figures earn stars too),
  and Puzzler mode (link blocks anywhere, solve sums; best times kept separately).
- Sharing: figure links use the CrazyGames SDK invite link (and `getInviteParam('fig')`) when embedded
  there, otherwise `?fig=`. Every incoming gift goes straight into the workshop (with a full workshop it waits and
  moves in when a slot frees up); a new player gets a short card and Kubo hands it over after the Sprout. Your
  own figures' results have a Share button, and the share sheet uses the system share sheet where there is one.

## Languages

All 25 CrazyGames locales. The language comes from the player's choice in Settings, then `?lang=`,
then the CrazyGames SDK (`user.systemInfo.locale`), then the browser. English strings live in
`js/i18n/en/*.js`; each locale is `js/i18n/<code>.js`. Every new user-visible string needs a key
in all locales: `node tools/check-i18n.mjs` checks keys, placeholders and tags (CI runs it).

## Browser tests

`tests/e2e/` drives the real game in headless Chrome (Playwright, WebGL through SwiftShader): the tutorial,
all 50 figures, walking between islands, the results card and the way on, gifts, Rebuild, the HUD layout on
phones and in Arabic, keyboard / touch controls, and chain links, the next-figure beacon and the tool buttons, and hints for a block behind you, and the 3D picking up again after the phone drops the WebGL context. Each suite starts its own static server.

```
PLAYWRIGHT_DIR=/path/with/node_modules/playwright node tests/e2e/run.mjs          # everything
PLAYWRIGHT_DIR=… node tests/e2e/run.mjs gift hud                                   # some suites
```

Playwright isn't a dependency of the game; point `PLAYWRIGHT_DIR` at any folder whose `node_modules` has it.

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
- `js/features/*.js`: optional features plugged in through `init(ctx)` (garden,
  workshop, puzzler, accessibility, language picker, debug)
- `js/features/workshop-cam.js`: the Workshop editor's orbit camera (inertia, zoom to cursor,
  framing, spring arm)
- `js/i18n.js`, `js/i18n/`: translations and locale detection
- `js/audio.js`: synthesized sound effects and generative music
- `lib/three.module.min.js`: bundled three.js r186
