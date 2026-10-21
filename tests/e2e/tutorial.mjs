// The controls tutorial on the Sprout: Kubo's wake-up lines after the storm, one step at a time, live progress,
// no block tooltips before grabbing, and the door keeps you on the island; Kubo explains floating on the first tall figure.
import { suite, saveWith } from './lib.mjs';

await suite('tutorial', async t => {
  // a first launch: after the storm, Kubo says his welcome himself, in his bubble, one line per press
  const w = await t.page({ save: null, waitFor: 'cinema' });
  await w.waitForTimeout(1500);
  await w.keyboard.press('Escape');
  await t.app(w, 'playing');
  await w.waitForTimeout(400);
  const meet = () => w.evaluate(() => ({ step: window.__voxlink.game.tutorial, k: window.__voxlink.game.meet?.k, kubo: document.body.classList.contains('companion'), bubble: document.querySelector('#kubo-speech.show .ks-text')?.innerText || '' }));
  const m0 = await meet();
  t.check('after the storm, Kubo welcomes you in his bubble', m0.step === 'meet' && m0.kubo && /Kubo/.test(m0.bubble), m0);
  for (let i = 0; i < 3; i++) { await w.keyboard.press('KeyE'); await w.waitForTimeout(150); }
  t.check('each press brings his next line', (await meet()).k === 3);
  await w.keyboard.press('Space'); await w.waitForTimeout(500);
  t.check('after his last line, the controls start', (await meet()).step === 'look');
  await w.close();

  const p = await t.page({ save: { campaign: 2, seen: { prologue: true, meadow: true } } });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  const step = () => p.evaluate(() => window.__voxlink.game.tutorial);
  t.check('starts with the look step on the Sprout', (await step()) === 'look' && (await p.evaluate(() => window.__voxlink.game.level.id)) === 'sprout');
  // the first block lies right in front of you, but its tooltip waits for the grab step
  await p.waitForTimeout(400);
  t.check('no block tooltip before the grab step', await p.evaluate(() => !document.getElementById('tooltip').classList.contains('show') && !window.__voxlink.game.focus));
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

  // the Tulip, the first tall figure: arriving, Kubo explains floating up (before the goals, not lost behind them)
  const q = await t.page({ save: saveWith(['sprout'], { seen: { tutorial: true } }) });
  await q.click('#btn-play');
  await t.app(q, 'playing');
  await q.evaluate(() => { const g = window.__voxlink.game, A = g.arch, o = A.offsetOf(A.parts.find(x => x.level.id === 'tulip').level); g.player.pos.set(o.x + 4, 0.2, o.z + 5); });
  const said = [];
  for (let i = 0; i < 24; i++) { await q.waitForTimeout(500); const b = await q.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''); if (b && b !== said.at(-1)) said.push(b); }
  const lift = said.findIndex(s => /float up/.test(s)), goals = said.findIndex(s => /Three stars/.test(s));
  t.check('on the Tulip, Kubo explains floating up before the goals', lift >= 0 && (goals < 0 || lift < goals), said);
});
