# Voxlink

A cozy first-person, cel-shaded voxel puzzle for desktop and mobile browsers.

A storm smashed the Great Figures of the Archipelago into loose blocks. Every block face that
carries a number belongs against the face with the same number on another block. Grab blocks, link
matching numbers onto the growing figure, and rebuild all 16 figures across 4 island chapters
with Kubo, the last Keeper.

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
| Jump | Space | Jump button |
| Backpack slot | 1–4, mouse wheel, Tab | Tap a slot |
| Drop | Right-click / Q | Drop button |
| Hint | H | Bulb button |

## How it plays

- Floating **bubbles** on the figure show which numbers are open right now.
- Find a loose block with that number, grab it, then click the bubble (or the block it attaches to).
- You can carry 4 blocks at once. Bubbles you can fill right away turn green.
- Each figure has 3 stars: finish it, beat the par time, and use no hints.

## Code map

- `js/levels.js`: figures (a small voxel modelling kit), chapters, story text, par times
- `js/voxels.js`: number atlas, per-face voxel geometry, spanning-tree puzzle generator
- `js/world.js`: themed island generation (terrain, plateaus, trees, particles, lights)
- `js/game.js`: level session (sockets, backpack, interaction, animations, celebration)
- `js/render.js`: toon materials and the ink-outline post pass (depth + normal edges)
- `js/player.js`, `js/input.js`: first-person controller, keyboard/mouse/touch input
- `js/main.js`: app flow, HUD, world map, dialogue, saves
- `js/audio.js`: synthesized sound effects and generative music
- `lib/three.module.min.js`: bundled three.js r186
