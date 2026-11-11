// Sparks of the Keeper's Lantern: three on every figure's island (none on the Sprout's), every one of them within
// reach of the game's own player physics (walking and jumping, no tools); catching one charges the magnet (small
// figures too), counts towards the island's three for good, and is kept with a half-built run; a fresh run brings
// them back in a paler light; on a finished island only the ones never found are left.
import { suite, saveWith, MEADOW } from './lib.mjs';

const ALL_OPEN = { campaign: 2, unlocked: 50, seen: { prologue: true, tutorial: true, meadow: true, farm: true, frost: true, frostwood: true, reef: true, cove: true, starfall: true, moon: true, cliffs: true, storm: true, nexus: true }, stars: {} };
const speech = p => p.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '');
// step into spark k (stand right under it, at its own height)
const touch = (p, k) => p.evaluate(k => { const g = window.__voxlink.game, s = g.sparks.spots[k]; g.player.pos.set(s.x, s.y - 1, s.z); g.player.vel.set(0, 0, 0); }, k);
const state = p => p.evaluate(() => {
  const V = window.__voxlink, g = V.game;
  return {
    mask: g.sparkMask, magnet: g.magnetCharges, saved: V.save.sparks[g.level.id] || 0, shown: g.sparks.items.map(i => i.g.visible),
    button: !document.getElementById('btn-magnet').classList.contains('hidden') && getComputedStyle(document.getElementById('btn-magnet')).display !== 'none',
    chip: document.querySelector('#goals .g-spark')?.innerText.replace(/\s+/g, ' ').trim() ?? null, pill: document.getElementById('count').innerText.replace(/\s+/g, ' ').trim(),
    toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').innerText : '',
  };
});

await suite('sparks', async t => {
  // every island: three sparks, each one a stand-in player (the game's Player) can walk and jump to
  const a = await t.page({ save: ALL_OPEN, query: '?debug' });
  const all = await a.evaluate(async () => {
    const V = window.__voxlink, { Player } = await import('./js/player.js'), out = [];
    for (let i = 0; i < V.LEVELS.length; i++) {
      V.startLevel(i);
      const g = V.game, w = g.world, spots = g.sparks?.spots || [], missed = [];
      for (const s of spots) {
        let ok = false;
        // straight at it from all round, by way of each bounce pad (a trampoline, a clam, a jump pad), or up its
        // breeze ring (walk in, hold jump, float to the top, then over to the spark)
        const starts = [], ring = s.lift;
        for (const d of [3, 4.5, 2]) for (let k = 0; k < 16; k++) starts.push({ x: s.x + Math.cos((k / 16) * Math.PI * 2) * d, z: s.z + Math.sin((k / 16) * Math.PI * 2) * d });
        for (const pad of w.pads) for (let k = 0; k < 8; k++) starts.push({ x: pad.x + Math.cos((k / 8) * Math.PI * 2) * 2, z: pad.z + Math.sin((k / 8) * Math.PI * 2) * 2, via: pad });
        if (ring) for (let k = 0; k < 8; k++) starts.unshift({ x: ring.x + Math.cos((k / 8) * Math.PI * 2) * 2.5, z: ring.z + Math.sin((k / 8) * Math.PI * 2) * 2.5, via: ring });
        for (const st of starts) {
          const f = w.floorAt(st.x, st.z);
          if (ok || f === null || w.walkSd(st.x, st.z) > -0.4 || w.heightAt(st.x, st.z) > f + 0.05) continue;
          const pl = new Player(), input = { move: { x: 0, y: -1, sprint: true }, jumpHeld: true };
          pl.spawn(st.x, st.z, 0); pl.pos.y = f;
          for (let n = 0, stuck = 0, there = !st.via; n < 600 && !ok; n++) {
            // (thrown by the pad, or floated to the top of the ring: now for the spark)
            if (pl.launchT > 0 || (st.via === ring && ring && pl.pos.y > ring.top - 0.1)) there = true;
            const dx = (there ? s.x : st.via.x) - pl.pos.x, dz = (there ? s.z : st.via.z) - pl.pos.z, h = Math.hypot(dx, dz), px = pl.pos.x, pz = pl.pos.z;
            pl.yaw = Math.atan2(-dx, -dz);
            input.move.y = h > 0.15 ? -1 : 0;
            // a jump when something's in the way, or right under a spark that hangs in the air
            if (pl.onGround && there && (stuck > 4 || (h < 0.5 && s.y - pl.pos.y > 2.4))) pl.jumpBuffer = 0.14;
            const inRing = ring && Math.hypot(pl.pos.x - ring.x, pl.pos.z - ring.z) < ring.r;
            pl.update(1 / 60, input, { x: 0, y: 0 }, g.colliders, w, inRing ? { maxY: ring.top } : null);
            stuck = Math.hypot(pl.pos.x - px, pl.pos.z - pz) < 0.01 && h > 0.15 ? stuck + 1 : 0;
            ok = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z, s.y - Math.min(Math.max(s.y, pl.pos.y), pl.pos.y + 1.7)) < 0.95;
          }
        }
        if (!ok) missed.push(`${s.kind}@${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}`);
      }
      out.push({ id: g.level.id, n: spots.length, kinds: spots.map(s => s.kind), missed });
    }
    return out;
  });
  t.check('no sparks on the Sprout (the first minute stays as it is)', all[0].n === 0, all[0]);
  t.check('three sparks on every other island', all.slice(1).every(r => r.n === 3), all.filter((r, i) => i && r.n !== 3));
  t.check('every spark can be reached on foot', all.every(r => !r.missed.length), all.filter(r => r.missed.length).map(r => `${r.id}: ${r.missed.join(' ')}`).join('; '));
  const kinds = all.flatMap(r => r.kinds);
  const farm = all.slice(5, 10), cove = all.slice(25, 30);
  t.check('the farm\'s and the cove\'s are up on the stacks their trampolines and clams throw you onto', [...farm, ...cove].every(r => r.kinds.filter(k => k === 'high').length === 2), [...farm, ...cove].map(r => r.kinds.join()));
  const lifts = all.filter(r => r.kinds.includes('lift'));
  t.check('where no jump or pad reaches the tallest thing, a breeze ring floats you up to its spark', lifts.length >= 10 && lifts.every(r => r.kinds.filter(k => k === 'lift').length === 1), lifts.length);
  t.check('most islands have one up high or in the air', kinds.filter(k => k === 'high').length >= 40 && kinds.filter(k => k === 'leap' || k === 'lift').length >= 10, { high: kinds.filter(k => k === 'high').length, leap: kinds.filter(k => k === 'leap').length });
  // the same spots every time
  const again = await a.evaluate(() => { const V = window.__voxlink, at = i => { V.startLevel(i); return JSON.stringify(V.game.sparks.spots); }; const x = at(7); at(12); return x === at(7); });
  t.check('an island\'s sparks are in the same spots every visit', again);
  await a.close();

  // the Tulip, the first island with sparks
  const p = await t.page({ save: saveWith(['sprout']), query: '?debug' });
  await t.hideDebug(p);
  await p.evaluate(() => window.__voxlink.startLevel(1));
  await t.app(p, 'playing');
  await p.waitForTimeout(600);
  const s0 = await state(p);
  t.check('the goals show the island\'s sparks, none found yet', s0.chip === '0 / 3', s0.chip);
  t.check('a small figure has no magnet button to begin with', !s0.button && s0.magnet === 0, s0);
  // Kubo points the first one out once it's in view (after his other lines)
  await p.evaluate(() => { const V = window.__voxlink, g = V.game, s = g.sparks.spots[0]; V.ctx.companion.reset(); g.player.pos.set(s.x * 0.5, 0, s.z * 0.5); g.player.yaw = Math.atan2(-s.x, -s.z); g.player.pitch = 0.1; });
  await p.waitForFunction(() => /spark/i.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
  t.check('Kubo says what a spark is the first time one is in view', /spark/i.test(await speech(p)) && /magnet/i.test(await speech(p)), await speech(p));
  await touch(p, 0);
  await p.waitForFunction(() => window.__voxlink.game.sparkMask === 1, null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
  const s1 = await state(p);
  t.check('walking into a spark catches it', s1.mask === 1 && !s1.shown[0] && s1.shown[1] && s1.shown[2], s1);
  t.check('…it charges the magnet, whose button appears', s1.magnet === 1 && s1.button, s1);
  t.check('…and counts for the island, in the goals and the save', s1.chip === '1 / 3' && s1.saved === 1 && /1/.test(s1.toast), s1);
  await p.waitForFunction(() => /magnet/i.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || '') && !/spark/i.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 12000 }).catch(() => {});
  t.check('the first one ever: Kubo says how the magnet works', /R/.test(await speech(p)) && /magnet/i.test(await speech(p)), await speech(p));
  // (running round the pedestal for a while: the fastest you get)
  const run = ms => p.evaluate(ms => new Promise(res => {
    const g = window.__voxlink.game, k = g.input.keys, s = g.arch.spawnOf(g.level, 9), t0 = performance.now(); let top = 0;
    g.player.pos.set(s.x, 0, s.z); g.player.vel.set(0, 0, 0);
    const tick = () => {
      // round the pedestal, on the open ground between it and the shore
      const a = Math.atan2(g.player.pos.z, g.player.pos.x) + 0.35, r = g.footR + 3.4;
      g.player.yaw = Math.atan2(-(Math.cos(a) * r - g.player.pos.x), -(Math.sin(a) * r - g.player.pos.z));
      k.add('KeyW'); k.add('ShiftLeft');
      top = Math.max(top, Math.hypot(g.player.vel.x, g.player.vel.z));
      if (performance.now() - t0 > ms) { k.delete('KeyW'); k.delete('ShiftLeft'); res({ top, left: g.player.gustT, boost: g.player.breezeK, built: g.player.breeze }); } else requestAnimationFrame(tick);
    };
    tick();
  }), ms);
  // the magnet works on a small figure: it pulls in the blocks that fit
  const pulled = await p.evaluate(() => {
    const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
    g.player.pos.set(v.mesh.position.x + 1.5, 0, v.mesh.position.z);
    g.useMagnet();
    return { pack: g.pack.length, magnet: g.magnetCharges };
  });
  t.check('the magnet pulls in blocks that fit on a small figure too', pulled.pack >= 1 && pulled.magnet === 0, pulled);
  await p.evaluate(() => { const g = window.__voxlink.game; while (g.pack.length) g.drop(); });
  // a second spark, then away over the bridge and back: the run keeps its sparks and its charges
  await touch(p, 1);
  await p.waitForFunction(() => window.__voxlink.game.sparkMask === 3, null, { timeout: 5000 }).catch(() => {});
  const fast = await run(2600);
  await p.waitForTimeout(5500);
  const calm = await run(2000);
  // (round the pedestal's bend neither run gets to its full speed: 14.4 and 7.6 m/s on a straight)
  t.check('a spark\'s breeze carries you: for a few seconds a run is well over a run', fast.boost === 1.9 && fast.built > 0.9 && fast.top > calm.top + 1.5 && fast.left > 2, { fast, calm });
  t.check('…and then it is a run again', calm.top < 10 && calm.left === 0 && calm.built < 0.5, calm);
  await p.evaluate(() => window.__voxlink.startLevel(1, true, 'keep'));
  await p.waitForTimeout(400);
  const s2 = await state(p);
  t.check('coming back to a half-built figure: the caught sparks stay caught, the charge is kept', s2.mask === 3 && !s2.shown[0] && !s2.shown[1] && s2.shown[2] && s2.magnet === 1, s2);
  // finish it with one spark left: the card counts them, and the last one is still there to find
  await t.win(p);
  await p.waitForTimeout(4200);
  const card = await p.evaluate(() => document.querySelector('#done-card .dc-sparks')?.innerText.replace(/\s+/g, ' ').trim());
  t.check('the results card counts the island\'s sparks', card === '2 / 3', card);
  const s3 = await state(p);
  t.check('walking the finished island: the spark never found is still there', s3.shown[2] && !s3.shown[0] && !s3.shown[1], s3.shown);
  t.check('…and the pill counts the world\'s sparks', /2 \/ 12/.test(s3.pill), s3.pill);
  await p.evaluate(() => window.__voxlink.ctx.companion.reset());
  await touch(p, 2);
  await p.waitForFunction(() => window.__voxlink.save.sparks.tulip === 7, null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(400);
  const s4 = await state(p);
  t.check('the third spark: the island has all three', s4.saved === 7 && /3 \/ 12/.test(s4.pill), s4);
  await p.waitForFunction(() => /three/i.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 9000 }).catch(() => {});
  t.check('…and Kubo says so (after the line he was on)', /three/i.test(await speech(p)), await speech(p));
  // a fresh run (a rebuild for stars): all three are back, paler, and charge the magnet again without counting twice
  await p.evaluate(() => window.__voxlink.startLevel(1));
  await t.app(p, 'playing');
  await p.waitForTimeout(500);
  const s5 = await state(p);
  t.check('a fresh run: the sparks are back, the goals show them all found', s5.shown.every(Boolean) && s5.mask === 0 && s5.chip === '3 / 3', s5);
  await touch(p, 0);
  await p.waitForFunction(() => window.__voxlink.game.sparkMask === 1, null, { timeout: 5000 }).catch(() => {});
  const s6 = await state(p);
  t.check('…catching one again charges the magnet and changes nothing else', s6.magnet === 1 && s6.saved === 7 && s6.chip === '3 / 3', s6);
  await p.close();

  // Kubo's lift: ten sparks, found anywhere, earn a hop in mid-air
  // jump, then jump again in the air: how high your feet get
  const apex = async page => {
    await page.evaluate(() => { const g = window.__voxlink.game, s = g.arch.spawnOf(g.level, 9); g.player.pos.set(s.x, 0, s.z); g.player.vel.set(0, 0, 0); });
    await page.waitForTimeout(300);
    const top = page.evaluate(() => new Promise(res => { const g = window.__voxlink.game, t0 = performance.now(); let m = 0; const tick = () => { m = Math.max(m, g.player.pos.y); if (performance.now() - t0 > 1700) res(m); else requestAnimationFrame(tick); }; tick(); }));
    await page.keyboard.down('Space'); await page.waitForTimeout(330); await page.keyboard.up('Space');
    await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('Space');
    return top;
  };
  const h = await t.page({ save: saveWith(MEADOW.slice(0, 4), { extra: { sparks: { tulip: 7, mushroom: 1 } } }), query: '?debug' });
  await t.hideDebug(h);
  await h.evaluate(() => window.__voxlink.startLevel(3));
  await t.app(h, 'playing');
  await h.waitForTimeout(400);
  const a0 = await apex(h);
  t.check('four sparks: jumping again in the air does nothing', !(await h.evaluate(() => window.__voxlink.game.player.canHop)) && a0 > 1.3 && a0 < 1.7, a0);
  await h.evaluate(() => window.__voxlink.ctx.companion.reset());
  await touch(h, 0);
  await h.waitForFunction(() => /5/.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || '') && /lift/i.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 12000 }).catch(() => {});
  t.check('the fifth spark: Kubo says five more earn a lift', /5 more/.test(await speech(h)) && /lift/i.test(await speech(h)), await speech(h));
  await h.evaluate(() => { const V = window.__voxlink; V.save.sparks.mushroom = 7; V.save.sparks.ladybug |= 2; V.save.sparks.apple = 1; V.ctx.companion.reset(); });
  await touch(h, 2);
  await h.waitForFunction(() => window.__voxlink.game.player.canHop, null, { timeout: 5000 }).catch(() => {});
  await h.waitForTimeout(300);
  t.check('the tenth spark: Kubo says how his lift works', /10/.test(await speech(h)) && /jump again/i.test(await speech(h)), await speech(h));
  const a1 = await apex(h);
  t.check('…and a second jump in mid-air now lifts you well higher', a1 > a0 + 0.6 && a1 < a0 + 1.4, { before: a0, after: a1 });
  const a2 = await apex(h);
  t.check('…one hop per jump, back again after landing', Math.abs(a2 - a1) < 0.3, { a1, a2 });
  // thirty sparks: he carries you after his lift (a glide while jump stays held)
  // jump, jump again and keep it held: how long until you land, how fast you sink, and whether he carried you
  const hang = async page => {
    await page.evaluate(() => { const g = window.__voxlink.game, s = g.arch.spawnOf(g.level, 9); g.player.pos.set(s.x, 0, s.z); g.player.vel.set(0, 0, 0); g.player.yaw = s.yaw + Math.PI; });
    await page.waitForTimeout(300);
    const air = page.evaluate(() => new Promise(res => {
      const g = window.__voxlink.game, t0 = performance.now(); let left = 0, sink = 0, carried = false;
      const tick = () => {
        const now = performance.now() - t0;
        if (!g.player.onGround && !left) left = now;
        if (now > 900) sink = Math.min(sink, g.player.vel.y);
        carried = carried || g.player.gliding;
        if ((left && g.player.onGround && now > left + 200) || now > 6000) res({ air: (now - left) / 1000, sink, carried });
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    await page.keyboard.down('Space'); await page.waitForTimeout(330); await page.keyboard.up('Space');
    await page.keyboard.down('Space');
    const r = await air;
    await page.keyboard.up('Space');
    return r;
  };
  await h.evaluate(() => { const V = window.__voxlink; Object.assign(V.save.sparks, { snail: 7, duck: 7, bunny: 7, sheep: 1, apple: 0 }); V.startLevel(4); });
  await t.app(h, 'playing');
  await h.waitForTimeout(400);
  const g0 = await hang(h);
  t.check('nineteen sparks: holding jump after the lift just falls', !g0.carried && g0.air < 1.5 && g0.sink < -4, g0);
  await h.evaluate(() => window.__voxlink.ctx.companion.reset());
  await touch(h, 0);
  await h.waitForFunction(() => /20/.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 12000 }).catch(() => {});
  t.check('the twentieth: Kubo says ten more and he can carry you', /10 more/.test(await speech(h)) && /carry/i.test(await speech(h)), await speech(h));
  await h.evaluate(() => { const V = window.__voxlink; Object.assign(V.save.sparks, { sheep: 7, windmill: 7, mitten: 7 }); V.save.sparks.apple |= 2; V.ctx.companion.reset(); });
  await touch(h, 2);
  await h.waitForFunction(() => window.__voxlink.game.player.canGlide, null, { timeout: 5000 }).catch(() => {});
  await h.waitForTimeout(300);
  t.check('the thirtieth: Kubo says how he carries you', /30/.test(await speech(h)) && /held/i.test(await speech(h)), await speech(h));
  const g1 = await hang(h);
  t.check('…and with jump held after his lift you sink slowly, carried', g1.carried && g1.air > g0.air + 0.6 && g1.sink > -2.2, { before: g0, after: g1 });
  await h.close();

  // from the second world on, the spark out on the far side is green and charges Kubo Express
  const e = await t.page({ save: saveWith(MEADOW, { seen: { farm: true, 'tip.sparks': true } }), query: '?debug' });
  await t.hideDebug(e);
  await e.evaluate(() => window.__voxlink.startLevel(5));
  await t.app(e, 'playing');
  await e.waitForTimeout(400);
  const tools = () => e.evaluate(() => { const g = window.__voxlink.game, shown = id => !document.getElementById(id).classList.contains('hidden') && getComputedStyle(document.getElementById(id)).display !== 'none'; return { mint: g.sparkMint, kinds: g.sparks.spots.map(s => s.kind), magnet: g.magnetCharges, express: g.expressCharges, magnetBtn: shown('btn-magnet'), expressBtn: shown('btn-express') }; });
  const e0 = await tools();
  t.check('Windmill Farm: the third spark, out on the far side, is the green one', e0.mint === 4 && e0.kinds[2] === 'far' && !e0.expressBtn, e0);
  await e.evaluate(() => window.__voxlink.ctx.companion.reset());
  await touch(e, 2);
  await e.waitForFunction(() => window.__voxlink.game.sparkMask === 4, null, { timeout: 5000 }).catch(() => {});
  await e.waitForFunction(() => /Express/.test(document.querySelector('#kubo-speech.show .ks-text')?.innerText || ''), null, { timeout: 12000 }).catch(() => {});
  const e1 = await tools();
  t.check('…catching it charges Kubo Express (not the magnet), whose button appears', e1.express === 1 && e1.magnet === 0 && e1.expressBtn && !e1.magnetBtn, e1);
  t.check('…and the first time, Kubo says what Express does', /Kubo Express/.test(await speech(e)) && /F/.test(await speech(e)), await speech(e));
  t.check('in the Meadow every spark is gold', await e.evaluate(() => { window.__voxlink.startLevel(2, true); return window.__voxlink.game.sparkMint === 0; }));
  await e.close();

  // a finished island you walk onto: the sparks you found are gone, the rest wait
  const q = await t.page({ save: saveWith(MEADOW, { seen: { nexus: true, farm: true }, extra: { sparks: { ladybug: 5 } } }), query: '?debug' });
  await t.hideDebug(q);
  await q.evaluate(() => window.__voxlink.startLevel(3, true));
  await t.app(q, 'playing');
  const s7 = await state(q);
  t.check('a finished island shows only the sparks never found', s7.shown.join() === 'false,true,false', s7.shown);
  await touch(q, 1);
  await q.waitForFunction(() => window.__voxlink.save.sparks.ladybug === 7, null, { timeout: 5000 }).catch(() => {});
  const s8 = await state(q);
  t.check('…catching it there counts, with no magnet to charge', s8.saved === 7 && s8.magnet === 0 && !s8.button, s8);
  // the Keeper's Isle: a world's card counts its sparks
  await q.evaluate(() => window.__voxlink.openNexus({ from: 0 }));
  await q.waitForFunction(() => window.__voxlink.ctx.app === 'nexus', null, { timeout: 15000 });
  await q.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 15000 });
  await q.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(0); N.player.pos.set(s.x, 0, s.z); });
  await q.waitForFunction(() => document.getElementById('nexus-card').classList.contains('show'), null, { timeout: 10000 }).catch(() => {});
  const nx = await q.evaluate(() => document.getElementById('nexus-card').innerText.replace(/\s+/g, ' '));
  t.check('the Keeper\'s Isle card counts the world\'s sparks', /3 \/ 12/.test(nx), nx);
  await q.close();
});
