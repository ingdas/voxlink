// The results card: labelled stars (New only on fresh ones), the world card on a world's last figure, and the
// way on with Enter (desktop) or a tap (phones). Also: photo mode is gone.
import { suite, saveWith } from './lib.mjs';

const SIZES = [
  { label: 'desktop', viewport: { width: 1280, height: 720 } },
  { label: 'phone', viewport: { width: 390, height: 844 }, mobile: true },
  { label: 'landscape', viewport: { width: 844, height: 390 }, mobile: true },
];

await suite('results card', async t => {
  for (const s of SIZES) {
    const save = saveWith(['sprout', 'tulip', 'mushroom', 'ladybug'], { stars: { done: true, fast: true } });
    const p = await t.page({ save, query: '?debug', viewport: s.viewport, mobile: s.mobile });
    await t.hideDebug(p);
    // the Tulip again: only the no-hint star is new
    await p.evaluate(() => window.__voxlink.startLevel(1, false, 'island'));
    await t.app(p, 'playing');
    await t.win(p);
    await p.waitForTimeout(4200);
    const a = await p.evaluate(() => ({
      app: window.__voxlink.ctx.app, panel: document.getElementById('screen-complete').classList.contains('show'),
      stars: [...document.querySelectorAll('#done-card .cs')].map(e => `${e.className.replace('cs', '').trim() || '-'}${e.querySelector('em') ? '+new' : ''}`),
      go: !!document.getElementById('dc-go'),
    }));
    t.check(`${s.label}: Tulip card, no panel, no way-on button`, a.app === 'playing' && !a.panel && !a.go, a);
    t.check(`${s.label}: New only on the newly earned star`, a.stars.join() === 'on,on,on+new', a.stars);
    // the Apple, the world's last: world card and the way on
    await p.evaluate(() => window.__voxlink.startLevel(4, false, 'island'));
    await t.app(p, 'playing');
    await t.win(p);
    await p.waitForTimeout(4200);
    const b = await p.evaluate(() => ({ text: document.getElementById('done-card').innerText, go: document.getElementById('dc-go')?.innerText }));
    t.check(`${s.label}: world card and "On to Windmill Farm"`, /Meadow Isles/.test(b.text) && /Windmill Farm/i.test(b.go || ''), b);
    if (s.mobile) await p.tap('#dc-go'); else await p.keyboard.press('Enter');
    await p.waitForTimeout(4500);
    const c = await p.evaluate(() => ({ app: window.__voxlink.ctx.app, base: window.__voxlink.ctx.base, talk: window.__voxlink.ctx.overlays.includes('screen-talk') }));
    t.check(`${s.label}: ${s.mobile ? 'a tap' : 'Enter'} travels on to the next world`, c.base === 'screen-map' && c.talk, c);
    await p.close();
  }
  // photo mode is gone: no camera buttons, C does nothing in the Garden
  const p = await t.page({ save: saveWith(['sprout']), query: '?debug' });
  await p.evaluate(() => document.getElementById('btn-garden')?.click());
  await p.waitForTimeout(2500);
  t.check('no photo controls anywhere', (await p.evaluate(() => document.querySelectorAll('[id*=photo], use[href="#i-camera"]').length)) === 0);
  await p.keyboard.press('KeyC'); await p.waitForTimeout(300);
  t.check('C does nothing in the Garden', (await p.evaluate(() => window.__voxlink.ctx.app)) === 'museum');
});
