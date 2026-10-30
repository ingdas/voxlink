// Phones and tablets play in landscape: held upright, a "turn your device" screen covers the game and everything
// waits (a figure in progress pauses, its clock stops; the opening holds still); a tall desktop window plays on.
// Also: Kubo talks where you can see him (beside him when the top HUD leaves no room above his head), the little
// Kubo of a docked bubble never catches the thumb going down for the stick, a dropped block lands out in front
// (short of a fence or wall), and a tap meant for the opening keeps his first line.
import { suite } from './lib.mjs';

const FIRST = { campaign: 2, seen: { prologue: true, meadow: true } };

const LAND = { width: 844, height: 390 }, UPRIGHT = { width: 390, height: 844 };
const upright = p => p.evaluate(() => ({ cover: getComputedStyle(document.getElementById('rotate')).display !== 'none', app: window.__voxlink.ctx.app, clock: window.__voxlink.game.elapsed, cine: window.__voxlink.ctx.cinema.clock }));

await suite('phone', async t => {
  // held upright from the start: the opening waits behind the turn-your-device screen, and plays once turned
  const o = await t.page({ save: null, waitFor: 'cinema', viewport: UPRIGHT, mobile: true });
  await o.waitForTimeout(1500);
  const o1 = await upright(o);
  await o.waitForTimeout(1000);
  const o2 = await upright(o);
  t.check('upright: the turn-your-device screen covers the opening, which holds still', o1.cover && o1.app === 'cinema' && o2.cine === o1.cine, [o1, o2]);
  t.check('upright: it asks in the player\'s language', /sideways/.test(await o.evaluate(() => document.getElementById('rotate').innerText)));
  await o.setViewportSize(LAND);
  await o.waitForTimeout(1000);
  const o3 = await upright(o);
  t.check('turned sideways: the screen goes and the opening plays on', !o3.cover && o3.cine > o2.cine, o3);
  await o.close();

  // turned upright mid-figure: it pauses (the clock stops); turned back, the pause menu is waiting
  const f = await t.page({ save: { ...FIRST, settings: { full: false } }, viewport: LAND, mobile: true }); // (a fullscreen window can't be resized)
  await f.tap('#btn-play');
  await t.app(f, 'playing');
  await f.evaluate(() => { const g = window.__voxlink.game; g.tutorial = null; });
  await f.waitForTimeout(1200);
  await f.setViewportSize(UPRIGHT);
  await f.waitForTimeout(400);
  const f1 = await upright(f);
  await f.waitForTimeout(1200);
  const f2 = await upright(f);
  t.check('upright mid-figure: covered and paused, the clock stopped', f1.cover && f1.app === 'paused' && f2.clock === f1.clock, [f1, f2]);
  await f.setViewportSize(LAND);
  await f.waitForTimeout(400);
  const f3 = await upright(f);
  t.check('turned back: the pause menu is waiting', !f3.cover && f3.app === 'paused' && await f.evaluate(() => document.getElementById('screen-pause').classList.contains('show')), f3);
  await f.close();

  // a tall desktop window is no phone: it plays as it is
  const d = await t.page({ save: FIRST, viewport: { width: 600, height: 900 } });
  t.check('a tall desktop window gets no turn-your-device screen', !(await upright(d)).cover);
  await d.close();

  for (const s of [{ label: 'landscape', viewport: LAND, place: 'side' }]) {
    const p = await t.page({ save: FIRST, viewport: s.viewport, mobile: true });
    await p.tap('#btn-play');
    await t.app(p, 'playing');
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const g = window.__voxlink.game, el = document.getElementById('kubo-speech');
      const box = el.querySelector('.ks-box').getBoundingClientRect(), needs = document.getElementById('needs').getBoundingClientRect();
      const pack = document.querySelector('.pack-wrap').getBoundingClientRect();
      // the first block, lying right in front of you
      const v = g.voxels.find(v => v.state === 'loose').mesh.position.clone().project(g.camera);
      const bx = (v.x + 1) / 2 * innerWidth, by = (1 - v.y) / 2 * innerHeight;
      return {
        cls: el.className, step: g.tutorial, box: [box.left, box.top, box.right, box.bottom].map(Math.round), needs: Math.round(needs.bottom), pack: Math.round(pack.top),
        block: [Math.round(bx), Math.round(by)], overBlock: bx > box.left && bx < box.right && by > box.top && by < box.bottom,
      };
    });
    const where = /docked/.test(r.cls) ? 'docked' : /side-/.test(r.cls) ? 'side' : 'above';
    // (where depends on what's on screen: his bubble never covers the bubble on the pedestal or the first block)
    t.check(`${s.label}: Kubo says the first step in his bubble`, r.step === 'grab' && /show/.test(r.cls) && ['side', 'above', 'docked'].includes(where), r);
    t.check(`${s.label}: his bubble keeps clear of the top HUD, the backpack and the first block`, r.box[1] >= r.needs && r.box[3] <= r.pack && !r.overBlock, r);
    await p.close();
  }

  // a docked bubble (reduced motion docks it): its little Kubo lets the thumb through to the stick
  let p = await t.page({ save: FIRST, viewport: LAND, mobile: true });
  await p.tap('#btn-play');
  await t.app(p, 'playing');
  await p.evaluate(() => document.body.classList.add('reduce-motion'));
  await p.waitForTimeout(600);
  const face = await p.evaluate(() => {
    const f = document.querySelector('#kubo-speech .kubo.mini').getBoundingClientRect();
    return { docked: document.getElementById('kubo-speech').classList.contains('docked'), x: f.left + f.width / 2, y: f.top + f.height / 2, under: document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2)?.id };
  });
  t.check('docked: the little Kubo lets the thumb through to the stick', face.docked && face.under === 'touch', face);
  await p.evaluate(() => document.body.classList.remove('reduce-motion'));

  // dropping: out in front in the open, short of anything solid in the way
  const drop = wall => p.evaluate(wall => {
    const g = window.__voxlink.game, pl = g.player, THREE = window.__voxlink.ctx.THREE;
    g.tutorial = null;
    pl.pos.set(0, 0, 9); pl.yaw = 0; pl.vel.set(0, 0, 0);
    const extra = wall ? new THREE.Box3(new THREE.Vector3(-3, 0, 7.4), new THREE.Vector3(3, 2, 7.6)) : null;
    if (extra) g.colliders.push(extra);
    const v = g.voxels.find(v => v.state === 'loose' && !g.puzzle.roots.includes(v.i));
    g.pack.push(v.i); g.active = g.pack.length - 1; v.state = 'held';
    g.drop();
    if (extra) g.colliders.splice(g.colliders.indexOf(extra), 1);
    return +(9 - v.rest.pos.z).toFixed(2);
  }, wall);
  const open = await drop(false), fenced = await drop(true);
  t.check('in the open a dropped block lands out in front, where you can see it', open >= 1.8 && open <= 2.3, open);
  t.check('with a fence just ahead it lands on your side of it', fenced <= 1.3, fenced);
  await p.close();

  // the opening's last tap (Skip on a phone) doesn't use up Kubo's first line
  const w = await t.page({ save: null, waitFor: 'cinema', viewport: LAND, mobile: true });
  await w.waitForTimeout(1500);
  // tap as play starts (the tap that skipped the opening, or its last moment)
  await w.evaluate(() => new Promise(done => {
    document.getElementById('cine-skip').click();
    const iv = setInterval(() => { if (window.__voxlink.ctx.app === 'playing') { clearInterval(iv); window.__voxlink.ctx.input.actions.push({ type: 'interact' }); done(); } }, 4);
  }));
  await w.waitForTimeout(500);
  const m = await w.evaluate(() => ({ step: window.__voxlink.game.tutorial, k: window.__voxlink.game.meet?.k }));
  t.check('a tap as the opening ends keeps his first line up', m.step === 'meet' && m.k === 0, m);
  await w.close();
});
