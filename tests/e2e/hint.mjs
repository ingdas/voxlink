// Hints with the block behind you: the arrow sits on the side edge you'd turn towards (not at the top or bottom), and
// the light waits for you to turn round to it before its few seconds start.
import { suite, saveWith, MEADOW } from './lib.mjs';

await suite('hint', async t => {
  const p = await t.page({ save: saveWith(MEADOW, { stars: { done: true, clean: true } }) });
  await p.evaluate(() => window.__voxlink.startLevel(window.__voxlink.LEVELS.findIndex(l => l.id === 'tulip'), false, 'island'));
  await t.app(p, 'playing');
  await p.waitForTimeout(1200);
  await t.hideDebug(p);

  // stand facing away from the nearest block that fits, then ask for a hint
  await p.evaluate(() => {
    const g = window.__voxlink.game, pp = g.player.pos;
    const v = g.voxels.filter(v => v.state === 'loose' && g.sockets.has(v.i))
      .sort((a, b) => a.mesh.position.distanceToSquared(pp) - b.mesh.position.distanceToSquared(pp))[0];
    const dx = v.mesh.position.x - pp.x, dz = v.mesh.position.z - pp.z;
    // facing -z at yaw 0: look straight away from it, turned a little to the left so it's behind on the right
    g.player.yaw = Math.atan2(dx, dz) - 0.3;
    g.player.pitch = -0.5;
    g.hint();
  });
  await p.waitForTimeout(1000);
  const a = await p.evaluate(() => {
    const el = document.getElementById('edge-hint'), r = el.getBoundingClientRect();
    return { on: el.classList.contains('on'), x: r.left + r.width / 2, y: r.top + r.height / 2, w: innerWidth, rot: el.firstElementChild.style.transform };
  });
  t.check('block behind you: the hint arrow is on the side edge, pointing sideways',
    a.on && a.x > a.w - 80 && /rotate\((1\.57|1\.5707)/.test(a.rot), a);

  // still facing away after 5 s: the light is still there
  await p.waitForTimeout(4500);
  const held = await p.evaluate(() => !!window.__voxlink.ctx.fx.beamTarget);
  t.check('the light waits while you haven\'t seen it', held);

  // turn round to it: a few seconds later it's gone
  await p.evaluate(() => { const g = window.__voxlink.game; g.player.yaw += Math.PI; g.player.pitch = 0; });
  await p.waitForTimeout(5000);
  const gone = await p.evaluate(() => !window.__voxlink.ctx.fx.beamTarget);
  t.check('once seen, the light fades as before', gone);
});
