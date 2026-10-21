// Linking and tools: one link brings along every carried block that fits, the next-figure beacon stays off while
// you build (also near the shore), and the magnet / express buttons show progress to the next charge and glow
// when they would help.
import { suite, saveWith, MEADOW } from './lib.mjs';

const FARM = ['snail', 'duck', 'bunny', 'sheep', 'windmill'];

await suite('tools', async t => {
  const p = await t.page({ save: saveWith([...MEADOW, ...FARM], { seen: { farm: true, frost: true }, unlocked: 11 }) });
  const start = id => p.evaluate(id => window.__voxlink.startLevel(window.__voxlink.LEVELS.findIndex(l => l.id === id), false, 'island'), id);
  await start('mitten');
  await t.app(p, 'playing');
  await p.waitForTimeout(1200);

  // near the shore of the figure you're building: no beacon, no "next figure" arrow
  const shore = await p.evaluate(() => {
    const g = window.__voxlink.game;
    for (let r = 4; r < 40; r += 0.25) {
      if (g.arch.onActive(r, 0) && !g.arch.partAt(r, 0)) { g.player.pos.set(r, g.player.pos.y, 0); return r; }
    }
    return null;
  });
  await p.waitForTimeout(500);
  const b = await p.evaluate(() => { const g = window.__voxlink.game; return { on: g.onIsland, next: g.nextStop(), arrow: document.getElementById('edge-next').classList.contains('show') }; });
  t.check('building, near the shore: no next-figure beacon or arrow', shore !== null && b.on && b.next === null && !b.arrow, { shore, ...b });

  // carry two blocks that fit different bubbles, link one: the other follows
  const pair = await p.evaluate(() => {
    const g = window.__voxlink.game;
    g.player.pos.set(0, g.player.pos.y, 4);
    const fit = [...g.sockets.keys()].slice(0, 2);
    for (const i of fit) g.grab(i);
    g.launch(fit[0]);
    return fit;
  });
  await p.waitForTimeout(2500);
  const placed = await p.evaluate(ids => ids.map(i => window.__voxlink.game.voxels[i].state), pair);
  t.check('one link brings along every carried block that fits', pair.length === 2 && placed.every(s => s === 'placed'), placed);

  // tools on a big figure
  await start('windmill');
  await t.app(p, 'playing');
  await p.waitForTimeout(1200);
  const ring = await p.evaluate(async () => {
    const g = window.__voxlink.game;
    g.magnetLinks = 6;
    const v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
    g.player.pos.set(v.mesh.position.x + 2, g.player.pos.y, v.mesh.position.z);
    await new Promise(r => setTimeout(r, 600));
    const m = document.getElementById('btn-magnet');
    return { p: m.style.getPropertyValue('--p'), ready: m.classList.contains('ready') };
  });
  t.check('magnet ring shows the way to the next charge', ring.p === '50%', ring);
  t.check('magnet glows with a block that fits in reach', ring.ready, ring);
  const ex = await p.evaluate(async () => {
    const g = window.__voxlink.game;
    const v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
    g.grab(v.i);
    g.expressCharges = 1; g.events.express(1, true);
    g.player.pos.set(14, g.player.pos.y, 6);
    await new Promise(r => setTimeout(r, 600));
    const e = document.getElementById('btn-express');
    return { ready: e.classList.contains('ready'), pop: e.querySelector('.tool-pop').classList.contains('show'), empty: e.classList.contains('empty') };
  });
  t.check('express: "+1" callout on a new charge, glows carrying a fit away from the figure', ex.ready && ex.pop && !ex.empty, ex);
});
