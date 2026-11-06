// Getting onto the bridges: from the middle of every figure's island in Frostwood (big islands of dense pines, rocks
// and drifts) you can walk straight to its bridge and out along it (the path in stays clear all the way to the shore);
// on Moon Isle (low gravity, no sea) you can't walk or jump off a bridge's side into the void. Every world grows its
// own archipelago (without having to make do), no two alike, with islands turned so their way in faces their bridge; in
// every one Kubo's way along the bridges (from the portal to each island, and from each island to the next) stays on
// them, the walk from one figure to the next is short, and so is the longest walk (portal or island to island).
// A bridge's speed-up builds up over a moment rather than at once; the way in across an island, from its pedestal
// to its bridge, speeds you up too (the rest of the island doesn't).
import { suite } from './lib.mjs';

const ALL = ['meadow', 'farm', 'frost', 'frostwood', 'reef', 'cove', 'starfall', 'moon', 'cliffs', 'storm'];
const save = { campaign: 2, unlocked: 50, seen: Object.fromEntries([...ALL, 'prologue', 'nexus', 'tutorial'].map(k => [k, true])), stars: { sprout: { done: true } } };

await suite('bridges', async t => {
  const p = await t.page({ save });
  // walk (holding forward, steering) to the shore end of an island's bridge or the end of its straight run out; true
  // if you got there
  const walkTo = async (kind, id) => {
    await p.keyboard.down('KeyW');
    let last = null, stuck = 0, ok = false;
    for (let i = 0; i < 90 && !ok; i++) {
      const r = await p.evaluate(([kind, id]) => {
        const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level);
        // (its way in runs from the pedestal the way the island is turned)
        const e = A.entryOf(pt.level), dx = Math.sin(pt.spin), dz = Math.cos(pt.spin), s = (e.x - o.x) * dx + (e.z - o.z) * dz - 1.5;
        const to = kind === 'entry' ? { x: o.x + dx * s, z: o.z + dz * s } : A.leadOf(pt.level), q = g.player.pos;
        g.player.yaw = Math.atan2(q.x - to.x, q.z - to.z);
        return { d: Math.hypot(q.x - to.x, q.z - to.z), x: q.x, z: q.z };
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
    await p.evaluate(id => {
      const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level), e = A.entryOf(pt.level);
      const dx = Math.sin(pt.spin), dz = Math.cos(pt.spin), s = (e.x - o.x) * dx + (e.z - o.z) * dz;
      g.player.pos.set(o.x + dx * s * 0.4, 1, o.z + dz * s * 0.4);
    }, id);
    await p.waitForTimeout(1200);
    if (!(await walkTo('entry', id)) || !(await walkTo('lead', id))) blocked.push(id);
  }
  t.check('Frostwood: from every island you can walk to its bridge and out along it', blocked.length === 0, blocked);

  // on the way from the first island to the second (or along the longest way between two islands), half way along
  // its straightest stretch (or at its start), facing along it
  const onBridge = (longest = false) => p.evaluate(longest => {
    const g = window.__voxlink.game, A = g.arch, L = A.parts.map(pt => pt.level);
    const lenOf = rt => rt.reduce((s, q, i) => s + (i ? q.distanceTo(rt[i - 1]) : 0), 0);
    let rt = A.routeFrom(L[0], L[1]);
    if (longest) for (const a of L) for (const b of L) if (a !== b && lenOf(A.routeFrom(a, b)) > lenOf(rt)) rt = A.routeFrom(a, b);
    window.__route = rt;
    let k = 1;
    for (let i = 2; i < rt.length; i++) if (rt[i].distanceTo(rt[i - 1]) > rt[k].distanceTo(rt[k - 1])) k = i;
    const a = rt[k - 1], b = rt[k], d = a.distanceTo(b), u = [(b.x - a.x) / d, (b.z - a.z) / d], f = longest ? 0.15 : 0.5;
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
    g.player.pos.set(x, 0.3, z); g.player.vel.set(0, 0, 0); g.player.yaw = Math.atan2(-u[0], -u[1]);
    window.__line = { x, z, u };
  }, longest);
  await p.evaluate(() => window.__voxlink.ctx.enterWorld(7));
  await t.app(p, 'playing');
  for (const [key, jump] of [['KeyD', false], ['KeyA', true]]) {
    await onBridge();
    await p.waitForTimeout(800);
    await p.keyboard.down(key);
    if (jump) await p.keyboard.down('Space');
    let off = 0, low = 9;
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(120);
      const s = await p.evaluate(() => { const q = window.__voxlink.game.player.pos, L = window.__line; return { off: Math.abs((q.x - L.x) * L.u[1] - (q.z - L.z) * L.u[0]), y: q.y }; });
      off = Math.max(off, s.off); low = Math.min(low, s.y);
    }
    await p.keyboard.up(key);
    if (jump) await p.keyboard.up('Space');
    t.check(`Moon Isle: ${jump ? 'jumping' : 'walking'} sideways keeps you on the bridge`, off < 1.2 && low > 0.1, { off, low });
  }

  // walking along the bridges (the longest way between two islands, steering round the bends): slow at first, near
  // full speed (2.4 x 5 m/s) later
  await onBridge(true);
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const g = window.__voxlink.game, rt = window.__route;
    window.__steer = setInterval(() => {
      const q = g.player.pos;
      let k = 0;
      for (let i = 1; i < rt.length; i++) if (rt[i].distanceTo(q) < rt[k].distanceTo(q)) k = i;
      const to = rt[Math.min(rt.length - 1, k + 1)];
      g.player.yaw = Math.atan2(q.x - to.x, q.z - to.z);
    }, 30);
  });
  await p.keyboard.down('KeyW');
  const speed = () => p.evaluate(() => { const v = window.__voxlink.game.player.vel; return Math.hypot(v.x, v.z); });
  await p.waitForTimeout(250);
  const early = await speed();
  await p.waitForTimeout(1600);
  const late = await speed();
  await p.keyboard.up('KeyW');
  await p.evaluate(() => clearInterval(window.__steer));
  t.check('a bridge speeds you up over a moment, not at once', early < 8 && late > 10.5, { early, late });

  // walking from beside the second island's pedestal out along its way in (towards its bridge, however the island is
  // turned), and across it
  const across = async turn => {
    await p.evaluate(turn => { const g = window.__voxlink.game, A = g.arch, pt = A.parts[1], o = A.offsetOf(pt.level); g.player.pos.set(o.x + Math.sin(pt.spin) * 6, 0.3, o.z + Math.cos(pt.spin) * 6); g.player.vel.set(0, 0, 0); g.player.yaw = pt.spin + turn; }, turn);
    await p.waitForTimeout(600);
    await p.keyboard.down('KeyW');
    await p.waitForTimeout(1800);
    const v = await speed();
    await p.keyboard.up('KeyW');
    return v;
  };
  const lane = await across(Math.PI), aside = await across(-Math.PI / 2);
  t.check("the way in across an island is a breeze lane, the rest of it isn't", lane > 10 && aside < 6, { lane, aside });

  // every world's archipelago, and Kubo's way along its bridges
  const shapes = new Set(), off = [], long = [], tries = {}, most = {};
  let turned = 0;
  for (let w = 0; w < ALL.length; w++) {
    await p.evaluate(w => window.__voxlink.ctx.enterWorld(w), w);
    await t.app(p, 'playing');
    const r = await p.evaluate(() => {
      const g = window.__voxlink.game, A = g.arch, ids = A.parts.map(pt => pt.level), bad = [], legs = [];
      const hub = A.portalPos(), shape = ids.map(l => { const o = A.offsetOf(l); return `${Math.round((o.x - hub.x) / 10)},${Math.round((o.z - hub.z) / 10)}`; }).join(' ');
      const pairs = ids.map(l => ['portal', l]).concat(ids.slice(1).map((l, i) => [ids[i], l]));
      // (and the longest walk there is: between any two of the portal and the islands)
      const every = ['portal', ...ids], lenOf = rt => rt.reduce((s, q, i) => s + (i ? q.distanceTo(rt[i - 1]) : 0), 0);
      let most = 0;
      for (let i = 0; i < every.length; i++) for (let k = i + 1; k < every.length; k++) most = Math.max(most, lenOf(A.routeFrom(every[i], every[k])));
      for (const [a, b] of pairs) {
        const rt = A.routeFrom(a, b);
        if (rt.length < 2) { bad.push(`${a.id || a}->${b.id}: no way`); continue; }
        let len = 0;
        for (let i = 1; i < rt.length; i++) {
          len += rt[i].distanceTo(rt[i - 1]);
          for (let s = 0; s <= 1; s += 0.05) {
            const x = rt[i - 1].x + (rt[i].x - rt[i - 1].x) * s, z = rt[i - 1].z + (rt[i].z - rt[i - 1].z) * s;
            if (g.world.walkSd(x, z) > -0.2) { bad.push(`${a.id || a}->${b.id}`); i = Infinity; break; }
          }
        }
        if (a !== 'portal') legs.push(Math.round(len));
      }
      return { shape, bad, legs, tries: A.tries, most: Math.round(most), turned: A.parts.filter(pt => pt.spin).length };
    });
    most[ALL[w]] = r.most;
    turned += r.turned;
    shapes.add(r.shape);
    tries[ALL[w]] = r.tries;
    off.push(...r.bad.map(b => `${ALL[w]}: ${b}`));
    if (Math.max(...r.legs) > 110) long.push(`${ALL[w]}: ${r.legs.join(', ')}`);
  }
  t.check('every world grows its archipelago without having to make do', Object.values(tries).every(n => n <= 30), tries);
  t.check('no two worlds lay out their islands alike', shapes.size === ALL.length, [...shapes]);
  t.check("Kubo's way along the bridges stays on them in every world", off.length === 0, off.slice(0, 5));
  t.check('the walk from one figure to the next is never long', long.length === 0, long);
  t.check('the longest walk in a world (portal or island to island) stays short', Object.values(most).every(m => m <= 130), most);
  t.check('islands turn so their way in faces their bridge', turned >= 15, turned);
});
