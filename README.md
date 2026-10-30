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

Phones and tablets play in landscape: the screen locks sideways where the browser allows it (fullscreen on
Android, the installed app); held upright, a "turn your device sideways" screen covers the game and everything
waits (a figure in progress pauses and its clock stops).

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

- The world select is a place you walk: the **Keeper's Isle**, a floating plaza with the Keeper's Lantern in the
  middle and a bridge out to one islet per world, each in its world's colours and trees, with the world's portal on
  its far side. Walk into a portal to travel there. A world opens once the one before it is rebuilt (until then
  its bridge has a gate and its portal sleeps); the world you're up to has a column of light over its portal.
  Your rebuilt figures stand in miniature on each islet (gold pedestals for three stars), the world's finale on
  top of its portal, and the Lantern lights an orb per finished world. A flowery arch leads to Kubo's Garden.
  The title's **Worlds** button and the pause menu's **Keeper's Isle** take you there (`js/nexus.js`,
  `js/features/nexus.js`).
- Each world is an archipelago you walk around: a middle island with a portal, joined by plank bridges to
  one island per figure (two staggered rows; you zip along the bridges). Walk onto a figure's island to start it (its puzzle takes over; a half-built figure
  keeps its progress when you leave). Blocks can't leave their island. Islands of figures you haven't
  reached yet are closed off by a gate on their bridge. Its portal leads back to the Keeper's Isle: you step out of
  that world's portal there. A world's islands share its look but each has a mood of its own: its colours
  (blossom, autumn, golden…), more or fewer trees and rocks, and a landmark (stone circle, giant mushrooms, an
  ancient oak, a wreck…).
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
  figures show a marker over their island. Kubo welcomes you back, and finishing a world shows a world card;
  its way on takes you to the Keeper's Isle, where the next world's gate sinks and its portal wakes in front of you.
- Star rewards: three-star figures get gold pedestals in Kubo's Garden and on the Keeper's Isle, a world with
  every star gets a crown (a gold orb on the Lantern, and a moment on the results), Kubo wears a hat from 25, 60,
  100 and 150 stars (on the islands and in the Garden), the 150th star gets its own card, and the ending can be
  watched again from the Keeper's Isle's pause menu (`js/features/hats.js`).
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
  instead of overlapping. A dropped block lands about two metres out in front, where you can see it (closer when
  a fence or wall is in the way). The pedestal's corner posts are slim posts with a ball on top, so they don't
  pass for blocks.
- Design decisions and the simulator behind them: `docs/design-notes.md`, `tools/design-sim.mjs`.
- First launch skips the title screen and goes straight into the opening cutscene, then the Sprout, where the
  first link comes first: Kubo says hello (one line; a click, a step or a few seconds move on), then grab the block
  lying right in front of you and link it, with looking and walking free all along. A look step and a walk step
  follow only if you haven't looked or walked around enough by then. Drop and the hint aren't drills: Kubo brings
  them up when they're useful (the first full backpack, 15 s without a link), and the first figure's hints are free.
  Finishing the figure before a step comes up leaves no step behind.
- The story opens with a short cutscene (about 15 s: the Keeper Colossus loses the storm, the storm smashes the
  first figure, whose blocks land where you will find them) and closes with one after the Colossus is rebuilt
  (`js/features/cinema.js`; Skip or Esc fast-forwards).
- Kubo floats beside you and does the talking (`js/features/companion.js`): while he talks he stays inside the
  view, his bubble above his head, or up beside him when the top HUD leaves no room (phones); lines queue so each gets a read (click the little Kubo to keep one up), and
  his bubble docks above the backpack when he's out of view. On touch screens the docked bubble lets every touch
  through, its little Kubo included (he sits where the left thumb goes down for the stick).
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

## CrazyGames

`js/crazygames.js` is the one place that touches the CrazyGames SDK (v3). It is only fetched on a CrazyGames page;
everywhere else every call is a no-op.

- **Lifecycle:** `loadingStart` / `loadingStop` around boot; `gameplayStart` / `gameplayStop` only on real transitions
  (in play: an island, the Keeper's Isle, the Garden, the Workshop editor; not in menus, cutscenes, the celebration,
  the pause menu, while held upright or during an ad); `happytime` for a rebuilt world, the finale and the 150th star.
- **Interstitials** (`midgame`): after a finished figure (once the celebration is over, before the results card) and
  when walking through a portal, either way between a world and the Keeper's Isle (behind the portal's flash). Never
  on a button. From the request until it is over the game stands still and swallows all input; while the ad plays it
  is silent. No ad available: the game simply carries on.
- **Save:** written to `localStorage` and to `SDK.data`, and merged at boot (no star in either copy is lost); a
  browser that blocks storage in the iframe keeps progress through the platform.
- **Mute:** the portal's `muteAudio` outranks the game's sliders (they are disabled, with a note; the player's levels
  come back). **Fullscreen:** no in-game switch there (the portal has its own button).

`tests/e2e/crazygames.mjs` checks all of it against a stand-in SDK.

## Store art (CrazyGames submission pack)

`art/store/overview.html` is the whole submission pack on one self-contained page, in the order the portal's
**Submit a game** form asks for it: the name, category, tags, description and controls with copy buttons and character
counts, the game options, the three covers (with the portal's label zone drawn over them and a thumbnail-size
preview), both preview videos, press-kit stills, and a check against every limit the portal enforces. Open it straight
from disk; every asset is a file next to it.

All of it is rendered from the game itself (modelled on puzzlebox's pack):

```sh
PLAYWRIGHT_DIR=/path/with/node_modules/playwright node tools/art-pack.mjs              # everything, ~2 minutes
PLAYWRIGHT_DIR=… node tools/art-pack.mjs --only=covers,stills                          # without re-cutting the videos
```

- **Covers** (`tools/art/covers.mjs`): the game renders the Mushroom's island on the Meadow Isles at twice the cover's
  size (the figure all but rebuilt, its last blocks caught mid-flight, Kubo beside it), and a small HTML composition per
  cover (`art/store/cover-*.html`) puts the game's own logo over it. The lockup is measured against the label zone
  (`covers.json`).
- **Previews** (`tools/art/video.mjs`, needs ffmpeg): the cover, then about 15 s of mostly first-person play with the
  HUD: the Rubber Duck's last blocks linked (the chain and the celebration), grabbing blocks on Frost Isles, the Magnet
  and Kubo Express, a chain at sunset on Sunset Reef, the updraft on Moon Isle, a run across the Keeper's Isle to a
  portal, and one look at the Keeper Colossus. The page's clock is driven by the script, so every frame is exactly
  1/30 s of game time however slowly it renders. The same beats (plus a few scenic ones) give the 1920×1080 stills.
- **Copy and limits**: `tools/art/submission.mjs` (the form's text, options and open points) and `tools/art/spec.mjs`
  (the portal's limits and the tags that exist on the site).

## Browser tests

`tests/e2e/` drives the real game in headless Chrome (Playwright, WebGL through SwiftShader): the tutorial,
all 50 figures, walking between islands, the results card and the way on, gifts, Rebuild, the HUD layout on
phones and in Arabic, keyboard / touch controls, and chain links, the next-figure beacon and the tool buttons, and hints for a block behind you, phones and tablets in landscape only (the turn-your-device screen, pausing and waiting while upright), Kubo and dropped blocks on phones, every island's own landmark (`MOODS_SHOTS=1` saves a picture of each to `tests/e2e/out/`), the 3D picking up again after the phone drops the WebGL context, and the Keeper's Isle (portals in and out, gates, a world waking, the Garden's arch). Each suite starts its own static server.

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
- `js/world-moods.js`: each world's five island moods (colour shifts, tree / rock counts) and their landmarks
- `js/world-kit.js`, `js/world-sky.js`: merged static geometry, shape contours, skies (aurora, sunset,
  moon and ringed planet, storm vortex, cloud sea)
- `js/game.js`: level session (sockets, backpack, interaction, animations, celebration)
- `js/render.js`: toon materials and the ink-outline post pass (depth + normal edges)
- `js/player.js`, `js/input.js`: first-person controller, keyboard/mouse/touch input
- `js/archipelago.js`: a world's islands and themed bridges, joined into one walkable place
- `js/nexus.js`: the Keeper's Isle (the world select): the plaza, an islet and a bridge per world, portals, gates
- `js/main.js`: app flow, HUD, dialogue, saves, and the `ctx` object for features
- `js/features/*.js`: optional features plugged in through `init(ctx)` (the Keeper's Isle, garden,
  workshop, puzzler, accessibility, language picker, debug)
- `js/features/workshop-cam.js`: the Workshop editor's orbit camera (inertia, zoom to cursor,
  framing, spring arm)
- `js/i18n.js`, `js/i18n/`: translations and locale detection
- `js/audio.js`: synthesized sound effects and generative music
- `lib/three.module.min.js`: bundled three.js r186
