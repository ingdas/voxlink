// The controls tutorial on the Sprout: one step at a time, live progress, and the door keeps you on the island.
import { suite } from './lib.mjs';

await suite('tutorial', async t => {
  const p = await t.page({ save: { campaign: 2, seen: { prologue: true, meadow: true } } });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  const step = () => p.evaluate(() => window.__voxlink.game.tutorial);
  t.check('starts with the look step on the Sprout', (await step()) === 'look' && (await p.evaluate(() => window.__voxlink.game.level.id)) === 'sprout');
  for (let i = 0; i < 8; i++) { await p.evaluate(() => { window.__voxlink.ctx.input.look.x += 0.06; }); await p.waitForTimeout(40); }
  await p.waitForTimeout(150);
  const bar = await p.evaluate(() => document.getElementById('coach').innerHTML.match(/width:(\d+)%/)?.[1]);
  t.check('the look bar fills while looking', +bar > 0 && +bar < 100, bar);
  for (let i = 0; i < 20; i++) { await p.evaluate(() => { window.__voxlink.ctx.input.look.x += 0.06; }); await p.waitForTimeout(30); }
  await p.waitForTimeout(400);
  t.check('looking around unlocks walking', (await step()) === 'move');
  await p.keyboard.down('KeyW'); await p.waitForTimeout(250); await p.keyboard.up('KeyW');
  await p.waitForTimeout(200);
  t.check('the W key lights up once used', /<kbd class="ck on">W<\/kbd>/.test(await p.evaluate(() => document.getElementById('coach').innerHTML)));
  await p.keyboard.down('KeyA'); await p.waitForTimeout(900); await p.keyboard.up('KeyA');
  await p.waitForTimeout(400);
  t.check('walking unlocks jumping', (await step()) === 'jump');
  // the door: walking onto the bridge before the Sprout is rebuilt keeps you on the island
  const entryZ = await p.evaluate(() => { const g = window.__voxlink.game, A = g.arch, e = A.entryOf(A.parts[0].level); g.player.pos.set(e.x, 0, e.z - 2); g.player.vel.set(0, 0, 8); return e.z; });
  await p.waitForTimeout(1200);
  const z = await p.evaluate(() => window.__voxlink.game.player.pos.z);
  t.check('the shut door keeps you on the first island', z < entryZ, { z, entryZ });
});
