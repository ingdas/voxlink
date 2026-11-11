// Movement you can feel: carried along a bridge the view widens a touch and wind lines streak past (not with
// reduced motion), and both are gone once you're back to a walk; a jump and a landing send a ring of dust over
// the ground; a finished figure's part flags are put away (one could stand right in the way on).
import { suite } from './lib.mjs';

const ALL_OPEN = { campaign: 2, unlocked: 50, seen: { prologue: true, tutorial: true, meadow: true, farm: true, frost: true, frostwood: true, reef: true, cove: true, starfall: true, moon: true, cliffs: true, storm: true, nexus: true, 'tip.sparks': true }, stars: {} };
// run along the bridges from this figure's island towards another one's, until you're at full speed (or time's up)
const sprint = p => p.evaluate(() => new Promise(res => {
  const V = window.__voxlink, g = V.game, k = g.input.keys;
  const other = g.arch.parts.find(q => q.level !== g.level && q.open);
  const route = g.arch.routeFrom(g.level, other.level).map(v => v.clone());
  g.player.pos.set(route[0].x, 0, route[0].z); g.player.vel.set(0, 0, 0);
  const t0 = performance.now();
  let best = null;
  const tick = () => {
    const me = g.player.pos;
    while (route.length > 1 && Math.hypot(route[0].x - me.x, route[0].z - me.z) < 2.5) route.shift();
    g.player.yaw = Math.atan2(-(route[0].x - me.x), -(route[0].z - me.z));
    k.add('KeyW'); k.add('ShiftLeft');
    const now = { speed: Math.hypot(g.player.vel.x, g.player.vel.z), rush: g.rush, fov: V.ctx.camera.fov, base: V.ctx.camera.userData.baseFov, lines: g.fx.wind.mesh.visible, opacity: g.fx.wind.mesh.material.opacity };
    if (!best || now.speed > best.speed) best = now;
    if ((now.speed > 16 && now.rush > 0.8) || performance.now() - t0 > 9000 || route.length < 2) { k.delete('KeyW'); k.delete('ShiftLeft'); return res({ ...best, ...(now.speed > 16 ? now : {}) }); }
    requestAnimationFrame(tick);
  };
  tick();
}));

await suite('feel', async t => {
  const p = await t.page({ save: ALL_OPEN, query: '?debug' });
  await t.hideDebug(p);
  await p.evaluate(() => window.__voxlink.startLevel(6));
  await t.app(p, 'playing');
  await p.waitForTimeout(500);
  const a = await sprint(p);
  t.check('running along a bridge carries you well past a run', a.speed > 16, a);
  t.check('…the view widens a touch', a.fov > a.base * 1.04 && a.fov < a.base * 1.09, a);
  t.check('…and wind lines streak past', a.lines && a.opacity > 0.4, a);
  await p.waitForTimeout(2500);
  const b = await p.evaluate(() => { const V = window.__voxlink, g = V.game; return { rush: g.rush, fov: V.ctx.camera.fov, base: V.ctx.camera.userData.baseFov, lines: g.fx.wind.mesh.visible }; });
  t.check('standing still again: the view is back and the lines are gone', b.rush === 0 && Math.abs(b.fov - b.base) < 0.01 && !b.lines, b);
  // with reduced motion: neither
  await p.evaluate(() => { window.__voxlink.game.comfort.kick = 0; });
  const c = await sprint(p);
  t.check('reduced motion: no wider view, no wind lines', Math.abs(c.fov - c.base) < 0.01 && !c.lines, c);
  await p.evaluate(() => { window.__voxlink.game.comfort.kick = 1; });
  // a jump and its landing: a ring of dust each
  await p.evaluate(() => { const g = window.__voxlink.game, s = g.arch.spawnOf(g.level, 9); g.player.pos.set(s.x, 0, s.z); g.player.vel.set(0, 0, 0); });
  await p.waitForTimeout(700);
  const rings = () => p.evaluate(() => window.__voxlink.game.fx.dustRings.filter(r => r.visible).map(r => +r.scale.x.toFixed(2)));
  await p.keyboard.down('Space');
  await p.waitForTimeout(120);
  const r1 = await rings();
  t.check('a jump sends a ring of dust out from your feet', r1.length === 1, r1);
  await p.waitForFunction(() => window.__voxlink.game.player.onGround && window.__voxlink.game.player.vel.y === 0, null, { timeout: 4000 });
  await p.keyboard.up('Space');
  await p.waitForTimeout(150);
  const r2 = await rings();
  t.check('…and so does the landing, wider', r2.length >= 1 && Math.max(...r2) > 1.2, r2);
  await p.waitForTimeout(900);
  t.check('…gone half a second later', (await rings()).length === 0);

  // a big figure, finished: its part flags are put away
  await p.evaluate(() => window.__voxlink.startLevel(9));
  await t.app(p, 'playing');
  const f0 = await p.evaluate(() => { const g = window.__voxlink.game; return { flags: g.flags.length, shown: g.flagGroup.visible }; });
  t.check('the Windmill has its part flags while you build', f0.flags === 3 && f0.shown, f0);
  await p.evaluate(() => { window.__voxlink.game.player.pos.set(0, 0, 9); });
  await t.win(p);
  await p.waitForFunction(() => window.__voxlink.game.roaming && window.__voxlink.ctx.app === 'playing', null, { timeout: 15000 });
  t.check('…and none once it stands finished', await p.evaluate(() => window.__voxlink.game.flagGroup.visible === false));
  await p.evaluate(() => window.__voxlink.startLevel(9, true));
  await t.app(p, 'playing');
  t.check('…nor when you come back to it', await p.evaluate(() => window.__voxlink.game.roaming && window.__voxlink.game.flagGroup.visible === false));
});
