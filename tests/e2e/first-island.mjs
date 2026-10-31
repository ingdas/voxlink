// The first island, played as a newcomer would: a reduced-motion switch on the very first opening, Kubo's hello
// worded for the device, a phone's first step naming the number, no drop button while the first block is new,
// Kubo flying over to the first block (and then the hint beam) for a player who can't find it, the Sprout's
// blocks all in plain sight near the pedestal, a "Warm-up" clock on the card, his bubble clear of the card, and
// Kubo leading the way along the bridges to the next island (holding forward after him gets you there).
import { suite } from './lib.mjs';

const FIRST = { campaign: 2, seen: { prologue: true, meadow: true } };
const speech = p => p.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '');
const linkOne = p => p.evaluate(() => {
  const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
  if (v) g.grab(v.i);
  const c = g.carriedAll().find(i => g.sockets.has(i));
  if (c !== undefined) g.launch(c);
});
const finish = async p => {
  for (let k = 0; k < 30; k++) {
    if (await p.evaluate(() => window.__voxlink.game.mode !== 'play')) break;
    await linkOne(p);
    await p.waitForTimeout(450);
  }
  await p.waitForFunction(() => window.__voxlink.game.roaming && window.__voxlink.ctx.app !== 'complete', null, { timeout: 15000 });
};

await suite('first-island', async t => {
  // a first launch: the opening has a reduced-motion switch next to Skip
  const o = await t.page({ save: null, waitFor: 'cinema' });
  await o.waitForTimeout(500);
  const sw = () => o.evaluate(() => { const b = document.getElementById('cine-motion'), c = getComputedStyle(b); return { shown: c.display !== 'none' && c.visibility !== 'hidden', on: b.querySelector('.toggle').classList.contains('on'), rm: document.body.classList.contains('reduce-motion') }; });
  const s0 = await sw();
  t.check('first opening: a reduced-motion switch is offered', s0.shown && !s0.on && !s0.rm, s0);
  await o.click('#cine-motion');
  const s1 = await sw();
  t.check('it turns reduced motion on right away', s1.on && s1.rm, s1);
  t.check('…and it is saved with the settings', await o.evaluate(() => JSON.parse(localStorage.getItem('voxlink.v2')).settings.reduceMotion === true));
  // after the storm, Kubo's hello says how to go on with a mouse and keyboard
  await o.keyboard.press('Escape');
  await t.app(o, 'playing');
  await o.waitForTimeout(500);
  const hello = await speech(o);
  t.check('desktop: the hello says "Click or press Space", not "Tap"', /Click or press Space/.test(hello) && !/Tap/.test(hello), hello);
  await o.close();
  // …and on a phone, to tap
  const h = await t.page({ save: null, waitFor: 'cinema', viewport: { width: 844, height: 390 }, mobile: true });
  await h.tap('#cine-skip');
  await t.app(h, 'playing');
  await h.waitForTimeout(500);
  t.check('phone: the hello says "Tap to continue"', /Tap to continue/.test(await speech(h)), await speech(h));
  await h.close();

  // a player who can't find the first block gets Kubo flying over to it, then the hint beam on it
  const p = await t.page({ save: FIRST });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  await p.waitForFunction(() => window.__voxlink.game.tutorial === 'grab');
  const block = () => p.evaluate(() => { const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)); return { x: v.mesh.position.x, z: v.mesh.position.z }; });
  const kuboOff = async () => p.evaluate(b => { const k = window.__voxlink.ctx.companion.where(); return k ? Math.hypot(k.x - b.x, k.z - b.z) : 99; }, await block());
  await p.waitForTimeout(5000);
  t.check('…not right away', await p.evaluate(() => window.__voxlink.ctx.companion.leading() === null));
  await p.waitForTimeout(5500);
  t.check('stuck on the first block: Kubo flies over to it', (await kuboOff()) < 1.2, await kuboOff());
  await p.waitForTimeout(5000);
  t.check('…and a little later the hint beam points at it', await p.evaluate(() => { const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)); return g.fx.beamTarget === v.mesh; }));
  await p.evaluate(() => { const g = window.__voxlink.game; g.grab(g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)).i); });
  await p.waitForTimeout(600);
  t.check('grabbing it calls him back', await p.evaluate(() => window.__voxlink.ctx.companion.leading() === null));

  // the Sprout's blocks: near the pedestal, on the grass, nothing between them and it (any layout)
  const lay = await p.evaluate(() => {
    const g = window.__voxlink.game, w = g.world, r0 = Math.max(4, g.footR + 1.2), bad = [];
    const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const keep = g.voxels.map(v => ({ p: v.rest.pos.clone(), q: v.rest.quat.clone(), m: v.mesh.position.clone(), mq: v.mesh.quaternion.clone() }));
    for (let s = 1; s <= 25; s++) {
      g.scatter(rng(s), 0.2, false);
      for (const v of g.voxels) {
        if (v.state !== 'loose') continue;
        const { x, z } = v.rest.pos, r = Math.hypot(x, z);
        if (r > r0 + 4.6 || v.rest.pos.y > 1) bad.push({ s, r: +r.toFixed(1), y: +v.rest.pos.y.toFixed(1) });
      }
    }
    g.voxels.forEach((v, k) => { v.rest.pos.copy(keep[k].p); v.rest.quat.copy(keep[k].q); v.mesh.position.copy(keep[k].m); v.mesh.quaternion.copy(keep[k].mq); });
    return bad;
  });
  t.check('the Sprout\'s blocks lie on the grass close to the pedestal (25 layouts)', lay.length === 0, lay.slice(0, 5));

  // finished inside the tutorial: the card says Warm-up rather than 0:00
  await finish(p);
  const card = await p.evaluate(() => document.getElementById('done-card').innerText);
  t.check('a first figure finished during the tutorial: "Warm-up" on the card, no 0:00', /Warm-up/.test(card) && !/0:00/.test(card), card);

  // Kubo leads along the bridges: follow him, holding forward, and you reach the next island
  await p.waitForTimeout(2500);
  const said = [];
  let reached = false;
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 160 && !reached; i++) {
    const r = await p.evaluate(() => {
      const v = window.__voxlink, g = v.game, c = v.ctx.companion, to = c.leading() || g.wayTarget();
      if (to) g.player.yaw = Math.atan2(g.player.pos.x - to.x, g.player.pos.z - to.z);
      return { level: g.level.id, roaming: g.roaming, say: document.querySelector('#kubo-speech.show .ks-text')?.innerText || '' };
    });
    if (r.say && !said.includes(r.say)) said.push(r.say);
    reached = r.level === 'tulip';
    await p.waitForTimeout(150);
  }
  await p.keyboard.up('KeyW');
  t.check('following Kubo along the bridges leads to the Tulip\'s island', reached, said);
  t.check('at the turn onto the boardwalk he says which way', said.some(s => /This way/.test(s)), said);
  await p.close();

  // a phone: the first step names the number, no drop button for the first block, and after the figure Kubo's
  // bubble keeps clear of the results card
  const m = await t.page({ save: FIRST, viewport: { width: 844, height: 390 }, mobile: true });
  await m.tap('#btn-play');
  await t.app(m, 'playing');
  await m.waitForTimeout(400);
  await m.waitForFunction(() => window.__voxlink.game.tutorial === 'grab');
  await m.waitForTimeout(300);
  const step = await m.evaluate(() => {
    const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
    return { num: v.num, chip: document.querySelector('#kubo-speech .ks-text .coach-num')?.innerText };
  });
  t.check('phone: the first step shows the block\'s number', String(step.num) === step.chip, step);
  const dropShown = () => m.evaluate(() => { const b = document.getElementById('btn-drop').getBoundingClientRect(); return b.width > 2; });
  await m.evaluate(() => { const g = window.__voxlink.game; g.grab(g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)).i); });
  await m.waitForTimeout(150);
  t.check('phone: the number stays in the step while you grab the block', /\d/.test(await m.evaluate(() => document.querySelector('#coach .coach-num')?.innerText || '')));
  await m.waitForTimeout(750);
  t.check('phone: no drop button while linking the first block', (await m.evaluate(() => window.__voxlink.game.tutorial)) === 'link' && !(await dropShown()), await m.evaluate(() => [window.__voxlink.game.tutorial, document.body.className, getComputedStyle(document.getElementById('btn-drop')).transform]));
  await finish(m);
  await m.waitForTimeout(2200);
  const ov = await m.evaluate(() => {
    const a = document.querySelector('#kubo-speech.show .ks-box')?.getBoundingClientRect(), b = document.getElementById('done-card').getBoundingClientRect();
    const badges = [...document.querySelectorAll('#done-card .dc-stars .cs')].map(cs => { const e = cs.querySelector('em')?.getBoundingClientRect(), l = cs.querySelector('small').getBoundingClientRect(); return !!e && e.bottom > l.top + 1 && e.right > l.left && e.left < l.right; });
    return { talking: !!a, overlap: !!a && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, badgeOverLabel: badges.some(Boolean) };
  });
  t.check('phone: Kubo\'s bubble keeps clear of the results card', ov.talking && !ov.overlap, ov);
  t.check('phone: the NEW badges don\'t cover the star labels', !ov.badgeOverLabel, ov);
  await m.close();
});
