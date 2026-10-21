// HUD layout and controls: keyboard turning, the top HUD rows never overlap (phones, Arabic), tools fit on a
// narrow phone, Kubo's bubble lets touches through, Restart asks first, settings show a scroll cue.
import { suite, saveWith, MEADOW } from './lib.mjs';

await suite('hud', async t => {
  // keyboard-only: J / L turn, which completes the tutorial's look step
  let p = await t.page({ save: { campaign: 2, seen: { prologue: true, meadow: true } } });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  await p.evaluate(() => { window.__voxlink.ctx.input.enabled = true; });
  await p.keyboard.down('KeyL'); await p.waitForTimeout(900); await p.keyboard.up('KeyL');
  await p.waitForTimeout(400);
  t.check('J / L turning completes the look step', (await p.evaluate(() => window.__voxlink.game.tutorial)) === 'move');
  await p.close();

  const save = saveWith(MEADOW, { seen: { farm: true }, unlocked: 10 });
  for (const v of [{ label: 'landscape ar-SA', viewport: { width: 844, height: 390 }, lang: 'ar-SA' }, { label: 'portrait 360', viewport: { width: 360, height: 640 }, lang: 'de-DE' }]) {
    p = await t.page({ save: { ...save, settings: { lang: v.lang } }, viewport: v.viewport, mobile: true });
    await p.evaluate(() => window.__voxlink.startLevel(window.__voxlink.LEVELS.findIndex(l => l.id === 'windmill'), false, 'island'));
    await t.app(p, 'playing');
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.__voxlink.ctx.kuboSays('A long line from Kubo to check where the docked bubble sits on a phone.'));
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const box = s => document.querySelector(s).getBoundingClientRect();
      const b = box('#kubo-speech .ks-box'), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { prog: box('.hud-top .progress').bottom, goals: box('#goals').bottom, needs: box('#needs').top, tools: [box('.hud-tools').left, box('.hud-tools').right], w: innerWidth, through: !hit?.closest('.ks-box') };
    });
    t.check(`${v.label}: bubbles row below the progress pill and goals`, r.needs >= Math.max(r.prog, r.goals), r);
    t.check(`${v.label}: every tool on screen`, r.tools[0] >= 0 && r.tools[1] <= r.w, r.tools);
    t.check(`${v.label}: touches pass through Kubo's bubble`, r.through);
    await p.close();
  }

  // Restart asks first; the settings list shows a scroll cue
  p = await t.page({ save, viewport: { width: 390, height: 760 }, mobile: true });
  await p.click('#btn-settings'); await p.waitForTimeout(500);
  t.check('settings show a scroll cue while more is below', await p.evaluate(() => document.querySelector('#screen-settings .settings').classList.contains('more')));
  await p.evaluate(() => document.querySelector('#screen-settings [data-back]').click());
  await p.evaluate(() => window.__voxlink.startLevel(5));
  await t.app(p, 'playing');
  await p.evaluate(() => document.getElementById('btn-pause').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('btn-restart').click()); await p.waitForTimeout(100);
  t.check('Restart: the first tap asks', (await p.evaluate(() => window.__voxlink.ctx.app)) === 'paused');
  await p.evaluate(() => document.getElementById('btn-restart').click()); await p.waitForTimeout(500);
  t.check('Restart: the second tap restarts', (await p.evaluate(() => window.__voxlink.ctx.app)) !== 'paused');
});
