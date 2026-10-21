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
