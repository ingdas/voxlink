// After a figure: no results screen, straight back on the island with a results card, the way to the next
// figure's island lit (its gate open), and the finished figure standing built when you walk back onto it.
import { suite, saveWith, MEADOW } from './lib.mjs';

await suite('walk on', async t => {
  const p = await t.page({ save: saveWith(MEADOW, { seen: { farm: true } }), query: '?debug' });
  await t.hideDebug(p);
  await p.click('#btn-play');
  await t.app(p, 'playing');
  t.check('Continue lands in Windmill Farm, on the Snail', (await p.evaluate(() => window.__voxlink.game.level.id)) === 'snail');
  await p.evaluate(() => { window.__voxlink.game.player.pos.set(0, 0, 8); });
  await t.win(p);
  await p.waitForTimeout(4200);
  const r = await p.evaluate(() => {
    const g = window.__voxlink.game, w = g.wayTarget(), duck = g.arch.parts.find(q => q.level.id === 'duck');
    return {
      app: window.__voxlink.ctx.app, panel: document.getElementById('screen-complete').classList.contains('show'),
      card: document.getElementById('done-card').classList.contains('show'), cardText: document.getElementById('done-card').innerText,
      roaming: g.roaming, input: window.__voxlink.ctx.input.enabled, duckOpen: duck.open, gate: duck.gate.visible,
      toDuck: !!w && Math.hypot(w.x - g.arch.offsetOf(duck.level).x, w.z - g.arch.offsetOf(duck.level).z) < 1,
    };
  });
  t.check('no results screen; back in control', r.app === 'playing' && !r.panel && r.input, r);
  t.check('a results card shows the figure', r.card && /Snail/.test(r.cardText), r.cardText);
  t.check('roaming, the next island open', r.roaming && r.duckOpen && !r.gate, r);
  t.check('the way points at the Rubber Duck', r.toDuck);
  // over to the duck and back: the snail stands built
  const go = id => p.evaluate(id => { const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level); g.player.pos.set(o.x + 4, 0.2, o.z + 5); }, id);
  await go('duck'); await p.waitForTimeout(1200);
  t.check('walking onto the Duck starts its puzzle', await p.evaluate(() => window.__voxlink.game.level.id === 'duck' && !window.__voxlink.game.roaming));
  t.check('the results card is gone', !(await p.evaluate(() => document.getElementById('done-card').classList.contains('show'))));
  await go('snail'); await p.waitForTimeout(1200);
  const s = await p.evaluate(() => ({ id: window.__voxlink.game.level.id, roaming: window.__voxlink.game.roaming, placed: window.__voxlink.game.placedCount, n: window.__voxlink.game.voxels.length }));
  t.check('the finished Snail stands built', s.id === 'snail' && s.roaming && s.placed === s.n, s);
});
