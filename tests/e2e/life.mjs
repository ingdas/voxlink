// What lives on the islands: butterflies that keep to the land near you and move off when you walk up, birds that
// stay overhead as you cross to another island, fish that only jump in open water, shooting stars in the night
// worlds (and no fish over the void), and none of it in a cutscene.
import { suite, saveWith, MEADOW } from './lib.mjs';

const ALL_OPEN = { campaign: 2, unlocked: 50, seen: { prologue: true, tutorial: true, meadow: true, farm: true, frost: true, frostwood: true, reef: true, cove: true, starfall: true, moon: true, cliffs: true, storm: true, nexus: true, 'tip.sparks': true }, stars: {} };
// where a pair of wings is (instance 2k of the wings' mesh), in the scene
const wingsAt = (p, part) => p.evaluate(part => {
  const V = window.__voxlink, g = V.game, im = g.life?.parts[part], M = new V.ctx.THREE.Matrix4(), q = new V.ctx.THREE.Vector3(), out = [];
  if (!im) return null;
  for (let k = 0; k < im.count; k += 2) {
    im.getMatrixAt(k, M);
    if (Math.abs(M.elements[0]) + Math.abs(M.elements[1]) + Math.abs(M.elements[2]) < 1e-6) continue; // hidden
    q.setFromMatrixPosition(M);
    out.push({ k, x: q.x, y: q.y, z: q.z, d: Math.hypot(q.x - g.player.pos.x, q.z - g.player.pos.z), floor: g.world.floorAt(q.x, q.z) });
  }
  return out;
}, part);

await suite('life', async t => {
  const p = await t.page({ save: saveWith([...MEADOW, 'snail'], { seen: { farm: true, 'tip.sparks': true } }), query: '?debug' });
  await t.hideDebug(p);
  await p.evaluate(() => window.__voxlink.startLevel(5, true));
  await t.app(p, 'playing');
  await p.waitForTimeout(2500);
  const b0 = await wingsAt(p, 'flutter');
  t.check('butterflies are about, near you', b0.length >= 6 && b0.every(b => b.d < 34), b0.map(b => +b.d.toFixed(1)));
  t.check('…a little way over the ground, not up in the sky', b0.every(b => b.y - (b.floor ?? 0) > 0.2 && b.y - (b.floor ?? 0) < 4), b0.map(b => +(b.y - (b.floor ?? 0)).toFixed(1)));
  await p.waitForTimeout(700);
  const b1 = await wingsAt(p, 'flutter');
  t.check('…and on the move', b1.filter((b, i) => Math.hypot(b.x - b0[i].x, b.y - b0[i].y, b.z - b0[i].z) > 0.05).length >= b1.length - 1);
  // walk right up to one: a moment later it has moved off or climbed out of reach
  const near = await p.evaluate(() => {
    const V = window.__voxlink, g = V.game, im = g.life.parts.flutter, M = new V.ctx.THREE.Matrix4(), q = new V.ctx.THREE.Vector3();
    im.getMatrixAt(0, M); q.setFromMatrixPosition(M);
    g.player.pos.set(q.x, g.world.floorAt(q.x, q.z) ?? 0, q.z); g.player.vel.set(0, 0, 0);
    return true;
  });
  await p.waitForTimeout(1600);
  const fled = await p.evaluate(() => {
    const V = window.__voxlink, g = V.game, im = g.life.parts.flutter, M = new V.ctx.THREE.Matrix4(), q = new V.ctx.THREE.Vector3();
    im.getMatrixAt(0, M); q.setFromMatrixPosition(M);
    return { d: Math.hypot(q.x - g.player.pos.x, q.z - g.player.pos.z), up: q.y - g.player.pos.y };
  });
  t.check('a butterfly you walk up to moves off', near && (fled.d > 1.2 || fled.up > 1.9), fled);
  // birds wheel overhead, and are still overhead once you've walked to the next island
  const birds = async () => (await wingsAt(p, 'birds')).map(b => ({ d: +b.d.toFixed(1), y: +b.y.toFixed(1) }));
  const k0 = await birds();
  t.check('birds wheel overhead', k0.length >= 3 && k0.every(b => b.y > 8 && b.d < 45), k0);
  await p.evaluate(() => { const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === 'duck'), o = A.offsetOf(pt.level); g.player.pos.set(o.x + 4, 0.2, o.z + 5); });
  await p.waitForFunction(() => window.__voxlink.game.level.id === 'duck', null, { timeout: 8000 });
  await p.waitForTimeout(9000);
  const k1 = await birds();
  t.check('…and follow you to the next island', k1.every(b => b.d < 45), k1);
  const b2 = await wingsAt(p, 'flutter');
  t.check('…as do the butterflies', b2.length >= 6 && b2.every(b => b.d < 34), b2.map(b => +b.d.toFixed(1)));
  // a fish: only ever in open water
  const fish = await p.evaluate(() => new Promise(res => {
    const g = window.__voxlink.game, t0 = performance.now(), seen = [];
    const tick = () => {
      for (const f of g.life.parts.fish) if (f.visible) seen.push({ sd: g.world.walkSd(f.position.x, f.position.z), y: f.position.y - g.world.seaY });
      if (performance.now() - t0 > 14000) return res(seen);
      requestAnimationFrame(tick);
    };
    tick();
  }));
  t.check('fish jump out of the sea', fish.length > 10 && Math.max(...fish.map(f => f.y)) > 0.6, { frames: fish.length });
  t.check('…in open water, never across land or a bridge', fish.every(f => f.sd > 1), Math.min(...fish.map(f => f.sd)));
  await p.close();

  // the night worlds: shooting stars, and nothing jumping over the void
  const q = await t.page({ save: ALL_OPEN, query: '?debug' });
  await t.hideDebug(q);
  await q.evaluate(() => window.__voxlink.startLevel(32));
  await t.app(q, 'playing');
  const parts = await q.evaluate(() => Object.keys(window.__voxlink.game.life.parts));
  t.check('Starfall Peak: no fish over the void, no butterflies', !parts.includes('fish') && !parts.includes('flutter') && parts.includes('star'), parts);
  const star = await q.evaluate(() => new Promise(res => {
    const g = window.__voxlink.game, t0 = performance.now();
    const tick = () => {
      const s = g.life.parts.star;
      if (s.visible && s.material.opacity > 0.5) return res({ el: Math.asin((s.position.y - window.__voxlink.ctx.camera.position.y) / s.position.distanceTo(window.__voxlink.ctx.camera.position)) });
      if (performance.now() - t0 > 16000) return res(null);
      requestAnimationFrame(tick);
    };
    tick();
  }));
  t.check('…a shooting star crosses the sky, well above the horizon', !!star && star.el > 0.1, star);
  // every world loads with its own life and no errors (the page's error log fails the suite)
  const worlds = await q.evaluate(() => { const V = window.__voxlink, out = {}; for (let c = 0; c < 10; c++) { V.startLevel(c * 5 + 1); out[V.game.world.themeId] = Object.keys(V.game.life?.parts || {}).join('+'); } return out; });
  t.check('every world has something alive', Object.values(worlds).every(Boolean), worlds);
  // a cutscene hides it all
  await q.evaluate(() => window.__voxlink.ctx.showEnding());
  await q.waitForFunction(() => window.__voxlink.ctx.app === 'cinema', null, { timeout: 15000 });
  await q.waitForTimeout(1500);
  const cine = await q.evaluate(() => { const g = window.__voxlink.game; return { life: g.life?.group.visible, sparks: g.sparks?.group.visible }; });
  t.check('a cutscene has no butterflies, birds or sparks in it', cine.life === false && cine.sparks !== true, cine);
  await q.close();
});
