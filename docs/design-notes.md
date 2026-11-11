# Design notes

## 2026-10-21 · All blocks at once vs. parts

**Question.** Big figures were built in *parts*: only the current part's blocks were on the island and
the next part rained down when it was finished. Would putting **all blocks on the island at once**
(optionally with power-ups against crowding) play better?

**Method.** `tools/design-sim.mjs` simulates a human-like player on the real figures and puzzle
trees: it knows the open bubble numbers (HUD), notices blocks within 14 m, must walk within 4.5 m to
read a block's numbers, remembers its last 8 reads, sees the "fits now" glint within 9 m, carries 4
blocks and walks at 6.2 m/s. 12 seeds per variant. *Wasted reads* = blocks inspected that could not
fit, a proxy for the "too crowded / too many numbers" feeling.

| Colossus (330 blocks)                   | time   | walking | wasted reads / link |
|-----------------------------------------|--------|---------|---------------------|
| parts, scattered over the whole island  | 48 min | 12.0 km | 0.47 |
| all at once, random                     | 56 min | 10.7 km | **2.89** |
| all at once + magnet tool               | 53 min |  9.6 km | 2.90 |
| all at once, zoned by part              | 45 min |  7.9 km | 2.28 |
| **all at once, zoned + zone-aware HUD** | 28 min |  5.9 km | **0.24** |
| …plus magnet tool                       | 26 min |  5.2 km | 0.24 |

Windmill (70), Whale (84), Dragon (118) and Octopus (122) show the same ordering (−25 to −40 % time).

**Findings.**
- Plain "all at once" is *worse*: 3–6× more irrelevant numbers to read. Crowding is real.
- A magnet / power-up alone barely helps crowding; it only saves walking.
- **Spatial organisation is what matters**: each part's blocks in their own *district* of the island,
  plus a HUD compass telling you which district is active, beats both the old parts and plain
  all-at-once on every metric — while still giving the freedom and overview of having everything
  on the island from the start (no waiting for blocks to rain in).

**Decision.** All blocks are placed at once, grouped into colour-flagged *districts* (one per
part, the first one facing the spawn). No bubbles are held back; parts remain as milestones with a
celebration. A district compass points to the active district. A **Magnet** tool (charges earned
by linking) pulls every block that fits right now within 10 m into the backpack.

## 2026-10-21 · Follow-up experiments (same simulator, districts + magnet)

| Change (Colossus, 330 blocks)                         | time    | walking |
|-------------------------------------------------------|---------|---------|
| baseline, linking within 4 m of the pedestal          | 26.0 min | 5.2 km |
| link from ~11 m (what the game already allows)        | 21.9 min | 3.7 km |
| + backpack of 6                                       | 20.4 min | 3.3 km |
| + backpack of 8                                       | 20.0 min | 3.2 km |
| link 11 m + island radius × 0.8                       | 17.5 min | 2.3 km |
| longer reading distance (floating number labels)      | slower: more irrelevant numbers read |

**Decisions.** Walking dominates play time, so islands for big figures are ~15 % smaller
(`R = max(12 + 0.95·√n, footprint + 12)`). The backpack stays at 4: 6–8 slots only gain 5–8 %
and crowd the HUD on phones. No floating number labels: the "fits now" glint already does the
useful part, more visible numbers only add noise.

## 2026-10-21 · Tools: chain links and Kubo Express

- **Chain links.** Blocks in the backpack that belong directly on the block you just linked now fly
  in by themselves, one after another with rising pitch ("Chain ×3!"). It removes repetitive aiming
  and rewards collecting neighbouring numbers together.
- **Kubo Express.** Linking from anywhere (no walk back to the figure) cut simulated play time by
  33 % (Colossus), 19 % (Dragon) and 9 % (Windmill). Unlimited, it would remove the rhythm of
  returning to watch the figure grow, so it is a limited tool: one charge per 20 links (max 2) on
  figures with districts. It sends every carried block that fits to its bubble (key F / plane button).
- Tools now: Hint (costs the no-hint star), Magnet (R, every 12 links), Kubo Express (F, every 20
  links), plus the Keeper's updraft on tall figures.

## 2026-10-21 · Chain links: one rule

Playtest: it wasn't clear when carried blocks went onto the figure by themselves. Only the blocks that belonged
right on the block you had just linked did, which you can't see; a carried block whose bubble was already
open stayed in the backpack, even though it looked just the same (green). Now linking any block brings along
every carried block that fits, and the ones those open up, so the rule is "everything green goes in". The
backpack line says so ("Click one of bubbles 4, 12: they all link") and Kubo points it out the first time.
Kubo Express keeps its point: it does the same from anywhere, without the walk back. Puzzler mode keeps the
old rule, since it never shows what fits.

The tool buttons also say more: a ring fills towards the next charge (charges are no longer counted while a tool
is full), a key cap shows H / R / F on desktop, "+1 Magnet" shows under the button on a new charge, and a tool
glows green while using it would do something.

## 2026-10-21 · Worlds with their own identity

Every chapter used the same round island with box plateaus; only colours changed. Each world now
has its own layout, landmarks, sky, music, ambience and one gentle twist:

| World | Layout & landmarks | Twist |
|---|---|---|
| Meadow | stepped terraces, pond with bridge, cottage, fences, hay bales | none (tutorial baseline) |
| Frost | archipelago of islets joined by ice bridges, igloo, aurora | slippery frozen lake |
| Reef | sand crescent around a shallow lagoon, piers, sea stacks, sunset | wading slows you |
| Starfall | floating islets over a cloud sea, crystals, moon & ringed planet | low gravity + jump pads |
| Storm | ruined pillar ring and arches on a windswept plateau, vortex sky | gentle wind gusts |

A reachability check (flood-fill + jump/step rules) confirms every block on every level can be
reached, also after combining the new layouts with districts.

## 2026-10-21 · 50 figures

The campaign grew from 20 to 50 figures: 10 per world instead of 4. Each world still ramps from small
to its finale (Windmill, Polar Bear, Whale, Star Dragon, Keeper Colossus), and the new figures fill the
gaps in that ramp, so every world opens with a short figure (11–38 blocks) after the previous finale.
Story lines that point at the next figure ("One figure left…", "I can see the Colossus") stay right
before it. Total par time is about 6 hours (was about 2.5).

- **Saves.** `unlocked` counts figures in campaign order, so old saves are migrated once
  (`save.campaign = 2`): everything up to the furthest figure the player had reached opens up,
  including the new figures before it.
- **Map.** Each chapter band is as tall as its number of islands.
- **Garden.** 50 pedestals don't fit one ring at a comfortable size (it would need a 43 m radius), so
  the first two chapters stand on an inner ring and the last three on an outer ring, both open to the
  south. This also fixed the fifth chapter's figures, which had no gallery angle and never appeared.
- **Island difficulty** follows the figure's position within its chapter (`chapterProgress`, 0–1)
  instead of its index, so ten figures per chapter don't max it out early.

## 2026-10-21 · Ten worlds of five

Ten figures per world made each world long (up to an hour of par time) before the scenery changed, so
every world was split in two: 10 worlds of 5 figures, each ending on its biggest figure. The figure order
is unchanged, so saves (which count figures in order) carry over as they are.

| New world | Between | Layout & landmarks | Twist |
|---|---|---|---|
| Windmill Farm | Meadow → Frost | fenced crop fields, red barn and silo, a turning windmill, sheep | hay trampolines onto tall hay stacks |
| Frostwood | Frost → Reef | dense snowy pines, log cabin, a frozen stream | deep snowdrifts slow you; the stream is slippery |
| Shipwreck Cove | Reef → Starfall | rocky crescent round a deep bay, a half-sunk wreck, tide pools | giant clams toss you onto rock stacks |
| Moon Isle | Starfall → Storm | cratered moon over the void, moon base, Earth in the sky | very low gravity (0.42 g): one jump reaches the mesas |
| Gale Cliffs | Starfall/Moon → Storm | chalk sea cliffs, terraced hills, dry-stone walls, cottages, kites | wind gusts |

Bounce pads (farm, cove) reuse Starfall's launch maths with normal gravity; every pad was checked to land
the player on its target. The share of blocks placed up high and the island difficulty were rescaled for
twice as many chapters (`chapter * 0.04` and `chapter * 0.16`), so each figure keeps its old values.

## 2026-10-21 · Patterned blocks, workshop worlds, no daily figure

- **Patterned blocks.** Five new palette colours carry a face pattern drawn by the voxel shader: glossy
  apple red, toadstool red with light dots, ladybug red with dark spots, blue glass and yellow glass. They
  make small figures read at a glance (the mushroom's dots, the ladybug's spots, lamps, visors, domes) without
  extra blocks. The pattern is placed from each face's position in its atlas tile, so it shows on game
  blocks, thumbnails, the garden and the cutscenes alike; the workshop uses the same shader on its blocks.
  The apple was rebuilt rounder (31 blocks) and became the Meadow's finale.
- **Workshop worlds.** Custom figures can stand on any of the ten worlds. Share codes stay readable: codes
  for the first four worlds are still version 1 (2-bit theme); the others are version 2 (4-bit theme).
- **Daily figure removed** (code, styles and its 17 strings per locale). Old saves lose their daily stats.

## 2026-10-21 · Walking between figures

A generic level select broke the feeling of being on the islands, so you now walk from figure to figure.

- **Waystones.** Every island shows its world's other four figures on pedestals around the rim, ordered from
  the spawn: later figures clockwise, earlier ones counter-clockwise. Finished figures stand in miniature,
  the next one to play is a glowing silhouette with a "?", later ones are locked. A gate on the far side
  leads to the next world. Walking into a pedestal (or through the gate) opens the figure's briefing;
  Back returns you to the island. Starting another figure while one is half built warns that its progress
  is lost.
- **After a figure** the results panel's main button is "Walk on": you're back on the island with the
  finished figure, the puzzle HUD steps aside, the next waystone lights up and an edge arrow points to it.
- **Map → world select.** One island per world (the figure you're on there, five progress pips); the
  title's Play goes straight to your next figure's briefing.
- Waystones are placed with the same free-ground test as loose blocks, which then keep clear of them.

## 2026-10-21 · Archipelagos instead of waystones

The waystones (every figure island showing the world's other figures in miniature) gave too much away and
still felt like a menu. Each world is now one walkable archipelago (`js/archipelago.js`):

- A small **hub island** with the world's portal on its south side; a causeway runs north to a boardwalk, and
  a spur leads from it into the south side of each **figure island**, which sit in a row. The spur lands
  where every island layout already keeps a clear path to the pedestal, so no island needed rotating.
- **Only one figure island is active.** The whole archipelago is shifted so the active island sits at the
  origin (what all the game's figure logic expects); walking onto another island just moves that shift and
  loads its puzzle (1–12 ms), so the walk is continuous. Islands are built once per world (40–150 ms) as
  "parts" without their own sky, sea or lights; the hub provides those, and the sun's shadow follows you.
- **Blocks stay on their island**: while you carry any, the active island's shore holds you back, bridge
  included ("drop them before you cross"). Dropped blocks always land on the active island.
- **Every figure keeps its own saved run** (`save.sessions`), so you can leave a half-built figure.
- **Locked islands** have a gate on their spur. **Teleporting** only happens between worlds, by the portal
  (it opens the world select; Back returns you to the island).
- The briefing screen is gone; a figure's intro line is Kubo's bark the first time you step onto its
  island. The Puzzler toggle moved to Settings.

Long walks, fixed two ways: the islands stand in **two staggered rows** (odd figures in front, even figures
behind the gaps, their bridges running between the front islands), which halves the spread (Frost: 125 m →
63 m from the middle to the furthest island), and the bridges are **breeze lanes** (a glowing stripe; you move
2.4× faster on them, ~17 m/s running). The longest hub-to-figure trip is now about 8 seconds.

## 2026-10-21 · Rails, the first door, a beacon and live tutorial feedback

- **Rails** run along every open edge of every bridge (two bars on posts), with openings only where a bridge
  meets land or another bridge; the boardwalk's ends are railed too. The dotted "breeze lane" stripe is gone
  (the speed boost stays).
- **The first island's door**: the bridge off the Sprout's island has a door that stays shut until the Sprout
  is rebuilt, so a new player can't wander off mid-tutorial. Entering the Meadow before that starts you on
  that island rather than the hub.
- **Where next**: a tall column of light with a "?" stands over the next figure's island (over the portal once
  the world is done), and an edge arrow points there whenever it's out of view.
- **Tutorial feedback**: the coach shows your actual keys and lights each one the moment you use it (W A S D,
  Space, right-click/Q, H); the look and walk steps show a bar that fills as you go and advance as soon as
  it's full.

## 2026-10-21 · Kubo on the islands

Kubo is now a character in the world (`js/features/companion.js`): the yellow Keeper cube floats at your side
on every island, bobbing, blinking and turning to look at you. Everything he explains comes from him: the
tutorial steps (with the lighting-up keys and the progress bar), tips, a figure's intro line the first time you
step onto its island, where to go next, and why a bridge or door is closed. When he has something to say he
drifts into view ahead of you and to the right (clear of the first tutorial block), and a speech bubble with a
tail hangs above his head; if he's out of view the bubble docks at the bottom with his face. Quick feedback
("too far away", "recharging") stays a toast. He steps aside in cutscenes, menus, the celebration and Kubo's
Garden (which has its own Kubo statue).

## 2026-10-22 · The Keeper's Isle: a world select you walk

The world select was the last menu between the worlds: a scrolling map you clicked. It is now a place, the
**Keeper's Isle** (`js/nexus.js`, `js/features/nexus.js`), and you stay in first person all the way from one world
to the next.

- **Layout.** A floating plaza (radius 10 m) over a golden cloud sea, with the Keeper's Lantern in the middle. Eleven
  islets stand in a ring 28 m out, each joined to the plaza by a bridge in its world's style (barn-red fence, ice,
  bamboo, glowing crystal…): one per world, clockwise in world order, and Kubo's Garden in the south. Islets are
  built with each world's own ground colours, trees and rocks (a new `gate` layout), so the ring reads as a sampler
  of the worlds; everything floats, which also lets the sea worlds and the void worlds sit side by side.
- **Portals.** Each islet's portal stands on its far side, facing the plaza, its window showing the world's sky over
  its ground. Walking into it travels there; the world's own portal (on its middle island) brings you back out of
  that portal on the isle. A short flash of light covers each switch (the isle builds in ~45 ms, a world's
  archipelago in 40–150 ms), and the camera glides out of the portal you came through.
- **What the map showed now stands in the world.** Rebuilt figures stand in miniature on four pedestals per islet
  (gold for three stars) with the world's finale on top of its portal, the Lantern lights an orb per finished world
  (gold when crowned), a sign at each bridge head gives the world's number, name and stars, and a card names the
  world, its stars and its figures (the unfound ones as "?") when you're on its bridge or islet. A column of light
  stands over the portal of the world you're up to.
- **Opening a world.** A world that isn't open yet keeps a gate on its bridge and a dark, sleeping portal; Kubo
  says which world wakes it. Finishing a world's last figure ("On to …") takes you to the isle facing the next
  world: its gate sinks into the bridge and its portal wakes.
- The Garden's arch replaces the map's Garden button (leaving the Garden brings you back out of the arch); the
  ending's replay moved to the isle's pause menu. Kubo explains the isle the first time you arrive.
- Kubo's companion only hid itself during a world's frames, so on the isle (and in the Garden) it kept claiming
  his lines while invisible; it now re-checks whether it should be shown whenever it's asked.

## 2026-10-30 · The first minute: the first link comes first

A playtest of a fresh first launch (a bot playing at a human pace, never skipping) put the first link at **53 s**:
a 22 s opening, 15 s of Kubo's four wake-up lines, then look / walk / jump drills that turned the player away from
the block placed in front of them (on a phone the grab step came up facing the river, the pedestal off screen), and
drop / hint drills after it. The same run now links at about **25 s** (control at 16 s).

- **Opening: 21.8 s → 15.3 s.** Both shots stay (the Colossus loses the storm, the storm smashes the Sprout) with
  two captions instead of four. A first cut to 9.6 s felt rushed: each beat (the push-in on the Colossus, the
  shatter, the descent onto the Sprout, waking up) needs a moment to land, so they got most of their time back and
  only the extra captions stayed out.
- **Kubo says one line** (his hello); the rest of his intro was either the cutscene again or the mechanic told
  before it's seen. A click, E, Space, a step or six seconds end it.
- **Grab and link first**, with the block still in front of you. Looking and walking are never locked; the look
  and walk steps (with their bars) only show after the first link if they're still to learn.
- **No jump, drop or hint drills.** Jumping waits for the first place it's needed (the Tulip's updraft tip), drop
  is explained the first time the backpack is full, and the hint after 15 s without a link (each once, ever). The
  drop drill used to have you grab a block that didn't fit, so the first thing it practised was a failure.
- **No step outlives the figure.** Linking every block while the drop step was up left "Grab another block, then
  drop it" on a finished island (and the figure ran at 0:00, since the clock waits for the tutorial). Finishing the
  figure now clears the tutorial; dropping the block during the link step goes back to the grab step.

### The first minute, part two: weight, legibility, momentum, a quiet screen

From the same playtest's frames:

- **Links had little weight** (a block flies over, the counter ticks). Now the two matching numbers slide together
  where the blocks join, merge into one and pop; on the first figure the last 28% of each flight runs at 0.3× for
  0.3 s (off with reduced motion), a bell an octave up rings over the existing rising chime, Kubo hops and spins,
  and the very first link ever gets a line ("Click! A perfect match!…", which also says what the skipped intro line
  used to explain, now that it has been seen).
- **Hard to read**: the first block lay with its number on its side, the pedestal's bubble was a dot, and on a phone
  Kubo's bubble sat right over the pedestal bubble it was pointing to (on desktop it hid the hint toast). The first
  block now turns its number to you, upright and tipped towards your eyes; during the grab and link steps the bubbles
  are 1.45× and beat. Kubo's bubble tries its spots in order (above his head, beside him on either side up in the sky
  or level with him, docked in the middle or at either edge) and takes the first that covers none of the open
  bubbles, the blocks that fit within 9 m or the toast, staying put while its spot is still clear. The toast also
  draws above it.
- **Dead air after the first win**: a small card, one line, an arrow at the screen's edge. Now you get control back
  facing this island's bridge, Kubo flies ahead to it and waits until you're within 4 m, the Sprout's door swings
  open (it used to snap open while you were in the celebration), and the stars that are new fly from the card into
  a world star count added to the top pill.
- **A busy screen before anything happened** (progress, bubble list, backpack, hint, jump). On the first play each
  comes in when it's first needed: backpack at the first grab, progress / bubble list / jump at the first link, the
  hint once the tutorial is over or Kubo brings it up.


## 2026-11-02 · The first five minutes on CrazyGames: ten players, ten devices

**Method.** Bots played the first five minutes as ten players, inside the frame CrazyGames embeds the game in: a
crazygames.com page with a header and a long page below, the game served from a game-files host, and a stand-in
SDK served from the real SDK URL (lifecycle calls logged, interstitials that play for 15 s behind a frequency cap).
Each player had their own device, input and pace: a child on a school Chromebook (trackpad, portal mute, presses
Space before clicking the game), a speedrunner on a gaming PC (skips everything, sprints), an iPhone held upright
first, a budget Android on slow 4G, an iPad (desktop-class user agent), a 68-year-old on a 150 %-scaled laptop
(arrow keys, slow reader, tries the bubble before the block), a MacBook trackpad user who clicks outside the frame
mid-figure, a Japanese gamepad player, a German teenager on an iPhone SE who switches apps and gets an early ad,
and an Arabic returning player whose save is in SDK.data.

| | control | first link | Sprout | on the Tulip's island | Tulip |
|---|---|---|---|---|---|
| watched the opening (7 players) | 21–28 s | 27–34 s | 57–79 s | 77–100 s | 3:00–4:40 |
| skipped it (3 players) | 7–9 s | 11–13 s | 30–51 s | 49–70 s | 2:10–3:10 |

Loading: 61 requests, 0.72 MB gzipped (1.05 MB in Japanese, which adds its font subsets).

**Found and fixed.**
- **The keyboard stayed with the portal's page.** Until the player clicked into the frame, Space scrolled the
  CrazyGames page by 670 px, pushing the game out of view (the browser then stops drawing it, so the opening froze
  off-screen), and the opening's Esc did nothing. The game now takes focus as it loads.
- **Arrow keys, Space and Page/Home/End scrolled the portal's page** even with the game focused: an iframe that
  can't scroll hands the scroll to its parent. They never scroll anything now (fields, sliders and Space on a
  focused button keep their keys).
- **An interstitial a minute in.** The first break that asks for an ad is the end of the tutorial figure, about a
  minute in (30–80 s); with a short frequency cap or no preroll, a newcomer got an ad right there. There is no
  midgame request in a session's first three minutes of play now; the first one comes after the Tulip.
- **A returning player out of the portal had no lead.** Continue takes you through the world's portal onto the
  middle island, 60 m from the figure you're up to, with only the light column far off and a bridge straight ahead
  that may be gated. Kubo now leads the way there along the causeway and boardwalk, as he does after a figure.
- **A gamepad couldn't skip the opening**: Start and B did nothing, and A only moved focus to Skip. Skip is now the
  opening's primary button (A or Start), and its Esc keycap hides in gamepad mode.

**Seen, not changed.**
- On short phones (320–360 px tall) the backpack covers blocks lying right at your feet; looking down or stepping
  back shows them. Players held phones the right way round after the turn-your-device screen.
- In gamepad mode Kubo says "press X", but the focus label and backpack line still say "Click to link" (needs pad
  wording in every locale).
- Holding forward towards Kubo when he leads can run you into a tree or a low fence between you and him; people steer
  round them, so this only stalls players who walk in a straight line.

## 2026-11-02 · Archipelagos that look grown, not laid out; bridges ease you up to speed

- **Layouts.** Every world had the same grid: a causeway, a straight east-west boardwalk and islands in two rows
  off it. A first pass gave worlds different grids (rows, an avenue, a switchback, a slalom), which still read as
  mechanical. Now each world's islands are **grown** from the hub (`grow` in `js/archipelago.js`, seeded per world so
  a world always looks the same): one by one in play order, each is placed in open water near the hub and the
  figure before, never side by side in a row with another, and joined to the rest by a **curving bridge**: out of
  its south shore (where its path in is kept clear, so islands still never rotate; up to ~25° either side of
  south), then a smooth bend to the hub's one bridge north or a **round landing** where bridges branch (a new
  landing can split any bridge). A join has to bend gently (radius ≥ 5 m), keep 1.4 m of open water to every shore
  and other bridge, and meet the bridge it joins at a good angle; of those that fit, the cheapest wins, counting
  its length, the walk on to the hub and, more so, the walk back to the figure before. `GROWTH` gives each world its character (gaps, the way it drifts, how
  widely it fans out, and *trail*: a winding string of islands vs. a cluster). Islands are spaced by
  how far their ground really reaches (not their nominal radius), with 4–9 m of water between them. Walks from one
  figure to the next are 40–85 m (a spot is preferred if it's within 45 m of the figure before); from the portal to
  the furthest island 130–250 m. With every island entered from the south a hop can't be much shorter than the
  distance between the two islands' middles. Growing a
  world adds 5–80 ms to entering it the first time on a desktop (Shipwreck Cove the most: its first try doesn't
  fit), nothing after that: each world's layout is kept for the session. (Kept down by a grid of the bridges'
  segments, a quick look at a curve's tightest bend before it's built, a coarse pass every 4 m before the fine one,
  and pricing a candidate before sampling it evenly: Cove went from 260 ms to 70.)
- Bridges are polylines (a point every 0.5 m): planks across the way, a beam under it, stone piers in the stone
  worlds; rails follow the curves and open onto landings between lamp posts. Locked islands' gates sit just off
  the landing or hub their bridge leaves; Kubo's way is the shortest path along the bridges.
- **The ways in are breeze lanes too.** Most of a hop's time was on the islands (pedestal to shore and shore to
  pedestal at walking pace), not on the bridges. Each island's way in (2.6 m wide, from just outside the figure's
  footprint to its shore, inside the strip that's kept clear) and the hub's from the portal to its bridge now speed
  you up like a bridge, on plain ground only (not ice, water or drifts), and are marked by short planks set into
  the ground in the bridge's colours. A walk from beside one pedestal to beside the next went from 8–10 s to
  6.6–8 s (Meadow, Windmill Farm, Sunset Reef, Moon Isle).
- **The bridges' speed-up** (2.4×) used to kick in the moment you stepped on. It now builds up over about 1.3 s
  of walking (smoothstep) and dies away over about 0.6 s once you're off; ground that slows you (drifts, water)
  still does so at once.
- Fixed in passing: every island's bridge had an (open) door at its island end, not just the Sprout's: a door's
  visibility was `undefined` rather than `false` for the others.

## 2026-11-06 · Archipelagos round a hub in the middle; islands turn to face their bridges

- **Why.** The grown layouts had long walks: the longest walk along the bridges between any two of the portal
  and a world's islands was 129–248 m (mean 198), almost always from the portal to the last island. Two rules made
  that so. Every island was entered from the south (its way in, the path kept clear from the pedestal to the shore,
  runs south), so islands could only sit north of where their bridge joined; and the hub had one bridge, off its north
  shore, with every island required to lie ahead of you as you come out of the portal. The network was a tree whose
  root, the portal, sat at the far end. Making it compact (scoring each island by the longest walk it makes) cut that
  to ~130 m but made the walk from figure to figure in play order longer (254 → ~320 m): with those two rules a
  layout is either a chain (short hops) or a clump (short longest walk), not both.
- **Islands turn.** Each island is still built with its way in running south (so every layout generator, and the
  things they put "behind" an island, like Frost's satellite islets or the Cove's wreck, stay as they are) and is
  then turned by a quarter turn (`pt.spin`) so that way faces its bridge. Quarter turns keep every collider a box.
  The active island stays turned in the scene: the archipelago turns ground queries, colliders, block tops and
  bounce pads into the island's own coordinates (`api.spin`), the spawn on an island (`arch.spawnOf`) and district 0
  face its way in, and finished figures on the other islands face south like the one you're building (a figure is
  never turned, so you may walk up to one from its side or back). The Sprout isn't turned: the first minute is laid
  out on it.
- **The hub sits in the middle.** Its bridges leave from its west, north and east shores (the portal stands on the
  south side; its trees and rocks keep clear of those ways), and the walks across it (from the portal to its middle
  and on to each bridge in use) are edges of the bridge network too (`land`, never drawn), so Kubo's way and every
  walk can cross the hub. Islands may sit anywhere round it.
- **Shapes.** `GROWTH` gives each world a shape round the hub: petals all round (Meadow), fields fanned out behind
  the farmyard (Windmill Farm), floes packed off to the north-east (Frost Isles), a wood wrapped round the west
  (Frostwood), an atoll with the hub on its rim (Sunset Reef, which may close a loop), a horseshoe bay off to the east
  (Shipwreck Cove), a tower of rocks reaching north (Starfall Peak), craters strewn all round (Moon Isle), a ridge
  running through the hub (Gale Cliffs), a spiral round the eye (Eye of the Storm). On a ring the islands go round
  it in play order, so the next figure is a neighbour. Each island is placed where there's room near its place on the
  shape, turned so its way in faces the likeliest join, and of the spots a bridge reaches the one that keeps the
  longest walk short wins (then the shape, then the walk from the figure before); a world takes the best of four
  goes, scored on the longest walk and the walk through the figures in order.
- **Result** (bridge walks, measured from where you stand out of the portal): the longest walk in a world is now
  64–116 m (mean 88, was 198); the walk portal → 1 → 2 → … → 5 is 156–345 m (mean 214, was 254). Growing a world
  takes 12–36 ms on a desktop, the first time it's entered in a session.

## 2026-11-11 · Finishing looks: shading, a living sea, haze, a grade per world, islands that bloom

- **How it was chosen.** Ten looks were built as separate switches and compared before/after on the same cameras,
  seeds and moments (stills and frame-stepped clips, rendered in SwiftShader). Eight were kept, the glow was kept at
  a quarter of its first strength (it read as far too intense at full), and cloud shadows were dropped.
- **Corner shading.** Each block face's corners darken with the neighbours that crowd them (two sides, or two sides
  and the corner between; the pedestal counts as solid under the bottom layer), as an `aoc` vertex attribute that the
  voxel material multiplies into its light. Finished figures (`mergeFigure`) bake it and split each quad along the
  diagonal that keeps the shading even; in play, placing a block re-shades it and its 26 neighbours. No cost per frame,
  and it shows in low-graphics mode too.
- **The outline pass** now also does contact shadows (scalable ambient obscurance from the depth and normal images it
  already has: 12 samples on a fixed spiral, 6 on phones, no per-pixel rotation since there's no blur pass to hide its
  grain, faded out by 60 m), draws each outline in a deep shade of what it outlines (the ink colour still leads), adds
  the glow, and applies the world's colour grade (lift, gain, saturation, contrast, in gamma space). It then writes
  the frame sRGB-encoded to a target that an FXAA pass smooths onto the screen; FXAA passes the scene depth on for the
  overlays (badges, particles), which are drawn after it, so their text isn't softened. Phones had no anti-aliasing
  at all before. Thumbnails skip FXAA and the glow.
- **The sea** (`sea.js`) is a toon material whose colour runs from light shallows to the deep by the distance to the
  nearest shore, baked once per world into a small texture from every island's own coastline function (14–30 ms when
  a world loads). Foam lines roll in to the shores, a fringe laps at them, slow wave streaks cross it, sun glints
  sparkle, and far out it melts into the sky's horizon colour.
- **The toon shader** (every ground, prop and block) is patched once in `ShaderLib`: ground tops get large lighter and
  warmer / darker and richer patches and, on a figure's island, a worn ring round the pedestal (`LK_GROUND`,
  `LK_WEAR` defines on the ground material); the fog becomes aerial haze (far things fade into the sky beyond 25 m,
  and a low mist hangs over the sea between islands); and each island's materials carry a colour-wash uniform.
  Shared values reach every material live because their uniform values are plain objects, which three.js keeps by
  reference when it copies a material's uniforms. Patterns use archipelago coordinates, so they don't jump when the
  active island changes.
- **Islands bloom.** Finished islands run a little richer and warmer, the one you're on is as it always was,
  unfinished open ones are muted and locked ones more so. Finishing a figure washes colour out from its pedestal to
  its shore at 9 m/s with a bright leading edge.
- **Glow** (desktop only): crystals, portals, lanterns, the Keeper's crystal, lit orbs, pulse pads, link rings and
  fireflies are drawn again, alone, over a black silhouette of the scene (so walls still hide them) at quarter size,
  blurred in six small passes and added in the outline pass; night worlds glow a little more. The beacon and hint
  beams are left out: at any strength that reads they burn out to white.
- **Dropped:** cloud shadows (drifting noise darkening the sun's light). They were hard to read as clouds on
  islands this size and only showed up clearly on the sea.
