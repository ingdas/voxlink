// The first minute: a short storm opening, Kubo's one-line hello, then the first link with the block lying right in
// front of you (looking and walking free all along); the look / walk steps only if they're still to learn; drop and
// the hint come up when they're useful; finishing the figure early leaves no step behind; the door keeps you on the
// island; Kubo explains floating on the first tall figure.
import { suite, saveWith } from './lib.mjs';

// turn to the first loose block that fits (fit: true), doesn't (fit: false), or a bubble a carried block fits
const face = (p, what) => p.evaluate(w => {
  const g = window.__voxlink.game, c = g.camera.position;
  const pos = w === 'socket' ? [...g.sockets.values()].find(s => g.carrying(s.child))?.sprite.position
    : g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i) === w)?.mesh.position;
  if (!pos) return null;
  const dx = pos.x - c.x, dz = pos.z - c.z;
  g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(pos.y - c.y, Math.hypot(dx, dz));
  return Math.hypot(dx, dz, pos.y - c.y);
}, what);

await suite('tutorial', async t => {
  // a first launch, watched through: the opening is short
  const w = await t.page({ save: null, waitFor: 'cinema' });
  const clock = await w.evaluate(() => new Promise(done => {
    const iv = setInterval(() => { const v = window.__voxlink; if (v.ctx.app !== 'cinema') { clearInterval(iv); done(v.ctx.cinema.clock); } }, 50);
  }));
  t.check('the opening is over in about ten seconds', clock > 8 && clock < 11, clock);
  await t.app(w, 'playing');
  await w.waitForTimeout(600);
  const state = () => w.evaluate(() => ({ step: window.__voxlink.game.tutorial, k: window.__voxlink.game.meet?.k, kubo: document.body.classList.contains('companion'), bubble: document.querySelector('#kubo-speech.show .ks-text')?.innerText || '' }));
  const m0 = await state();
  t.check('after the storm, Kubo says hello in his bubble', m0.step === 'meet' && m0.kubo && /Kubo/.test(m0.bubble), m0);
  // the first block lies within reach, right in front of you
  const d0 = await w.evaluate(() => { const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)); return v.mesh.position.distanceTo(g.camera.position); });
  t.check('the first block lies within reach', d0 < 5.5, d0);
  // a step ends his hello (he only has the one line)
  await w.keyboard.down('KeyW'); await w.waitForTimeout(150); await w.keyboard.up('KeyW');
  await w.waitForTimeout(500);
  const m1 = await state();
  t.check('a step ends his hello and goes straight to the first block', m1.step === 'grab' && /same number/.test(m1.bubble), m1);
  await face(w, true); await w.waitForTimeout(150);
  await w.keyboard.press('KeyE'); await w.waitForTimeout(900);
  t.check('grabbing the block that fits moves on to linking', (await state()).step === 'link');
  await face(w, 'socket'); await w.waitForTimeout(150);
  await w.keyboard.press('KeyE'); await w.waitForTimeout(900);
  // the bot never turned with the mouse: the look step comes up (with its bar); looking around ends it
  t.check('without having looked around, the look step comes next', (await state()).step === 'look');
  for (let i = 0; i < 30; i++) { await w.evaluate(() => { window.__voxlink.ctx.input.look.x += 0.06; }); await w.waitForTimeout(30); }
  await w.waitForTimeout(400);
  t.check('looking around moves on to walking', (await state()).step === 'move');
  await w.keyboard.down('KeyA'); await w.waitForTimeout(1200); await w.keyboard.up('KeyA');
  await w.waitForTimeout(400);
  t.check('walking ends the tutorial', (await state()).step === 'done');
  await w.close();

  // Kubo's hello moves on by itself when the player just waits
  const s = await t.page({ save: null, waitFor: 'cinema' });
  await s.keyboard.press('Escape');
  await t.app(s, 'playing');
  await s.waitForTimeout(7500);
  t.check('Kubo\'s hello moves on to the first block by itself', (await s.evaluate(() => window.__voxlink.game.tutorial)) === 'grab');
  await s.close();

  // the opening already seen: straight to the first block; walking and looking count as you go
  const p = await t.page({ save: { campaign: 2, seen: { prologue: true, meadow: true } } });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  const step = () => p.evaluate(() => window.__voxlink.game.tutorial);
  t.check('starts on the first block on the Sprout', (await step()) === 'grab' && (await p.evaluate(() => window.__voxlink.game.level.id)) === 'sprout');
  const z0 = await p.evaluate(() => window.__voxlink.game.player.pos.z);
  await p.keyboard.down('KeyS'); await p.waitForTimeout(1500); await p.keyboard.up('KeyS');
  t.check('walking works from the start', (await p.evaluate(() => window.__voxlink.game.player.pos.z)) - z0 > 1);
  // walk back up to the block, then grab it
  for (let i = 0; i < 20 && (await face(p, true)) > 4.5; i++) { await p.keyboard.down('KeyW'); await p.waitForTimeout(200); await p.keyboard.up('KeyW'); }
  await face(p, true); await p.waitForTimeout(150);
  await p.keyboard.press('KeyE'); await p.waitForTimeout(900);
  t.check('grab → link', (await step()) === 'link');
  // dropping the block before linking it: back to finding it
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(400);
  t.check('dropping the block before linking goes back to the grab step', (await step()) === 'grab');
  // the first figure's hints are free (no warning, no lost star)
  await p.waitForFunction(() => { const g = window.__voxlink.game; return g.voxels.some(v => v.state === 'loose' && g.sockets.has(v.i)); });
  await p.keyboard.press('KeyH'); await p.waitForTimeout(300);
  t.check('hints are free on the first figure', await p.evaluate(() => window.__voxlink.game.hintsUsed === 0 && window.__voxlink.game.hintCooldown > 0));
  // link every block without stopping for the look / walk steps: the finished figure leaves no step behind
  for (let k = 0; k < 30; k++) {
    if (await p.evaluate(() => window.__voxlink.game.mode !== 'play')) break;
    // (a bubble opens once the block below it has landed)
    await p.evaluate(() => {
      const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
      if (v) g.grab(v.i);
      const c = g.carriedAll().find(i => g.sockets.has(i));
      if (c !== undefined) g.launch(c);
    });
    await p.waitForTimeout(500);
  }
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'playing' && window.__voxlink.game.placedCount === window.__voxlink.game.voxels.length, null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  t.check('a figure finished mid-tutorial leaves no tutorial step behind', (await step()) === null && !/Grab|look|walk/i.test(await p.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '')));
  // the door: walking onto the bridge before the Sprout is rebuilt keeps you on the island
  await p.close();
  const d = await t.page({ save: { campaign: 2, seen: { prologue: true, meadow: true } } });
  await d.click('#btn-play');
  await t.app(d, 'playing');
  const entryZ = await d.evaluate(() => { const g = window.__voxlink.game, A = g.arch, e = A.entryOf(A.parts[0].level); g.player.pos.set(e.x, 0, e.z - 2); g.player.vel.set(0, 0, 8); return e.z; });
  await d.waitForTimeout(1200);
  const z = await d.evaluate(() => window.__voxlink.game.player.pos.z);
  t.check('the shut door keeps you on the first island', z < entryZ, { z, entryZ });
  await d.close();

  // the Tulip, the first tall figure: arriving, Kubo explains floating up (before the goals, not lost behind them)
  const q = await t.page({ save: saveWith(['sprout'], { seen: { tutorial: true } }) });
  await q.click('#btn-play');
  await t.app(q, 'playing');
  await q.evaluate(() => { const g = window.__voxlink.game, A = g.arch, o = A.offsetOf(A.parts.find(x => x.level.id === 'tulip').level); g.player.pos.set(o.x + 4, 0.2, o.z + 5); });
  const said = [];
  for (let i = 0; i < 24; i++) { await q.waitForTimeout(500); const b = await q.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''); if (b && b !== said.at(-1)) said.push(b); }
  const lift = said.findIndex(s => /float up/.test(s)), goals = said.findIndex(s => /Three stars/.test(s));
  t.check('on the Tulip, Kubo explains floating up before the goals', lift >= 0 && (goals < 0 || lift < goals), said);
  // a while without a link: Kubo brings up the hint; a full backpack: how to drop (each once)
  const bubble = () => q.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '');
  await q.evaluate(() => { window.__voxlink.game.sinceLink = 16; });
  let lost = '';
  for (let i = 0; i < 12 && !/Lost\?/.test(lost); i++) { await q.waitForTimeout(500); lost = await bubble(); }
  t.check('a while without a link: Kubo brings up the hint', /Lost\?/.test(lost), lost);
  await q.waitForTimeout(5000);
  await q.evaluate(() => { const g = window.__voxlink.game; for (const v of g.voxels.filter(v => v.state === 'loose').slice(0, 4)) g.grab(v.i); });
  let full = '';
  for (let i = 0; i < 12 && !/Backpack full/.test(full); i++) { await q.waitForTimeout(500); full = await bubble(); }
  t.check('a full backpack: Kubo says how to drop a block', /Backpack full/.test(full), full);
});
