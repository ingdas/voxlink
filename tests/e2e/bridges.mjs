// Getting onto the bridges: from the middle of every figure's island in Frostwood (big islands of dense pines, rocks
// and drifts) you can walk straight to its bridge and onto the boardwalk (the path in stays clear all the way to the
// shore); on Moon Isle (low gravity, no sea) you can't walk or jump off a bridge's side into the void.
import { suite } from './lib.mjs';

const ALL = ['meadow', 'farm', 'frost', 'frostwood', 'reef', 'cove', 'starfall', 'moon', 'cliffs', 'storm'];
const save = { campaign: 2, unlocked: 50, seen: Object.fromEntries([...ALL, 'prologue', 'nexus', 'tutorial'].map(k => [k, true])), stars: {} };

await suite('bridges', async t => {
  const p = await t.page({ save });
  // walk (holding forward, steering) to the spur's island end or the boardwalk; true if you got there
  const walkTo = async (kind, id) => {
    await p.keyboard.down('KeyW');
    let last = null, stuck = 0, ok = false;
    for (let i = 0; i < 90 && !ok; i++) {
      const r = await p.evaluate(([kind, id]) => {
        const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level);
        const x = o.x, z = kind === 'entry' ? A.entryOf(pt.level).z - 1.5 : A.boardwalkZ(), q = g.player.pos;
        g.player.yaw = Math.atan2(q.x - x, q.z - z);
        return { d: Math.hypot(q.x - x, q.z - z), x: q.x, z: q.z };
      }, [kind, id]);
      ok = r.d < 1.2;
      if (last && Math.hypot(r.x - last.x, r.z - last.z) < 0.05) { if (++stuck > 6) break; } else stuck = 0;
      last = r;
      await p.waitForTimeout(150);
    }
    await p.keyboard.up('KeyW');
    return ok;
  };

  await p.evaluate(() => window.__voxlink.ctx.enterWorld(3));
  await t.app(p, 'playing');
  const ids = await p.evaluate(() => window.__voxlink.game.arch.parts.map(pt => pt.level.id));
  const blocked = [];
  for (const id of ids) {
    await p.evaluate(id => { const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level), e = A.entryOf(pt.level); g.player.pos.set(o.x, 1, o.z + (e.z - o.z) * 0.4); }, id);
    await p.waitForTimeout(1200);
    if (!(await walkTo('entry', id)) || !(await walkTo('junction', id))) blocked.push(id);
  }
  t.check('Frostwood: from every island you can walk to its bridge and onto the boardwalk', blocked.length === 0, blocked);

  await p.evaluate(() => window.__voxlink.ctx.enterWorld(7));
  await t.app(p, 'playing');
  for (const [key, jump] of [['KeyD', false], ['KeyA', true]]) {
    await p.evaluate(() => { const g = window.__voxlink.game, A = g.arch, a = A.offsetOf(A.parts[0].level), c = A.offsetOf(A.parts[1].level); g.player.pos.set((a.x + c.x) / 2, 0.3, A.boardwalkZ()); g.player.yaw = -Math.PI / 2; });
    await p.waitForTimeout(800);
    await p.keyboard.down(key);
    if (jump) await p.keyboard.down('Space');
    let off = 0, low = 9;
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(120);
      const s = await p.evaluate(() => { const g = window.__voxlink.game; return { off: Math.abs(g.player.pos.z - g.arch.boardwalkZ()), y: g.player.pos.y }; });
      off = Math.max(off, s.off); low = Math.min(low, s.y);
    }
    await p.keyboard.up(key);
    if (jump) await p.keyboard.up('Space');
    t.check(`Moon Isle: ${jump ? 'jumping' : 'walking'} sideways keeps you on the boardwalk`, off < 1.2 && low > 0.1, { off, low });
  }
});
