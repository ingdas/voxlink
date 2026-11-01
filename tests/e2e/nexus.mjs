// The Keeper's Isle, the world select you walk: in from the title, through a world's portal and back out of it,
// a closed world's gate, a newly opened world waking as you arrive, the Garden's arch, the pause menu, phones.
import { suite, saveWith, MEADOW } from './lib.mjs';

const FARM = ['snail', 'duck', 'bunny', 'sheep'];
const V = 'window.__voxlink';
// walk forward (W) for ms, facing yaw
const walk = async (p, yaw, ms) => {
  await p.evaluate(y => { const N = window.__voxlink.ctx.nexus.session; N.player.yaw = y; }, yaw);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(ms); await p.keyboard.up('KeyW');
};

await suite('keeper\'s isle', async t => {
  const save = saveWith([...MEADOW, ...FARM], { seen: { farm: true } });
  const p = await t.page({ save, query: '?debug' });
  await t.hideDebug(p);

  // in from the title: the Keeper's welcome the first time, then you stand on the plaza facing your world
  await p.click('#btn-map');
  await p.waitForFunction(() => window.__voxlink.ctx.overlays.includes('screen-talk'), null, { timeout: 15000 });
  for (let i = 0; i < 8 && await p.evaluate(() => window.__voxlink.ctx.overlays.includes('screen-talk')); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 15000 });
  const a = await p.evaluate(() => {
    const { ctx } = window.__voxlink, N = ctx.nexus.session;
    return { app: ctx.app, name: document.getElementById('lvl-name').textContent, count: document.getElementById('count').textContent,
      open: N.isle.islets.map(k => k.open), seen: !!ctx.save.seen.nexus, ms: Math.round(N.buildMs) };
  });
  t.check('the title\'s Worlds button walks you onto the Keeper\'s Isle', a.app === 'nexus' && a.name === "Keeper's Isle" && a.seen, a);
  t.check('two worlds open, the other eight behind gates, the Garden open', a.open.filter(Boolean).length === 3 && a.open[0] && a.open[1] && a.open[10], a.open);
  t.check(`the isle builds quickly (${a.ms} ms)`, a.ms < 1500);

  // the card for the world you walk up to
  await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(1); N.player.pos.set(s.x, 0, s.z); });
  await p.waitForTimeout(300);
  const card = await p.evaluate(() => ({ show: document.getElementById('nexus-card').classList.contains('show'), text: document.getElementById('nexus-card').innerText, figs: document.querySelectorAll('#nexus-card .nx-figs img').length }));
  t.check('by a portal: a card with the world, its stars and its rebuilt figures', card.show && /Windmill Farm/.test(card.text) && card.figs === 4, card);

  // a closed world: its gate holds you back and Kubo says why
  await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, k = N.isle.islets[3], u = k.u; N.player.pos.set(u.x * 9, 0, u.z * 9); });
  await walk(p, await p.evaluate(() => { const u = window.__voxlink.ctx.nexus.session.isle.islets[3].u; return Math.atan2(-u.x, -u.z); }), 1500);
  const g = await p.evaluate(() => { const { ctx } = window.__voxlink, N = ctx.nexus.session, k = N.isle.islets[3], q = N.player.pos; return { along: q.x * k.u.x + q.z * k.u.z, bark: document.querySelector('#kubo-bark p').textContent }; });
  t.check('a closed bridge\'s gate holds you back', g.along < 11.2, g);
  t.check('…and Kubo says which world wakes it', /Frost Isles|Frost/.test(g.bark) && /asleep/.test(g.bark), g.bark);

  // walking into the farm's portal takes you to the farm, out of its portal there
  await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(1); N.player.pos.set(s.x, 0, s.z); });
  await walk(p, await p.evaluate(() => window.__voxlink.ctx.nexus.session.isle.arrival(1).yaw + Math.PI), 1200);
  await t.app(p, 'playing');
  const w = await p.evaluate(() => { const { game } = window.__voxlink; const pp = game.arch.portalPos(), q = game.player.pos; return { chapter: game.level.chapter, d: Math.hypot(q.x - pp.x, q.z - pp.z), nexus: !!window.__voxlink.ctx.nexus.session }; });
  t.check('walking into a portal travels to its world, in front of the world\'s own portal', w.chapter === 1 && w.d < 4 && !w.nexus, w);

  // that world's portal leads back out of the farm's portal on the isle
  await p.evaluate(() => { const { game } = window.__voxlink; const pp = game.arch.portalPos(); game.player.pos.set(pp.x, 0, pp.z - 2.2); game.player.yaw = Math.PI; });
  await p.keyboard.down('KeyW'); await p.waitForTimeout(900); await p.keyboard.up('KeyW');
  await t.app(p, 'nexus');
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 15000 });
  const b = await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(1), q = N.player.pos; return { d: Math.hypot(q.x - s.x, q.z - s.z), world: !!window.__voxlink.game.world }; });
  t.check('a world\'s portal brings you back out of its portal on the isle', b.d < 0.5 && !b.world, b);

  // pause on the isle: Resume / Settings / Title screen (no Epilogue yet)
  await p.keyboard.press('KeyP');
  await p.waitForTimeout(300);
  const ps = await p.evaluate(() => ({ app: window.__voxlink.ctx.app, base: window.__voxlink.ctx.base, ending: getComputedStyle(document.getElementById('btn-nexus-ending')).display }));
  t.check('P pauses the isle, no Epilogue before the Colossus stands', ps.app === 'paused' && ps.base === 'screen-nexus-pause' && ps.ending === 'none', ps);
  await p.click('#btn-nexus-resume');
  await p.waitForTimeout(300);
  t.check('Resume goes back to walking', (await p.evaluate(() => window.__voxlink.ctx.app)) === 'nexus');

  // the Garden through its arch, and back out of the arch
  await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(10); N.player.pos.set(s.x, 0, s.z); });
  await walk(p, await p.evaluate(() => window.__voxlink.ctx.nexus.session.isle.arrival(10).yaw + Math.PI), 1200);
  await t.app(p, 'museum', 15000);
  for (let i = 0; i < 6 && await p.evaluate(() => window.__voxlink.ctx.overlays.includes('screen-talk')); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
  t.check('the flowery arch leads into Kubo\'s Garden', true);
  await p.evaluate(() => document.getElementById('btn-garden-leave').click());
  await t.app(p, 'nexus');
  const gb = await p.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(10), q = N.player.pos; return Math.hypot(q.x - s.x, q.z - s.z); });
  t.check('leaving the Garden brings you back out of its arch', gb < 0.5, gb);

  // finishing a world: "On to Frost Isles" takes you to the isle, where Frost's gate sinks and its portal wakes
  await p.evaluate(() => window.__voxlink.startLevel(9, false, 'island'));
  await t.app(p, 'playing');
  await t.win(p);
  await p.waitForTimeout(4200);
  await p.keyboard.press('Enter');
  await t.app(p, 'nexus');
  for (let i = 0; i < 6 && await p.evaluate(() => window.__voxlink.ctx.overlays.includes('screen-talk')); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.isle.islets[2].portal.wake === 1, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(300);
  const u = await p.evaluate(() => {
    const N = window.__voxlink.ctx.nexus.session, k = N.isle.islets[2], q = N.player.pos, s = N.isle.plazaSpot(2);
    return { open: k.open, wake: k.portal.wake, gate: k.gate?.visible, d: Math.hypot(q.x - s.x, q.z - s.z), bark: document.querySelector('#kubo-bark p').textContent };
  });
  t.check('a newly opened world: you arrive facing it, its gate sinks and its portal wakes', u.open && u.wake === 1 && u.gate === false && u.d < 1, u);
  t.check('…and Kubo announces it', /Frost/.test(u.bark) && /awake/.test(u.bark), u.bark);
  await p.close();

  // phones: the stick walks you, the card fits, nothing but the stroll HUD shows
  const m = await t.page({ save: saveWith(MEADOW, { seen: { nexus: true } }), query: '?debug', viewport: { width: 844, height: 390 }, mobile: true });
  await t.hideDebug(m);
  await m.tap('#btn-map');
  await m.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 20000 });
  await m.evaluate(() => { const N = window.__voxlink.ctx.nexus.session, s = N.isle.arrival(0); N.player.pos.set(s.x, 0, s.z); });
  await m.waitForTimeout(400);
  const ph = await m.evaluate(() => {
    const r = document.getElementById('nexus-card').getBoundingClientRect();
    const shown = [...document.querySelectorAll('#hud > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className.split(' ')[0]);
    return { inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: Math.round(r.width), shown };
  });
  t.check('phone: the card fits on screen', ph.inside, ph);
  t.check('phone: only the stroll HUD shows', !ph.shown.includes('done-card') && !ph.shown.some(s => /pack|needs/.test(s)), ph.shown);

  // the first visit, through a portal mid-play: the welcome frees the pointer behind the flash, so no pause menu
  // in between; while Kubo talks the top bar steps aside for Skip (no level goals left in it either)
  const f = await t.page({ save: saveWith(['sprout']), viewport: { width: 900, height: 600 } });
  await f.evaluate(() => window.__voxlink.startLevel(1, false, 'island'));
  await t.app(f, 'playing');
  await f.evaluate(() => { window.__screens = []; new MutationObserver(() => { const s = [...document.querySelectorAll('.screen.show')].map(e => e.id).join(','); if (window.__screens.at(-1) !== s) window.__screens.push(s); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
  await f.evaluate(() => window.__voxlink.ctx.nexus.enter({ from: 0, ad: true }));
  await f.waitForFunction(() => document.getElementById('screen-talk').classList.contains('show'));
  await f.waitForTimeout(500);
  t.check('first visit: no pause menu on the way in', !(await f.evaluate(() => window.__screens.some(s => s.includes('screen-pause')))), await f.evaluate(() => window.__screens));
  const sk = await f.evaluate(() => {
    const a = document.getElementById('talk-skip').getBoundingClientRect(), top = document.querySelector('#hud .hud-top'), b = top.getBoundingClientRect();
    return { barShown: getComputedStyle(top).visibility !== 'hidden', overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, goals: getComputedStyle(document.getElementById('goals')).display };
  });
  t.check('first visit: nothing under the Skip button while Kubo talks', !sk.barShown || !sk.overlap, sk);
  t.check('the Keeper\'s Isle top bar has no level goals in it', sk.goals === 'none', sk);
  await f.close();

  // a world's first visit: straight through its portal (no talk screen over the portal's picture), and Kubo tells
  // you about the world once you're there and can see it
  const wv = await t.page({ save: saveWith(MEADOW, { seen: { nexus: true } }) });
  await wv.evaluate(() => window.__voxlink.openNexus());
  await t.app(wv, 'nexus');
  await wv.evaluate(() => { window.__talked = false; new MutationObserver(() => { if (document.getElementById('screen-talk').classList.contains('show')) window.__talked = true; }).observe(document.getElementById('screen-talk'), { attributes: true }); });
  await wv.evaluate(() => window.__voxlink.ctx.nexus.session.travel(1));
  await t.app(wv, 'playing', 20000);
  await wv.waitForTimeout(800);
  const wf = await wv.evaluate(() => ({ talked: window.__talked, level: window.__voxlink.game.level.chapter, said: document.querySelector('#kubo-speech.show .ks-text')?.innerText || '' }));
  t.check('a world\'s first visit: no talk screen on the way in', !wf.talked && wf.level === 1, wf);
  t.check('…Kubo welcomes you to it once you\'re there', /Windmill Farm/.test(wf.said), wf.said);
  await wv.waitForTimeout(7000);
  t.check('…and goes on to his next line by himself', /hay trampolines/.test(await wv.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '')));
  await wv.close();
});
