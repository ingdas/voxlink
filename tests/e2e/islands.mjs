// Walking the archipelago: Continue and the world HUD off the island, finished islands stay built, Rebuild asks
// first and is dropped when you walk away, and the bubble you can fill wins the aim.
import { suite, saveWith, MEADOW } from './lib.mjs';

await suite('islands', async t => {
  const save = saveWith([...MEADOW, 'snail'], { stars: { done: true, fast: true, clean: true }, seen: { farm: true }, unlocked: 9 });
  save.stars.snail = { done: true };
  const p = await t.page({ save, query: '?debug' });
  await t.hideDebug(p);
  // Tab only reaches controls on the screen you see
  const tabs = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); tabs.push(await p.evaluate(() => document.activeElement?.closest('.screen')?.id || 'none')); }
  t.check('Tab stays on the title screen', tabs.every(id => id === 'screen-title' || id === 'none'), tabs);
  await p.click('#btn-play');
  await t.app(p, 'playing');
  await p.waitForTimeout(600);
  const hub = await p.evaluate(() => ({ on: window.__voxlink.game.onIsland, name: document.getElementById('lvl-name').textContent, needs: getComputedStyle(document.getElementById('needs')).display, bubble: document.querySelector('#kubo-speech .ks-text').textContent }));
  t.check('on the hub the HUD shows the world, not a puzzle', !hub.on && hub.name === 'Windmill Farm' && hub.needs === 'none', hub);
  t.check('Kubo welcomes you back on arrival', /welcome back/i.test(hub.bubble), hub.bubble);
  const go = id => p.evaluate(id => { const g = window.__voxlink.game, A = g.arch, pt = A.parts.find(q => q.level.id === id), o = A.offsetOf(pt.level); g.player.pos.set(o.x + 4, 0.2, o.z + 5); }, id);
  await go('snail'); await p.waitForTimeout(1500);
  const s = await p.evaluate(() => ({ roam: window.__voxlink.game.roaming, reb: document.getElementById('btn-rebuild').classList.contains('show') }));
  t.check('a finished island stands built, Rebuild offered (stars missing)', s.roam && s.reb, s);
  await p.keyboard.press('KeyR'); await p.waitForTimeout(300);
  t.check('R asks first', await p.evaluate(() => window.__voxlink.game.roaming));
  await p.keyboard.press('KeyR'); await p.waitForTimeout(600);
  t.check('R again starts the rebuild', await p.evaluate(() => !window.__voxlink.game.roaming && window.__voxlink.game.placedCount < window.__voxlink.game.voxels.length));
  await go('duck'); await p.waitForTimeout(1200);
  await go('snail'); await p.waitForTimeout(1200);
  const back = await p.evaluate(() => ({ roam: window.__voxlink.game.roaming, full: window.__voxlink.game.placedCount === window.__voxlink.game.voxels.length, session: !!window.__voxlink.save.sessions.snail }));
  t.check('walking away drops the rebuild: built again', back.roam && back.full && !back.session, back);
  // the bubble a carried block fits wins the aim
  await p.evaluate(() => window.__voxlink.startLevel(window.__voxlink.LEVELS.findIndex(l => l.id === 'bunny')));
  await t.app(p, 'playing');
  const aim = await p.evaluate(() => {
    const g = window.__voxlink.game, s = [...g.sockets.values()][0], v = g.voxels[s.child];
    g.pack.push(v.i); v.state = 'carried';
    const sp = s.sprite.position;
    g.camera.position.set(sp.x + 5, sp.y + 1, sp.z + 5); g.camera.lookAt(sp); g.camera.updateMatrixWorld();
    const h = g.rayFrom();
    return h?.kind === 'socket' && h.child === s.child;
  });
  t.check('aiming at a fillable bubble picks it', aim);
  // every star: on the Keeper's Isle every world is open and crowned, every figure stands by its portal, and the
  // ending can be replayed from its pause menu
  await p.evaluate(() => { const V = window.__voxlink; for (const l of V.LEVELS) V.save.stars[l.id] = { done: true, fast: true, clean: true }; V.save.unlocked = 50; V.save.seen.nexus = true; V.openNexus(); });
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 20000 });
  await p.keyboard.press('KeyP');
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const k = window.__voxlink.ctx.nexus.session.isle.islets.filter(i => !i.slot.garden);
    return { open: k.every(i => i.open), crowned: k.filter(i => i.slot.crowned).length, figures: k.reduce((n, i) => n + i.slot.minis.filter(Boolean).length + !!i.slot.finale, 0), ending: getComputedStyle(document.getElementById('btn-nexus-ending')).display !== 'none' };
  });
  t.check('150 stars: every world open and crowned, all 50 figures by their portals, the ending can be replayed', m.open && m.crowned === 10 && m.figures === 50 && m.ending, m);
});
