// Phones drop the WebGL context (tab in the background, memory pressure): the game waits for it to come back
// and carries on, instead of the "could not start the 3D graphics" screen.
import { suite, saveWith, MEADOW } from './lib.mjs';

await suite('context-lost', async t => {
  const p = await t.page({ save: saveWith(MEADOW, { stars: { done: true, clean: true } }) });
  await p.evaluate(() => window.__voxlink.startLevel(window.__voxlink.LEVELS.findIndex(l => l.id === 'tulip'), false, 'island'));
  await t.app(p, 'playing');
  await p.waitForTimeout(1000);

  await p.evaluate(() => { window.__lc = window.__voxlink.renderer.gl.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  await p.waitForTimeout(800);
  const during = await p.evaluate(() => ({ fatal: !!document.getElementById('fatal'), lost: window.__voxlink.renderer.gl.getContext().isContextLost() }));
  t.check('context lost: no fatal screen while it may come back', during.lost && !during.fatal, during);

  await p.evaluate(() => window.__lc.restoreContext());
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => {
    const v = window.__voxlink, r = v.renderer, gl = r.gl.getContext();
    r.render(v.ctx.scene, v.ctx.camera); // read in the same task as the draw (the buffer is cleared after it)
    return { fatal: !!document.getElementById('fatal'), lost: gl.isContextLost(), direct: r.direct, black: r.frameLooksBroken() };
  });
  t.check('context restored: the game draws again, no fatal screen, pipeline kept', !after.lost && !after.fatal && !after.direct && !after.black, after);

  await p.evaluate(() => window.__lc.loseContext());
  await p.waitForTimeout(6000);
  const stuck = await p.evaluate(() => !!document.getElementById('fatal'));
  t.check('a context that stays lost on screen still shows the graphics message', stuck);
});
